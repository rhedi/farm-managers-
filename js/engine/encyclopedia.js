// v18 📖 Ensiklopedia Tani: a collection book with one stamp per crop, tree, animal, pond species, factory product,
// region and city, each with 3 tiers (goals in BALANCE.encyclopedia.tiers). Counters live in
// `state.encyclopedia.counts` (crop/tree tons, herd peak + best genetics, pond harvests, factory batches, city
// deliveries) and are fed by game events (Game.emit → trackEvent) plus coarse offline hooks; regions are derived from
// fields and 🏛️ projects. Stamps never go down. A complete category row (every stamp ≥ tier) unlocks cosmetics:
// tractor paints, a farm banner on the map and a barn style; tenders unlock more by count (tenders.js).

const DEFAULT_TIERS = { crop: [0.01, 100, 'S'], tree: [0.01, 100, 'S'], animal: [1, 100, 1.25], fish: [1, 10, 25],
  product: [1, 10, 100], region: [1, 1, 3], city: [1, 10, 50] };
const n0 = (v) => new Intl.NumberFormat('id-ID').format(v);

export const CATS = [
  { id: 'crop', name: 'Tanaman', emoji: '🌾', text: (t) => ['Panen pertama', `Panen ${n0(t[1])} t`, 'Kualitas A★'] },
  { id: 'tree', name: 'Pohon buah', emoji: '🌳', text: (t) => ['Panen pertama', `Panen ${n0(t[1])} t`, 'Kualitas A★'] },
  { id: 'animal', name: 'Ternak', emoji: '🐄', text: (t) => ['Ternak pertama', `${n0(t[1])} ekor sekaligus`, `Genetika ★${Math.round((1 + (t[2] - 0.5) * 4) * 10) / 10}`] },
  { id: 'fish', name: 'Ikan', emoji: '🐟', text: (t) => ['Panen pertama', `${n0(t[1])}× panen`, `${n0(t[2])}× panen`] },
  { id: 'product', name: 'Produk olahan', emoji: '🏭', text: (t) => ['Produksi pertama', `${n0(t[1])} batch`, `${n0(t[2])} batch`] },
  { id: 'region', name: 'Wilayah', emoji: '🗺️', text: () => ['Ladang pertama', 'Proyek Warisan', 'Proyek tahap 3'] },
  { id: 'city', name: 'Kota', emoji: '🏙️', text: (t) => ['Kiriman pertama', `${n0(t[1])} kiriman`, `${n0(t[2])} kiriman`] },
];

export const ecfg = (game) => {
  const e = game.data.BALANCE.encyclopedia || {};
  return { tiers: { ...DEFAULT_TIERS, ...(e.tiers || {}) }, cosmetics: e.cosmetics || [] };
};

/** Stamp entries per category: [{key, cat, id, name, emoji, unlockLevel}]. */
export function entries(data, idx) {
  const out = { crop: [], tree: [], animal: [], fish: [], product: [], region: [], city: [] };
  const add = (cat, id, name, emoji, unlockLevel = 1) => out[cat].push({ key: `${cat}:${id}`, cat, id, name, emoji, unlockLevel });
  for (const c of data.CROPS) add('crop', c.id, c.name, c.emoji, c.unlockLevel);
  for (const t of data.TREES || []) add('tree', t.id, t.name, t.emoji, t.unlockLevel);
  for (const a of data.ANIMALS) add('animal', a.id, a.name, a.emoji, a.unlockLevel);
  for (const p of data.PONDS || []) {
    const prod = idx?.products.get(p.product);
    add('fish', p.id, prod?.name ?? p.name, prod?.emoji ?? p.emoji, p.unlockLevel);
  }
  const seen = new Set();
  for (const f of data.FACTORIES || []) for (const r of f.recipes) for (const pid of Object.keys(r.outputs)) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    const prod = idx?.products.get(pid);
    add('product', pid, prod?.name ?? pid, prod?.emoji ?? f.emoji, f.unlockLevel);
  }
  for (const r of data.REGIONS) add('region', r.id, r.name, r.emoji ?? '📍', r.unlockLevel ?? 1);
  for (const c of data.CITIES || []) add('city', c.id, c.name, c.emoji, c.unlockLevel);
  return out;
}

const enc = (game) => (game.state.encyclopedia?.stamps ? game.state.encyclopedia : ensureEncyclopedia(game.state, game.data, game.idx));
const ENTRY_CACHE = new WeakMap(); // idx → entries (data never changes for a Game)
const entriesOf = (game) => {
  let e = ENTRY_CACHE.get(game.idx);
  if (!e) ENTRY_CACHE.set(game.idx, (e = entries(game.data, game.idx)));
  return e;
};

