// Random world events, rolled once per day from the game RNG (state.events, state.nextEventId).
// pest (field, −25% yield until treated) · storm (region: crop damage, free rain) · heatwave
// (region: hot + dry) · boom/crash (product price ×mult) · subsidy (money) · perfect (growth bonus).
import { random, randRange, round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { clampPrice } from './market.js';

const DEFAULTS = { chancePerDay: 0.25, weights: { pest: 3, storm: 2, heatwave: 2, boom: 2, crash: 2, subsidy: 1, perfect: 2 },
  pestYield: 0.75, subsidyPerHa: 60, subsidyMin: 800, perfectGrowth: 1.25 };
export const HEATWAVE_TEMP = 6;
const INSTANT = new Set(['storm', 'subsidy']);
export const MAX_ACTIVE = 3;

export const EVENT_INFO = {
  pest: { name: 'Serangan Hama', emoji: '🐛' },
  storm: { name: 'Badai', emoji: '⛈️' },
  heatwave: { name: 'Gelombang Panas', emoji: '🔥' },
  boom: { name: 'Harga Melonjak', emoji: '📈' },
  crash: { name: 'Harga Anjlok', emoji: '📉' },
  subsidy: { name: 'Subsidi Pemerintah', emoji: '💰' },
  perfect: { name: 'Cuaca Ideal', emoji: '🌈' },
};

const cfg = (game) => ({ ...DEFAULTS, ...(game.data.BALANCE.events || {}) });
const list = (game) => (game.state.events ||= []);
const pick = (state, arr) => arr[Math.floor(random(state) * arr.length)];
const active = (game, type, pred) => list(game).filter((e) => e.type === type && e.startDay <= game.day
  && (e.endsDay == null || e.endsDay >= game.day) && pred(e));

function ownedRegions(game) {
  const ids = Object.keys(game.state.fields).map((id) => game.idx.fields.get(id)?.regionId);
  const set = new Set(ids.filter(Boolean));
  return set.size ? game.data.REGIONS.filter((r) => set.has(r.id)).map((r) => r.id) : game.data.REGIONS.map((r) => r.id);
}

export function treatPestCost(game, fieldId) {
  const def = game.idx.fields.get(fieldId);
  return def ? round2(def.sizeHa * (game.data.BALANCE.pestTreatPerHa ?? 40)) : 0;
}

export const pestFactor = (game, f) => (f?.pest ? cfg(game).pestYield : 1);

/** Weather changes from active events for a region/day: heatwave = hot & dry, storm = rain. */
export function weatherOverride(game, regionId, day) {
  const o = { tempAdd: 0, rain: null };
  for (const e of game.state.events || []) {
    if (e.regionId !== regionId || e.startDay > day || (e.endsDay != null && e.endsDay < day)) continue;
    if (e.type === 'heatwave') { o.tempAdd += HEATWAVE_TEMP; o.rain = false; }
    if (e.type === 'storm') o.rain = true;
  }
  return o;
}

export const eventGrowthMult = (game, regionId) =>
  (active(game, 'perfect', (e) => e.regionId === regionId).length ? cfg(game).perfectGrowth : 1);

/** Product of active boom/crash multipliers for a product. */
export function marketEventMult(game, productId) {
  return list(game).filter((e) => (e.type === 'boom' || e.type === 'crash') && e.productId === productId)
    .reduce((m, e) => m * e.mult, 1);
}

function describe(game, e) {
  const region = e.regionId && game.idx.regions.get(e.regionId)?.name;
  const prod = e.productId && game.idx.products.get(e.productId)?.name;
  switch (e.type) {
    case 'pest': {
      const f = game.state.fields[e.fieldId];
      const crop = game.idx.crops.get(f?.cropId)?.name ?? 'tanaman';
      return `Hama menyerang ${crop} di ${game.idx.fields.get(e.fieldId)?.name}. Hasil −25% sampai disemprot (${fmtMoney(treatPestCost(game, e.fieldId))}).`;
    }
    case 'storm': return `Badai di ${region}: tanaman rusak ${Math.round(e.damage * 100)}%, tapi hujan gratis.`;
    case 'heatwave': return `${region} panas & kering sampai hari ${e.endsDay}. Pertimbangkan irigasi.`;
    case 'boom': return `Harga ${prod} naik ${Math.round((e.mult - 1) * 100)}% sampai hari ${e.endsDay}.`;
    case 'crash': return `Harga ${prod} turun ${Math.round((1 - e.mult) * 100)}% sampai hari ${e.endsDay}.`;
    case 'subsidy': return `Pemerintah membagikan subsidi ${fmtMoney(e.amount)}.`;
    case 'perfect': return `Tanaman di ${region} tumbuh ${Math.round((cfg(game).perfectGrowth - 1) * 100)}% lebih cepat sampai hari ${e.endsDay}.`;
    default: return '';
  }
}

/** Build a new event of `type` for `day` (mutating world state), or null when it can't apply. */
function create(game, type, day) {
  const { state } = game;
  const e = { type, startDay: day, endsDay: day };
  if (type === 'pest') {
    const crops = (f) => f.state === 'growing' || f.state === 'orchard'; // annual crops and fruit trees
    const ids = Object.keys(state.fields).filter((id) => crops(state.fields[id]) && !state.fields[id].pest);
    if (!ids.length) return null;
    e.fieldId = pick(state, ids);
    e.regionId = game.idx.fields.get(e.fieldId)?.regionId;
    e.endsDay = null;
    state.fields[e.fieldId].pest = true;
  } else if (type === 'storm' || type === 'heatwave' || type === 'perfect') {
    e.regionId = pick(state, ownedRegions(game));
    if (active(game, type, (x) => x.regionId === e.regionId).length) return null;
    if (type === 'heatwave') e.endsDay = day + 2 + Math.floor(random(state) * 2);
    if (type === 'perfect') e.endsDay = day + 1 + Math.floor(random(state) * 2);
    if (type === 'storm') {
      e.damage = round2(randRange(state, 0.05, 0.15));
      for (const [fid, f] of Object.entries(state.fields)) {
        // growing crops and orchards outdoors; a rumah kaca shields its field
        if ((f.state !== 'growing' && f.state !== 'orchard') || f.greenhouse || game.idx.fields.get(fid)?.regionId !== e.regionId) continue;
        f.damage = round2((f.damage ?? 1) * (1 - e.damage));
      }
    }
  } else if (type === 'boom' || type === 'crash') {
    const busy = new Set(list(game).filter((x) => x.productId).map((x) => x.productId));
    const ids = game.data.CROPS.filter((c) => c.unlockLevel <= state.level && !busy.has(c.id)).map((c) => c.id);
    if (!ids.length) return null;
    e.productId = pick(state, ids);
    e.mult = round2(type === 'boom' ? randRange(state, 1.3, 1.5) : 0.7);
    e.endsDay = day + 2 + Math.floor(random(state) * 3);
    state.market[e.productId] = clampPrice(game.idx.products.get(e.productId), state.market[e.productId] * e.mult);
  } else if (type === 'subsidy') {
    const C = cfg(game);
    const ha = Object.keys(state.fields).reduce((s, id) => s + (game.idx.fields.get(id)?.sizeHa ?? 0), 0);
    e.amount = Math.round(Math.max(C.subsidyMin, ha * C.subsidyPerHa));
    game.earn(e.amount, 'hadiah');
  } else return null;
  return e;
}

function end(game, e) {
  if ((e.type === 'boom' || e.type === 'crash') && game.state.market[e.productId] > 0) {
    game.state.market[e.productId] = clampPrice(game.idx.products.get(e.productId), game.state.market[e.productId] / e.mult);
  }
  if (e.type === 'pest' && game.state.fields[e.fieldId]) game.state.fields[e.fieldId].pest = false;
  if (!INSTANT.has(e.type)) {
    const info = EVENT_INFO[e.type];
    game.emit('event_end', `${info.emoji} ${info.name} berakhir.`, { eventId: e.id, eventType: e.type });
  }
}

/** Daily rollover (before weather and market): expire finished events, maybe start one new. */
export function stepEventsDay(game, day) {
  const { state } = game;
  state.nextEventId ||= 1;
  const keep = [];
  for (const e of list(game)) {
    const gone = e.type === 'pest' ? !state.fields[e.fieldId]?.pest : e.endsDay < day;
    if (gone) end(game, e); else keep.push(e);
  }
  state.events = keep;
  const C = cfg(game);
  if (random(state) >= C.chancePerDay) return null;
  // Up to MAX_ACTIVE events at once, each of a different kind.
  const kinds = new Set(state.events.map((x) => x.type));
  if (kinds.size >= MAX_ACTIVE) return null;
  const entries = Object.entries(C.weights).filter(([t, w]) => w > 0 && EVENT_INFO[t] && !kinds.has(t));
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = random(state) * total;
  const type = (entries.find(([, w]) => (r -= w) < 0) || entries[entries.length - 1])[0];
  const e = create(game, type, day);
  if (!e) return null;
  e.id = `ev${state.nextEventId++}`;
  state.events.push(e);
  const info = EVENT_INFO[type];
  const extra = { eventId: e.id, eventType: type, regionId: e.regionId, fieldId: e.fieldId, productId: e.productId };
  game.emit(type === 'pest' ? 'pest' : 'event_start', `${info.emoji} ${info.name}: ${describe(game, e)}`, extra);
  return e;
}

/** Spray a field's pests: costs pestTreatPerHa × ha, instant. */
export function treatPest(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!f) return { ok: false, reason: 'Ladang belum dimiliki.' };
  if (!f.pest) return { ok: false, reason: 'Tidak ada hama di ladang ini.' };
  const cost = treatPestCost(game, fieldId);
  if (!game.spend(cost, 'semprot_hama')) return { ok: false, reason: `Uang tidak cukup (butuh ${fmtMoney(cost)}).` };
  f.pest = false;
  const ev = list(game).find((e) => e.type === 'pest' && e.fieldId === fieldId);
  game.state.events = list(game).filter((e) => e !== ev);
  game.emit('event_end', `🐛 Hama di ${game.idx.fields.get(fieldId)?.name} disemprot (${fmtMoney(cost)}).`,
    { eventId: ev?.id ?? null, eventType: 'pest', fieldId });
  return { ok: true, cost };
}

/** Public list of current events for the UI. */
export function activeEventsView(game) {
  return list(game).filter((e) => e.startDay <= game.day && (e.type === 'pest' ? !!game.state.fields[e.fieldId]?.pest
    : e.endsDay >= game.day)).map((e) => ({
    id: e.id, type: e.type, ...EVENT_INFO[e.type], desc: describe(game, e), regionId: e.regionId ?? null,
    fieldId: e.fieldId ?? null, productId: e.productId ?? null, endsDay: e.endsDay ?? null,
    ...(e.type === 'pest' ? { cost: treatPestCost(game, e.fieldId) } : {}),
    ...(e.mult ? { mult: e.mult } : {}), ...(e.amount ? { amount: e.amount } : {}),
  }));
}
