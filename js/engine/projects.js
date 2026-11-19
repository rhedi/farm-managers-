// 🏛️ Proyek Warisan: regional megaprojects (money sink + long goals). Each region offers BALANCE.projects.types minus
// skip[region]; every project has BALANCE.projects.stages.length stages (5 since v20: stages 4–5 open at Lv 65/85; cost
// × regionScale, built over whole game days, finished at the daily rollover). A Monumen per continent opens once every
// region there has a project at stage MONUMENT_STAGE (3).
// state.projects = { regions: { [regionId]: { [typeId]: { stage 0–5, build: null | { stage, start, end, cost } } } },
//   monuments: { [continentId]: { done, build } }, spent, value /* finished stage spend */ }.
// Other systems read the effects through projectPerk(game, key, scope) (like research.perk).
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { grantResearchPoints } from './rewards.js';

/** Stage a region needs for its continent's Monumen (and the "Warisan Abadi" achievement): the v17 top stage. */
export const MONUMENT_STAGE = 3;
const cfg = (game) => game.data.BALANCE.projects || null;
/** Number of stages per project (data-driven; 3 before v20). */
export const maxStageOf = (data) => data?.BALANCE?.projects?.stages?.length || MONUMENT_STAGE;
export const maxStage = (game) => maxStageOf(game.data);
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/** 3 significant digits: 1234567 → 1230000. */
const sig3 = (v) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 2); return Math.round(v / p) * p; };

/** Load migration / createGame: fill the shape, drop unknown regions/types, clamp stages, drop broken builds. */
export function ensureProjects(s, data) {
  const p = obj(s.projects), C = data?.BALANCE?.projects, regions = {}, monuments = {};
  const types = new Set((C?.types || []).map((t) => t.id));
  const build = (b) => (b && Number.isFinite(b.end) && Number.isFinite(b.start) && b.stage >= 1 ? b : null);
  for (const [rid, rp] of Object.entries(obj(p.regions))) {
    if (!(data?.REGIONS || []).some((r) => r.id === rid)) continue;
    for (const [tid, x] of Object.entries(obj(rp))) {
      if (!types.has(tid) || !x || typeof x !== 'object') continue;
      const stage = Math.max(0, Math.min(maxStageOf(data), x.stage | 0));
      const b = build(x.build);
      (regions[rid] ||= {})[tid] = { stage, build: b && b.stage === stage + 1 ? b : null };
    }
  }
  for (const [cid, m] of Object.entries(obj(p.monuments))) {
    if (!(data?.CONTINENTS || []).some((c) => c.id === cid) || !m || typeof m !== 'object') continue;
    monuments[cid] = { done: !!m.done, build: m.done ? null : build(m.build) };
  }
  s.projects = { regions, monuments, spent: Math.max(0, Number(p.spent) || 0), value: Math.max(0, Number(p.value) || 0) };
  return s.projects;
}

const st = (game) => (game.state.projects?.regions ? game.state.projects : ensureProjects(game.state, game.data));
const regionOf = (game, id) => game.idx.regions.get(id) ?? null;
const typeOf = (game, id) => (cfg(game)?.types || []).find((t) => t.id === id) ?? null;
const slot = (game, regionId, typeId) => st(game).regions[regionId]?.[typeId] ?? { stage: 0, build: null };

/** Project types offered in a region (all types minus the region's skip). */
export function regionTypes(game, regionId) {
  const C = cfg(game);
  if (!C || !regionOf(game, regionId)) return [];
  return C.types.filter((t) => C.skip?.[regionId] !== t.id);
}

export const regionScale = (game, region) => {
  const s = cfg(game).regionScale || {};
  return (s.base ?? 1) + (s.perLevel ?? 0) * (region?.unlockLevel ?? 1);
};
/** Cost of stage `k` (1-based) in a region. */
export const stageCost = (game, regionId, k) => sig3(cfg(game).stages[k - 1].cost * regionScale(game, regionOf(game, regionId)));
export const stageLevel = (game, regionId, k) => Math.max(cfg(game).stages[k - 1].level, regionOf(game, regionId)?.unlockLevel ?? 1);

export function ownsRegion(game, regionId) {
  return Object.keys(game.state.fields).some((id) => game.idx.fields.get(id)?.regionId === regionId);
}

/** Every running build: [{kind:'region'|'monument', regionId?, typeId?, continentId?, build}]. */
function builds(game) {
  const p = st(game), out = [];
  for (const [regionId, rp] of Object.entries(p.regions)) for (const [typeId, x] of Object.entries(rp)) {
    if (x.build) out.push({ kind: 'region', regionId, typeId, x, build: x.build });
  }
  for (const [continentId, m] of Object.entries(p.monuments)) if (m.build) out.push({ kind: 'monument', continentId, x: m, build: m.build });
  return out;
}
export const buildingCount = (game) => builds(game).length;

/** Game time the build ends: the midnight `days` days after the start day (finished by that day's rollover). */
const endTime = (game, days) => (game.day - 1 + days) * 24;

