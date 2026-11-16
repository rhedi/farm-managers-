// Manajer Pabrik: a hired staff member who runs the controlled factories. Every `tier.intervalHours` (Game.advance,
// after the factories step) it queues the most profitable batches the stock allows (js/engine/factoryPlanner.js),
// through the normal factories.js setRecipe/startBatch path. Deterministic (no RNG). Offline catch-up is bounded by
// MAX_CATCHUP_HOURS, so at most 48 / intervalHours passes.
// state.factoryManager = { hired: null | {tierId, hiredDay}, on, settings, lastPass /* game time */, waits:{factoryId: reason},
//   stats:{runs, batches, estProfit, bought}, today:{day, runs, batches, profit}, recent:[≤ RECENT], note,
//   last: null | {time, runs:[{factoryId, recipeId, batches}]} /* the latest pass that queued something */ }
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { stateOf, defOf, recipeOf, setRecipe, startBatch } from './factories.js';
import { buyProduct } from './purchase.js';
import { storageInfo } from './storage.js';
import { planPass, controlledIds, WAIT } from './factoryPlanner.js';
import { staffCfg, staffTier, staffWage, hireStaff, staffSwapCost, replaceStaff, fireStaff, payStaffDay, staffCandidates } from './staff.js';

export const RECENT = 6;
export { WAIT };
/** Stepper values offered by the UI (the engine accepts any value inside the limits). */
export const STEPS = {
  minMargin: [0, 5, 10, 15, 20, 30, 50],
  reservePct: [0, 10, 25, 50, 75, 90],
  headroom: [60, 70, 80, 90, 95, 100],
};
const LIMITS = { minMargin: [0, 100], reservePct: [0, 90], headroom: [50, 100] };
export const defaultSettings = () => ({ factories: null, reservePct: {}, minMargin: 5, buyInputs: false, headroom: 90, contracts: true });

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Number(v) || 0));
/** Staff role for js/engine/staff.js (shared hire / replace / fire with the Manajer Logistik). */
const ROLE = { key: 'factoryManager', cfg: 'factoryManager', label: 'manajer pabrik', Title: 'Manajer Pabrik', icon: '🏭',
  event: 'factory_manager', fireNote: 'Batch yang sedang diproses tetap selesai; pabrik kembali kamu atur sendiri.',
  run: (game) => runFactoryManager(game, { force: true }) };
const cfg = (game) => staffCfg(game, ROLE);
export const tierOf = (game, id) => staffTier(game, ROLE, id);
const st = (game) => game.state.factoryManager;
const working = (game) => !!(st(game)?.hired && st(game).on && tierOf(game, st(game).hired.tierId));
const pname = (game, id) => game.idx.products.get(id)?.name ?? id;

export const factoryManagerWage = (game) => staffWage(game, ROLE);

/** createGame / load migration: absent = not hired, default settings; unknown ids are dropped. */
export function ensureFactoryManager(game) {
  const s = game.state;
  const d = s.factoryManager = { hired: null, on: true, settings: {}, lastPass: null, waits: {}, stats: {}, today: {}, recent: [], note: '', last: null, idleSince: null, ...(s.factoryManager || {}) };
  if (d.hired && !tierOf(game, d.hired.tierId)) d.hired = null;
  d.settings = sanitize(game, { ...defaultSettings(), ...d.settings });
  d.stats = { runs: 0, batches: 0, estProfit: 0, bought: 0, ...d.stats };
  d.today = { day: game.day, runs: 0, batches: 0, profit: 0, ...d.today };
  d.waits ||= {};
  d.recent = (d.recent || []).slice(0, RECENT);
  syncControl(game);
}

function sanitize(game, x) {
  const products = game.idx.products, facs = new Set((game.data.FACTORIES || []).map((f) => f.id));
  const reservePct = {};
  for (const [id, v] of Object.entries(x.reservePct || {})) {
    const pct = Math.round(clamp(v, LIMITS.reservePct));
    if (products.has(id) && pct > 0) reservePct[id] = pct;
  }
  return {
    factories: Array.isArray(x.factories) ? (game.data.FACTORIES || []).map((f) => f.id).filter((id) => x.factories.includes(id) && facs.has(id)) : null,
    reservePct,
    minMargin: round2(clamp(x.minMargin, LIMITS.minMargin)),
    buyInputs: !!x.buyInputs,
    headroom: Math.round(clamp(x.headroom ?? 90, LIMITS.headroom)),
    contracts: x.contracts !== false,
  };
}

