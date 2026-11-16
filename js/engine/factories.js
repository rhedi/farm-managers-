// Factories (stream B): processing chains on state.factories. Deterministic (no RNG).
// state.factories[id] = { level, recipeId, queued, progress, running, auto, blocked, managed?, inMult?, outMult?, batchOut? }
//   queued: batches still to run (manual mode), running: inputs of the current batch are consumed,
//   progress: work hours done on it, blocked: Indonesian reason or null.
//   managed: run by the Manajer Pabrik (factoryManager.js), which sets inMult/outMult (its tier's −input / +output);
//   batchOut: output multiplier fixed when the running batch started.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { roomFor } from './storage.js';
import { sellableStock } from './economy.js';

export const SPEED_PER_LEVEL = 1.25;

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

export const defOf = (game, id) => (game.data.FACTORIES || []).find((f) => f.id === id);
export const recipeOf = (def, recipeId) => def?.recipes.find((r) => r.id === recipeId) ?? null;
const pname = (game, id) => game.idx.products.get(id)?.name ?? id;
const unit = (game, id) => game.idx.products.get(id)?.unit ?? '';
const basePrice = (game, id) => game.idx.products.get(id)?.basePrice ?? 0;

export const speedOf = (level) => SPEED_PER_LEVEL ** Math.max(0, level - 1);
/** Hours a batch takes at this level (whole game hours: factories step once per hour). */
export const batchHours = (recipe, level) => Math.ceil(recipe.hours / speedOf(level) - 1e-9);
export const valueOf = (game, map) => round2(Object.entries(map).reduce((s, [id, q]) => s + q * basePrice(game, id), 0));

export function stateOf(game, id) {
  const all = (game.state.factories ||= {});
  const f = all[id];
  if (!f) return null;
  return Object.assign(f, { level: 1, recipeId: null, queued: 0, progress: 0, running: false, auto: false, blocked: null, ...f });
}

/** Recipe as this factory runs it: inputs × f.inMult, outputs × outMult (default f.outMult; Manajer Pabrik tiers). */
export function scaledRecipe(recipe, f, outMult = f?.outMult ?? 1) {
  const inMult = f?.inMult ?? 1;
  if (inMult === 1 && outMult === 1) return recipe;
  const scale = (map, m) => Object.fromEntries(Object.entries(map).map(([id, q]) => [id, round2(q * m)]));
  return { ...recipe, inputs: scale(recipe.inputs, inMult), outputs: scale(recipe.outputs, outMult) };
}

/** First input that is short (feed reserve kept), as an Indonesian reason; '' when all inputs are there. */
export function missingInput(game, recipe, f = null) {
  for (const [id, q] of Object.entries(scaledRecipe(recipe, f).inputs)) {
    const have = sellableStock(game, id);
    if (have + 1e-9 < q) return `Bahan kurang: ${pname(game, id)} ${fmtNum(have)}/${fmtNum(q)} ${unit(game, id)}.`;
  }
  return '';
}

/** Outputs that won't fit their store (t goods: silo), as a reason; '' when it all fits. */
export const noRoom = (game, recipe) => roomFor(game, recipe.outputs);

function setBlocked(game, id, f, reason) {
  if (f.blocked === reason) return;
  f.blocked = reason || null;
  if (reason) game.emit('factory_blocked', `${defOf(game, id).name} berhenti: ${reason}`, { factoryId: id, reason });
}

/** Start the next batch if one is wanted (queued or auto) and the inputs are there. */
function tryStart(game, id, f) {
  const recipe = recipeOf(defOf(game, id), f.recipeId);
  if (f.running || !recipe || !(f.queued > 0 || f.auto)) {
    if (!f.running) setBlocked(game, id, f, null);
    return false;
  }
  const miss = missingInput(game, recipe, f);
  if (miss) { setBlocked(game, id, f, miss); return false; }
  const silo = game.state.silo;
  for (const [pid, q] of Object.entries(scaledRecipe(recipe, f).inputs)) {
    silo[pid] = round2(silo[pid] - q);
    if (silo[pid] <= 0) delete silo[pid];
  }
  f.running = true;
  f.progress = 0;
  if ((f.outMult ?? 1) !== 1) f.batchOut = f.outMult; else delete f.batchOut;
  setBlocked(game, id, f, null);
  return true;
}

