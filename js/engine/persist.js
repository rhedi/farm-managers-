// Serialization helpers. Storage is injected ({getItem,setItem}); no globals.
import { newFieldState } from './fields.js';
import { STORAGE_KINDS, stockTons, upgradesFor } from './storage.js';
import { HERD_DEFAULTS } from './breeding.js';
import { upgradesOf } from './upgrades.js';
import { normalizeLedger } from './ledger.js';
import { ensureAutoFeed } from './autoFeed.js';
import { ensureOverflow } from './overflow.js';
import { ensureCalendar } from './calendar.js';
import { migrateMandor } from './mandor.js';
import { ensureKabar } from './kabar.js';
import { ensureProjects } from './projects.js';

export const SAVE_KEY = 'farm-manager-save';
export const SAVE_VERSION = 1;
export const MAX_CATCHUP_HOURS = 48;
export const HISTORY_SIZE = 120;

/** Every stats key the engine tracks (all numeric, default 0). */
export const STATS_KEYS = ['harvests', 'fieldsOwned', 'machinesOwned', 'machineModels', 'animalsOwned', 'livestockOwned',
  'totalEarned', 'totalSpent', 'tonsHarvested', 'level', 'productsSold', 'salesValue', 'contractsDone', 'regionsOwned'];

export const newStats = () => Object.fromEntries(STATS_KEYS.map((k) => [k, 0]));

/** A pause caused by the level-up modal (`modalPause` = speed before it) is never saved: the save keeps that speed. */
export function serializeState(state) {
  const { modalPause, ...rest } = state;
  return JSON.stringify({ ...rest, ...(modalPause > 0 ? { speed: modalPause } : {}), version: SAVE_VERSION, savedAt: Date.now() });
}

/** Parse + validate a save. Returns the state object or throws Error on corrupt input. */
export function parseSave(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  if (!obj || typeof obj !== 'object') throw new Error('Data simpanan rusak.');
  if (obj.version !== SAVE_VERSION) throw new Error(`Versi simpanan tidak didukung: ${obj.version}`);
  for (const k of ['time', 'money', 'fields', 'machines', 'silo', 'market', 'rng']) {
    if (!(k in obj)) throw new Error(`Data simpanan tidak lengkap (${k}).`);
  }
  return obj;
}

/**
 * Bring a parsed save up to the current data/state shape (B10): fill missing keys,
 * market entries and herds; drop machines/fields/animals whose definitions are gone.
 */
