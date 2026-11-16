// Game-day missions (stream C): 3 seeded missions per game day, scaled to level, assets and recent pace.
// Uses its own hash-seeded RNG per day, so game.state.rng (weather, market…) is untouched.
// Progress comes from game events (trackEvent, called by Game.emit) and stat/xp deltas, so plans, auto-sell and
// managers count the same as manual taps. Rewards ("Hadiah Berskala", rewards.js): max(fixed floor, share of the
// recent daily income); XP targets follow the XP actually earned in the last 3 game days.
import { hashSeed, random, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { getFieldView } from './fields.js';
import { netWorth } from './economy.js';
import { BUY_MARKUP } from './purchase.js';
import { nice, recentIncome, scaledCash, grantResearchPoints, RECENT_DAYS } from './rewards.js';

export const MISSIONS_PER_DAY = 3;
export const STREAK_GOAL = 7;
const TASK_LABEL = { plow: 'bajak', seed: 'tanam', fertilize: 'pupuk', irrigate: 'irigasi', lime: 'kapur' };
const FACTOR = { harvest: 1.2, sell: 1, task: 0.8, tasks_any: 0.7, feed: 0.6, contract: 1.4, xp: 0.7, factory: 1.2 };
/** Share of the recent daily income paid per mission type (5–10%, ≤ 12% after jitter; 3 missions ≈ ≤ 30% of a day).
 *  Money saturates late game, so the "big" reward of hard missions is research points / XP, not cash. */
const PCT = { harvest: 0.09, sell: 0.06, task: 0.06, tasks_any: 0.05, feed: 0.06, contract: 0.1, xp: 0.07, factory: 0.09 };
export const MAX_PCT = 0.12;
/** Hard missions that often (RP_CHANCE) also give +1 research point: the reward that never saturates. */
const RP_TYPES = new Set(['contract', 'factory', 'harvest']);
const RP_CHANCE = 0.4;
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

const dayRng = (game, day, salt = 'm') => ({ rng: hashSeed(`${game.state.seed}|${salt}|${day}`) });

function levelGap(game) {
  const L = game.data.LEVELS, i = Math.min(game.state.level, L.length - 1);
  return Math.max(250, (L[i] ?? 0) - (L[i - 1] ?? 0));
}

/** Fixed base money reward (the floor): grows with level and net worth. */
export function baseReward(game) {
  const lvl = game.state.level; // NW share capped so rewards never compound: ≤ 600·level per mission
  return nice(300 * lvl + Math.min(0.002 * Math.max(0, netWorth(game)), 300 * lvl));
}

/** Average XP earned per game day over the last RECENT_DAYS days (null when unknown, e.g. a fresh save). */
export function recentXpRate(game) {
  const d = game.state.missions?.xpDays ?? [];
  if (d.length) return d.reduce((a, b) => a + b, 0) / d.length;
  const inc = recentIncome(game); // old saves: ≈ xpPerHarvestValue × income, discounted for prices above base
  return inc > 0 ? 0.6 * (game.data.BALANCE.xpPerHarvestValue ?? 0.01) * inc : null;
}

/** "Kumpulkan N XP" target: 60–90% of the recent daily XP; fresh games use a small level-based target. */
export function xpTarget(game, r) {
  const rate = recentXpRate(game), k = 0.6 + 0.3 * random(r);
  return nice(Math.max(30, rate != null ? rate * k : Math.min(levelGap(game) * 0.02, 40 * game.state.level) * k));
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
  // Sell own produce: stock in the silo, what is about to be harvested, or (auto-sell, managers) the recent income.
  // Target ≥ 2× base reward; buy-then-resell is netted out in trackEvent.
  let value = 0;
  for (const [id, q] of Object.entries(s.silo)) value += q * (s.market[id] ?? 0);
  for (const id of soonIds) value += soon[id] * (s.market[id] ?? 0);
  value = Math.max(value, recentIncome(game));
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
  out.push({ type: 'xp', weight: 1, make: (r) => ({ target: xpTarget(game, r) }) });
  // Feed: harvested or bought feed crops; ≥ 1 t and ≥ 1 day of herd feed, worth ≥ the floor at the buy price.
  const feedIds = [...feedCropIds(game)].filter((id) => s.market[id] > 0);
  if (feedIds.length) {
    const need = Object.entries(s.animals).reduce((t, [id, h]) => t + h.count * (game.idx.animals.get(id)?.feedPerDay ?? 0), 0);
    const price = Math.min(...feedIds.map((id) => s.market[id] * BUY_MARKUP));
    const target = Math.ceil(Math.max(1, need, (0.75 * base) / price) * 2) / 2;
    if (target <= (game.storageInfo?.('silo').free ?? Infinity)) out.push({ type: 'feed', weight: 2, make: () => ({ target, cap: round2(0.75 * target * price) }) });
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
    const c = pool.splice(i, 1)[0], { cap, ...p } = c.make(r);
    const jitter = 0.9 + 0.2 * random(r);
    const f = FACTOR[c.type] * (c.type === 'task' ? 0.6 + 0.4 * p.target : 1) * jitter;
    const floor = nice(base * f);
    let reward = scaledCash(game, floor, Math.min(MAX_PCT, PCT[c.type] * jitter));
    if (cap != null) reward = Math.max(floor, Math.min(reward, nice(cap))); // feed can be bought: never pay more than it costs
    const rp = RP_TYPES.has(c.type) && game.state.level >= 5 && random(r) < RP_CHANCE ? 1 : 0;
    const xp = Math.round(Math.max((20 + 0.004 * gap) * f, 0.15 * f * (recentXpRate(game) ?? 0))); // ≈ 10–20% of a day's XP
    list.push({ id: `d${day}-${list.length + 1}`, type: c.type, ...p, progress: 0, base: startValue(game, c.type),
      reward, xp, ...(rp ? { rp } : {}), done: false, claimed: false });
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
  if (!Array.isArray(s.missions.xpDays)) s.missions.xpDays = [];
  if (s.missions.day !== game.day) newDay(game, game.day, announce);
  s.missions.xpMark ??= { day: game.day, xp: s.xp, partial: true }; // old save loaded mid-day: don't count this day
}

/** XP earned per closed game day (last RECENT_DAYS), measured at each rollover. */
function trackXpDay(game, day) {
  const m = M(game), mark = m.xpMark, xp = game.state.xp;
  // mark.partial: the day that ended was only partly measured (old save loaded mid-day) → not a full day's rate.
  if (mark && !mark.partial && mark.day === day - 1 && xp >= mark.xp) {
    m.xpDays.push(round2(xp - mark.xp));
    if (m.xpDays.length > RECENT_DAYS) m.xpDays.splice(0, m.xpDays.length - RECENT_DAYS);
  }
  m.xpMark = { day, xp };
}

function newDay(game, day, announce) {
  const m = M(game);
  for (const x of m.list) if (x.done && !x.claimed) payout(game, x); // nothing earned is lost at midnight
  trackXpDay(game, day); // after the payouts: their XP belongs to the day that ended
  if (m.lastFullDay < day - 1) m.streak = 0;
  m.day = day;
  m.list = generateMissions(game, day);
  if (announce) game.emit('missions_new', `🎯 ${m.list.length} misi baru untuk hari game ${day}.`, { missions: m.list.map((x) => x.id) });
}

/** Daily rollover hook (runs after the clock reached the new day, before the ledger closes the old one). */
export function stepMissionsDay(game) { ensureMissions(game, true); }

function payout(game, x) {
  x.claimed = true;
  game.earn(x.reward, 'hadiah');
  grantResearchPoints(game, x.rp || 0);
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
    else if (x.type === 'feed' && ev.type === 'task_done' && ev.task === 'harvest' && feedCropIds(game).has(ev.cropId)) x.progress += ev.tons || 0;
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

/** Every STREAK_GOAL full days: 5× the floor or half a day of recent income, whichever is larger. */
export const streakBonus = (game) => ({ money: scaledCash(game, nice(baseReward(game) * 5), 0.5), xp: Math.round(levelGap(game) * 0.03) });

export function missionLabel(game, x) {
  const crop = x.cropId && game.idx.crops.get(x.cropId);
  switch (x.type) {
    case 'harvest': return `Panen ${fmtNum(x.target)} t ${crop?.name ?? x.cropId}`;
    case 'sell': return `Jual hasil sendiri senilai ${fmtMoney(x.target)}`;
    case 'task': return `Selesaikan ${x.target} tugas ${TASK_LABEL[x.task] ?? x.task}`;
    case 'tasks_any': return `Selesaikan ${x.target} tugas ladang`;
    case 'xp': return `Kumpulkan ${fmtNum(x.target)} XP`;
    case 'feed': return `Sediakan ${fmtNum(x.target)} t pakan ternak (panen/beli)`;
    case 'contract': return 'Selesaikan 1 kontrak';
    case 'factory': return `Produksi ${x.target} batch di pabrik`;
    default: return x.type;
  }
}
/** How the mission can be done hands-off (plans, auto-sell, managers). */
const HINT = {
  harvest: 'Rencana 🔁 memanen otomatis', sell: 'Jual otomatis & Manajer Logistik ikut dihitung',
  task: 'Tugas dari Rencana 🔁 ikut dihitung', tasks_any: 'Tugas dari Rencana 🔁 ikut dihitung',
  xp: 'Semua XP dihitung: panen, ternak, pabrik, kontrak', feed: 'Panen tanaman pakan juga dihitung',
  contract: 'Kirim kontrak di Pasar › Kontrak', factory: 'Manajer Pabrik ikut dihitung',
};
const EMOJI = { sell: '💰', task: '🚜', tasks_any: '✅', xp: '⭐', feed: '🌽', contract: '📋', factory: '🏭' };

export function claimMission(game, id) {
  const m = M(game), x = m?.list.find((y) => y.id === id);
  if (!x) return fail('Misi tidak ditemukan.');
  if (x.claimed) return fail('Hadiah misi sudah diambil.');
  if (!x.done) return fail('Misi belum selesai.');
  payout(game, x);
  return ok({ reward: x.reward, xp: x.xp, rp: x.rp || 0 });
}

export function missionsView(game) {
  ensureMissions(game);
  const m = M(game);
  return {
    day: m.day, streak: m.streak, streakGoal: STREAK_GOAL, streakBonus: streakBonus(game),
    resetsInHours: round2(24 - (game.state.time % 24)),
    realSecondsPerDay: 24 * game.data.BALANCE.realSecondsPerGameHour,
    recentIncome: recentIncome(game),
    claimable: m.list.filter((x) => x.done && !x.claimed).length,
    list: m.list.map((x) => ({ id: x.id, type: x.type, label: missionLabel(game, x), hint: HINT[x.type] ?? '',
      emoji: x.type === 'harvest' ? (game.idx.crops.get(x.cropId)?.emoji ?? '🌾') : EMOJI[x.type] ?? '🎯',
      target: x.target, progress: Math.min(x.progress, x.target), frac: Math.min(1, x.progress / x.target),
      reward: x.reward, xp: x.xp, rp: x.rp || 0, done: x.done, claimed: x.claimed, cropId: x.cropId ?? null, task: x.task ?? null })),
  };
}