/** Controlled factories: `managed` with the tier's input/output scale; the rest go back to the player. */
function syncControl(game) {
  const d = st(game), tier = working(game) ? tierOf(game, d.hired.tierId) : null;
  const ids = new Set(tier ? controlledIds(game, tier, d.settings) : []);
  for (const def of game.data.FACTORIES || []) {
    const f = stateOf(game, def.id);
    if (!f) continue;
    if (ids.has(def.id)) {
      f.managed = true; f.auto = false;
      if ((tier.inputMult ?? 1) !== 1) f.inMult = tier.inputMult; else delete f.inMult;
      if ((tier.outputMult ?? 1) !== 1) f.outMult = tier.outputMult; else delete f.outMult;
    } else if (f.managed) { delete f.managed; delete f.inMult; delete f.outMult; }
  }
  for (const id of Object.keys(d.waits)) if (!ids.has(id)) delete d.waits[id];
}

export const hireFactoryManager = (game, tierId) => hireStaff(game, ROLE, tierId);
/** Price of switching the hired manager to `t`: its hireCost − tradeIn × the current tier's hireCost, never < 0. */
export const swapCost = (game, t) => staffSwapCost(game, ROLE, t);
/** Promote / replace; settings, stats, recent runs and aktif/jeda stay; the new tier plans at once. */
export const replaceFactoryManager = (game, tierId) => replaceStaff(game, ROLE, tierId);
export function fireFactoryManager(game) {
  const r = fireStaff(game, ROLE);
  if (r.ok) syncControl(game);
  return r;
}

/** Aktif/jeda. Paused = the factories go back to the player (queued batches stay); turning it on plans at once. */
export function setFactoryManagerOn(game, on) {
  const d = st(game);
  if (!d.hired) return fail('Belum ada manajer pabrik.');
  d.on = !!on;
  d.note = '';
  if (d.on) runFactoryManager(game, { force: true }); else syncControl(game);
  return ok({ on: d.on });
}

/** Partial update (`reservePct` replaces the map); values are clamped. Plans at once when working. */
export function setFactoryManagerSettings(game, patch = {}) {
  const d = st(game);
  d.settings = sanitize(game, { ...d.settings, ...patch });
  if (working(game)) runFactoryManager(game, { force: true }); else syncControl(game);
  return ok({ settings: structuredClone(d.settings) });
}

/**
 * Inputs the Manajer Pabrik keeps from automatic selling/shipping: queued batches of its factories not started yet
 * plus what the next pass would use (dry run, no buying). `hours` > interval widens the dry run to that many hours of
 * queue room (plan auto-sell keeps a day of inputs, js/engine/stockKeep.js). {} when not working.
 */
export function factoryHold(game, { hours = 0 } = {}) {
  if (!working(game)) return {};
  const d = st(game), tier = tierOf(game, d.hired.tierId), ids = new Set(controlledIds(game, tier, d.settings));
  const hold = {};
  const add = (id, q) => { hold[id] = round2((hold[id] || 0) + q); };
  for (const def of game.data.FACTORIES || []) if (ids.has(def.id)) {
    const f = stateOf(game, def.id), r = recipeOf(def, f.recipeId), n = f.queued - (f.running ? 1 : 0);
    if (r && n > 0) for (const [id, q] of Object.entries(r.inputs)) add(id, q * (f.inMult ?? 1) * n);
  }
  for (const p of planPass(game, tier, d.settings, factoryManagerWage(game), { ahead: true, horizon: hours }).plans) for (const [id, q] of Object.entries(p.use)) add(id, q);
  return hold;
}

/**
 * One planning pass when due (every tier.intervalHours; `force` = now): applies planPass — recipe switch, inputs bought
 * (ledger 'pembelian_produk'), batches queued via startBatch. Returns the runs [{factoryId, recipeId, batches, estProfit, buyCost}].
 */
