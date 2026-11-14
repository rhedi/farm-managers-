// Serialization helpers. Storage is injected ({getItem,setItem}); no globals.
import { newFieldState } from './fields.js';
import { SILO_START, SILO_STEP } from './silo.js';
import { HERD_DEFAULTS } from './breeding.js';
import { upgradesOf } from './upgrades.js';
import { normalizeLedger } from './ledger.js';

export const SAVE_KEY = 'farm-manager-save';
export const SAVE_VERSION = 1;
export const MAX_CATCHUP_HOURS = 48;
export const HISTORY_SIZE = 120;

/** Every stats key the engine tracks (all numeric, default 0). */
export const STATS_KEYS = ['harvests', 'fieldsOwned', 'machinesOwned', 'machineModels', 'animalsOwned', 'livestockOwned',
  'totalEarned', 'totalSpent', 'tonsHarvested', 'level', 'productsSold', 'salesValue', 'contractsDone', 'regionsOwned'];

export const newStats = () => Object.fromEntries(STATS_KEYS.map((k) => [k, 0]));

export function serializeState(state) {
  return JSON.stringify({ ...state, version: SAVE_VERSION, savedAt: Date.now() });
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
  s.speed ??= 1; s.xp ??= 0; s.level ??= 1; s.loan ??= 0;
  s.weather ||= {}; s.priceHistory ||= {}; s.animals ||= {};
  s.achievements ||= []; s.log ||= []; s.history ||= [];
  s.contracts ||= []; s.feedReserve ||= {}; s.autoRepair ??= false;
  s.forecast ||= {}; s.events ||= []; s.nextEventId ||= 1; // F5 world (field ph/nutrients via newFieldState)
  s.factories ||= {}; // stream B factories (missing keys filled by factories.stateOf); drop unknown ones
  for (const id of Object.keys(s.factories)) if (!(data.FACTORIES || []).some((f) => f.id === id)) delete s.factories[id];
  s.stats = { ...newStats(), ...(s.stats || {}) };
  normalizeLedger(s); // income/expense report: old saves start with an empty ledger
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
  // F8: old saves get enough free silo steps to hold their current stock (workers: workers.ensureWorkers).
  if (typeof s.siloCapacity !== 'number') {
    const S = data.BALANCE.silo ?? {}, start = S.start ?? SILO_START, step = S.step ?? SILO_STEP;
    const used = Object.entries(s.silo).reduce((sum, [id, q]) => sum + (idx.products.get(id)?.unit === 't' ? q : 0), 0);
    s.siloCapacity = start + step * Math.ceil(Math.max(0, used - start) / step);
  }
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
  if (s.history.length > HISTORY_SIZE) s.history.splice(0, s.history.length - HISTORY_SIZE);
  return s;
}

export function writeStorage(storage, json) {
  storage.setItem(SAVE_KEY, json);
}

export function readStorage(storage) {
  return storage.getItem(SAVE_KEY);
}