export function normalizeState(s, data, idx) {
  if (s.modalPause > 0) s.speed = s.modalPause; // defensive: older v16 builds could save it
  delete s.modalPause;
  s.speed ??= 1; s.xp ??= 0; s.level ??= 1; s.loan ??= 0;
  // Raised level cap (30 → 50): a save that kept earning XP at the old max would skip several levels at once.
  // Banked XP is cut to the next level's threshold, so the next XP gain levels up exactly once (with its modal).
  const L = data.LEVELS || [];
  if (s.level < L.length && s.xp >= (L[s.level + 1] ?? Infinity)) s.xp = L[s.level];
  s.weather ||= {}; s.priceHistory ||= {}; s.animals ||= {};
  s.achievements ||= []; s.log ||= []; s.history ||= [];
  s.contracts ||= []; s.feedReserve ||= {}; s.autoRepair ??= false;
  s.forecast ||= {}; s.events ||= []; s.nextEventId ||= 1; // F5 world (field ph/nutrients via newFieldState)
  s.factories ||= {}; // stream B factories (missing keys filled by factories.stateOf); drop unknown ones
  for (const id of Object.keys(s.factories)) if (!(data.FACTORIES || []).some((f) => f.id === id)) delete s.factories[id];
  s.stats = { ...newStats(), ...(s.stats || {}) };
  normalizeLedger(s); // income/expense report: old saves start with an empty ledger
  // v16 Hadiah Berskala / Bab Petani: XP per game day (missions.ensureMissions measures from now on), bonus research
  // points, chapter chain (chapters.ensureChapters claims already-met steps silently when `seeded` is false).
  if (s.missions && typeof s.missions === 'object' && !Array.isArray(s.missions.xpDays)) s.missions.xpDays = [];
  if (s.research?.bonus != null) s.research.bonus = Math.max(0, Number(s.research.bonus) || 0); // missing = 0
  if (!s.chapters || typeof s.chapters !== 'object') s.chapters = { claimed: [], seeded: false, notice: 0 };
  for (const id of Object.keys(s.fields)) {
    if (!idx.fields.has(id)) { delete s.fields[id]; continue; }
    s.fields[id] = { ...newFieldState(idx.fields.get(id)), ...s.fields[id] };
  }
  s.machines = s.machines.filter((m) => idx.machines.has(m.defId));
  for (const m of s.machines) {
    if (m.busy && !s.fields[m.busy]?.busy) m.busy = false;
    if (typeof m.condition !== 'number') m.condition = 1;
    m.upgrades = upgradesOf(m); // machine upgrades (engine/transmission/efficiency 0–3)
  }
  // Storage levels (workers: workers.ensureWorkers). Old saves: the silo gets the first level of the current curve
  // holding the old built capacity (siloCapacity, F8) and its stock; the Gudang dingin one that holds the animal stock.
  s.storageUpgrades ||= {};
  for (const kind of STORAGE_KINDS) {
    if (typeof s.storageUpgrades[kind] === 'number') continue;
    const old = kind === 'silo' && typeof s.siloCapacity === 'number' ? s.siloCapacity : 0;
    s.storageUpgrades[kind] = upgradesFor(data.BALANCE.storage[kind], Math.max(old, stockTons(idx.products, s.silo, kind)));
  }
  delete s.siloCapacity;
  const maxUid = s.machines.reduce((mx, m) => Math.max(mx, Number(String(m.uid).slice(1)) || 0), 0);
  s.nextUid = Math.max(s.nextUid || 1, maxUid + 1);
  for (const p of data.PRODUCTS) {
    if (!(s.market[p.id] > 0)) s.market[p.id] = p.basePrice;
    if (!s.priceHistory[p.id]?.length) s.priceHistory[p.id] = [s.market[p.id]];
  }
  for (const id of Object.keys(s.animals)) {
    if (!idx.animals.has(id)) { delete s.animals[id]; continue; }
    s.animals[id] = { count: 0, barns: 0, quality: 1, happiness: 1, fed: 1, ...HERD_DEFAULTS, ...s.animals[id] };
  }
  // Kolam ikan (fish.js): old saves have none; drop ponds whose definition is gone, fill missing keys.
  s.ponds = (Array.isArray(s.ponds) ? s.ponds : []).filter((p) => idx.ponds?.has(p?.pondId))
    .map((p) => ({ count: 0, stocked: 0, growth: 0, water: 100, fed: 1, aerator: false, autoWater: false,
      autoRestock: false, readyDays: 0, dead: 0, alert: 'ok', ...p }));
  const maxPond = s.ponds.reduce((mx, p) => Math.max(mx, Number(String(p.uid).slice(1)) || 0), 0);
  s.nextPondUid = Math.max(s.nextPondUid || 1, maxPond + 1);
  // v16: Beli pakan otomatis (missing = on: it only buys feed that prevents starvation), Gudang overflow tally,
  // Kalender Panen + timed boosters (missing = no claims, no boosters).
  ensureAutoFeed(s);
  ensureOverflow(s);
  ensureCalendar(s);
  // 👷 Mandor Ladang: a save without `mandor` predates the 2-free-fields rule → a covering Mandor for free (one toast).
  migrateMandor(s, data);
  // v17 📰 Kabar Desa (missing = nothing open; the first dilemma comes the next day) + 🏛️ Proyek Warisan (none built).
  ensureKabar(s);
  ensureProjects(s, data);
  if (s.history.length > HISTORY_SIZE) s.history.splice(0, s.history.length - HISTORY_SIZE);
  return s;
}

export function writeStorage(storage, json) {
  storage.setItem(SAVE_KEY, json);
}

export function readStorage(storage) {
  return storage.getItem(SAVE_KEY);
}
