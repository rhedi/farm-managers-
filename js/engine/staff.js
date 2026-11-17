// Shared hire / replace-promote / fire / wage for staff managers (Manajer Logistik, Manajer Pabrik).
// A role: { key: state key, cfg: BALANCE key, label: 'manajer logistik', Title: 'Manajer Logistik', icon,
//   event: event prefix, fireNote: extra text on firing, run(game): planning pass after a change }.
// state[role.key].hired = null | { tierId, hiredDay }. Costs and wages book to ledger 'gaji'.
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { perk } from './research.js';
import { challengeBlock } from './legacyPerks.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

export const staffCfg = (game, role) => game.data.BALANCE[role.cfg] ?? { tiers: [] };
export const staffTier = (game, role, id) => staffCfg(game, role).tiers.find((t) => t.id === id) ?? null;
export const hiredTier = (game, role) => {
  const h = game.state[role.key]?.hired;
  return h ? staffTier(game, role, h.tierId) : null;
};

/** Daily wage of the hired tier after the research perk 'wages' (0 when nobody is hired). */
export function staffWage(game, role, t = hiredTier(game, role)) {
  return t ? round2(t.wage * (1 - perk(game, 'wages'))) : 0;
}

/** First hire price of a tier: `role.hireCost(game, t)` (🌳 Mandor Keluarga discount) or the tier's hireCost. */
const hirePrice = (game, role, t) => (role.hireCost ? role.hireCost(game, t) : t.hireCost);

export function hireStaff(game, role, tierId) {
  const d = game.state[role.key], t = staffTier(game, role, tierId);
  if (!t) return fail('Calon manajer tidak ditemukan.');
  if (d.hired) return fail(`Sudah ada ${role.label}. Pakai "Ganti / promosikan" untuk mengganti.`);
  if (game.state.level < t.unlockLevel) return fail(`Butuh level ${t.unlockLevel}.`);
  const rule = challengeBlock(game, 'staff', role.key); // 🌳 challenge "Tanpa Manajer"
  if (rule) return fail(rule);
  const cost = hirePrice(game, role, t);
  if (!game.spend(cost, 'gaji')) return fail('Uang tidak cukup.');
  d.hired = { tierId: t.id, hiredDay: game.day };
  d.on = true;
  d.note = '';
  role.onHire?.(game);
  game.emit(`${role.event}_hired`, `${role.icon} ${t.name} (${t.title}) bergabung sebagai ${role.Title} (${fmtMoney(t.wage)}/hari).`, { tierId: t.id, cost });
  role.run(game);
  return ok({ cost });
}

/** Price of switching to `t`: its hireCost − tradeIn × the current tier's hireCost, never < 0. */
export function staffSwapCost(game, role, t) {
  const cur = hiredTier(game, role);
  const credit = cur ? round2(cur.hireCost * (staffCfg(game, role).tradeIn ?? 0.5)) : 0;
  return { credit, cost: round2(Math.max(0, t.hireCost - credit)) };
}

/** Promote / replace with another tier (up or down); settings, stats and aktif/jeda stay. Runs a pass at once. */
export function replaceStaff(game, role, tierId) {
  const d = game.state[role.key], t = staffTier(game, role, tierId), cur = hiredTier(game, role);
  if (!cur) return fail(`Belum ada ${role.label}.`);
  if (!t) return fail('Calon manajer tidak ditemukan.');
  if (t.id === cur.id) return fail(`${t.name} sudah menjadi manajermu.`);
  if (game.state.level < t.unlockLevel) return fail(`Butuh level ${t.unlockLevel}.`);
  const { cost, credit } = staffSwapCost(game, role, t);
  if (cost > 0 && !game.spend(cost, 'gaji')) return fail('Uang tidak cukup.');
  d.hired = { tierId: t.id, hiredDay: game.day };
  d.note = '';
  const verb = t.skill > cur.skill ? 'dipromosikan' : 'diganti';
  game.emit(`${role.event}_replaced`, `${role.icon} ${role.Title} ${verb}: ${t.name} (${t.title}) menggantikan ${cur.name} · biaya ${fmtMoney(cost)} setelah tukar ${fmtMoney(credit)} · gaji ${fmtMoney(t.wage)}/hari.`,
    { from: cur.id, to: t.id, cost });
  role.run(game);
  return ok({ cost, credit, from: cur.id, to: t.id });
}

export function fireStaff(game, role) {
  const d = game.state[role.key], t = hiredTier(game, role);
  if (!t) return fail(`Belum ada ${role.label}.`);
  d.hired = null;
  d.note = '';
  game.emit(`${role.event}_fired`, `${role.icon} ${t.name} berhenti sebagai ${role.Title}.${role.fireNote ? ` ${role.fireNote}` : ''}`, { tierId: t.id });
  return ok();
}

/** Daily rollover: the wage (ledger 'gaji'); a shortfall goes to the loan. */
export function payStaffDay(game, role) {
  const wage = staffWage(game, role);
  if (!(wage > 0)) return;
  const short = game.payOrBorrow(wage, 'gaji');
  if (short > 0) game.emit('wages_unpaid', `Uang kurang untuk gaji ${role.label}: ${fmtMoney(short)} ditambahkan ke pinjaman.`, { amount: short });
}

/** Candidate cards for the hire / replace list. */
export function staffCandidates(game, role, tierView) {
  const s = game.state, cur = hiredTier(game, role);
  return staffCfg(game, role).tiers.map((t) => {
    const locked = s.level < t.unlockLevel, current = t === cur, swap = cur ? staffSwapCost(game, role, t) : null;
    const price = swap ? swap.cost : hirePrice(game, role, t), rule = cur ? '' : challengeBlock(game, 'staff', role.key);
    return { ...tierView(t), locked, current, price, credit: swap?.credit ?? 0,
      wageDiff: cur ? round2(staffWage(game, role, t) - staffWage(game, role, cur)) : 0,
      reason: current ? 'Manajer saat ini.' : rule || (locked ? `Terbuka di level ${t.unlockLevel}.` : s.money < price ? 'Uang tidak cukup.' : null) };
  });
}