/** Highest project stage in a region (🏛️ Proyek Warisan). */
function regionStage(s, regionId) {
  const reg = s.projects?.regions?.[regionId];
  return reg ? Math.max(0, ...Object.values(reg).map((p) => p?.stage || 0)) : 0;
}
const ownsRegion = (s, idx, regionId) => Object.keys(s.fields || {}).some((id) => idx.fields.get(id)?.regionId === regionId);

/** Tier reached now (0–3) from counters and live state: consecutive goals met. */
export function tierNow(game, cat, id, s = game.state, idx = game.idx, data = game.data) {
  const T = (data.BALANCE.encyclopedia?.tiers || {})[cat] ?? DEFAULT_TIERS[cat];
  const c = s.encyclopedia?.counts || {}, key = `${cat}:${id}`;
  let met;
  switch (cat) {
    case 'crop': case 'tree': {
      const tons = c[key] || 0, rec = s.quality?.records?.[id];
      const g = (data.BALANCE.quality?.grades || []).map((x) => x.id);
      const rank = (gid) => { const i = g.indexOf(gid); return i < 0 ? ['S', 'A', 'B', 'C'].indexOf(gid) : i; };
      met = [tons >= T[0] || !!rec, tons >= T[1], !!rec && rank(rec.grade) <= rank(T[2])];
      break;
    }
    case 'animal': {
      const herd = s.animals?.[id];
      const peak = Math.max(c[key] || 0, herd?.count || 0), bq = Math.max(c[`${key}#q`] || 0, herd?.count > 0 ? herd.breedQuality ?? 1 : 0);
      met = [peak >= T[0], peak >= T[1], bq >= T[2] - 1e-9];
      break;
    }
    case 'region': {
      const st = regionStage(s, id);
      met = [ownsRegion(s, idx, id) || st > 0, st >= T[1], st >= T[2]];
      break;
    }
    default: { const v = c[key] || 0; met = [v >= T[0], v >= T[1], v >= T[2]]; }
  }
  let t = 0;
  while (t < 3 && met[t]) t++;
  return t;
}

/**
 * Load migration / new game. A save without `encyclopedia` is back-filled (silently) with the tiers its state proves:
 * crops/trees ever harvested on owned fields (lastCropId, fruiting orchards), herds, ponds, outputs of owned
 * factories' recipes and processed stock, regions with fields/projects, cities of trips on the road.
 */
export function ensureEncyclopedia(s, data, idx) {
  const fresh = !s.encyclopedia || typeof s.encyclopedia !== 'object';
  const e = fresh ? {} : s.encyclopedia;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  e.stamps = obj(e.stamps); e.counts = obj(e.counts);
  e.cosmetics = Array.isArray(e.cosmetics) ? e.cosmetics.filter((x) => typeof x === 'string') : [];
  e.recent = Array.isArray(e.recent) ? e.recent.slice(-12) : [];
  e.banner ??= null; e.barn ??= null;
  s.encyclopedia = e;
  if (!idx) return e;
  const all = entries(data, idx), keys = new Set(Object.values(all).flat().map((x) => x.key));
  for (const k of Object.keys(e.stamps)) if (!keys.has(k) || !(e.stamps[k] >= 1 && e.stamps[k] <= 3)) delete e.stamps[k];
  const cos = new Set((data.BALANCE.encyclopedia?.cosmetics || []).map((c) => c.id));
  e.cosmetics = e.cosmetics.filter((id) => cos.has(id));
  if (e.banner && !e.cosmetics.includes(e.banner)) e.banner = null;
  if (e.barn && !e.cosmetics.includes(e.barn)) e.barn = null;
  if (fresh) backfill(s, data, idx, e, all);
  return e;
}

