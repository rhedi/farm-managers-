// Offline catch-up beyond the exact window: "mode hemat". Game.catchUp simulates the first `exactHours` (48) game
// hours exactly, then whole game days coarsely, up to `maxRealHours` (8) real hours away in total:
//  - each coarse day runs the normal daily rollover (weather, market, auto-feed, animals & fish, wages, interest,
//    contracts, missions, rivals, ledger, overflow summary) — exact daily systems;
//  - field plans produce at `efficiency` (50%) of their cycle rate: expected yield (plan fertilize/irrigate) every
//    growDays + 1 days, paid with cash at the same rate (seed, fertilizer, irrigation, rent, fuel estimate), skipped
//    when cash is short; harvests are sold (plan auto-sell, keeping stockKeep.js stock) or stored (overflow tallied);
//  - factories run by a working Manajer Pabrik (or 🔁 Otomatis) process their best stocked recipe at 50% speed;
//  - active contracts are delivered from stock when it covers the rest.
// Field tasks, crop growth, trucks and running batches stay frozen while the coarse days pass; the exact sim resumes
// afterwards (the < 24 h remainder runs exactly). No RNG beyond the rollover's own draws → deterministic.
import { round2 } from './rng.js';
import { expectedYield } from './fields.js';
import { isTree, ageDays, orchardOutlook } from './orchard.js';
import { xpForValue } from './taskrun.js';
import { perk } from './research.js';
import { keptStock, storeHarvest, holdHours } from './stockKeep.js';
import { factoryHold } from './factoryManager.js';
import { stateOf, recipeOf, scaledRecipe, batchHours } from './factories.js';
import { storeProduct, freeOf, kindOf, tonsPerUnit } from './storage.js';
import { deliverContract } from './contracts.js';
import { sellableStock } from './economy.js';
import { effectiveStats } from './upgrades.js';
import { RENT_HA_PER_HOUR } from './tasks.js';
import { yearDays, seasonIdAt, cropSeasonFit, climateTemp, SEASONS, OFF_SEASON_GROWTH } from './seasons.js';

export const OFFLINE_DEFAULTS = { exactHours: 48, maxRealHours: 8, efficiency: 0.5, fuelLitersPerHa: 6 };
export const offlineCfg = (game) => ({ ...OFFLINE_DEFAULTS, ...(game.data.BALANCE.offline || {}) });

/** Average growth speed of a crop over one year in a region (season fit, too cold = 0; greenhouses grow at 1). */
function yearGrowth(game, regionId, crop) {
  const Y = yearDays(game);
  let sum = 0;
  for (let d = 1; d <= Y; d++) {
    if (crop.minTemp != null && climateTemp(game, regionId, d) < crop.minTemp) continue;
    const sid = seasonIdAt(game, regionId, d), fit = cropSeasonFit(crop, sid);
    sum += fit === 'good' ? 1 : fit === 'off' ? OFF_SEASON_GROWTH : SEASONS[sid].growthMult;
  }
  return sum / Y;
}

/** Owned rigs: per task the best ha/hour (implement × fastest tractor) and how many can run at once. */
function rigsOf(game) {
  const ms = game.state.machines.map((m) => effectiveStats(game, m)).filter(Boolean);
  const tractors = ms.filter((m) => m.type === 'tractor'), speed = Math.max(0, ...tractors.map((t) => t.speed ?? 1));
  const rig = {};
  for (const m of ms) if (m.type === 'implement') {
    const r = (rig[m.task] ||= { rate: 0, n: 0 });
    r.rate = Math.max(r.rate, m.haPerHour * speed); r.n++;
  }
  const hv = ms.filter((m) => m.type === 'harvester');
  if (hv.length) rig.harvest = { rate: Math.max(...hv.map((m) => m.haPerHour)), n: hv.length };
  return { rig, tractors: tractors.length, workers: game.state.workers.length };
}

/**
 * Per planned field: daily tons / cost / XP at full rate (× efficiency when applied). Computed once per catch-up.
 * Annual crops cycle every growDays / yearly growth speed + their machine hours; when the owned rigs, tractors or
 * workers cannot keep up with every plan, all annual rates shrink by the bottleneck share.
 */
