// v18 ⭐ Kualitas & Rekor. Every crop/fruit harvest gets a grade (A★/A/B/C) from the yield factors at harvest time
// (fields.yieldFactorsOf: pH, nutrients, rotation, pests, dry days), fertilizer/lime and how soon after "ready" it was
// harvested. The silo keeps one tons-weighted price multiplier per crop (`state.quality.stock`, missing = B ×1), used
// by every market sale (sellProduct, truck city sales, overflow). Records: best t/ha and best grade per crop, plus the
// last harvest per field (field card). ⭐ Kontrak kualitas: extra offers that only accept stock averaging ≥ A.
// Hash-seeded draws only (never state.rng), so weather/market streams are unchanged.
import { hashSeed, random, randRange, round2 } from './rng.js';
import { yieldFactorsOf, witherFactor } from './fields.js';
import { fmtNum } from './defs.js';

const r4 = (v) => Math.round(v * 10000) / 10000;
const DEFAULT_GRADES = [
  { id: 'S', label: 'A★', min: 92, mult: 1.15 }, { id: 'A', label: 'A', min: 78, mult: 1.08 },
  { id: 'B', label: 'B', min: 55, mult: 1 }, { id: 'C', label: 'C', min: 0, mult: 0.9 },
];
const DEFAULT_PENALTY = { ph: 150, phMax: 30, nutrients: 25, rotation: 15, fertilizer: 12, pest: 8, weather: 30, weatherMax: 15,
  readyGraceHours: 12, readyLateHours: 72, late: 12, wither: 60, witherMax: 40 };

export const qcfg = (game) => {
  const q = game.data.BALANCE.quality || {};
  return { limeBonus: 4, recordFreshHours: 48, ...q, grades: q.grades || DEFAULT_GRADES, penalty: { ...DEFAULT_PENALTY, ...(q.penalty || {}) } };
};

/** Load migration / new game: `{stock, records, fields, seq}`; unknown crops and fields dropped, numbers sanitised. */
export function ensureQuality(s, idx) {
  const q = (s.quality && typeof s.quality === 'object') ? s.quality : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  q.stock = obj(q.stock); q.records = obj(q.records); q.fields = obj(q.fields);
  q.seq = Number.isFinite(q.seq) ? q.seq : 0;
  if (idx) {
    for (const id of Object.keys(q.stock)) if (!idx.crops.has(id) || !(q.stock[id] > 0)) delete q.stock[id];
    for (const id of Object.keys(q.records)) if (!idx.crops.has(id) || !(q.records[id]?.tph >= 0)) delete q.records[id];
    for (const id of Object.keys(q.fields)) if (!idx.fields.has(id) || !idx.crops.has(q.fields[id]?.cropId)) delete q.fields[id];
  }
  s.quality = q;
  return q;
}
const qstate = (game) => (game.state.quality?.stock ? game.state.quality : ensureQuality(game.state, game.idx));

/** Grade entry for a score (0–100). */
export function gradeForScore(game, score) {
  const g = qcfg(game).grades;
  return g.find((x) => score >= x.min) ?? g[g.length - 1];
}
export const gradeById = (game, id) => qcfg(game).grades.find((g) => g.id === id) ?? null;
/** Grade an average stock multiplier falls in (the best grade whose mult it reaches). */
export function gradeForMult(game, mult) {
  const g = qcfg(game).grades;
  return g.find((x) => mult >= x.mult - 1e-4) ?? g[g.length - 1];
}
/** Rank for comparisons: 0 = best. */
export const gradeRank = (game, id) => { const i = qcfg(game).grades.findIndex((g) => g.id === id); return i < 0 ? 99 : i; };

/**
 * Score a harvest of `cropId` on a field from its yield factors + timing. `opts`: readyHours (default the field's),
 * fertilized/limed overrides (coarse offline / previews). Returns {score, grade, label, mult, parts:[{id, label, pts}]}.
 */