/** Why the next stage can't start now ('' = it can, money aside → `money` reason only when short). */
export function blockReason(game, regionId, typeId) {
  const C = cfg(game), x = slot(game, regionId, typeId);
  if (!C) return 'Proyek tidak tersedia.';
  if (!regionTypes(game, regionId).some((t) => t.id === typeId)) return 'Proyek ini tidak ada di wilayah ini.';
  if (game.state.level < C.unlockLevel) return `Proyek Warisan terbuka di level ${C.unlockLevel}.`;
  if (x.build) return 'Sedang dibangun.';
  if (x.stage >= maxStage(game)) return 'Sudah selesai.';
  if (!ownsRegion(game, regionId)) return 'Butuh minimal 1 ladang di wilayah ini.';
  const lvl = stageLevel(game, regionId, x.stage + 1);
  if (game.state.level < lvl) return `Tahap ${x.stage + 1} butuh level ${lvl}.`;
  if (buildingCount(game) >= C.maxBuilding) return `Maksimal ${C.maxBuilding} proyek dibangun bersamaan.`;
  const cost = stageCost(game, regionId, x.stage + 1);
  if (game.state.money < cost) return `Uang tidak cukup (butuh ${fmtMoney(cost)}).`;
  return '';
}

export function startProject(game, regionId, typeId) {
  const why = blockReason(game, regionId, typeId);
  if (why) return fail(why);
  const C = cfg(game), p = st(game), x = ((p.regions[regionId] ||= {})[typeId] ||= { stage: 0, build: null });
  const k = x.stage + 1, cost = stageCost(game, regionId, k), days = C.stages[k - 1].days;
  if (!game.spend(cost, 'proyek_warisan')) return fail(`Uang tidak cukup (butuh ${fmtMoney(cost)}).`);
  x.build = { stage: k, start: game.state.time, end: endTime(game, days), cost };
  p.spent = round2(p.spent + cost);
  const t = typeOf(game, typeId), r = regionOf(game, regionId);
  game.emit('project_started', `🏗️ ${t.emoji} ${t.name} ${r.name} tahap ${k} mulai dibangun (${fmtMoney(cost)}, ${days} hari).`,
    { regionId, typeId, stage: k, cost, days });
  return ok({ stage: k, cost, days });
}

// ---- Monumen (one per continent) ----
const continentRegions = (game, cid) => game.data.REGIONS.filter((r) => r.continent === cid);
const regionDone = (game, regionId) => Object.values(st(game).regions[regionId] || {}).some((x) => x.stage >= MONUMENT_STAGE);
export const monumentInfo = (game, cid) => {
  const M = cfg(game).monument, [name, emoji] = M.names?.[cid] ?? ['Monumen', '🗿'];
  return { name: `Monumen ${name}`, emoji, cost: M.cost, days: M.days, level: M.level, rp: M.rp };
};

export function monumentReason(game, cid) {
  const C = cfg(game), m = st(game).monuments[cid], info = monumentInfo(game, cid);
  if (!C) return 'Proyek tidak tersedia.';
  if (!(game.data.CONTINENTS || []).some((c) => c.id === cid)) return 'Benua tidak dikenal.';
  if (m?.done) return 'Sudah berdiri.';
  if (m?.build) return 'Sedang dibangun.';
  const regs = continentRegions(game, cid), left = regs.filter((r) => !regionDone(game, r.id)).length;
  if (left) return `Selesaikan 1 proyek sampai tahap 3 di setiap wilayah benua ini (kurang ${left}).`;
  if (game.state.level < info.level) return `Butuh level ${info.level}.`;
  if (buildingCount(game) >= C.maxBuilding) return `Maksimal ${C.maxBuilding} proyek dibangun bersamaan.`;
  if (game.state.money < info.cost) return `Uang tidak cukup (butuh ${fmtMoney(info.cost)}).`;
  return '';
}

export function startMonument(game, cid) {
  const why = monumentReason(game, cid);
  if (why) return fail(why);
  const info = monumentInfo(game, cid), p = st(game);
  if (!game.spend(info.cost, 'proyek_warisan')) return fail(`Uang tidak cukup (butuh ${fmtMoney(info.cost)}).`);
  p.monuments[cid] = { done: false, build: { stage: 1, start: game.state.time, end: endTime(game, info.days), cost: info.cost } };
  p.spent = round2(p.spent + info.cost);
  game.emit('project_started', `🏗️ ${info.emoji} ${info.name} mulai dibangun (${fmtMoney(info.cost)}, ${info.days} hari).`,
    { continentId: cid, typeId: 'monumen', stage: 1, cost: info.cost, days: info.days });
  return ok({ cost: info.cost, days: info.days });
}

