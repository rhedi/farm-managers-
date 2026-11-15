// Rumah kaca (greenhouse) on a field: fields[id].greenhouse = { builtDay, cost }. Built for costPerHa × ha on
// fields ≤ maxHa (not on orchards), costs upkeepPerHaDay × ha every day (ledger 'listrik_rumah_kaca'; borrowed when
// broke). Effects on annual crops: growth ×1 regardless of season/minTemp, season yield never below 1, no dry-day
// penalty, no storm damage, yield × (1 + yieldBonus) shown as yieldFactors.greenhouse. Removal refunds `refund`.
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';

const DEFAULTS = { unlockLevel: 9, costPerHa: 18000, upkeepPerHaDay: 90, maxHa: 12, yieldBonus: 0.2, refund: 0.3 };
export const greenhouseCfg = (game) => ({ ...DEFAULTS, ...(game.data.BALANCE.greenhouse || {}) });

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
export const hasGreenhouse = (f) => !!f?.greenhouse;

/** Build quote + why it can't be built: { ok, reason, cost, upkeepPerDay, refund, maxHa, unlockLevel, built }. */
export function greenhouseQuote(game, fieldId) {
  const C = greenhouseCfg(game);
  const def = game.idx.fields.get(fieldId);
  const f = game.state.fields[fieldId];
  if (!def) return fail('Ladang tidak ditemukan.');
  const cost = round2(def.sizeHa * C.costPerHa), upkeepPerDay = round2(def.sizeHa * C.upkeepPerHaDay);
  const base = { cost, upkeepPerDay, refund: round2((f?.greenhouse?.cost ?? cost) * C.refund), maxHa: C.maxHa,
    unlockLevel: C.unlockLevel, yieldBonus: C.yieldBonus, built: hasGreenhouse(f) };
  let reason = null;
  if (!f) reason = 'Kamu belum memiliki ladang ini.';
  else if (base.built) reason = 'Rumah kaca sudah dibangun.';
  else if (game.state.level < C.unlockLevel) reason = `Rumah kaca terbuka di level ${C.unlockLevel}.`;
  else if (def.sizeHa > C.maxHa) reason = `Ladang terlalu luas (maks ${C.maxHa} ha).`;
  else if (f.orchard) reason = 'Tebang kebun buah dulu.';
  else if (f.busy) reason = 'Ladang sedang dikerjakan.';
  else if (cost > game.state.money) reason = 'Uang tidak cukup.';
  return { ...base, ok: !reason, reason };
}

export function buildGreenhouse(game, fieldId) {
  const q = greenhouseQuote(game, fieldId);
  if (!q.ok) return fail(q.reason);
  game.spend(q.cost, 'rumah_kaca');
  game.state.fields[fieldId].greenhouse = { builtDay: game.day, cost: q.cost };
  const name = game.idx.fields.get(fieldId).name;
  game.emit('greenhouse_built', `🏠 Rumah kaca dibangun di ${name} (${fmtMoney(q.cost)}).`, { fieldId });
  return ok({ cost: q.cost, upkeepPerDay: q.upkeepPerDay });
}

/** Dismantle: refund × build cost back (penjualan_aset); the crop keeps growing outdoors. */
export function removeGreenhouse(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!hasGreenhouse(f)) return fail('Tidak ada rumah kaca di ladang ini.');
  if (f.busy) return fail('Ladang sedang dikerjakan.');
  const refund = round2(f.greenhouse.cost * greenhouseCfg(game).refund);
  f.greenhouse = null;
  game.earn(refund, 'penjualan_aset', { stat: false });
  return ok({ refund });
}

/** Daily upkeep for every greenhouse (borrowed when broke). Returns the total charged. */
export function stepGreenhouseDay(game) {
  const C = greenhouseCfg(game);
  let total = 0;
  for (const [id, f] of Object.entries(game.state.fields)) {
    if (!hasGreenhouse(f)) continue;
    const cost = round2((game.idx.fields.get(id)?.sizeHa ?? 0) * C.upkeepPerHaDay);
    if (cost > 0) { game.payOrBorrow(cost, 'listrik_rumah_kaca'); total += cost; }
  }
  return round2(total);
}

/** Yield factor overrides for a greenhouse field (given the outdoor factors), or {}. */
export function greenhouseFactors(game, f, fac) {
  if (!hasGreenhouse(f)) return {};
  return { weather: 1, storm: 1, season: Math.max(1, fac.season), greenhouse: 1 + greenhouseCfg(game).yieldBonus };
}

/** Field-view block, or null. */
export function greenhouseView(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!hasGreenhouse(f)) return null;
  const q = greenhouseQuote(game, fieldId);
  return { builtDay: f.greenhouse.builtDay, cost: f.greenhouse.cost, upkeepPerDay: q.upkeepPerDay, refund: q.refund,
    yieldBonus: q.yieldBonus };
}