function finish(game, id, f, base) {
  const recipe = scaledRecipe(base, null, f.batchOut ?? 1);
  const full = noRoom(game, recipe);
  if (full) { setBlocked(game, id, f, full); return; }
  const silo = game.state.silo, def = defOf(game, id);
  for (const [pid, q] of Object.entries(recipe.outputs)) {
    silo[pid] = round2((silo[pid] || 0) + q);
    game.emit('factory_done', `${def.emoji} ${def.name}: ${fmtNum(q)} ${unit(game, pid)} ${pname(game, pid)} selesai.`,
      { factoryId: id, productId: pid, qty: q });
  }
  f.running = false;
  f.progress = 0;
  delete f.batchOut;
  if (f.queued > 0) f.queued -= 1;
  setBlocked(game, id, f, null);
  game.addXp(round2(valueOf(game, recipe.outputs) * (game.data.BALANCE.xpPerHarvestValue ?? 0.01)));
}

/** One game hour of work for every owned factory (called by Game.advance at each full hour). */
export function stepFactoriesHour(game) {
  for (const def of game.data.FACTORIES || []) {
    const f = stateOf(game, def.id);
    if (!f) continue;
    if (!f.running) { tryStart(game, def.id, f); continue; } // a batch started now counts from the next hour
    const recipe = recipeOf(def, f.recipeId);
    if (!recipe) { f.running = false; continue; } // recipe dropped from data
    const need = batchHours(recipe, f.level);
    if (f.progress < need) f.progress += 1;
    if (f.progress >= need) {
      finish(game, def.id, f, recipe);
      if (!f.running) tryStart(game, def.id, f);
    }
  }
}

export function buyFactory(game, id) {
  const def = defOf(game, id);
  if (!def) return fail('Pabrik tidak ditemukan.');
  if (stateOf(game, id)) return fail(`${def.name} sudah dimiliki.`);
  if (def.unlockLevel > game.state.level) return fail(`${def.name} terbuka di level ${def.unlockLevel}.`);
  if (!game.spend(def.price, 'pabrik')) return fail('Uang tidak cukup.');
  game.state.factories[id] = { level: 1, recipeId: def.recipes[0]?.id ?? null, queued: 0, progress: 0, running: false, auto: false, blocked: null };
  game.emit('factory_bought', `${def.emoji} ${def.name} dibeli seharga ${fmtMoney(def.price)}.`, { factoryId: id });
  return ok({ cost: def.price });
}

export const upgradeCostOf = (def, level) => (level >= def.maxLevel ? null : def.upgradeCost * level);

export function upgradeFactory(game, id) {
  const def = defOf(game, id), f = stateOf(game, id);
  if (!def || !f) return fail('Pabrik belum dimiliki.');
  const cost = upgradeCostOf(def, f.level);
  if (cost == null) return fail('Pabrik sudah level maksimal.');
  if (!game.spend(cost, 'pabrik')) return fail('Uang tidak cukup.');
  f.level += 1;
  return ok({ level: f.level, cost });
}

/** Player calls on a factory run by the Manajer Pabrik fail; the manager passes `{ byManager: true }`. */
const MANAGED = '🤖 Dikelola Manajer Pabrik. Lepas pabrik ini di pengaturan manajer untuk mengatur sendiri.';

export function setRecipe(game, id, recipeId, opts = {}) {
  const def = defOf(game, id), f = stateOf(game, id);
  if (!def || !f) return fail('Pabrik belum dimiliki.');
  if (f.managed && !opts.byManager) return fail(MANAGED);
  if (!recipeOf(def, recipeId)) return fail('Resep tidak ditemukan.');
  if (f.running) return fail('Pabrik sedang memproses.');
  f.recipeId = recipeId;
  f.queued = 0;
  tryStart(game, id, f);
  return ok({ recipeId });
}

/** Queue `count` batches; fails when idle and the first batch can't start. */
export function startBatch(game, id, count = 1, opts = {}) {
  const f = stateOf(game, id);
  if (!f) return fail('Pabrik belum dimiliki.');
  if (f.managed && !opts.byManager) return fail(MANAGED);
  const recipe = recipeOf(defOf(game, id), f.recipeId);
  if (!recipe) return fail('Pilih resep dulu.');
  count = Math.floor(Number(count));
  if (!(count > 0)) return fail('Jumlah tidak valid.');
  if (!f.running) {
    const miss = missingInput(game, recipe, f);
    if (miss) return fail(miss);
  }
  f.queued += count;
  tryStart(game, id, f);
  return ok({ queued: f.queued });
}

export function setFactoryAuto(game, id, on) {
  const f = stateOf(game, id);
  if (!f) return fail('Pabrik belum dimiliki.');
  if (f.managed) return fail(MANAGED);
  f.auto = !!on;
  tryStart(game, id, f);
  return ok({ auto: f.auto });
}
