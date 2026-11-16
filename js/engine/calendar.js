// 📅 Kalender Panen: a real-calendar-day login reward on a 7-day cycle. The UI passes the local date ('YYYY-MM-DD')
// and Date.now(); the engine itself never reads the clock. Missing a day restarts the cycle at day 1 (the longest
// streak is kept); a date or clock earlier than the last claim is refused (clock rollback guard).
// Rewards are not cash: timed boosters (deterministic, measured in game hours), research points and a badge.
// state.calendar = { lastDate: null | 'YYYY-MM-DD', lastMs, streak, best, claims, badges }
// state.boosters = [{ kind, mult, until /* game hours */, name, emoji }] — at most one per kind.
import { round2 } from './rng.js';
import { grantResearchPoints } from './rewards.js';

/** Booster kinds: seedCost (× seed price), yield (× harvest roll), animalProd (× daily animal output), taskSpeed (÷ task hours). */
export const BOOSTERS = {
  seedCost: { name: 'Benih Hemat', emoji: '🌱', fmt: (m) => `benih −${Math.round((1 - m) * 100)}%` },
  yield: { name: 'Pupuk Super', emoji: '🧪', fmt: (m) => `hasil panen +${Math.round((m - 1) * 100)}%` },
  animalProd: { name: 'Ternak Ceria', emoji: '🐄', fmt: (m) => `produksi ternak +${Math.round((m - 1) * 100)}%` },
  taskSpeed: { name: 'Kerja Kilat', emoji: '⚡', fmt: (m) => `tugas ladang ${Math.round((m - 1) * 100)}% lebih cepat` },
};
const B = (kind, mult, days) => ({ kind, mult, days });
/** The 7-day cycle (index = cycle day − 1). `days` = game days the booster lasts (1 game day = 1 real minute at 1×). */
export const REWARDS = [
  { emoji: '🌱', name: 'Benih Hemat', boosters: [B('seedCost', 0.5, 5)] },
  { emoji: '🧪', name: 'Pupuk Super', boosters: [B('yield', 1.1, 10)] },
  { emoji: '🔬', name: '+1 Poin Riset', rp: 1 },
  { emoji: '🐄', name: 'Ternak Ceria', boosters: [B('animalProd', 1.15, 10)] },
  { emoji: '⚡', name: 'Kerja Kilat', boosters: [B('taskSpeed', 1.25, 10)] },
  { emoji: '🧺', name: 'Paket Tanam', boosters: [B('seedCost', 0.5, 10), B('yield', 1.1, 10)] },
  { emoji: '🏆', name: 'Panen Raya', rp: 1, badge: true, boosters: [B('yield', 1.2, 10), B('animalProd', 1.15, 10)] },
];
const ROLLBACK_MS = 60 * 60 * 1000; // tolerated clock jitter (DST, sync) before a claim counts as a rollback

/** createGame / load migration (persist.normalizeState): no claims yet; drop unknown or broken boosters. */
export function ensureCalendar(s) {
  const c = s.calendar || {};
  s.calendar = { lastDate: typeof c.lastDate === 'string' ? c.lastDate : null, lastMs: Number(c.lastMs) || 0,
    streak: c.streak | 0, best: c.best | 0, claims: c.claims | 0, badges: c.badges | 0 };
  s.boosters = (Array.isArray(s.boosters) ? s.boosters : []).filter((b) => BOOSTERS[b?.kind] && b.mult > 0 && Number.isFinite(b.until));
}

/** Day number of a 'YYYY-MM-DD' local date (NaN when malformed). */
export function dayNumber(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : NaN;
}

/** Product of the active boosters of `kind` (1 when none). */
export function boostMult(game, kind) {
  let m = 1;
  for (const b of game.state.boosters || []) if (b.kind === kind && b.until > game.state.time + 1e-9) m *= b.mult;
  return m;
}

/** Active boosters for the UI: [{kind, name, emoji, mult, text, hoursLeft}]. */
export function activeBoosters(game) {
  const t = game.state.time;
  return (game.state.boosters || []).filter((b) => b.until > t + 1e-9).map((b) => ({ kind: b.kind, name: BOOSTERS[b.kind].name,
    emoji: BOOSTERS[b.kind].emoji, mult: b.mult, text: BOOSTERS[b.kind].fmt(b.mult), hoursLeft: round2(b.until - t) }));
}

