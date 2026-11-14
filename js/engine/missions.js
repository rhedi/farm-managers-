// Daily missions (stream C): 3 seeded missions per game day, scaled to level and assets.
// Uses its own hash-seeded RNG per day, so game.state.rng (weather, market…) is untouched.
// Progress comes from game events (trackEvent, called by Game.emit) and stat/xp deltas.
import { hashSeed, random, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { getFieldView } from './fields.js';
import { netWorth } from './economy.js';
import { BUY_MARKUP } from './purchase.js';

export const MISSIONS_PER_DAY = 3;
export const STREAK_GOAL = 7;
const TASK_LABEL = { plow: 'bajak', seed: 'tanam', fertilize: 'pupuk', irrigate: 'irigasi', lime: 'kapur' };
const FACTOR = { harvest: 1.2, sell: 1, task: 0.8, tasks_any: 0.7, feed: 0.6, contract: 1.4, xp: 0.7, factory: 1.2 };
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

const dayRng = (game, day, salt = 'm') => ({ rng: hashSeed(`${game.state.seed}|${salt}|${day}`) });
/** 2 significant digits: 1234 → 1200, 87 → 87. */
const nice = (v) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1); return Math.round(v / p) * p; };

function levelGap(game) {
  const L = game.data.LEVELS, i = Math.min(game.state.level, L.length - 1);
  return Math.max(250, (L[i] ?? 0) - (L[i - 1] ?? 0));
}

/** Base money reward: grows with level and net worth. */
export function baseReward(game) {
  const lvl = game.state.level; // NW share capped so rewards never compound: ≤ 600·level per mission
  return nice(300 * lvl + Math.min(0.002 * Math.max(0, netWorth(game)), 300 * lvl));
}

function ownedViews(game) { return Object.keys(game.state.fields).map((id) => getFieldView(game, id)); }

/** Crops any owned herd eats. */
function feedCropIds(game) {
  const ids = new Set();
  for (const [id, h] of Object.entries(game.state.animals)) if (h.count > 0) for (const c of game.idx.animals.get(id)?.feedCrops ?? []) ids.add(c);
  return ids;
}

/** Candidate missions available right now: [{type, weight, make(r) → params}]. `base` = base money reward. */
function candidates(game, base) {
  const s = game.state, views = ownedViews(game), out = [];
  // Harvest: crops that are ready or due within ~30 h.
  const soon = {};
  for (const v of views) {
    const f = s.fields[v.id], crop = f.cropId && game.idx.crops.get(f.cropId);
    if (!crop || !(f.state === 'ready' || (f.state === 'growing' && crop.growDays * 24 - (f.growHours || 0) <= 30))) continue;
    soon[crop.id] = (soon[crop.id] || 0) + (v.predictedYield || 0);
  }
  const soonIds = Object.keys(soon).filter((id) => soon[id] >= 1);
  if (soonIds.length) out.push({ type: 'harvest', weight: 3, make: (r) => {
    const cropId = soonIds[Math.floor(random(r) * soonIds.length)];
    return { cropId, target: Math.max(1, Math.round(soon[cropId] * (0.5 + 0.3 * random(r)))) };
  } });
  // Sell own produce: stock in the silo plus what is about to be harvested. Target ≥ 2× base reward so the
  // reward is always below the sales needed (and buy-then-resell is netted out in trackEvent).
  let value = 0;
  for (const [id, q] of Object.entries(s.silo)) value += q * (s.market[id] ?? 0);
  for (const id of soonIds) value += soon[id] * (s.market[id] ?? 0);
  const minSell = 2 * base;
  if (value * 0.7 >= minSell) out.push({ type: 'sell', weight: 3, make: (r) => ({ target: nice(Math.max(minSell, value * (0.4 + 0.3 * random(r)))) }) });
  // Field tasks the player can run (implement owned), weighted by fields waiting for them.
  const nFields = views.length;
  const tasks = Object.keys(TASK_LABEL).filter((t) => views.some((v) => v.actions?.includes(t))
    || s.machines.some((m) => game.idx.machines.get(m.defId)?.task === t));
  if (tasks.length) out.push({ type: 'task', weight: 2, make: (r) => {
    const w = tasks.map((t) => 1 + views.filter((v) => v.nextStep === t).length);
    let x = random(r) * w.reduce((a, b) => a + b, 0), i = 0;
    while (x >= w[i] && i < w.length - 1) x -= w[i++];
    return { task: tasks[i], target: 1 + Math.floor(random(r) * Math.min(3, nFields)) };
  } });
  out.push({ type: 'tasks_any', weight: 1, make: (r) => ({ target: Math.min(8, 2 + Math.floor(random(r) * (1 + nFields))) }) });
  out.push({ type: 'xp', weight: 1, make: (r) => ({ target: nice(Math.max(30, levelGap(game) * (0.02 + 0.02 * random(r)))) }) });
  // Feed: ≥ 1 t and ≥ 1 day of herd feed, and worth at least the reward at the cheapest feed's buy price.
  const feedIds = [...feedCropIds(game)].filter((id) => s.market[id] > 0);
  if (feedIds.length) {
    const need = Object.entries(s.animals).reduce((t, [id, h]) => t + h.count * (game.idx.animals.get(id)?.feedPerDay ?? 0), 0);
    const price = Math.min(...feedIds.map((id) => s.market[id] * BUY_MARKUP));
    const target = Math.ceil(Math.max(1, need, (0.75 * base) / price) * 2) / 2;
    if (target <= (game.siloInfo?.().free ?? Infinity)) out.push({ type: 'feed', weight: 2, make: () => ({ target }) });
  }
  if ((s.contracts || []).some((c) => c.status === 'active')) out.push({ type: 'contract', weight: 2, make: () => ({ target: 1 }) });
  const ownsFactory = typeof game.factoriesView === 'function'
    && (game.factoriesView() || []).some((f) => f.owned || (s.factories?.[f.id]?.level ?? 0) > 0);
  if (ownsFactory) out.push({ type: 'factory', weight: 2, make: (r) => ({ target: 1 + Math.floor(random(r) * 3) }) });
  return out;
}

