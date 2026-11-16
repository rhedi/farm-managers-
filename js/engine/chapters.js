// "Bab Petani": a chain of goals that walks a new farmer from the tutorial's first sale to factories and the world.
// state.chapters = { claimed: [stepId], seeded, notice }. Steps are checked from state (no events), one at a time:
// the current step is the first unclaimed one; when its goal is met the player claims a scaled reward (rewards.js).
// Old saves (seeded false): every step that is already satisfied is claimed silently once (no reward spam);
// `notice` = how many, for one summary toast in the UI.
import { fmtMoney } from './defs.js';
import { scaledCash, grantResearchPoints } from './rewards.js';

const n = (x) => x || 0;
const plans = (s) => Object.values(s.fields).filter((f) => f.plan).length;
const greenhouses = (s) => Object.values(s.fields).filter((f) => f.greenhouse).length;

// value(state) → progress toward target; go = where "Tunjukkan" navigates ({tab, sub}); reward = fixed floor,
// pct = share of recent daily income; level = level the goal needs (shown as locked until then).
export const CHAPTERS = [
  { id: 'bab1', name: 'Bab 1 · Petani Mandiri', emoji: '🌱', steps: [
    { id: 'field2', goal: 'Beli ladang ke-2', icon: '🗺️', target: 2, value: (s) => Object.keys(s.fields).length, go: { tab: 'farm', sub: 'map' }, reward: 1500, xp: 60 },
    { id: 'plan', goal: 'Aktifkan Rencana di 1 ladang', icon: '🔁', target: 1, value: plans, go: { tab: 'farm', sub: 'fields' }, reward: 1500, xp: 60 },
    { id: 'worker', goal: 'Rekrut 1 pekerja baru', icon: '👷', target: 1, value: (s) => Math.max(0, n(s.workers?.length) - 1), go: { tab: 'garage', sub: 'workers' }, reward: 2000, xp: 80 },
    { id: 'contract1', goal: 'Selesaikan 1 kontrak', icon: '📋', target: 1, value: (s) => n(s.stats.contractsDone), go: { tab: 'market', sub: 'contracts' }, reward: 2500, xp: 100 },
  ] },
  { id: 'bab2', name: 'Bab 2 · Juragan Desa', emoji: '🏡', steps: [
    { id: 'pond', goal: 'Bangun kolam ikan', icon: '🐟', level: 3, target: 1, value: (s) => n(s.ponds?.length), go: { tab: 'animals', sub: 'fish' }, reward: 3000, xp: 120 },
    { id: 'dispatcher', goal: 'Rekrut Manajer Logistik', icon: '🧑‍💼', level: 6, target: 1, value: (s) => (s.dispatcher?.hired ? 1 : 0), go: { tab: 'market', sub: 'ship' }, reward: 5000, xp: 200 },
    { id: 'greenhouse', goal: 'Bangun rumah kaca', icon: '🏠', level: 9, target: 1, value: greenhouses, go: { tab: 'farm', sub: 'fields' }, reward: 8000, xp: 300 },
  ] },
  { id: 'bab3', name: 'Bab 3 · Raja Industri', emoji: '🏭', steps: [
    { id: 'factory', goal: 'Bangun pabrik', icon: '🏭', level: 11, target: 1, value: (s) => Object.keys(s.factories || {}).length, go: { tab: 'silo', sub: 'processed' }, reward: 10000, xp: 400 },
    { id: 'factoryManager', goal: 'Rekrut Manajer Pabrik', icon: '👩‍🔧', level: 11, target: 1, value: (s) => (s.factoryManager?.hired ? 1 : 0), go: { tab: 'silo', sub: 'processed' }, reward: 10000, xp: 400 },
    { id: 'contracts10', goal: 'Selesaikan 10 kontrak', icon: '🤝', target: 10, value: (s) => n(s.stats.contractsDone), go: { tab: 'market', sub: 'contracts' }, reward: 15000, xp: 600 },
    { id: 'regions5', goal: 'Miliki ladang di 5 wilayah', icon: '🌍', target: 5, value: (s) => n(s.stats.regionsOwned), go: { tab: 'farm', sub: 'map' }, reward: 25000, xp: 900 },
  ] },
  { id: 'bab4', name: 'Bab 4 · Taipan Dunia', emoji: '🌐', steps: [
    { id: 'ponds3', goal: 'Miliki 3 kolam ikan', icon: '🎣', target: 3, value: (s) => n(s.ponds?.length), go: { tab: 'animals', sub: 'fish' }, reward: 30000, xp: 1200 },
    { id: 'fields25', goal: 'Miliki 25 ladang', icon: '🗺️', target: 25, value: (s) => Object.keys(s.fields).length, go: { tab: 'farm', sub: 'map' }, reward: 60000, xp: 2500 },
    { id: 'contracts50', goal: 'Selesaikan 50 kontrak', icon: '📜', target: 50, value: (s) => n(s.stats.contractsDone), go: { tab: 'market', sub: 'contracts' }, reward: 80000, xp: 4000 },
    { id: 'regions13', goal: 'Miliki ladang di ke-13 wilayah', icon: '👑', level: 43, target: 13, value: (s) => n(s.stats.regionsOwned), go: { tab: 'farm', sub: 'map' }, reward: 200000, xp: 10000 },
  ] },
];
const STEP_PCT = 0.15; // Hadiah Berskala: 15% of a recent day's income per step (cash saturates; chapters end in research)
export const STEPS = CHAPTERS.flatMap((c) => c.steps.map((st, i) => ({ ...st, chapterId: c.id, last: i === c.steps.length - 1 })));

