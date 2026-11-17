// 👷 Mandor Ladang: field plans (🔁 Rencana, plans.js) run free on BALANCE.mandor.freeFields (2) fields; more need a
// hired Mandor (one per farm, hire / replace / fire via the shared staff.js, ledger 'gaji'). Tier `fields` = how many
// planned fields run (null = all); `speed` = own-rig task speed bonus on planned fields (Kepala Mandor).
// Coverage: pinned fields first (newest pin first), then plans already running (state.mandor.active, activation order),
// then the largest fields (FIELDS order on ties): a new or bigger field never pauses a running plan. Planned fields
// past the cap keep their plan, marked `plan.paused` with `plan.blocked` = the "Butuh Mandor" label (runPlans).
// state.mandor = { hired: null | {tierId, hiredDay}, on, pins: [fieldId], note, notice /* grandfathered, toast once */ }
import { staffCfg, staffTier, staffWage, hireStaff, replaceStaff, fireStaff, payStaffDay, staffCandidates } from './staff.js';
import { runPlans } from './plans.js';

const ROLE = { key: 'mandor', cfg: 'mandor', label: 'mandor', Title: 'Mandor Ladang', icon: '👷', event: 'mandor',
  fireNote: 'Rencana di luar ladang gratis dijeda (tetap tersimpan).', run: (game) => runPlans(game) };
export const MANDOR_DEFAULTS = { freeFields: 2, tradeIn: 0.5, tiers: [] };
export const mandorCfg = (game) => ({ ...MANDOR_DEFAULTS, ...staffCfg(game, ROLE) });
export const mandorTier = (game, id) => staffTier(game, ROLE, id);
const st = (game) => game.state.mandor;
const capOf = (cfg, t) => (t ? (t.fields == null ? Infinity : Math.max(cfg.freeFields, t.fields)) : cfg.freeFields);

/** Smallest tier that runs `planned` fields (Kepala Mandor for > 30 or at Lv ≥ 20): grandfathering of old saves. */
export function grandfatherTier(cfg, planned, level) {
  const tiers = [...(cfg.tiers || [])].sort((a, b) => a.skill - b.skill);
  const top = tiers[tiers.length - 1];
  if (!top) return null;
  if (level >= top.unlockLevel) return top;
  return tiers.find((t) => capOf(cfg, t) >= planned) ?? top;
}

/**
 * persist.normalizeState: a save without `mandor` predates the rule. With more planned fields than the free ones it
 * gets the covering tier for free (no plan is ever paused by loading), plus one notice toast. Missing keys get defaults.
 */
export function migrateMandor(s, data) {
  const cfg = { ...MANDOR_DEFAULTS, ...(data.BALANCE?.mandor || {}) };
  if (!s.mandor || typeof s.mandor !== 'object') {
    s.mandor = { hired: null, on: true, pins: [], note: '', notice: false };
    const planned = Object.values(s.fields || {}).filter((f) => f?.plan).length;
    const t = planned > cfg.freeFields ? grandfatherTier(cfg, planned, s.level ?? 1) : null;
    if (t) { s.mandor.hired = { tierId: t.id, hiredDay: Math.floor((s.time ?? 0) / 24) + 1, granted: true }; s.mandor.notice = true; }
  }
  const d = s.mandor;
  if (d.hired && !(cfg.tiers || []).some((t) => t.id === d.hired.tierId)) d.hired = null;
  d.on = true;
  d.pins = Array.isArray(d.pins) ? d.pins.filter((id, i, a) => typeof id === 'string' && s.fields?.[id] && a.indexOf(id) === i) : [];
  // Activation order: fields whose plan already ran keep running when a newer/bigger field gets a plan (missing = []).
  d.active = Array.isArray(d.active) ? d.active.filter((id, i, a) => typeof id === 'string' && s.fields?.[id]?.plan && a.indexOf(id) === i) : [];
  d.note ??= '';
  d.notice = !!d.notice;
}

/** createGame / loadGame. */
export function ensureMandor(game) { migrateMandor(game.state, game.data); }

export const mandorWage = (game) => staffWage(game, ROLE);
export const hiredMandor = (game) => (st(game)?.hired ? mandorTier(game, st(game).hired.tierId) : null);
/** Planned fields that may run: freeFields without a Mandor, else the tier's fields (Infinity = all). */
export const mandorCap = (game) => capOf(mandorCfg(game), hiredMandor(game));