export function generateMissions(game, day) {
  const base = baseReward(game), r = dayRng(game, day), pool = candidates(game, base), list = [];
  const gap = levelGap(game);
  while (list.length < MISSIONS_PER_DAY && pool.length) {
    let x = random(r) * pool.reduce((a, c) => a + c.weight, 0), i = 0;
    while (x >= pool[i].weight && i < pool.length - 1) x -= pool[i++].weight;
    const c = pool.splice(i, 1)[0], p = c.make(r);
    const f = FACTOR[c.type] * (c.type === 'task' ? 0.6 + 0.4 * p.target : 1) * (0.9 + 0.2 * random(r));
    list.push({ id: `d${day}-${list.length + 1}`, type: c.type, ...p, progress: 0, base: startValue(game, c.type),
      reward: nice(base * f), xp: Math.round((20 + 0.004 * gap) * f), done: false, claimed: false });
  }
  return list;
}

/** Stat-based missions measure deltas from the value at creation. */
function startValue(game, type) {
  if (type === 'sell') return game.state.stats.salesValue || 0;
  if (type === 'xp') return game.state.xp || 0;
  return 0;
}

const M = (game) => game.state.missions;

/** Create today's missions if missing (new game, old save); `announce` emits missions_new. */
export function ensureMissions(game, announce = false) {
  const s = game.state;
  if (!s.missions || typeof s.missions !== 'object') s.missions = { day: 0, list: [], streak: 0, lastFullDay: 0 };
  s.missions.streak ??= 0; s.missions.lastFullDay ??= 0; s.missions.list ||= [];
  if (s.missions.day !== game.day) newDay(game, game.day, announce);
}

function newDay(game, day, announce) {
  const m = M(game);
  for (const x of m.list) if (x.done && !x.claimed) payout(game, x); // nothing earned is lost at midnight
  if (m.lastFullDay < day - 1) m.streak = 0;
  m.day = day;
  m.list = generateMissions(game, day);
  if (announce) game.emit('missions_new', `🎯 ${m.list.length} misi harian baru.`, { missions: m.list.map((x) => x.id) });
}

/** Daily rollover hook (runs after the clock reached the new day). */
export function stepMissionsDay(game) { ensureMissions(game, true); }

function payout(game, x) {
  x.claimed = true;
  game.earn(x.reward, 'hadiah');
  game.addXp(x.xp);
}

