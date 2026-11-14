// AI rival farms (stream C). Net worth is a pure function of (seed, rival, day): a keypoint curve
// (log-interpolated) times seeded wobble that depends on personality. No game RNG is consumed.
// state.rivals = { day, ranks: { [id|'player']: rank } } holds yesterday's ranking for ▲/▼ and rank_up.
import { hashSeed } from './rng.js';
import { fmtMoney } from './defs.js';
import { netWorth } from './economy.js';

const k = 1000, M = 1e6;
/** `points` = [day, $] keypoints; geometric between points, linear ($/day of the last segment) after.
 *  Tuned on a 900-day greedy bot (Lv30 data): average play ≈ $72k d30 · $220k d100 · $1.1M d200 ·
 *  $4.5M d300 · $15M d400 · $38M d500 · $150M d800; a stronger run ≈ 2× that until d400.
 *  Weak rivals fall in weeks, Iowa Golden Acres (#2) around day 120–180; Agro Nusantara Group is the
 *  elite that keeps compounding and is overtaken around Lv 20–23 (day ≈ 400–520), staying within reach after. */
export const RIVALS = [
  { id: 'sidorukun', name: 'Koperasi Sido Rukun', emoji: '🌾', personality: 'steady',
    points: [[1, 32 * k], [20, 50 * k], [60, 75 * k], [200, 130 * k], [900, 400 * k]] },
  { id: 'duval', name: 'Ferme Duval', emoji: '🧀', personality: 'volatile',
    points: [[1, 45 * k], [30, 60 * k], [100, 140 * k], [300, 600 * k], [900, 3 * M]] },
  { id: 'hoeness', name: 'Hoeness Agrar', emoji: '🍺', personality: 'steady',
    points: [[1, 55 * k], [60, 100 * k], [120, 220 * k], [300, 1 * M], [900, 6 * M]] },
  { id: 'midori', name: 'Midori Nōjō Hokkaido', emoji: '🗻', personality: 'volatile',
    points: [[1, 50 * k], [60, 110 * k], [150, 380 * k], [300, 1.6 * M], [900, 10 * M]] },
  { id: 'tanimakmur', name: 'PT Tani Makmur', emoji: '🌴', personality: 'aggressive',
    points: [[1, 70 * k], [60, 200 * k], [100, 380 * k], [150, 600 * k], [200, 800 * k], [300, 2 * M], [500, 6 * M], [900, 18 * M]] },
  { id: 'iowagolden', name: 'Iowa Golden Acres', emoji: '🌽', personality: 'steady',
    points: [[1, 100 * k], [60, 280 * k], [100, 500 * k], [150, 750 * k], [180, 1 * M], [250, 1.5 * M], [300, 3 * M], [400, 6 * M], [500, 12 * M], [900, 40 * M]] },
  { id: 'nusantara', name: 'Agro Nusantara Group', emoji: '🏢', personality: 'aggressive',
    points: [[1, 130 * k], [100, 700 * k], [200, 2.8 * M], [300, 11 * M], [400, 25 * M], [500, 45 * M], [650, 80 * M], [900, 150 * M]] },
];
export const PERSONALITY = {
  steady: { amp: 0.015, jitter: 0.005, label: 'Stabil' },
  aggressive: { amp: 0.04, jitter: 0.015, label: 'Agresif' },
  volatile: { amp: 0.09, jitter: 0.04, label: 'Fluktuatif' },
};

const unit = (seed, salt) => hashSeed(`${seed}|${salt}`) / 4294967296;

/** Smooth curve through the keypoints (no wobble). */
export function rivalCurve(r, day) {
  const P = r.points;
  if (day <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    const [d0, v0] = P[i - 1], [d1, v1] = P[i];
    if (day <= d1) return v0 * (v1 / v0) ** ((day - d0) / (d1 - d0));
  }
  const [d0, v0] = P[P.length - 2], [d1, v1] = P[P.length - 1];
  return v1 + ((v1 - v0) / (d1 - d0)) * (day - d1);
}

/** Rival net worth on `day` (day 1 = new game). Deterministic for a given game seed. */
export function rivalNetWorth(seed, r, day) {
  const d = Math.max(0, day - 1);
  const P = PERSONALITY[r.personality];
  const ph1 = unit(seed, `${r.id}|p1`) * 2 * Math.PI, ph2 = unit(seed, `${r.id}|p2`) * 2 * Math.PI;
  const wave = 0.6 * Math.sin(2 * Math.PI * d / 9 + ph1) + 0.4 * Math.sin(2 * Math.PI * d / 23 + ph2);
  const jit = unit(seed, `${r.id}|d${d}`) - 0.5;
  return Math.round(rivalCurve(r, day) * (1 + P.amp * wave + P.jitter * 2 * jit));
}

function ranking(game, day, playerNw) {
  const seed = game.state.seed;
  const rows = RIVALS.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, personality: r.personality,
    netWorth: rivalNetWorth(seed, r, day), isPlayer: false }));
  rows.push({ id: 'player', name: 'Pertanianmu', emoji: '🧑‍🌾', personality: null, netWorth: Math.round(playerNw), isPlayer: true });
  rows.sort((a, b) => b.netWorth - a.netWorth || Number(b.isPlayer) - Number(a.isPlayer));
  rows.forEach((x, i) => { x.rank = i + 1; });
  return rows;
}

const ranksOf = (rows) => Object.fromEntries(rows.map((x) => [x.id, x.rank]));

export function ensureRivals(game) {
  const s = game.state;
  if (s.rivals?.ranks) return;
  s.rivals = { day: game.day, ranks: ranksOf(ranking(game, game.day, netWorth(game))) };
}

/** Daily rollover: rank rivals for the new day; emit rank_up for every rival the player passed. */
export function stepRivalsDay(game, day) {
  ensureRivals(game);
  const prev = game.state.rivals.ranks;
  const rows = ranking(game, day, netWorth(game));
  const me = rows.find((x) => x.isPlayer);
  const passed = rows.filter((x) => !x.isPlayer && x.rank > me.rank && prev[x.id] != null && prev[x.id] < prev.player);
  game.state.rivals = { day, ranks: ranksOf(rows) };
  if (passed.length) {
    const names = passed.map((x) => x.name).join(', ');
    game.emit('rank_up', `🏆 Kamu menyalip ${names}! Kini peringkat #${me.rank} (${fmtMoney(me.netWorth)}).`,
      { rank: me.rank, prevRank: prev.player ?? null, passed: passed.map((x) => x.id) });
  }
}

/** Live leaderboard; `change` = places gained since the last daily ranking (+ up, − down). */
export function leaderboard(game) {
  ensureRivals(game);
  const prev = game.state.rivals.ranks;
  return ranking(game, game.day, netWorth(game)).map((x) => ({ ...x, change: prev[x.id] != null ? prev[x.id] - x.rank : 0 }));
}