export function scoreHarvest(game, fieldId, cropId, opts = {}) {
  const f = game.state.fields[fieldId];
  const fertilized = opts.fertilized ?? !!f?.fertilized;
  const fac = (opts.fac && opts.fertilized == null ? opts.fac : null) ?? yieldFactorsOf(game, fieldId, cropId, { fertilized });
  if (!fac) return null;
  const P = qcfg(game).penalty, parts = [];
  const add = (id, label, pts) => { if (Math.abs(pts) >= 0.5) parts.push({ id, label, pts: -Math.round(pts) }); };
  add('ph', 'pH tanah', Math.min(P.phMax, (1 - fac.ph) * P.ph));
  add('nutrients', 'Nutrisi tanah', Math.max(0, (1 - fac.nutrients) / 0.4) * P.nutrients);
  if (fac.rotation < 1) add('rotation', 'Tanaman sama 2× (rotasi)', P.rotation);
  if (!fertilized) add('fert', 'Tanpa pupuk', P.fertilizer);
  if (fac.pest < 1) add('pest', 'Hama', P.pest);
  add('weather', 'Hari kering', Math.min(P.weatherMax, Math.max(0, 1 - fac.weather) * P.weather));
  const h = opts.readyHours ?? (f?.state === 'ready' ? f.readyHours || 0 : 0);
  let late = 0;
  if (h > P.readyGraceHours) late = P.late * Math.min(1, (h - P.readyGraceHours) / Math.max(1, P.readyLateHours - P.readyGraceHours));
  const wither = opts.readyHours != null ? 1 : (f ? witherFactor(f) : 1);
  late += Math.min(P.witherMax, (1 - wither) * P.wither);
  add('timing', 'Panen terlambat', late);
  if (opts.limed ?? f?.limed) parts.push({ id: 'lime', label: 'Dikapur siklus ini', pts: qcfg(game).limeBonus });
  const score = Math.max(0, Math.min(100, Math.round(100 + parts.reduce((a, p) => a + p.pts, 0))));
  const g = gradeForScore(game, score);
  return { score, grade: g.id, label: g.label, mult: g.mult, parts };
}

/** Price multiplier of a product's stock (crops only; everything else ×1). */
export function stockMult(game, productId) {
  if (!game.idx.crops.has(productId)) return 1;
  return game.state.quality?.stock?.[productId] ?? 1;
}
export const stockGrade = (game, productId) => (game.idx.crops.has(productId) ? gradeForMult(game, stockMult(game, productId)) : null);
/** Stock average reaches grade `gradeId` (⭐ Kontrak kualitas). */
export const meetsGrade = (game, productId, gradeId) => stockMult(game, productId) >= (gradeById(game, gradeId)?.mult ?? 1) - 1e-4;

/** Mix `qty` of grade multiplier `mult` into the stock average (before the qty is added to the silo). */
export function blendStock(game, productId, qty, mult) {
  if (!game.idx.crops.has(productId) || !(qty > 0)) return;
  const q = qstate(game), stock = Math.max(0, game.state.silo[productId] || 0);
  const cur = q.stock[productId] ?? 1;
  const v = r4((stock * cur + qty * mult) / (stock + qty));
  if (Math.abs(v - 1) < 1e-4) delete q.stock[productId];
  else q.stock[productId] = v;
}

/**
 * Harvest finished (taskrun, before the stock is stored and the soil updated): grade it, mix it into the stock
 * average, update the field's last harvest and the crop records. Emits `quality_record` when the best t/ha improves.
 * Returns {grade, label, score, tph, record}.
 */
export function noteHarvest(game, fieldId, cropId, tons) {
  const def = game.idx.fields.get(fieldId), crop = game.idx.crops.get(cropId);
  if (!def || !crop || !(tons > 0)) return null;
  const sc = scoreHarvest(game, fieldId, cropId);
  if (!sc) return null;
  const q = qstate(game), day = game.day;
  blendStock(game, cropId, tons, sc.mult);
  const tph = round2(tons / Math.max(0.01, def.sizeHa));
  const rec = q.records[cropId];
  const first = !rec;
  const better = !first && tph > rec.tph + 0.005;
  const r = q.records[cropId] = rec ?? { tph: 0, fieldId, day, grade: sc.grade, gradeFieldId: fieldId, gradeDay: day, harvests: 0, tons: 0 };
  r.harvests = (r.harvests || 0) + 1;
  r.tons = round2((r.tons || 0) + tons);
  if (first || better) Object.assign(r, { tph, fieldId, day });
  if (first || gradeRank(game, sc.grade) < gradeRank(game, r.grade)) Object.assign(r, { grade: sc.grade, gradeFieldId: fieldId, gradeDay: day });
  q.fields[fieldId] = { cropId, grade: sc.grade, score: sc.score, tph, tons: round2(tons), day, time: game.state.time, record: first || better };
  if (better) {
    game.emit('quality_record', `🏅 Rekor baru! ${crop.emoji} ${crop.name} ${fmtNum(tph, 1)} t/ha di ${def.name} (sebelumnya ${fmtNum(rec.tph, 1)} t/ha).`,
      { fieldId, cropId, tph, prev: rec.tph, grade: sc.grade });
  }
  return { grade: sc.grade, label: sc.label, score: sc.score, tph, record: first || better };
}