export function runFactoryManager(game, { force = false } = {}) {
  const d = st(game);
  syncControl(game);
  if (!working(game)) return [];
  const s = game.state, tier = tierOf(game, d.hired.tierId);
  if (!force && d.lastPass != null && s.time - d.lastPass < tier.intervalHours - 1e-6) return [];
  d.lastPass = s.time;
  const plan = planPass(game, tier, d.settings, factoryManagerWage(game));
  const runs = [];
  for (const p of plan.plans) {
    const f = stateOf(game, p.factoryId);
    if (f.recipeId !== p.recipeId && !setRecipe(game, p.factoryId, p.recipeId, { byManager: true }).ok) continue;
    let bought = 0;
    for (const [id, q] of Object.entries(p.buy)) { const r = buyProduct(game, id, q, 'pembelian_produk'); if (r.ok) bought = round2(bought + r.cost); }
    const r = startBatch(game, p.factoryId, p.batches, { byManager: true });
    if (!r.ok) { plan.waits[p.factoryId] = WAIT.input; continue; }
    runs.push({ ...p, buyCost: bought });
    record(game, tier, p, bought);
  }
  d.waits = Object.fromEntries(Object.entries(plan.waits).filter(([id]) => !runs.some((r) => r.factoryId === id)));
  if (runs.length) d.last = { time: s.time, runs: runs.map((r) => ({ factoryId: r.factoryId, recipeId: r.recipeId, batches: r.batches })) };
  const idle = plan.ids.filter((id) => { const f = stateOf(game, id); return !f.running && !f.queued; });
  const why = [...new Set(idle.map((id) => d.waits[id]).filter(Boolean))];
  d.note = !plan.ids.length ? 'Belum punya pabrik. Beli di Gudang › Olahan.'
    : idle.length ? `${idle.length} pabrik menunggu: ${why.join(', ') || WAIT.input}.` : '';
  d.idleSince = idle.length ? (d.idleSince ?? s.time) : null; // a factory left idle ≥ 1 game day → card shows a fix
  return runs;
}

function record(game, tier, p, bought) {
  const d = st(game), def = defOf(game, p.factoryId), recipe = recipeOf(def, p.recipeId);
  const out = Object.keys(recipe.outputs)[0], name = recipe.name ?? pname(game, out);
  if (d.today.day !== game.day) d.today = { day: game.day, runs: 0, batches: 0, profit: 0 };
  d.today.runs++; d.today.batches += p.batches; d.today.profit = round2(d.today.profit + p.estProfit);
  d.stats.runs++; d.stats.batches += p.batches;
  d.stats.estProfit = round2(d.stats.estProfit + p.estProfit);
  d.stats.bought = round2(d.stats.bought + bought);
  d.recent.unshift({ day: game.day, hour: game.hour, factoryId: p.factoryId, recipeId: p.recipeId, batches: p.batches, estProfit: p.estProfit, buyCost: bought });
  d.recent.length = Math.min(d.recent.length, RECENT);
  game.emit('factory_manager_run', `🏭 ${tier.name} menjalankan ${def.emoji} ${def.name}: ${p.batches}× ${name}`
    + `${bought > 0 ? ` (beli bahan ${fmtMoney(bought)})` : ''} · perkiraan untung ${fmtMoney(p.estProfit)}.`,
  { factory: p.factoryId, recipe: p.recipeId, batches: p.batches, estProfit: p.estProfit, buyCost: bought });
}

/** Daily rollover: the manager's wage (ledger 'gaji'); a shortfall goes to the loan. */
export function stepFactoryManagerDay(game) {
  const d = st(game);
  if (d.today.day !== game.day) d.today = { day: game.day, runs: 0, batches: 0, profit: 0 };
  payStaffDay(game, ROLE);
}

