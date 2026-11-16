// Manajer Pabrik planner: pure (no state changes), deterministic. Scores every recipe of every controlled factory by
// margin per hour (output at market − inputs at market sell price − running cost) and allocates usable inputs and
// storage room greedily, best score first. factoryManager.js applies the plan; the dispatcher holds its inputs.
import { round2 } from './rng.js';
import { sellableStock } from './economy.js';
import { stateOf, recipeOf, scaledRecipe, batchHours } from './factories.js';
import { capacityOf, usedOf, kindOf, tonsPerUnit, STORAGE_KINDS } from './storage.js';
import { BUY_MARKUP } from './purchase.js';

export const WAIT = { input: 'bahan kurang', room: 'gudang hampir penuh', margin: 'margin terlalu kecil' };
const EPS = 1e-9;
const price = (game, id) => game.state.market[id] ?? 0;
const sum = (map, fn) => Object.entries(map).reduce((a, [id, q]) => a + fn(id, q), 0);
const add = (map, id, q) => { map[id] = round2((map[id] || 0) + q); };
const owned = (game) => (game.data.FACTORIES || []).filter((d) => stateOf(game, d.id));

/** Factories the manager runs: owned, allowed by settings (null = all), the first `tier.factories` in data order. */
export function controlledIds(game, tier, settings) {
  const ids = owned(game).map((d) => d.id).filter((id) => !settings.factories || settings.factories.includes(id));
  return tier.factories == null ? ids : ids.slice(0, tier.factories);
}

/** Remaining quantity of active contracts per product. */
export function contractNeed(game) {
  const need = {};
  for (const c of game.state.contracts || []) if (c.status === 'active') add(need, c.productId, Math.max(0, c.qty - c.delivered));
  return need;
}

/** Inputs of batches queued but not started yet (any factory): already promised, so never planned twice. */
export function pendingInputs(game) {
  const out = {};
  for (const def of owned(game)) {
    const f = stateOf(game, def.id), r = recipeOf(def, f.recipeId), n = f.queued - (f.running ? 1 : 0);
    if (r && n > 0) for (const [id, q] of Object.entries(scaledRecipe(r, f).inputs)) add(out, id, q * n);
  }
  return out;
}

/** Stock the manager may use per product: sellable (feed reserve kept) − queued inputs − contracts − logistics holds − reserve %. */
export function usableStock(game, settings) {
  const s = game.state, pend = pendingInputs(game), need = settings.contracts ? contractNeed(game) : {};
  const held = s.dispatcher?.hired ? s.dispatcher.held || {} : {};
  const out = {};
  for (const id of Object.keys(s.silo)) {
    const keep = (s.silo[id] || 0) * (settings.reservePct[id] || 0) / 100;
    out[id] = Math.max(0, round2(sellableStock(game, id) - (pend[id] || 0) - (need[id] || 0) - (held[id] || 0) - keep));
  }
  return out;
}

/** Tons per store a batch adds (outputs) minus what it takes out (inputs). */
function netTons(game, r) {
  const net = {};
  for (const [map, sign] of [[r.outputs, 1], [r.inputs, -1]]) for (const [id, q] of Object.entries(map)) {
    const p = game.idx.products.get(id), kind = kindOf(p);
    if (kind) net[kind] = (net[kind] || 0) + sign * q * tonsPerUnit(p);
  }
  return net;
}

/** Free tons under the headroom per store, after running outputs and queued batches land. */
function roomLeft(game, headroom) {
  const room = Object.fromEntries(STORAGE_KINDS.map((k) => [k, capacityOf(game, k) * headroom / 100 - usedOf(game, k)]));
  for (const def of owned(game)) {
    const f = stateOf(game, def.id), r = recipeOf(def, f.recipeId);
    if (!r) continue;
    if (f.running) for (const [id, q] of Object.entries(scaledRecipe(r, null, f.batchOut ?? 1).outputs)) {
      const p = game.idx.products.get(id), kind = kindOf(p);
      if (kind) room[kind] -= q * tonsPerUnit(p);
    }
    const n = f.queued - (f.running ? 1 : 0);
    if (n > 0) for (const [k, t] of Object.entries(netTons(game, scaledRecipe(r, f)))) room[k] -= n * Math.max(0, t);
  }
  return room;
}