export function fieldRates(game) {
  const s = game.state, B = game.data.BALANCE, C = offlineCfg(game), out = [], Y = yearDays(game);
  const { rig, tractors, workers } = rigsOf(game), demand = {};
  const annual = [];
  for (const [fieldId, f] of Object.entries(s.fields)) {
    const plan = f.plan, def = game.idx.fields.get(fieldId), crop = plan && game.idx.crops.get(plan.cropId);
    if (!crop || !def) continue;
    const ha = def.sizeHa, base = game.idx.products.get(crop.id)?.basePrice ?? 0;
    if (isTree(crop)) {
      if (f.cropId !== crop.id || !f.orchard || ageDays(game, f) < crop.maturityDays) continue; // young trees: no fruit yet
      const o = orchardOutlook(game, fieldId, crop.id), perDay = o.harvestsPerYear / Y;
      if (!(perDay > 0)) continue;
      out.push({ fieldId, cropId: crop.id, sell: !!plan.sell, tons: o.tons * perDay, cost: { perawatan_kebun: o.yearlyCost / Y },
        xp: perDay * (2 * B.xpPerTask + xpForValue(game, o.tons * base)), harvests: perDay });
      continue;
    }
    if (!rig.plow || !rig.seed) continue; // plans cannot plow/seed without the implements
    const fert = plan.fertilize && !!rig.fertilize, irr = plan.irrigate && !!rig.irrigate, ownHarvest = !!rig.harvest && !plan.rent;
    const hours = { plow: ha / rig.plow.rate, seed: ha / rig.seed.rate, ...(fert ? { fertilize: ha / rig.fertilize.rate } : {}),
      ...(irr ? { irrigate: ha / rig.irrigate.rate } : {}), ...(ownHarvest ? { harvest: ha / rig.harvest.rate } : {}) };
    const growth = f.greenhouse ? 1 : yearGrowth(game, def.regionId, crop);
    if (!(growth > 0)) continue;
    const work = Object.values(hours).reduce((a, h) => a + h, 0) + (ownHarvest ? 0 : ha / RENT_HA_PER_HOUR);
    const days = (crop.growDays ?? 5) / growth + work / 24;
    for (const [t, h] of Object.entries(hours)) demand[t] = (demand[t] || 0) + h / days;
    const tons = expectedYield(game, fieldId, crop.id, { fertilized: fert, irrigated: irr });
    const rent = ownHarvest ? 0 : ha * game.data.STARTING.harvesterRentPerHa;
    const ops = Object.keys(hours).length;
    const cost = {
      benih: ha * crop.seedCostPerHa * (1 - perk(game, 'seedCost')),
      pupuk_kapur_irigasi: ha * ((fert ? B.fertilizerCostPerHa * (1 - perk(game, 'fertCost')) : 0) + (irr ? B.irrigateCostPerHa : 0)),
      sewa_pemanen: rent,
      bbm: ha * ops * C.fuelLitersPerHa * B.fuelPrice * (1 - perk(game, 'fuel')),
    };
    annual.push({ fieldId, cropId: crop.id, sell: !!plan.sell, tons: tons / days, harvests: 1 / days,
      cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v / days])), xp: ((ops + 1) * B.xpPerTask + xpForValue(game, tons * base)) / days });
  }
  // Bottleneck: each implement/harvester type, the tractors (field work) and the workers (all own-rig work), 24 h/day.
  const machineDemand = Object.entries(demand).reduce((a, [t, h]) => a + (t === 'harvest' ? 0 : h), 0);
  const allDemand = Object.values(demand).reduce((a, h) => a + h, 0);
  const share = Math.min(1, ...Object.entries(demand).map(([t, h]) => (rig[t].n * 24) / h),
    machineDemand > 0 ? tractors * 24 / machineDemand : 1, allDemand > 0 ? workers * 24 / allDemand : 1);
  for (const r of annual) {
    r.tons *= share; r.harvests *= share; r.xp *= share;
    for (const k of Object.keys(r.cost)) r.cost[k] *= share;
  }
  return [...out, ...annual];
}

/** One coarse day of field plans at `eff`. Mutates `carry` (fractional harvest counts per field). */
function fieldsDay(game, rates, eff, carry, hold) {
  const s = game.state, crops = new Map();
  const sum = {};
  for (const r of rates) for (const k in r.cost) sum[k] = (sum[k] || 0) + r.cost[k] * eff;
  const total = round2(Object.values(sum).reduce((a, v) => a + v, 0));
  const payAll = total > 0 && total <= s.money; // usual case: one booking for every field
  if (payAll) game.spend(total, Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, round2(v)]).filter(([, v]) => v > 0)));
  let xp = 0;
  for (const r of rates) {
    if (!payAll && total > 0) {
      const split = Object.fromEntries(Object.entries(r.cost).map(([k, v]) => [k, round2(v * eff)]).filter(([, v]) => v > 0));
      const cost = round2(Object.values(split).reduce((a, v) => a + v, 0));
      if (cost > s.money || (cost > 0 && !game.spend(cost, split))) continue; // plans wait for money
    }
    const tons = round2(r.tons * eff);
    if (!(tons > 0)) continue;
    const key = `${r.cropId}|${r.sell ? 1 : 0}`;
    crops.set(key, round2((crops.get(key) || 0) + tons));
    carry[r.fieldId] = (carry[r.fieldId] || 0) + r.harvests * eff;
    const n = Math.floor(carry[r.fieldId] + 1e-9);
    if (n > 0) { s.stats.harvests += n; carry[r.fieldId] -= n; }
    xp += r.xp * eff;
  }
  if (!crops.size) return;
  const kept = keptStock(game, { factory: hold });
  for (const [key, tons] of crops) {
    const [cropId, sell] = key.split('|');
    storeHarvest(game, cropId, tons, { sell: sell === '1', kept });
    s.stats.tonsHarvested = round2(s.stats.tonsHarvested + tons);
  }
  game.addXp(Math.round(xp));
}