/** Everything the Gudang › Olahan card, the factory cards and Garasi › Pekerja need. */
export function factoryManagerView(game) {
  const s = game.state, d = st(game), set = d.settings, tiers = cfg(game).tiers;
  const hiredTier = d.hired ? tierOf(game, d.hired.tierId) : null;
  const tierView = (t) => ({ id: t.id, name: t.name, title: t.title, emoji: t.emoji, stars: t.skill, unlockLevel: t.unlockLevel,
    hireCost: t.hireCost, wage: t.wage, factories: t.factories, intervalHours: t.intervalHours,
    inputMult: t.inputMult ?? 1, outputMult: t.outputMult ?? 1, buyInputs: !!t.buyInputs });
  const ctrl = new Set(hiredTier && d.on ? controlledIds(game, hiredTier, set) : []);
  const factories = (game.data.FACTORIES || []).filter((def) => stateOf(game, def.id)).map((def) => {
    const f = stateOf(game, def.id);
    const allowed = !set.factories || set.factories.includes(def.id), rec = recipeLabel(game, def.id, f.recipeId);
    return { id: def.id, name: def.name, emoji: def.emoji, allowed, overCap: allowed && !!hiredTier && d.on && !ctrl.has(def.id),
      recipeName: rec.name, recipeEmoji: rec.emoji,
      managed: ctrl.has(def.id), running: f.running, queued: f.queued, wait: ctrl.has(def.id) && !f.running && !f.queued ? d.waits[def.id] ?? null : null };
  });
  const inputIds = new Set((game.data.FACTORIES || []).filter((def) => stateOf(game, def.id)).flatMap((def) => def.recipes.flatMap((r) => Object.keys(r.inputs))));
  const products = [...new Set([...inputIds, ...Object.keys(set.reservePct)])].map((id) => game.idx.products.get(id)).filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, unit: p.unit, qty: s.silo[p.id] || 0, reservePct: set.reservePct[p.id] || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const today = d.today.day === game.day ? d.today : { runs: 0, batches: 0, profit: 0 };
  const next = hiredTier && d.on && d.lastPass != null ? Math.max(0, round2(d.lastPass + hiredTier.intervalHours - s.time)) : 0;
  const lastRuns = (d.last?.runs || []).map((r) => ({ ...r, ...recipeLabel(game, r.factoryId, r.recipeId) }));
  const lastRun = d.last ? { hoursAgo: round2(s.time - d.last.time), runs: lastRuns,
    text: lastRuns.map((r) => `${r.batches}× ${r.name}`).join(', ') } : null;
  return {
    unlockLevel: Math.min(...tiers.map((t) => t.unlockLevel)), level: s.level, tradeIn: cfg(game).tradeIn ?? 0.5,
    hired: hiredTier ? { ...tierView(hiredTier), hiredDay: d.hired.hiredDay, wagePaid: factoryManagerWage(game) } : null,
    on: d.on, note: d.note, candidates: staffCandidates(game, ROLE, tierView), settings: structuredClone(set), steps: STEPS,
    stats: { ...d.stats }, today: { runs: today.runs, batches: today.batches, profit: today.profit }, nextPassHours: next, lastRun,
    blocked: hiredTier && d.on ? blockedInfo(game, hiredTier, factories) : null,
    queuedBatches: factories.filter((f) => f.managed).reduce((a, f) => a + f.queued, 0),
    busy: factories.filter((f) => f.managed && (f.running || f.queued)).length,
    recent: d.recent.map((r) => {
      const def = defOf(game, r.factoryId), rec = recipeLabel(game, r.factoryId, r.recipeId);
      return { ...r, factoryName: def?.name ?? r.factoryId, factoryEmoji: def?.emoji ?? '🏭', recipeName: rec.name, recipeEmoji: rec.emoji };
    }),
    factories, products, owned: factories.length,
  };
}

/**
 * A managed factory idle for ≥ 1 game day: {hours, reason, missing:[product names], fix: null | {action, label, cost?}}.
 * Fixes: 'buyInputs' (Direktur, setting off), 'storage' (store near full), 'margin' (min margin to 0), 'market' (go buy).
 */
function blockedInfo(game, tier, factories) {
  const d = st(game), s = game.state;
  if (d.idleSince == null || s.time - d.idleSince < 24 - 1e-9) return null;
  const idle = factories.filter((f) => f.managed && !f.running && !f.queued);
  if (!idle.length) return null;
  const waits = new Set(idle.map((f) => f.wait ?? WAIT.input));
  const missing = [...new Set(idle.flatMap((f) => {
    const r = recipeOf(defOf(game, f.id), stateOf(game, f.id).recipeId);
    return r ? Object.entries(r.inputs).filter(([id, q]) => (s.silo[id] || 0) < q).map(([id]) => pname(game, id)) : [];
  }))];
  const reason = waits.has(WAIT.input) ? WAIT.input : waits.has(WAIT.room) ? WAIT.room : WAIT.margin;
  const silo = storageInfo(game, 'silo');
  const fix = reason === WAIT.room ? { action: 'storage', kind: 'silo', label: `Perbesar silo (${fmtMoney(silo.nextUpgradeCost)})`, cost: silo.nextUpgradeCost }
    : reason === WAIT.margin ? { action: 'margin', label: 'Turunkan margin min. ke 0%' }
      : tier.buyInputs && !d.settings.buyInputs ? { action: 'buyInputs', label: 'Aktifkan beli bahan' }
        : { action: 'market', label: 'Beli bahan di Pasar' };
  return { hours: round2(s.time - d.idleSince), reason, factories: idle.map((f) => f.name), missing, fix };
}

/** Display name of a recipe: its own name, else the first output product's. */
function recipeLabel(game, factoryId, recipeId) {
  const rec = recipeOf(defOf(game, factoryId), recipeId), out = rec && game.idx.products.get(Object.keys(rec.outputs)[0]);
  return { name: rec?.name ?? out?.name ?? recipeId ?? '—', emoji: out?.emoji ?? '' };
}