function backfill(s, data, idx, e, all) {
  const bump = (key, v) => { e.counts[key] = Math.max(e.counts[key] || 0, v); };
  for (const f of Object.values(s.fields || {})) {
    for (const id of [f.lastCropId, f.orchard?.harvests > 0 ? f.cropId : null]) {
      if (id && idx.crops.has(id)) bump(`${idx.crops.get(id).perennial ? 'tree' : 'crop'}:${id}`, 0.01);
    }
  }
  for (const [id, h] of Object.entries(s.animals || {})) if (h?.count > 0) { bump(`animal:${id}`, h.count); bump(`animal:${id}#q`, h.breedQuality ?? 1); }
  for (const p of s.ponds || []) bump(`fish:${p.pondId}`, 1);
  for (const def of data.FACTORIES || []) {
    const f = s.factories?.[def.id];
    if (!f) continue;
    const r = def.recipes.find((x) => x.id === f.recipeId) ?? def.recipes[0];
    for (const pid of Object.keys(r?.outputs || {})) bump(`product:${pid}`, 1);
  }
  for (const it of all.product) if ((s.silo?.[it.id] || 0) > 0) bump(it.key, 1);
  for (const t of s.shipments || []) if (t.sold && !t.tender) bump(`city:${t.cityId}`, 1);
  for (const r of s.dispatcher?.recent || []) if (r?.cityId) bump(`city:${r.cityId}`, 1);
  for (const list of Object.values(all)) for (const it of list) {
    const t = tierNow({ state: s, idx, data }, it.cat, it.id, s, idx, data);
    if (t > 0) e.stamps[it.key] = t;
  }
  syncCosmeticsRaw(s, data, idx, e, all, null);
}

/** Add to a counter (`max` keeps the peak instead of summing). */
export function bump(game, key, v, { max = false } = {}) {
  const c = enc(game).counts;
  c[key] = max ? Math.max(c[key] || 0, v) : Math.round(((c[key] || 0) + v) * 100) / 100;
}

/** Raise stored stamps to the live tier; emits `stamp_new` per raise and unlocks finished rows' cosmetics. */
export function syncStamps(game, only = null) {
  const e = enc(game), all = entriesOf(game), raised = [];
  for (const list of Object.values(all)) for (const it of list) {
    if (only && !only.includes(it.key)) continue;
    const t = tierNow(game, it.cat, it.id);
    if (t > (e.stamps[it.key] || 0)) {
      e.stamps[it.key] = t;
      raised.push({ ...it, tier: t });
    }
  }
  for (const r of raised) {
    e.recent.push({ key: r.key, tier: r.tier, day: game.day });
    const goal = CATS.find((c) => c.id === r.cat).text(ecfg(game).tiers[r.cat])[r.tier - 1];
    game.emit('stamp_new', `📖 Prangko baru: ${r.emoji} ${r.name} ${'★'.repeat(r.tier)} (${goal}).`, { key: r.key, cat: r.cat, id: r.id, tier: r.tier });
  }
  if (e.recent.length > 12) e.recent.splice(0, e.recent.length - 12);
  if (raised.length) syncCosmetics(game);
  return raised.length;
}

function syncCosmeticsRaw(s, data, idx, e, all, game) {
  const done = s.tenders?.done || 0, out = [];
  for (const c of data.BALANCE.encyclopedia?.cosmetics || []) {
    if (e.cosmetics.includes(c.id)) continue;
    const ok = c.from?.cat ? all[c.from.cat]?.length && all[c.from.cat].every((it) => (e.stamps[it.key] || 0) >= c.from.tier)
      : c.from?.tenders ? done >= c.from.tenders : false;
    if (!ok) continue;
    e.cosmetics.push(c.id);
    if (c.kind === 'banner' && !e.banner) e.banner = c.id;
    if (c.kind === 'barn' && !e.barn) e.barn = c.id;
    out.push(c);
  }
  if (game) for (const c of out) game.emit('cosmetic_unlocked', `🎁 Kosmetik baru: ${c.emoji} ${c.name}! Atur di Prestasi › 📖 Ensiklopedia.`, { cosmeticId: c.id, kind: c.kind });
  return out;
}
/** Unlock cosmetics whose row / tender count is complete (emits `cosmetic_unlocked`). */
export const syncCosmetics = (game) => syncCosmeticsRaw(game.state, game.data, game.idx, enc(game), entriesOf(game), game);

/** Game.emit hook (also while muted): feed the counters from events. */
export function trackEvent(game, ev) {
  switch (ev.type) {
    case 'task_done': {
      if (ev.task !== 'harvest' || !(ev.tons > 0) || !ev.cropId) return;
      const key = `${game.idx.crops.get(ev.cropId)?.perennial ? 'tree' : 'crop'}:${ev.cropId}`;
      bump(game, key, ev.tons);
      syncStamps(game, [key]);
      return;
    }
    case 'factory_done': bump(game, `product:${ev.productId}`, 1); syncStamps(game, [`product:${ev.productId}`]); return;
    case 'fish_harvest': bump(game, `fish:${ev.pondId}`, 1); syncStamps(game, [`fish:${ev.pondId}`]); return;
    case 'delivery_done': bump(game, `city:${ev.cityId}`, 1); syncStamps(game, [`city:${ev.cityId}`]); return;
    case 'field_bought': case 'project_done': syncStamps(game, entriesOf(game).region.map((x) => x.key)); return;
    default:
  }
}