/** Daily rollover: finish builds whose end time has come (+1 RP per Pusat Riset stage, Monumen RP). */
export function stepProjectsDay(game) {
  const p = st(game);
  let finished = 0;
  for (const b of builds(game)) {
    if (game.state.time < b.build.end - 1e-6) continue;
    finished++;
    p.value = round2(p.value + b.build.cost);
    if (b.kind === 'monument') {
      const info = monumentInfo(game, b.continentId);
      b.x.done = true; b.x.build = null;
      grantResearchPoints(game, info.rp);
      game.emit('project_done', `🎉 ${info.emoji} ${info.name} berdiri! +${info.rp} poin riset.`,
        { continentId: b.continentId, typeId: 'monumen', stage: 1, done: true });
      continue;
    }
    const t = typeOf(game, b.typeId), r = regionOf(game, b.regionId);
    b.x.stage = b.build.stage; b.x.build = null;
    if (t.effect === 'rp') grantResearchPoints(game, t.values[b.x.stage - 1] ?? 1);
    game.emit('project_done', `🎉 ${t.emoji} ${t.name} ${r.name} tahap ${b.x.stage} selesai! ${effectText(game, t, b.regionId, b.x.stage)}.`,
      { regionId: b.regionId, typeId: b.typeId, stage: b.x.stage, done: b.x.stage >= maxStage(game) });
  }
  if (finished) game.checkAchievements();
}

// ---- effects ----
const stageOf = (game, regionId, typeId) => st(game).regions[regionId]?.[typeId]?.stage ?? 0;
const valueAt = (game, typeId, stage) => (stage > 0 ? typeOf(game, typeId)?.values?.[stage - 1] ?? 0 : 0);

/**
 * Effect of finished stages. Keys: 'rainFloor' (regionId → min rain chance), 'damStage' (regionId → 0–3),
 * 'cityPrice' (continentId → best Pelabuhan bonus), 'portStage' (continentId → best Pelabuhan stage),
 * 'koperasi' (regionId → seed/fertilizer discount), 'wages' (global: koperasi weighted by owned fields per region),
 * 'contractBonus' (global: Σ Pasar Induk, ≤ contractBonusMax). 0 when nothing is built.
 */
export function projectPerk(game, key, scope) {
  if (!cfg(game) || !game.state.projects) return 0;
  const regs = st(game).regions;
  switch (key) {
    case 'rainFloor': return valueAt(game, 'bendungan', stageOf(game, scope, 'bendungan'));
    case 'damStage': return stageOf(game, scope, 'bendungan');
    case 'koperasi': return valueAt(game, 'koperasi', stageOf(game, scope, 'koperasi'));
    case 'cityPrice': case 'portStage': {
      const best = Math.max(0, ...continentRegions(game, scope).map((r) => stageOf(game, r.id, 'pelabuhan')));
      return key === 'portStage' ? best : valueAt(game, 'pelabuhan', best);
    }
    case 'wages': {
      const ids = Object.keys(game.state.fields);
      if (!ids.length) return 0;
      let sum = 0;
      for (const id of ids) sum += valueAt(game, 'koperasi', stageOf(game, game.idx.fields.get(id)?.regionId, 'koperasi'));
      return sum / ids.length;
    }
    case 'contractBonus': {
      let sum = 0;
      for (const rid of Object.keys(regs)) sum += valueAt(game, 'pasar', stageOf(game, rid, 'pasar'));
      return Math.min(cfg(game).contractBonusMax ?? 0.12, sum);
    }
    default: return 0;
  }
}

export function effectText(game, t, regionId, stage) {
  const v = t.values[Math.max(0, stage - 1)] ?? 0, r = regionOf(game, regionId);
  const cont = (game.data.CONTINENTS || []).find((c) => c.id === r?.continent);
  switch (t.effect) {
    case 'rainFloor': return `Peluang hujan min. ${pct(v)} di ${r?.name}; kekeringan & El Niño lebih ringan`;
    case 'cityPrice': return `Harga jual kota di ${cont?.short ?? cont?.name ?? 'benua ini'} +${pct(v)} (tanaman tetap maks. 115%)`;
    case 'rp': return `+${v} poin riset`;
    case 'koperasi': return `Benih & pupuk −${pct(v)} di ${r?.name}, gaji ikut lebih hemat`;
    case 'contractBonus': return `Bonus kontrak selesai +${pct(v)} (semua Pasar Induk, maks. ${pct(cfg(game).contractBonusMax ?? 0.12)})`;
    default: return '';
  }
}

/** Net worth share of the finished spend ("nilai warisan"). */
export const projectsValue = (game) => (game.state.projects ? round2((cfg(game)?.legacyValue ?? 0) * (game.state.projects.value || 0)) : 0);

/** Achievement stats: projectStages, projectsDone (stage 3), monuments. */
export function projectStat(game, key) {
  const p = game.state.projects;
  if (!p?.regions) return 0;
  const slots = Object.values(p.regions).flatMap((rp) => Object.values(rp));
  if (key === 'projectStages') return slots.reduce((a, x) => a + (x.stage || 0), 0);
  if (key === 'projectsDone') return slots.filter((x) => x.stage >= MONUMENT_STAGE).length;
  if (key === 'monuments') return Object.values(p.monuments || {}).filter((m) => m.done).length;
  return 0;
}