/** Every recipe option of the controlled factories with queue room, best first. `ahead`: as if every queue were empty. */
function options(game, tier, set, ids, wagePerHour, ahead) {
  const out = [], need = set.contracts ? contractNeed(game) : {};
  const mods = { inMult: tier.inputMult ?? 1, outMult: tier.outputMult ?? 1 };
  ids.forEach((fid, fi) => {
    const def = (game.data.FACTORIES || []).find((d) => d.id === fid), f = stateOf(game, fid);
    const recipes = f.queued > 0 || f.running ? [recipeOf(def, f.recipeId)].filter(Boolean) : def.recipes;
    recipes.forEach((base) => {
      const r = scaledRecipe(base, mods), hours = batchHours(base, f.level);
      const busy = Math.max(f.queued, f.running ? 1 : 0); // an auto batch started before the takeover has queued 0
      const free = Math.max(1, Math.ceil(tier.intervalHours / hours - EPS)) - (ahead ? 0 : busy);
      if (free <= 0) return;
      const outV = sum(r.outputs, (id, q) => q * price(game, id)), inV = sum(r.inputs, (id, q) => q * price(game, id));
      const run = wagePerHour * hours / ids.length, margin = outV - inV - run;
      const buyIn = sum(r.inputs, (id, q) => q * price(game, id) * (game.idx.crops.has(id) ? BUY_MARKUP : 1));
      const prio = Object.keys(r.outputs).some((id) => (need[id] || 0) > (game.state.silo[id] || 0) + EPS);
      out.push({ fid, fi, ri: def.recipes.indexOf(base), recipe: base, r, hours, free, net: netTons(game, r), prio,
        margin, pct: margin / Math.max(EPS, inV + run) * 100, buyMargin: outV - buyIn - run, buyPct: (outV - buyIn - run) / Math.max(EPS, buyIn + run) * 100 });
    });
  });
  return out.sort((a, b) => (b.prio - a.prio) || (b.margin / b.hours - a.margin / a.hours) || a.fi - b.fi || a.ri - b.ri);
}

/**
 * Batches that fit `room` given each store's net tons per batch (+ `extra` tons bought up front). Only stores that
 * grow are checked: a batch that shrinks a store (10 t wheat → 7.5 t flour) can never overflow it.
 */
const roomCap = (o, room, k, extra = {}) => Object.keys({ ...o.net, ...extra })
  .every((kind) => { const t = (extra[kind] || 0) + k * Math.max(0, o.net[kind] || 0); return t <= EPS || t <= room[kind] + EPS; });

/**
 * One pass: `{ plans: [{factoryId, recipeId, batches, use, buy, buyCost, estProfit}], waits: {factoryId: WAIT reason}, ids }`.
 * Stock-only batches first; with buying allowed (tier + setting) the rest of the queue is bought when the all-bought
 * margin still passes the minimum and the money is there. `ahead`: dry run of the next pass (no buying) for the
 * logistics hold. Room: inputs leave only when a batch starts, so they never free room for this pass.
 */
export function planPass(game, tier, set, wage, { ahead = false } = {}) {
  const ids = controlledIds(game, tier, set), usable = usableStock(game, set), room = roomLeft(game, set.headroom);
  const plans = [], waits = {}, done = new Set();
  let money = game.state.money;
  for (const o of options(game, tier, set, ids, wage / 24, ahead)) {
    if (done.has(o.fid)) continue;
    if (o.pct < set.minMargin - EPS || o.margin <= 0) { waits[o.fid] ??= WAIT.margin; continue; }
    const byStock = Math.min(...Object.entries(o.r.inputs).map(([id, q]) => Math.floor(((usable[id] || 0) + EPS) / q)));
    let k = Math.min(o.free, byStock);
    while (k > 0 && !roomCap(o, room, k)) k--;
    const buy = {};
    let buyCost = 0, roomBlocked = false;
    if (!ahead && tier.buyInputs && set.buyInputs && k < o.free && o.buyMargin > 0 && o.buyPct >= set.minMargin - EPS) {
      for (let kb = o.free; kb > k; kb--) {
        const b = {}, tons = {};
        let cost = 0, okBuy = true;
        for (const [id, q] of Object.entries(o.r.inputs)) {
          const miss = round2(Math.max(0, kb * q - (usable[id] || 0)));
          if (miss <= EPS) continue;
          if (!game.idx.crops.has(id) || !(price(game, id) > 0)) { okBuy = false; break; }
          b[id] = miss; cost += miss * price(game, id) * BUY_MARKUP;
          const p = game.idx.products.get(id), kind = kindOf(p);
          if (kind) tons[kind] = (tons[kind] || 0) + miss * tonsPerUnit(p);
        }
        if (!okBuy || cost > money + EPS) continue;
        if (!roomCap(o, room, kb, tons)) { roomBlocked = true; continue; }
        Object.assign(buy, b); buyCost = round2(cost); k = kb;
        for (const [kind, t] of Object.entries(tons)) room[kind] -= t;
        break;
      }
    }
    if (k < 1) { waits[o.fid] ??= byStock < 1 && !roomBlocked ? WAIT.input : WAIT.room; continue; }
    const use = {};
    for (const [id, q] of Object.entries(o.r.inputs)) {
      const u = round2(Math.min(usable[id] || 0, k * q - (buy[id] || 0)));
      if (u > 0) { use[id] = u; usable[id] = round2(usable[id] - u); }
    }
    for (const [kind, t] of Object.entries(o.net)) room[kind] -= k * Math.max(0, t);
    money -= buyCost;
    done.add(o.fid);
    delete waits[o.fid];
    const extra = Object.entries(buy).reduce((a, [id, q]) => a + q * price(game, id) * (BUY_MARKUP - 1), 0);
    plans.push({ factoryId: o.fid, recipeId: o.recipe.id, batches: k, use, buy, buyCost, estProfit: round2(k * o.margin - extra) });
  }
  for (const id of ids) if (!done.has(id) && !waits[id] && !stateOf(game, id).queued) waits[id] = WAIT.input;
  return { plans, waits, ids };
}
