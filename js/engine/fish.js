// Peternakan ikan: ponds (data PONDS / FISH_BALANCE). state.ponds = [{uid, pondId, count, stocked, growth 0–1,
// water 0–100, fed 0–1, aerator, autoWater, autoRestock, readyDays, dead, alert}]. One pond = one batch:
// build → tebar benih → grow `growDays` on pelet → panen (kg → Gudang dingin, overflow sold at 70%) → empty.
import { clamp, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { xpForValue } from './taskrun.js';
import { storeProduct } from './storage.js';
import { expansionCost } from './animals.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
export const fishCfg = (game) => game.data.FISH_BALANCE;
export const pondsOf = (game) => (game.state.ponds ||= []);
const findPond = (game, uid) => pondsOf(game).find((p) => p.uid === uid);

/** {unlocked, reason}: level gate, then the climate gate (owned field in a tropical / cold region) until anyRegionLevel. */
export function pondAccess(game, def) {
  const lvl = game.state.level;
  if (def.unlockLevel > lvl) return { unlocked: false, reason: `${def.name} terbuka di level ${def.unlockLevel}.` };
  if (!def.climate || lvl >= (def.anyRegionLevel ?? Infinity)) return { unlocked: true, reason: '' };
  const fits = (r) => (def.climate === 'tropical' ? !!r?.climate?.tropical : (r?.climate?.baseTemp ?? 99) <= fishCfg(game).coldTemp);
  const owned = Object.keys(game.state.fields).some((id) => fits(game.idx.regions.get(game.idx.fields.get(id)?.regionId)));
  if (owned) return { unlocked: true, reason: '' };
  const where = def.climate === 'tropical' ? 'wilayah tropis' : 'wilayah dingin';
  return { unlocked: false, reason: `Butuh ladang di ${where} (atau level ${def.anyRegionLevel}).` };
}

/** Pelet (t/day) a stocked pond eats: count × harvestKg × fcr / growDays kg. */
export const feedNeed = (def, p) => (p.count > 0 ? p.count * def.harvestKg * def.fcr / def.growDays / 1000 : 0);
/** Growth multiplier from kualitas air: 1 at ≥ goodWater, minGrowth at 0. */
export function waterGrowth(game, water) {
  const c = fishCfg(game);
  return water >= c.goodWater ? 1 : c.minGrowth + (1 - c.minGrowth) * water / c.goodWater;
}
/** Daily death rate at this water quality and fed share. */
export function mortality(game, water, fed) {
  const c = fishCfg(game);
  const bad = water < c.badWater ? c.badWaterMortality * (c.badWater - water) / c.badWater : 0;
  return c.baseMortality + bad + c.hungerMortality * (1 - fed);
}
export const aeratorCost = (game, def) => round2(def.buildCost * fishCfg(game).aeratorRate);
/** Price of the next pond of this type: rises with the ponds of that type already built (BALANCE.expansion.pond). */
export const pondCostOf = (game, def) => expansionCost(game, 'pond', def.buildCost, pondsOf(game).filter((p) => p.pondId === def.id).length);

export function buildPond(game, pondId) {
  const def = game.idx.ponds.get(pondId);
  if (!def) return fail('Kolam tidak ditemukan.');
  const access = pondAccess(game, def);
  if (!access.unlocked) return fail(access.reason);
  if (!game.spend(pondCostOf(game, def), 'kolam')) return fail('Uang tidak cukup.');
  const s = game.state;
  s.nextPondUid = (s.nextPondUid || 1);
  const pond = { uid: `k${s.nextPondUid++}`, pondId, count: 0, stocked: 0, growth: 0, water: 100, fed: 1,
    aerator: false, autoWater: false, autoRestock: false, readyDays: 0, dead: 0, alert: 'ok' };
  pondsOf(game).push(pond);
  game.emit('pond_built', `${def.emoji} ${def.name} dibangun.`, { uid: pond.uid, pondId });
  return ok({ uid: pond.uid });
}

/** Tebar benih into an empty pond (`n` defaults to full capacity). */
export function stockPond(game, uid, n) {
  const p = findPond(game, uid), def = p && game.idx.ponds.get(p.pondId);
  if (!def) return fail('Kolam tidak ditemukan.');
  if (p.count > 0) return fail('Kolam masih berisi ikan.');
  n = Math.floor(n ?? def.capacity);
  if (!(n > 0) || n > def.capacity) return fail(`Jumlah benih 1–${def.capacity} ekor.`);
  const cost = round2(n * def.fryPrice);
  if (!game.spend(cost, 'benih_ikan')) return fail('Uang tidak cukup.');
  Object.assign(p, { count: n, stocked: n, growth: 0, fed: 1, readyDays: 0, dead: 0, alert: 'ok' });
  game.emit('pond_stocked', `${def.emoji} ${fmtNum(n)} benih ditebar di ${def.name} (${fmtMoney(cost)}).`, { uid, n, cost });
  return ok({ count: n, cost });
}

/** Ganti air: kualitas air back to 100%. */
export function changeWater(game, uid, { quiet = false } = {}) {
  const p = findPond(game, uid), def = p && game.idx.ponds.get(p.pondId);
  if (!def) return fail('Kolam tidak ditemukan.');
  if (p.water >= 99.5) return fail('Air masih jernih.');
  if (!game.spend(def.waterCost, 'air_kolam')) return fail('Uang tidak cukup.');
  p.water = 100;
  if (!quiet) game.emit('pond_water', `💧 Air ${def.name} diganti (${fmtMoney(def.waterCost)}).`, { uid, cost: def.waterCost });
  return ok({ cost: def.waterCost });
}

export function buyAerator(game, uid) {
  const p = findPond(game, uid), def = p && game.idx.ponds.get(p.pondId);
  if (!def) return fail('Kolam tidak ditemukan.');
  if (p.aerator) return fail('Aerator sudah terpasang.');
  const cost = aeratorCost(game, def);
  if (!game.spend(cost, 'kolam')) return fail('Uang tidak cukup.');
  p.aerator = true;
  game.emit('pond_aerator', `🫧 Aerator dipasang di ${def.name}: air turun ${Math.round(fishCfg(game).aeratorDecay * 100)}% lebih lambat.`, { uid, cost });
  return ok({ cost });
}

/** Toggles: `water` (ganti air otomatis below autoWaterBelow), `restock` (tebar ulang after harvest). */
export function setPondAuto(game, uid, { water, restock } = {}) {
  const p = findPond(game, uid);
  if (!p) return fail('Kolam tidak ditemukan.');
  if (water != null) p.autoWater = !!water;
  if (restock != null) p.autoRestock = !!restock;
  return ok({ autoWater: p.autoWater, autoRestock: p.autoRestock });
}

/** Panen a grown pond: count × harvestKg kg into the Gudang dingin, XP by value; the pond empties (fresh water). */
export function harvestPond(game, uid, { auto = false } = {}) {
  const p = findPond(game, uid), def = p && game.idx.ponds.get(p.pondId);
  if (!def) return fail('Kolam tidak ditemukan.');
  if (!(p.count > 0)) return fail('Kolam kosong.');
  if (p.growth < 1) return fail(`Ikan belum siap panen (${Math.floor(p.growth * 100)}%).`);
  const kg = round2(p.count * def.harvestKg);
  const res = storeProduct(game, def.product, kg);
  const value = kg * (game.state.market[def.product] ?? 0);
  const prod = game.idx.products.get(def.product);
  const fish = p.count;
  Object.assign(p, { count: 0, growth: 0, water: 100, readyDays: 0, alert: 'ok' });
  game.emit('fish_harvest', `${def.emoji} Panen ${def.name}${auto ? ' (otomatis)' : ''}: ${fmtNum(kg)} kg ${prod?.name ?? def.product} dari ${fmtNum(fish)} ekor.`,
    { uid, pondId: def.id, productId: def.product, kg, fish, auto, stored: res.stored, overflow: res.overflow, earned: res.earned });
  game.addXp(round2(xpForValue(game, value)));
  if (p.autoRestock) stockPond(game, uid);
  return ok({ kg, stored: res.stored, overflow: res.overflow, earned: res.earned });
}

/** Pelet (t) every stocked pond eats per day. */
export const totalFeedNeed = (game) => pondsOf(game).reduce((s, p) => s + feedNeed(game.idx.ponds.get(p.pondId), p), 0);

/**
 * Midnight: each stocked pond eats pelet from the silo, water decays (aerator slows it; auto ganti air below
 * autoWaterBelow if affordable), fish grow by fed × waterGrowth / growDays and die by `mortality`. Grown ponds
 * left unharvested for autoHarvestDays are harvested automatically. Alerts fire only when the situation changes.
 */
export function stepFishDay(game) {
  const c = fishCfg(game), silo = game.state.silo;
  for (const p of [...pondsOf(game)]) {
    const def = game.idx.ponds.get(p.pondId);
    if (!def || !(p.count > 0)) continue;
    const need = feedNeed(def, p);
    const take = Math.min(need, silo[c.feed] || 0);
    if (take > 0) {
      silo[c.feed] = Math.round((silo[c.feed] - take) * 1e6) / 1e6;
      if (silo[c.feed] <= 0) delete silo[c.feed];
    }
    const fed = need > 0 ? clamp(take / need, 0, 1) : 1;
    p.fed = round2(fed);
    p.water = round2(Math.max(0, p.water - def.waterDecay * (p.aerator ? c.aeratorDecay : 1)));
    if (p.autoWater && p.water < c.autoWaterBelow) changeWater(game, p.uid, { quiet: true });
    const deaths = Math.min(p.count, Math.round(p.count * mortality(game, p.water, fed)));
    p.count -= deaths;
    p.dead = (p.dead || 0) + deaths;
    if (p.count === 0) {
      Object.assign(p, { growth: 0, readyDays: 0, alert: 'ok' });
      game.emit('pond_alert', `💀 Semua ikan di ${def.name} mati. Jaga air & pelet, lalu tebar benih lagi.`, { uid: p.uid, alert: 'dead' });
      continue;
    }
    if (p.growth < 1) {
      const g = p.growth + fed * waterGrowth(game, p.water) / def.growDays;
      p.growth = g >= 0.999 ? 1 : Math.round(g * 1e4) / 1e4;
      if (p.growth >= 1) game.emit('fish_ready', `${def.emoji} ${def.name} siap panen!`, { uid: p.uid, pondId: def.id });
    } else if (++p.readyDays >= c.autoHarvestDays && p.count > 0) {
      harvestPond(game, p.uid, { auto: true });
      continue;
    }
    const alert = p.count === 0 ? 'ok' : p.water < c.badWater ? 'water' : fed < 0.999 ? 'hungry' : 'ok';
    if (alert !== p.alert) {
      if (alert === 'water') game.emit('pond_alert', `⚠️ Kualitas air ${def.name} buruk (${Math.round(p.water)}%)! Ikan mulai mati — ganti air.`, { uid: p.uid, alert });
      else if (alert === 'hungry') game.emit('pond_alert', `⚠️ ${def.name} kekurangan pelet ikan! Pertumbuhan terhenti.`, { uid: p.uid, alert });
    }
    p.alert = alert;
  }
}
