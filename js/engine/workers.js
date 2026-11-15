// Workers (F9): every owned-machine field task needs a free worker. Wages are paid daily.
import { random, round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { perk } from './research.js';

export const NO_WORKER = 'Tidak ada pekerja bebas.';
export const MAX_SKILL_SPEEDUP = 0.2;
const NAMES = ['Budi', 'Siti', 'Agus', 'Dewi', 'Joko', 'Rina', 'Bambang', 'Sri', 'Andi', 'Wati', 'Hendra', 'Yuni',
  'Slamet', 'Lestari', 'Eko', 'Ratna', 'Dedi', 'Nur', 'Asep', 'Ayu', 'Wahyu', 'Fitri', 'Rudi', 'Indah'];

const cfg = (game) => game.data.BALANCE.workers ?? {};
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

/** Daily wage for a skill level (before the random spread). */
export const wageFor = (game, skill) => {
  const c = cfg(game);
  return Math.round((c.wageBase ?? 60) + (c.wagePerSkill ?? 140) * skill);
};

/** Task duration multiplier: skill 1 is 20% faster. */
export const skillFactor = (worker) => 1 - MAX_SKILL_SPEEDUP * (worker?.skill ?? 0);

function rollCandidate(game, n) {
  const s = game.state;
  const name = NAMES[Math.floor(random(s) * NAMES.length)];
  const c = cfg(game);
  const lo = c.skillMin ?? 0.1, hi = c.skillMax ?? 0.9;
  const skill = round2(lo + (hi - lo) * random(s));
  const wage = Math.max(20, wageFor(game, skill) + Math.round((random(s) - 0.5) * 20));
  return { id: `c${game.day}-${n}`, name, skill, wage };
}

/** Replace the candidate list (3 fresh candidates). */
export function refreshCandidates(game) {
  const n = cfg(game).candidates ?? 3;
  game.state.candidates = Array.from({ length: n }, (_, i) => rollCandidate(game, i + 1));
  game.state.candidatesWeek = Math.floor((game.day - 1) / 7);
}

/** The starting worker (fixed, no RNG). */
export function starterWorker(game) {
  const skill = cfg(game).starterSkill ?? 0.3;
  return { id: 'w1', name: 'Pak Budi', skill, wage: wageFor(game, skill), busy: false };
}

export const freeWorker = (game) => game.state.workers
  .filter((w) => !w.busy).sort((a, b) => b.skill - a.skill)[0] ?? null;

/** createGame / load migration: starter worker, id counter, busy cleanup, first candidates. */
export function ensureWorkers(game) {
  const s = game.state;
  if (!Array.isArray(s.workers) || !s.workers.length) s.workers = [starterWorker(game)];
  for (const w of s.workers) if (w.busy && !s.fields[w.busy]?.busy) w.busy = false;
  const maxId = Math.max(0, ...s.workers.map((w) => Number(String(w.id).slice(1)) || 0));
  s.nextWorkerId = Math.max(s.nextWorkerId || 1, maxId + 1);
  if (!Array.isArray(s.candidates) || s.candidatesWeek == null) refreshCandidates(game);
}

export const candidatesView = (game) => game.state.candidates.map((c) => ({ ...c }));

export function workersView(game) {
  const trip = (id) => game.state.shipments?.find((s) => s.id === id); // truck driver (logistics.js)
  const names = (id) => game.idx.fields.get(id)?.name
    ?? (trip(id) ? `🚚 ${game.idx.cities.get(trip(id).cityId)?.name ?? 'Pengiriman'}` : id);
  return game.state.workers.map((w) => ({ ...w, busyField: w.busy ? names(w.busy) : null,
    speedup: round2(MAX_SKILL_SPEEDUP * w.skill) }));
}

export function hireWorker(game, candidateId) {
  const s = game.state;
  const i = s.candidates.findIndex((c) => c.id === candidateId);
  if (i < 0) return fail('Calon pekerja tidak ditemukan.');
  const [c] = s.candidates.splice(i, 1);
  const id = `w${s.nextWorkerId++}`;
  s.workers.push({ id, name: c.name, skill: c.skill, wage: c.wage, busy: false });
  game.emit('worker_hired', `${c.name} bergabung sebagai pekerja (${fmtMoney(c.wage)}/hari).`, { workerId: id });
  return ok({ id });
}

export function fireWorker(game, workerId) {
  const s = game.state;
  const i = s.workers.findIndex((w) => w.id === workerId);
  if (i < 0) return fail('Pekerja tidak ditemukan.');
  if (s.workers[i].busy) return fail('Pekerja sedang bekerja.');
  if (s.workers.length <= 1) return fail('Tidak bisa memberhentikan pekerja terakhir.');
  s.workers.splice(i, 1);
  return ok();
}

/** Small skill gain after a finished task (diminishing towards 1). */
export function onTaskDone(game, worker) {
  if (!worker) return;
  const gain = cfg(game).skillPerTask ?? 0.01;
  worker.skill = Math.min(1, Math.round((worker.skill + gain * (1 - worker.skill)) * 1000) / 1000);
}

/** Daily wage bill (research perk 'wages' lowers it). */
export const totalWages = (game) => game.state.workers.reduce((sum, w) => sum + w.wage, 0) * (1 - perk(game, 'wages'));

/** Daily rollover: pay wages (shortfall goes to the loan), refresh candidates weekly. */
export function stepWorkersDay(game) {
  const s = game.state;
  const wages = round2(totalWages(game));
  const short = wages > 0 ? game.payOrBorrow(wages, 'gaji') : 0;
  if (short > 0) {
    game.emit('wages_unpaid', `Uang kurang untuk gaji pekerja: ${fmtMoney(short)} ditambahkan ke pinjaman.`, { amount: short });
  }
  if (Math.floor((game.day - 1) / 7) !== s.candidatesWeek) refreshCandidates(game);
}