/** Daily rollover: herd peaks + best genetics, then every stamp. */
export function stepEncyclopediaDay(game) {
  for (const [id, h] of Object.entries(game.state.animals || {})) {
    if (!(h?.count > 0)) continue;
    bump(game, `animal:${id}`, h.count, { max: true });
    bump(game, `animal:${id}#q`, h.breedQuality ?? 1, { max: true });
  }
  syncStamps(game);
}

/** Paint colours unlocked as cosmetics (machine paint palette, upgrades.js). */
export function cosmeticPaints(game) {
  const have = new Set(game.state.encyclopedia?.cosmetics || []);
  return ecfg(game).cosmetics.filter((c) => c.kind === 'paint' && have.has(c.id)).map((c) => c.color);
}

/** Choose the banner / barn style (`id` null = none). */
export function setCosmetic(game, kind, id) {
  if (kind !== 'banner' && kind !== 'barn') return { ok: false, reason: 'Jenis kosmetik tidak dikenal.' };
  const e = enc(game);
  if (id != null) {
    const c = ecfg(game).cosmetics.find((x) => x.id === id);
    if (!c || c.kind !== kind) return { ok: false, reason: 'Kosmetik tidak ditemukan.' };
    if (!e.cosmetics.includes(id)) return { ok: false, reason: 'Kosmetik ini belum terbuka.' };
  }
  e[kind] = id ?? null;
  return { ok: true, [kind]: e[kind] };
}

/** Active banner / barn cosmetic entries (map, Ternak), or null. */
export function activeCosmetic(game, kind) {
  const id = game.state.encyclopedia?.[kind];
  return id ? ecfg(game).cosmetics.find((c) => c.id === id) ?? null : null;
}

/**
 * Book view: {total, stamped, stars, maxStars, cats:[{id, name, emoji, tiers:[text×3], done, total, stars, rowTier,
 * items:[{key, id, name, emoji, tier, locked, unlockLevel, fresh, next}]}], cosmetics:[{…def, unlocked, active, how}],
 * banner, barn}. Tiers shown are max(stored, live), so a stamp appears before the next rollover stores it.
 */
export function encyclopediaView(game) {
  const e = enc(game), cfg = ecfg(game), all = entriesOf(game), level = game.state.level;
  const freshKeys = new Set(e.recent.filter((r) => game.day - r.day <= 1).map((r) => r.key));
  let total = 0, stamped = 0, stars = 0;
  const cats = CATS.map((c) => {
    const tiers = c.text(cfg.tiers[c.id]);
    const items = all[c.id].map((it) => {
      const tier = Math.max(e.stamps[it.key] || 0, tierNow(game, it.cat, it.id));
      return { key: it.key, id: it.id, name: it.name, emoji: it.emoji, tier, unlockLevel: it.unlockLevel,
        locked: it.unlockLevel > level && tier === 0, fresh: freshKeys.has(it.key), next: tier < 3 ? tiers[tier] : null };
    });
    const done = items.filter((x) => x.tier > 0).length, st = items.reduce((a, x) => a + x.tier, 0);
    total += items.length; stamped += done; stars += st;
    return { id: c.id, name: c.name, emoji: c.emoji, tiers, items, done, total: items.length, stars: st,
      rowTier: items.length ? Math.min(...items.map((x) => x.tier)) : 0 };
  });
  const catName = new Map(CATS.map((c) => [c.id, c]));
  const cosmetics = cfg.cosmetics.map((c) => ({ ...c, unlocked: e.cosmetics.includes(c.id), active: e.banner === c.id || e.barn === c.id,
    how: c.from?.cat ? `Lengkapi baris ${catName.get(c.from.cat)?.emoji ?? ''} ${catName.get(c.from.cat)?.name ?? c.from.cat} ${'★'.repeat(c.from.tier)}`
      : c.from?.tenders ? `Selesaikan ${c.from.tenders} Tender Ekspor` : '' }));
  return { total, stamped, stars, maxStars: total * 3, cats, cosmetics, banner: e.banner, barn: e.barn };
}