/** Called for every emitted event (except mission events). */
export function trackEvent(game, ev) {
  const m = M(game);
  if (!m || m.day !== game.day) return;
  const s = game.state;
  for (const x of m.list) {
    if (x.done) continue;
    if (x.type === 'harvest' && ev.type === 'task_done' && ev.task === 'harvest' && ev.cropId === x.cropId) x.progress += ev.tons || 0;
    else if (x.type === 'task' && ev.type === 'task_done' && ev.task === x.task) x.progress += 1;
    else if (x.type === 'tasks_any' && ev.type === 'task_done') x.progress += 1;
    else if (x.type === 'feed' && ev.type === 'purchase' && feedCropIds(game).has(ev.productId)) x.progress += ev.qty || 0;
    else if (x.type === 'contract' && ev.type === 'contract_done') x.progress += 1;
    else if (x.type === 'factory' && ev.type === 'factory_done') x.progress += ev.qty > 0 ? 1 : 0;
    else if (x.type === 'sell') {
      // Own produce only: market purchases made while the mission runs are netted out (no buy-and-resell).
      if (ev.type === 'purchase') x.spent = round2((x.spent || 0) + (ev.cost || 0));
      x.progress = Math.max(0, (s.stats.salesValue || 0) - x.base - (x.spent || 0));
    }
    else if (x.type === 'xp') x.progress = Math.max(0, s.xp - x.base);
    x.progress = round2(x.progress);
    if (x.progress >= x.target - 1e-9) complete(game, m, x);
  }
}

function complete(game, m, x) {
  x.done = true;
  x.progress = x.target;
  game.emit('mission_done', `🎯 Misi selesai: ${missionLabel(game, x)}! Ambil hadiah ${fmtMoney(x.reward)}.`, { missionId: x.id });
  if (m.list.every((y) => y.done) && m.lastFullDay !== m.day) {
    m.lastFullDay = m.day;
    m.streak += 1;
    if (m.streak % STREAK_GOAL === 0) {
      const b = streakBonus(game);
      game.earn(b.money, 'hadiah');
      game.emit('mission_streak', `🔥 ${m.streak} hari beruntun! Bonus ${fmtMoney(b.money)} dan ${b.xp} XP.`, { streak: m.streak, ...b });
      game.addXp(b.xp);
    }
  }
}

export const streakBonus = (game) => ({ money: nice(baseReward(game) * 5), xp: Math.round(levelGap(game) * 0.03) });

export function missionLabel(game, x) {
  const crop = x.cropId && game.idx.crops.get(x.cropId);
  switch (x.type) {
    case 'harvest': return `Panen ${fmtNum(x.target)} t ${crop?.name ?? x.cropId}`;
    case 'sell': return `Jual hasil sendiri senilai ${fmtMoney(x.target)}`;
    case 'task': return `Selesaikan ${x.target} tugas ${TASK_LABEL[x.task] ?? x.task}`;
    case 'tasks_any': return `Selesaikan ${x.target} tugas ladang`;
    case 'xp': return `Kumpulkan ${fmtNum(x.target)} XP`;
    case 'feed': return `Beli ${fmtNum(x.target)} t pakan ternak`;
    case 'contract': return 'Selesaikan 1 kontrak';
    case 'factory': return `Produksi ${x.target} batch di pabrik`;
    default: return x.type;
  }
}
const EMOJI = { sell: '💰', task: '🚜', tasks_any: '✅', xp: '⭐', feed: '🌽', contract: '📋', factory: '🏭' };

export function claimMission(game, id) {
  const m = M(game), x = m?.list.find((y) => y.id === id);
  if (!x) return fail('Misi tidak ditemukan.');
  if (x.claimed) return fail('Hadiah misi sudah diambil.');
  if (!x.done) return fail('Misi belum selesai.');
  payout(game, x);
  return ok({ reward: x.reward, xp: x.xp });
}

export function missionsView(game) {
  ensureMissions(game);
  const m = M(game);
  return {
    day: m.day, streak: m.streak, streakGoal: STREAK_GOAL, streakBonus: streakBonus(game),
    resetsInHours: round2(24 - (game.state.time % 24)),
    claimable: m.list.filter((x) => x.done && !x.claimed).length,
    list: m.list.map((x) => ({ id: x.id, type: x.type, label: missionLabel(game, x),
      emoji: x.type === 'harvest' ? (game.idx.crops.get(x.cropId)?.emoji ?? '🌾') : EMOJI[x.type] ?? '🎯',
      target: x.target, progress: Math.min(x.progress, x.target), frac: Math.min(1, x.progress / x.target),
      reward: x.reward, xp: x.xp, done: x.done, claimed: x.claimed, cropId: x.cropId ?? null, task: x.task ?? null })),
  };
}
