// Scaled rewards ("Hadiah Berskala"): mission, chapter and achievement cash follows the player's recent income, so a
// reward stays worth tapping at Lv 45 as much as at Lv 3. The fixed amounts in data/missions are the floor.
// Income = own production sold (crops, animal/fish products, processed goods, contracts) minus market purchases
// over the last RECENT_DAYS closed game days, so buy-and-resell never inflates it.
import { round2 } from './rng.js';

export const RECENT_DAYS = 3;
const INCOME_CATS = ['penjualan_panen', 'penjualan_ternak_produk', 'penjualan_olahan', 'kontrak'];

/** 2 significant digits: 1234 → 1200, 87 → 87. */
export const nice = (v) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1); return Math.round(v / p) * p; };

/** Closed ledger days (before today), newest last, at most `days`. */
function closedDays(game, days) {
  const L = game.state.ledger;
  if (!L?.cur) return [];
  return [...(L.days || []), L.cur].filter((b) => b.day < game.day).slice(-days);
}

/** Average daily production income over the last `days` closed game days (0 without history). */
export function recentIncome(game, days = RECENT_DAYS) {
  const list = closedDays(game, days);
  if (!list.length) return 0;
  const sum = list.reduce((t, b) => {
    const c = b.cats || {};
    return t + Math.max(0, INCOME_CATS.reduce((a, id) => a + (c[id] || 0), 0) - (c.pembelian_produk || 0));
  }, 0);
  return round2(sum / list.length);
}

/** Cash reward: max(fixed floor, pct × recent daily income), rounded to 2 significant digits. */
export const scaledCash = (game, floor, pct) => nice(Math.max(floor || 0, pct * recentIncome(game)));

/** Bonus research points (on top of 1 per level-up; research.js adds them to `earned`). */
export function grantResearchPoints(game, n) {
  if (!(n > 0)) return;
  const r = (game.state.research ||= { unlocked: [], respecs: 0 });
  r.bonus = (r.bonus || 0) + n;
}

/** Achievement payout: fixed `reward` floor or `incomeDays` (default 0.25, data uses ≤ 1) × recent daily income;
 *  `rp` research points (the big late-game reward, since money saturates). */
export const ACHIEVEMENT_DAYS = 0.25;
export const achievementReward = (game, a) => ({
  money: scaledCash(game, a.reward || 0, a.incomeDays ?? ACHIEVEMENT_DAYS), rp: a.rp || 0,
});