/** Planned field ids in coverage order: pins (newest first), then plans already active (activation order), then largest. */
export function plannedOrder(game) {
  const s = game.state, pins = st(game)?.pins ?? [], active = st(game)?.active ?? [], order = new Map(game.data.FIELDS.map((f, i) => [f.id, i]));
  const ids = Object.keys(s.fields).filter((id) => s.fields[id]?.plan && order.has(id));
  const rank = (list, id) => { const i = list.indexOf(id); return i < 0 ? Infinity : i; };
  const ha = (id) => game.idx.fields.get(id)?.sizeHa ?? 0;
  return ids.sort((a, b) => rank(pins, a) - rank(pins, b) || rank(active, a) - rank(active, b) || ha(b) - ha(a) || order.get(a) - order.get(b));
}

/** runPlans: remember newly running plans (activation order); drop fields whose plan is gone. */
export function trackActive(game, covered) {
  const d = st(game);
  if (!d) return;
  d.active = (d.active || []).filter((id) => game.state.fields[id]?.plan);
  for (const id of plannedOrder(game)) if (covered.has(id) && !d.active.includes(id)) d.active.push(id);
}

/** Set of planned field ids whose plans run now. */
export function coveredFields(game) {
  const cap = mandorCap(game);
  return new Set(plannedOrder(game).slice(0, cap === Infinity ? undefined : cap));
}

/** "Butuh Mandor (2/2 ladang gratis)" / "Butuh Mandor Senior (12/12 ladang)": the paused plans' reason. */
export function pausedLabel(game) {
  const cfg = mandorCfg(game), t = hiredMandor(game), cap = mandorCap(game);
  const next = [...cfg.tiers].sort((a, b) => a.skill - b.skill).find((x) => capOf(cfg, x) > cap);
  return `Butuh ${next?.title ?? 'Mandor'} (${cap}/${cap} ladang${t ? '' : ' gratis'})`;
}

/** Own-rig task speed bonus (Kepala Mandor) on a planned field; 0 otherwise. */
export function mandorSpeed(game, fieldId) {
  const t = hiredMandor(game);
  return t?.speed > 0 && game.state.fields[fieldId]?.plan ? t.speed : 0;
}

export const hireMandor = (game, tierId) => hireStaff(game, ROLE, tierId);
export const replaceMandor = (game, tierId) => replaceStaff(game, ROLE, tierId);
export function fireMandor(game) {
  const r = fireStaff(game, ROLE);
  if (r.ok) runPlans(game);
  return r;
}

/** 📌 Prioritise a planned field (`on`) or drop its pin. Newest pin first; runs plans at once. */
export function pinMandorField(game, fieldId, on = true) {
  const f = game.state.fields[fieldId];
  if (!f) return { ok: false, reason: 'Kamu belum memiliki ladang ini.' };
  const d = st(game);
  d.pins = d.pins.filter((id) => id !== fieldId && game.state.fields[id]);
  if (on) d.pins.unshift(fieldId);
  runPlans(game);
  return { ok: true, pins: [...d.pins], paused: !!f.plan?.paused };
}

/** Daily rollover: the Mandor's wage (ledger 'gaji'). */
export function stepMandorDay(game) { payStaffDay(game, ROLE); }

/** Grandfathered old save: true once (one toast), then false. */
export function takeMandorNotice(game) {
  const d = st(game);
  if (!d?.notice) return false;
  d.notice = false;
  return true;
}

/** Everything the Mandor card (Garasi › Pekerja), the Ladang summary and the plan editor need. */
export function mandorView(game) {
  const s = game.state, d = st(game), cfg = mandorCfg(game), t = hiredMandor(game), cap = mandorCap(game);
  const tierView = (x) => ({ id: x.id, name: x.name, title: x.title, emoji: x.emoji, stars: x.skill, unlockLevel: x.unlockLevel,
    hireCost: x.hireCost, wage: x.wage, fields: x.fields ?? null, speed: x.speed ?? 0 });
  const order = plannedOrder(game), covered = new Set(order.slice(0, cap === Infinity ? undefined : cap));
  const fields = order.map((id) => {
    const def = game.idx.fields.get(id);
    return { id, name: def?.name ?? id, sizeHa: def?.sizeHa ?? 0, pinned: d.pins.includes(id), running: covered.has(id) };
  });
  return {
    freeFields: cfg.freeFields, cap: cap === Infinity ? null : cap, planned: order.length, running: covered.size,
    paused: order.length - covered.size, pausedLabel: pausedLabel(game), tradeIn: cfg.tradeIn ?? 0.5, level: s.level,
    unlockLevel: Math.min(...cfg.tiers.map((x) => x.unlockLevel)),
    hired: t ? { ...tierView(t), hiredDay: d.hired.hiredDay, granted: !!d.hired.granted, wagePaid: mandorWage(game) } : null,
    candidates: staffCandidates(game, ROLE, tierView), fields,
  };
}