const C = (game) => game.state.chapters;
const met = (game, st) => st.value(game.state) >= st.target;

/** Shown after the tutorial's first sale (old saves: always). */
export const chaptersStarted = (game) => n(game.state.stats.salesValue) > 0 || n(game.state.stats.productsSold) > 0;

/** createGame / load: normalize; old saves claim already-met steps silently once. */
export function ensureChapters(game) {
  const s = game.state;
  if (!s.chapters || typeof s.chapters !== 'object') s.chapters = { claimed: [], seeded: false, notice: 0 };
  const c = s.chapters;
  c.claimed = [...new Set(Array.isArray(c.claimed) ? c.claimed : [])].filter((id) => STEPS.some((st) => st.id === id));
  c.notice = n(c.notice);
  if (!c.seeded) {
    const silent = STEPS.filter((st) => !c.claimed.includes(st.id) && met(game, st));
    c.claimed.push(...silent.map((st) => st.id));
    c.notice += silent.length;
    c.seeded = true;
  }
}

/** Reward for a step right now: {money, xp, rp} (the chapter's last step adds +1 research point). */
export const stepReward = (game, st) => ({ money: scaledCash(game, st.reward, STEP_PCT), xp: st.xp, rp: st.last ? 1 : 0 });

export const currentStep = (game) => STEPS.find((st) => !C(game).claimed.includes(st.id)) ?? null;

export function claimChapterStep(game, stepId) {
  const st = currentStep(game);
  if (!st || st.id !== stepId) return { ok: false, reason: 'Langkah ini belum aktif.' };
  if (!met(game, st)) return { ok: false, reason: 'Tujuan langkah ini belum tercapai.' };
  const r = stepReward(game, st);
  C(game).claimed.push(st.id);
  game.earn(r.money, 'hadiah');
  grantResearchPoints(game, r.rp);
  game.emit('chapter_step', `📖 ${st.goal} — selesai! +${fmtMoney(r.money)} · +${r.xp} XP${r.rp ? ` · +${r.rp} poin riset` : ''}.`,
    { stepId: st.id, chapterId: st.chapterId, ...r });
  game.addXp(r.xp);
  return { ok: true, stepId: st.id, ...r };
}

/** Summary toast count for old saves (read once by the UI). */
export function takeChapterNotice(game) { const k = n(C(game)?.notice); if (C(game)) C(game).notice = 0; return k; }

export function chaptersView(game) {
  const s = game.state, cur = currentStep(game);
  const step = (st) => ({ id: st.id, goal: st.goal, icon: st.icon, target: st.target, level: st.level ?? 1,
    progress: Math.min(st.value(s), st.target), frac: Math.min(1, st.value(s) / st.target), go: st.go,
    reward: stepReward(game, st), locked: (st.level ?? 1) > s.level,
    status: C(game).claimed.includes(st.id) ? 'claimed' : st === cur ? (met(game, st) ? 'ready' : 'active') : 'todo' });
  const ch = cur ? CHAPTERS.find((c) => c.id === cur.chapterId) : null;
  return { started: chaptersStarted(game), allDone: !cur, ready: !!cur && met(game, cur),
    chapter: ch && { id: ch.id, name: ch.name, emoji: ch.emoji, index: CHAPTERS.indexOf(ch) + 1, total: CHAPTERS.length,
      done: ch.steps.filter((st) => C(game).claimed.includes(st.id)).length, steps: STEPS.filter((x) => x.chapterId === ch.id).map(step) },
    current: cur && step(cur) };
}