/** Factories that run while away (managed by a working Manajer Pabrik, or 🔁 Otomatis) and their scaled recipes. */
function factoryLines(game) {
  const s = game.state, mgr = s.factoryManager, working = !!(mgr?.hired && mgr.on), out = [];
  const tons = (map, sign, net) => { for (const [id, q] of Object.entries(map)) { const p = game.idx.products.get(id), k = kindOf(p); if (k) net[k] = (net[k] || 0) + sign * q * tonsPerUnit(p); } };
  for (const def of game.data.FACTORIES || []) {
    const f = stateOf(game, def.id);
    if (!f || !((f.managed && working) || f.auto)) continue;
    const recipes = (f.managed ? def.recipes : [recipeOf(def, f.recipeId)].filter(Boolean)).map((base) => {
      const r = scaledRecipe(base, f), net = {};
      tons(r.outputs, 1, net); tons(r.inputs, -1, net);
      const value = Object.entries(r.outputs).reduce((a, [id, q]) => a + q * (game.idx.products.get(id)?.basePrice ?? 0), 0);
      return { r, net, value, perDay: 24 / batchHours(base, f.level) };
    });
    out.push({ id: def.id, managed: !!f.managed, recipes });
  }
  return out;
}

/** One coarse day of factory work at `eff`: each line runs its best-margin recipe the stock and store room allow. */
function factoriesDay(game, lines, eff, carry) {
  if (!lines.length) return;
  const s = game.state, room = { silo: freeOf(game, 'silo'), cold: freeOf(game, 'cold') };
  const price = (map) => { let v = 0; for (const id in map) v += map[id] * (s.market[id] ?? 0); return v; };
  for (const line of lines) {
    let best = null;
    for (const o of line.recipes) {
      const per = eff * o.perDay;
      let k = Math.floor((carry[line.id] || 0) + per + 1e-9);
      for (const id in o.r.inputs) k = Math.min(k, Math.floor((sellableStock(game, id) + 1e-9) / o.r.inputs[id]));
      for (const kind in o.net) if (o.net[kind] > 1e-9) k = Math.min(k, Math.floor((room[kind] + 1e-9) / o.net[kind]));
      const margin = price(o.r.outputs) - price(o.r.inputs);
      if (k > 0 && margin > 0 && (!best || margin * k > best.margin * best.k)) best = { o, k, per, margin };
    }
    if (!best) continue;
    const { o, k } = best;
    carry[line.id] = ((carry[line.id] || 0) + best.per) % 1; // only the fraction carries; stock-limited days don't bank batches
    for (const id in o.r.inputs) { s.silo[id] = round2((s.silo[id] || 0) - o.r.inputs[id] * k); if (s.silo[id] <= 0) delete s.silo[id]; }
    for (const id in o.r.outputs) storeProduct(game, id, round2(o.r.outputs[id] * k));
    for (const kind in o.net) room[kind] -= o.net[kind] * k;
    game.addXp(round2(xpForValue(game, o.value * k)));
    if (line.managed && s.factoryManager?.stats) s.factoryManager.stats.batches += k;
  }
}

/** Deliver active contracts whose remainder the stock covers (the player cannot do it while away). */
function contractsDay(game) {
  for (const c of game.state.contracts || []) {
    if (c.status !== 'active') continue;
    const rest = c.qty - c.delivered;
    if (sellableStock(game, c.productId) + 1e-9 >= rest) deliverContract(game, c.id);
  }
}

/**
 * Coarse catch-up of `hours` game hours (Game.catchUp, after the exact window). `rollover(light)` runs the Game's
 * daily rollover; `light` (every coarse day but the last) skips the daily missions and the rival ranking, which only
 * matter for the day the player comes back. Whole days step midnight to midnight; the remainder (< 24 h) is
 * simulated exactly by `advance`. Returns the number of coarse days.
 */
export function runCoarse(game, hours, { rollover, advance }) {
  const s = game.state, eff = offlineCfg(game).efficiency, rates = fieldRates(game), lines = factoryLines(game), carry = {}, fcarry = {};
  let left = hours, days = 0, hold = null;
  while (left >= 24 - 1e-9) {
    const next = (Math.floor(s.time / 24 + 1e-9) + 1) * 24, dt = next - s.time;
    if (days % 7 === 0) hold = factoryHold(game, { hours: holdHours(game) }); // re-planned weekly (a pass is costly)
    fieldsDay(game, rates, eff * dt / 24, carry, hold);
    factoriesDay(game, lines, eff * dt / 24, fcarry);
    contractsDay(game);
    s.time = next;
    left -= dt;
    rollover(left >= 24 - 1e-9);
    days++;
  }
  if (left > 1e-9) advance(left);
  return days;
}