/** Daily rollover: forget expired boosters. */
export function pruneBoosters(game) {
  const t = game.state.time;
  if (game.state.boosters?.length) game.state.boosters = game.state.boosters.filter((b) => b.until > t + 1e-9);
}

/** Grant a booster: the same kind keeps the stronger multiplier and its time is extended. */
function addBooster(game, { kind, mult, days }) {
  const s = game.state, list = (s.boosters ||= []), cur = list.find((b) => b.kind === kind && b.until > s.time);
  if (cur) { cur.until = round2(cur.until + days * 24); cur.mult = kind === 'seedCost' ? Math.min(cur.mult, mult) : Math.max(cur.mult, mult); return; }
  s.boosters = list.filter((b) => b.kind !== kind);
  s.boosters.push({ kind, mult, until: round2(s.time + days * 24) });
}

/** Where a claim on `date` would land: {canClaim, reason, gap, streak (after claiming), cycleDay 1–7, broken}. */
function claimState(game, date, nowMs) {
  const c = game.state.calendar, today = dayNumber(date), last = c.lastDate ? dayNumber(c.lastDate) : null;
  if (!Number.isFinite(today)) return { canClaim: false, reason: 'Tanggal tidak valid.', streak: c.streak, cycleDay: 1 };
  const gap = last == null ? null : today - last;
  if (gap != null && (gap < 0 || (nowMs != null && c.lastMs && nowMs < c.lastMs - ROLLBACK_MS)))
    return { canClaim: false, reason: 'Jam perangkat mundur dari klaim terakhir. Atur tanggal & jam otomatis.', streak: c.streak, cycleDay: ((Math.max(1, c.streak) - 1) % 7) + 1, rollback: true };
  if (gap === 0) return { canClaim: false, reason: 'Hadiah hari ini sudah diambil. Kembali besok!', streak: c.streak, cycleDay: ((Math.max(1, c.streak) - 1) % 7) + 1, claimedToday: true };
  const streak = gap === 1 ? c.streak + 1 : 1;
  return { canClaim: true, reason: null, streak, cycleDay: ((streak - 1) % 7) + 1, broken: gap != null && gap > 1 && c.streak > 0 };
}

const rewardView = (r, i) => ({ day: i + 1, emoji: r.emoji, name: r.name, rp: r.rp || 0, badge: !!r.badge,
  text: [...(r.boosters || []).map((b) => `${BOOSTERS[b.kind].fmt(b.mult)} · ${b.days} hari game`), r.rp ? `+${r.rp} poin riset` : null, r.badge ? '🏅 Lencana Petani Setia' : null].filter(Boolean).join(' + ') });

/** Everything the calendar card/modal needs; `date` = local 'YYYY-MM-DD', `nowMs` = Date.now(). */
export function calendarView(game, date, nowMs) {
  const c = game.state.calendar, cs = claimState(game, date, nowMs);
  const doneUpTo = cs.canClaim ? cs.cycleDay - 1 : cs.claimedToday ? cs.cycleDay : 0;
  return { date, ...cs, lastDate: c.lastDate, best: c.best, claims: c.claims, badges: c.badges, current: c.streak,
    days: REWARDS.map((r, i) => ({ ...rewardView(r, i), state: i + 1 <= doneUpTo ? 'done' : cs.canClaim && i + 1 === cs.cycleDay ? 'today' : 'next' })),
    boosters: activeBoosters(game) };
}

/** Claim today's reward → {ok, day, reward, streak, best} or {ok:false, reason}. Emits `calendar_claimed`. */
export function claimCalendar(game, date, nowMs) {
  const c = game.state.calendar, cs = claimState(game, date, nowMs);
  if (!cs.canClaim) return { ok: false, reason: cs.reason };
  const r = REWARDS[cs.cycleDay - 1];
  for (const b of r.boosters || []) addBooster(game, b);
  if (r.rp) grantResearchPoints(game, r.rp);
  if (r.badge) c.badges++;
  Object.assign(c, { lastDate: date, lastMs: Number(nowMs) || c.lastMs, streak: cs.streak, best: Math.max(c.best, cs.streak), claims: c.claims + 1 });
  const reward = rewardView(r, cs.cycleDay - 1);
  game.emit('calendar_claimed', `📅 Kalender Panen hari ${cs.cycleDay}: ${r.emoji} ${r.name} (${reward.text}).`,
    { cycleDay: cs.cycleDay, streak: cs.streak, reward });
  return { ok: true, day: cs.cycleDay, reward, streak: cs.streak, best: c.best };
}