/** Coarse offline harvests: the plan's expected grade (harvested on time), no records. */
export function coarseMult(game, fieldId, cropId, fertilized) {
  return scoreHarvest(game, fieldId, cropId, { readyHours: 0, fertilized: !!fertilized })?.mult ?? 1;
}

/** Field view block: last harvest (+ fresh record flag) and the grade the crop on it would get now. */
export function fieldQuality(game, fieldId, fac = null) {
  const f = game.state.fields[fieldId];
  if (!f) return null;
  const q = game.state.quality, last = q?.fields?.[fieldId] ?? null, cfg = qcfg(game);
  const lastView = last ? {
    ...last, label: gradeById(game, last.grade)?.label ?? last.grade,
    fresh: !!last.record && (game.state.time - (last.time ?? 0)) <= cfg.recordFreshHours && (q.records[last.cropId]?.harvests ?? 0) > 1,
    best: q.records[last.cropId]?.tph ?? last.tph,
  } : null;
  const preview = f.cropId && (f.state === 'growing' || f.state === 'ready' || f.state === 'orchard') ? scoreHarvest(game, fieldId, f.cropId, { fac }) : null;
  return { last: lastView, preview };
}

/** 📒 Buku Rekor: every crop and tree, harvested ones first (best t/ha, best grade, field, day). */
export function recordsView(game) {
  const q = game.state.quality?.records || {};
  const all = [...game.data.CROPS, ...(game.data.TREES || [])];
  return all.map((c) => {
    const r = q[c.id];
    const fname = (id) => game.idx.fields.get(id)?.name ?? id;
    return {
      cropId: c.id, name: c.name, emoji: c.emoji, tree: !!c.perennial, unlockLevel: c.unlockLevel, locked: c.unlockLevel > game.state.level,
      harvested: !!r, tph: r?.tph ?? 0, fieldName: r ? fname(r.fieldId) : null, day: r?.day ?? null,
      grade: r?.grade ?? null, gradeLabel: r ? gradeById(game, r.grade)?.label ?? r.grade : null,
      gradeFieldName: r ? fname(r.gradeFieldId) : null, gradeDay: r?.gradeDay ?? null, harvests: r?.harvests ?? 0, tons: r?.tons ?? 0,
      stockGrade: (game.state.silo[c.id] || 0) > 0 ? gradeForMult(game, stockMult(game, c.id)).label : null,
    };
  }).sort((a, b) => (b.harvested - a.harvested) || (a.unlockLevel - b.unlockLevel));
}

// ---- ⭐ Kontrak kualitas (added to state.contracts by contracts.stepContractsDay) ----

function avgFieldHa(game) {
  const ids = Object.keys(game.state.fields);
  return ids.length ? ids.reduce((a, id) => a + (game.idx.fields.get(id)?.sizeHa || 0), 0) / ids.length : 4;
}

/** Top up the quality-contract offers (crops harvested before and unlocked). Returns the number added. */
export function stepGradeContracts(game, day) {
  const s = game.state, c = qcfg(game).contracts;
  if (!c || s.level < c.fromLevel) return 0;
  const q = qstate(game), list = (s.contracts ||= []);
  let added = 0;
  while (list.filter((k) => k.status === 'offer' && k.minGrade).length < c.offers) {
    const taken = new Set(list.filter((k) => (k.status === 'offer' || k.status === 'active') && k.minGrade).map((k) => k.productId));
    const pool = game.data.CROPS.concat(game.data.TREES || []).filter((cr) => q.records[cr.id] && cr.unlockLevel <= s.level
      && !taken.has(cr.id) && game.idx.products.has(cr.id));
    if (!pool.length) break;
    q.seq += 1;
    const r = { rng: hashSeed(`${s.seed}|quality|${day}|${q.seq}`) };
    const crop = pool[Math.floor(random(r) * pool.length)], p = game.idx.products.get(crop.id);
    const per = avgFieldHa(game) * crop.baseYield; // one harvest of the average field
    const qty = Math.max(0.5, Math.round(per * randRange(r, c.harvestsMin, c.harvestsMax) * 2) / 2);
    const market = Math.max(s.market[p.id] ?? p.basePrice, p.basePrice * 0.9);
    const price = r4(market * randRange(r, c.priceMin, c.priceMax));
    const days = c.dueMin + Math.floor(random(r) * (c.dueMax - c.dueMin + 1));
    const value = round2(qty * price);
    list.push({ id: `q${q.seq}`, productId: p.id, qty, delivered: 0, price, value, days, offeredDay: day,
      expiresDay: day + c.offerDays, dueDay: day + days, penalty: round2(value * c.penaltyRate),
      xp: Math.round(value * c.xpPerValue), status: 'offer', minGrade: c.minGrade });
    added++;
  }
  return added;
}
