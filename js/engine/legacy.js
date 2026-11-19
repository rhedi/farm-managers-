// 🌳 Generasi Baru (prestige). From BALANCE.legacy.unlockLevel (30) the player may "Wariskan pertanian": the run
// restarts at Lv 1 with a fresh state and earns ⭐ Bintang Warisan (starFormula: level + √net worth + √achievements +
// √project stages, × the run's challenge multiplier when it was completed). Stars buy permanent perks
// (BALANCE.legacy.perks): `start*` effects are given at the start of every generation (and once at once when bought
// mid-run), the others (XP, mission slot, Mandor discount, cosmetics) apply live. A generation may run one challenge
// (BALANCE.legacy.challenges; enforced through legacyPerks.challengeBlock) for ×stars once Lv 30 is reached under it.
//
// The legacy block lives OUTSIDE the run state: `game.legacy`, saved as the top-level `legacy` key of the save JSON
// and mirrored to localStorage LEGACY_KEY (persist.js), so ⚙️ Reset game keeps it. Shape (normalizeLegacy):
//   { v, generation, stars, earned, perks: [id], emblem: {icon, color}, region: null | regionId,
//     museum: [{gen, name, days, level, netWorth, emblem, frame, stars, challenge, challengeName, achievements, stages, cups}],
//     shelf: [{gen, season, cup: 'emas'|'perak'|'perunggu', division, metric}] /* 🏆 Liga Musiman cups (league.js) */ }
// The run part is `state.generation = {n, challenge, challengeDone, forfeited, mandorHired, startDay}` (ensureGeneration).
import { round2 } from './rng.js';
import { fmtMoney, fieldUnlockLevel } from './defs.js';
import { netWorth, addMachine, syncCounts } from './economy.js';
import { projectStat } from './projects.js';
import { grantResearchPoints } from './rewards.js';
import { newFieldState } from './fields.js';
import { legacyCfg, perkSum, activeChallenge } from './legacyPerks.js';

export const LEGACY_VERSION = 1;
const DEFAULT_STARS = { levelFrom: 27, perLevel: 1, softFrom: 50, perLevelAfter: 0.5, nwUnit: 25000000, monumentStages: 3 };
const DEFAULT_EMBLEM = { icon: '🌱', color: 'hijau' };
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

export const newLegacy = () => ({ v: LEGACY_VERSION, generation: 1, stars: 0, earned: 0, perks: [], emblem: { ...DEFAULT_EMBLEM },
  region: null, museum: [], shelf: [] });

const cfgOf = (data) => data?.BALANCE?.legacy ?? { perks: [], challenges: [], emblem: { icons: [], colors: [] } };
/** Regions a generation may start in (level-1 regions) with their cheapest level-1 field. */
export function startRegions(data) {
  return (data.REGIONS || []).filter((r) => (r.unlockLevel ?? 1) <= 1).map((r) => {
    const f = (data.FIELDS || []).filter((x) => x.regionId === r.id && fieldUnlockLevel(data, x) <= 1).sort((a, b) => a.price - b.price)[0];
    return f ? { id: r.id, name: r.name, tropical: !!r.climate?.tropical, fieldId: f.id, fieldName: f.name, sizeHa: f.sizeHa, price: f.price } : null;
  }).filter(Boolean);
}

/** Load / create: any input (missing, old, corrupt) → a valid legacy block. Unknown perks, emblems and regions drop. */
export function normalizeLegacy(raw, data) {
  const L = raw && typeof raw === 'object' ? raw : {};
  const cfg = cfgOf(data), icons = cfg.emblem?.icons ?? [], colors = cfg.emblem?.colors ?? [];
  const perkIds = new Set((cfg.perks || []).map((p) => p.id));
  const regions = new Set(startRegions(data).map((r) => r.id));
  const e = L.emblem && typeof L.emblem === 'object' ? L.emblem : {};
  const cups = new Set(['emas', 'perak', 'perunggu']);
  return {
    v: LEGACY_VERSION,
    generation: Math.max(1, int(L.generation) || 1),
    stars: int(L.stars), earned: Math.max(int(L.earned), int(L.stars)),
    perks: [...new Set(Array.isArray(L.perks) ? L.perks : [])].filter((id) => perkIds.has(id)),
    emblem: { icon: icons.includes(e.icon) ? e.icon : DEFAULT_EMBLEM.icon, color: colors.includes(e.color) ? e.color : DEFAULT_EMBLEM.color },
    region: regions.has(L.region) ? L.region : null,
    museum: (Array.isArray(L.museum) ? L.museum : []).filter((m) => m && typeof m === 'object').slice(-(cfg.museumMax ?? 30))
      .map((m) => ({ gen: Math.max(1, int(m.gen)), name: String(m.name ?? `Generasi ${int(m.gen) || 1}`).slice(0, 80), days: int(m.days),
        level: Math.max(1, int(m.level)), netWorth: Math.round(Number(m.netWorth) || 0),
        emblem: { icon: String(m.emblem?.icon ?? DEFAULT_EMBLEM.icon).slice(0, 8), color: colors.includes(m.emblem?.color) ? m.emblem.color : DEFAULT_EMBLEM.color },
        frame: int(m.frame), stars: int(m.stars), challenge: typeof m.challenge === 'string' ? m.challenge : null,
        challengeName: typeof m.challengeName === 'string' ? m.challengeName.slice(0, 60) : null, achievements: int(m.achievements),
        stages: int(m.stages), cups: int(m.cups) })),
    shelf: (Array.isArray(L.shelf) ? L.shelf : []).filter((c) => c && cups.has(c.cup)).slice(-(data?.BALANCE?.league?.shelfMax ?? 60))
      .map((c) => ({ gen: Math.max(1, int(c.gen)), season: int(c.season), cup: c.cup, division: int(c.division), metric: String(c.metric ?? '') })),
  };
}

/** persist.normalizeState: the run's generation info (old saves: generation 1, no challenge). */
export function ensureGeneration(s, data) {
  const g = s.generation && typeof s.generation === 'object' ? s.generation : {};
  const ids = (cfgOf(data).challenges || []).map((c) => c.id);
  s.generation = { n: Math.max(1, int(g.n) || 1), challenge: ids.includes(g.challenge) ? g.challenge : null,
    challengeDone: !!g.challengeDone, forfeited: !!g.forfeited, mandorHired: !!g.mandorHired || !!s.mandor?.hired,
    startDay: Math.max(1, int(g.startDay) || 1) };
}

// ---------- ⭐ stars ----------

/**
 * Pure star formula. `level` (max level reached), `netWorth` ($), `achievements` (count), `stages` (Proyek Warisan
 * stages finished + monumentStages per Monumen). Sublinear: √ of net worth, achievements and stages. The level term is
 * perLevel × (level − levelFrom) up to softFrom (50), then perLevelAfter (0.5) per level (v20: Lv 100 → 23 + 25 = 48).
 * → {parts: {level, wealth, achievements, projects}, raw}.
 */
export function starFormula({ level = 1, netWorth: nw = 0, achievements = 0, stages = 0 }, cfg = DEFAULT_STARS) {
  const c = { ...DEFAULT_STARS, ...cfg };
  const parts = {
    level: c.perLevel * Math.max(0, Math.min(level, c.softFrom) - c.levelFrom) + c.perLevelAfter * Math.max(0, level - c.softFrom),
    wealth: Math.sqrt(Math.max(0, nw) / c.nwUnit),
    achievements: Math.sqrt(Math.max(0, achievements)),
    projects: Math.sqrt(Math.max(0, stages)),
  };
  return { parts, raw: parts.level + parts.wealth + parts.achievements + parts.projects };
}

/** The run's challenge for the star multiplier: {def, done} or null. */
function runChallenge(game) {
  const def = activeChallenge(game);
  if (!def) return null;
  return { def, done: !!game.state.generation?.challengeDone || game.state.level >= (legacyCfg(game).unlockLevel ?? 30) };
}

const stagesOf = (game) => projectStat(game, 'projectStages') + ({ ...DEFAULT_STARS, ...legacyCfg(game).stars }.monumentStages) * projectStat(game, 'monuments');

/** Star preview for passing the farm on now (the exact amount inheritFarm grants). */
export function legacyPreview(game) {
  const s = game.state, cfg = legacyCfg(game), unlock = cfg.unlockLevel ?? 30;
  const input = { level: s.level, netWorth: netWorth(game), achievements: s.achievements.length, stages: stagesOf(game) };
  const { parts, raw } = starFormula(input, cfg.stars);
  const ch = runChallenge(game), mult = ch?.done ? ch.def.mult : 1;
  const total = Math.floor(raw * mult + 1e-9);
  const canInherit = s.level >= unlock;
  return {
    parts: [
      { id: 'level', emoji: '⭐', label: 'Level tertinggi', detail: `Lv ${s.level}`, value: round2(parts.level) },
      { id: 'wealth', emoji: '💰', label: 'Kekayaan bersih', detail: fmtMoney(input.netWorth), value: round2(parts.wealth) },
      { id: 'achievements', emoji: '🏆', label: 'Prestasi', detail: `${input.achievements} tercapai`, value: round2(parts.achievements) },
      { id: 'projects', emoji: '🏛️', label: 'Proyek Warisan', detail: `${input.stages} tahap`, value: round2(parts.projects) },
    ],
    raw: round2(raw), mult, total, input,
    challenge: ch ? { id: ch.def.id, name: ch.def.name, emoji: ch.def.emoji, mult: ch.def.mult, done: ch.done } : null,
    canInherit, unlockLevel: unlock, reason: canInherit ? null : `Butuh level ${unlock} (sekarang Lv ${s.level}).`,
  };
}

// ---------- perks ----------

const EFFECT_TEXT = {
  startMoney: (v) => `Modal awal +${fmtMoney(v)}`,
  startSilo: (v) => `Silo mulai ${v} tingkat lebih besar`,
  regionChoice: () => 'Pilih wilayah awal (Jawa Barat, Bavaria, Iowa, Normandia, Hokkaido)',
  startRp: (v) => `+${v} poin riset di awal`,
  xp: (v) => `XP +${Math.round(v * 100)}%`,
  missionSlot: (v) => `+${v} misi harian`,
  mandorDiscount: (v) => `Mandor pertama −${Math.round(v * 100)}% biaya rekrut`,
  emblem: () => 'Pilih lambang & warna pertanian',
  paints: () => 'Cat mesin warisan: emas & ungu',
};
const START_KEYS = new Set(['startMoney', 'startSilo', 'startRp']);
export const perkText = (p) => Object.entries(p.effects || {}).map(([k, v]) => EFFECT_TEXT[k]?.(v) ?? k).join(' · ');
/** 'start' = given at each generation start (and once when bought mid-run), 'next' = from the next generation, 'live' = now. */
export const perkWhen = (p) => (Object.keys(p.effects || {}).some((k) => START_KEYS.has(k)) ? 'start' : p.effects?.regionChoice ? 'next' : 'live');

/** Highest level this family ever reached: the museum's generations and the current run. */
export const bestLevel = (L, runLevel = 0) => Math.max(runLevel || 0, ...(L.museum || []).map((m) => m.level || 0));

function perkReason(cfg, L, p, runLevel = 0) {
  if (L.perks.includes(p.id)) return 'Sudah dimiliki.';
  const missing = (p.requires || []).filter((id) => !L.perks.includes(id));
  if (missing.length) return `Butuh ${missing.map((id) => cfg.perks.find((x) => x.id === id)?.name ?? id).join(' & ')}.`;
  if (p.minLevel && bestLevel(L, runLevel) < p.minLevel) return `Butuh pernah mencapai Lv ${p.minLevel}.`;
  if (L.stars < p.cost) return `Butuh ${p.cost} ⭐.`;
  return null;
}

function buyOn(cfg, L, id, runLevel = 0) {
  const p = cfg.perks.find((x) => x.id === id);
  if (!p) return fail('Perk tidak ditemukan.');
  const reason = perkReason(cfg, L, p, runLevel);
  if (reason) return fail(reason);
  L.stars -= p.cost;
  L.perks.push(p.id);
  return ok({ perk: p });
}

/** Spend stars on a perk now. Start effects (money, research points, silo) are also given at once for this run. */
export function buyLegacyPerk(game, id) {
  const cfg = legacyCfg(game), r = buyOn(cfg, game.legacy, id, game.state.level);
  if (!r.ok) return r;
  const e = r.perk.effects || {}, s = game.state, applied = {};
  if (e.startMoney > 0) { game.earn(e.startMoney, 'hadiah', { stat: false }); applied.money = e.startMoney; }
  if (e.startRp > 0) { grantResearchPoints(game, e.startRp); applied.rp = e.startRp; }
  if (e.startSilo > 0) { s.storageUpgrades.silo = (s.storageUpgrades.silo || 0) + e.startSilo; applied.silo = e.startSilo; }
  game.emit('legacy_perk', `🌳 Perk warisan ${r.perk.emoji} ${r.perk.name}: ${perkText(r.perk)}.`, { perkId: r.perk.id, applied });
  return ok({ perkId: r.perk.id, stars: game.legacy.stars, applied });
}

/** Cosmetic emblem (needs the 'emblem' perk). */
export function setEmblem(game, { icon, color } = {}) {
  const cfg = legacyCfg(game);
  if (!(perkSum(game, 'emblem') > 0)) return fail('Butuh perk Lambang Keluarga.');
  const e = game.legacy.emblem;
  if (icon != null && !(cfg.emblem?.icons ?? []).includes(icon)) return fail('Lambang tidak tersedia.');
  if (color != null && !(cfg.emblem?.colors ?? []).includes(color)) return fail('Warna tidak tersedia.');
  game.legacy.emblem = { icon: icon ?? e.icon, color: color ?? e.color };
  return ok({ emblem: { ...game.legacy.emblem } });
}

/** Give up the run's challenge (no star multiplier; its rules stop applying). */
export function forfeitChallenge(game) {
  const g = game.state.generation, def = activeChallenge(game);
  if (!def) return fail('Tidak ada tantangan aktif.');
  if (g.challengeDone) return fail('Tantangan sudah selesai.');
  g.forfeited = true;
  game.emit('challenge_forfeit', `🌳 Tantangan ${def.emoji} ${def.name} dilepas. Aturannya tidak berlaku lagi.`, { challenge: def.id });
  return ok();
}

/** Daily rollover: a challenge is done once Lv 30 is reached under it (one event). */
export function stepLegacyDay(game) {
  const g = game.state.generation, def = activeChallenge(game);
  if (!def || g.challengeDone || game.state.level < (legacyCfg(game).unlockLevel ?? 30)) return;
  g.challengeDone = true;
  game.emit('challenge_done', `🌳 Tantangan ${def.emoji} ${def.name} selesai! Bintang Warisan ×${def.mult} saat mewariskan.`, { challenge: def.id });
}

// ---------- 🏛️ museum + inheritance ----------

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  let s = '', v = Math.max(1, Math.floor(n));
  if (v > 39) return String(v);
  for (const [k, r] of ROMAN) while (v >= k) { s += r; v -= k; }
  return s;
}

function epithet(entry) {
  if (entry.challengeDone && entry.challengeName) return `Penakluk ${entry.challengeName}`;
  if (entry.stages >= 12) return 'Sang Pembangun';
  if (entry.netWorth >= 1e9) return 'Sang Taipan';
  if (entry.achievements >= 25) return 'Sang Juara';
  return 'Sang Perintis';
}

function museumEntry(game, pv) {
  const s = game.state, L = game.legacy, gen = L.generation;
  const e = { gen, days: game.day, level: s.level, netWorth: Math.round(pv.input.netWorth), emblem: { ...L.emblem },
    frame: (s.league?.best ?? 0), stars: pv.total, challenge: pv.challenge?.id ?? null, challengeName: pv.challenge?.name ?? null,
    challengeDone: !!pv.challenge?.done, achievements: pv.input.achievements, stages: pv.input.stages,
    cups: (L.shelf || []).filter((c) => c.gen === gen).length };
  const { challengeDone, ...rest } = e;
  return { ...rest, name: `Generasi ${roman(gen)} · ${epithet(e)}` };
}

/**
 * Plan "Wariskan pertanian" without touching this game: the next legacy block (stars granted, `buy` perks bought in
 * order, region/emblem chosen, museum entry added, generation + 1). Game.inheritFarm builds the fresh run from it.
 * `opts` = {challengeId?: id|null, regionId?: id|null, buy?: [perkId], emblem?: {icon, color}}.
 */
export function planInheritance(game, { challengeId = null, regionId, buy = [], emblem } = {}) {
  const pv = legacyPreview(game);
  if (!pv.canInherit) return fail(pv.reason);
  const cfg = legacyCfg(game), data = game.data;
  const ch = challengeId ? cfg.challenges.find((c) => c.id === challengeId) : null;
  if (challengeId && !ch) return fail('Tantangan tidak dikenal.');
  const L = normalizeLegacy(JSON.parse(JSON.stringify(game.legacy)), data);
  L.stars += pv.total;
  L.earned += pv.total;
  for (const id of Array.isArray(buy) ? buy : []) {
    const r = buyOn(cfg, L, id, game.state.level);
    if (!r.ok) return fail(`${cfg.perks.find((p) => p.id === id)?.name ?? id}: ${r.reason}`);
  }
  const has = (key) => L.perks.some((id) => (cfg.perks.find((p) => p.id === id)?.effects?.[key] ?? 0) > 0);
  if (regionId !== undefined && regionId !== L.region) {
    const reg = regionId == null ? null : startRegions(data).find((r) => r.id === regionId);
    if (regionId != null && !reg) return fail('Wilayah awal tidak tersedia.');
    if (regionId != null && !has('regionChoice')) return fail('Butuh perk Tanah Leluhur untuk memilih wilayah awal.');
    if (reg && ch?.id === 'tropis' && !reg.tropical) return fail('Tantangan "Hanya wilayah tropis" harus mulai di wilayah tropis.');
    L.region = reg?.id ?? null;
  }
  if (emblem) {
    if (!has('emblem')) return fail('Butuh perk Lambang Keluarga.');
    const icons = cfg.emblem?.icons ?? [], colors = cfg.emblem?.colors ?? [];
    if ((emblem.icon != null && !icons.includes(emblem.icon)) || (emblem.color != null && !colors.includes(emblem.color))) return fail('Lambang tidak tersedia.');
    L.emblem = { icon: emblem.icon ?? L.emblem.icon, color: emblem.color ?? L.emblem.color };
  }
  const entry = museumEntry(game, pv);
  L.museum.push(entry);
  if (L.museum.length > (cfg.museumMax ?? 30)) L.museum.splice(0, L.museum.length - (cfg.museumMax ?? 30));
  L.generation += 1;
  return ok({ legacy: L, stars: pv.total, entry, challenge: ch?.id ?? null, preview: pv });
}

/**
 * createGame: the run's generation info and the perks' start effects on a fresh state (start money, research points,
 * silo levels, chosen start region, challenge starter machines, heritage paint on the starter tractor).
 */
export function applyLegacyStart(game, { challenge = null } = {}) {
  const s = game.state, L = game.legacy, cfg = legacyCfg(game);
  const def = challenge ? cfg.challenges.find((c) => c.id === challenge) ?? null : null;
  s.generation = { n: L.generation, challenge: def?.id ?? null, challengeDone: false, forfeited: false, mandorHired: false, startDay: game.day };
  const money = perkSum(game, 'startMoney');
  if (money > 0) s.money = round2(s.money + money); // start capital, like STARTING.money (not income)
  grantResearchPoints(game, perkSum(game, 'startRp'));
  const silo = perkSum(game, 'startSilo');
  if (silo > 0) s.storageUpgrades.silo = (s.storageUpgrades.silo || 0) + silo;
  const reg = perkSum(game, 'regionChoice') > 0 && L.region ? startRegions(game.data).find((r) => r.id === L.region) : null;
  if (reg && !(def?.id === 'tropis' && !reg.tropical) && !s.fields[reg.fieldId]) {
    for (const id of Object.keys(s.fields)) delete s.fields[id];
    s.fields[reg.fieldId] = newFieldState(game.idx.fields.get(reg.fieldId));
  }
  for (const id of def?.starter ?? []) if (game.idx.machines.has(id)) addMachine(game, id);
  const paint = perkSum(game, 'paints') > 0 ? cfg.paints?.[0] : null;
  const tractor = paint && s.machines.find((m) => game.idx.machines.get(m.defId)?.type === 'tractor');
  if (tractor) tractor.paint = paint;
  syncCounts(game);
}

/** Everything the 🌳 Warisan sub-tab needs. */
export function legacyView(game) {
  const cfg = legacyCfg(game), L = game.legacy, g = game.state.generation ?? {};
  const pv = legacyPreview(game);
  const perks = (cfg.perks || []).map((p) => {
    const reason = perkReason(cfg, L, p, game.state.level), owned = L.perks.includes(p.id);
    const prereq = (p.requires || []).every((id) => L.perks.includes(id));
    return { id: p.id, branch: p.branch, name: p.name, emoji: p.emoji, cost: p.cost, requires: p.requires || [], minLevel: p.minLevel ?? null,
      desc: perkText(p), when: perkWhen(p), owned, status: owned ? 'owned' : !reason ? 'ready' : prereq ? 'open' : 'locked', reason: owned ? null : reason };
  });
  const def = activeChallenge(game);
  const ch = g.challenge ? cfg.challenges.find((c) => c.id === g.challenge) : null;
  return {
    unlockLevel: pv.unlockLevel, level: game.state.level, generation: L.generation, stars: L.stars, earned: L.earned,
    canInherit: pv.canInherit, reason: pv.reason, preview: pv,
    perks, branches: cfg.branches ?? [], owned: L.perks.length, total: perks.length,
    challenge: ch ? { id: ch.id, name: ch.name, emoji: ch.emoji, mult: ch.mult, desc: ch.desc, done: !!g.challengeDone || (!!def && pv.challenge?.done),
      forfeited: !!g.forfeited, active: !!def } : null,
    challenges: (cfg.challenges || []).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, mult: c.mult, desc: c.desc })),
    regions: startRegions(game.data), region: L.region, regionPerk: perkSum(game, 'regionChoice') > 0,
    emblem: { ...L.emblem, frame: game.state.league?.best ?? 0 }, emblemPerk: perkSum(game, 'emblem') > 0,
    emblems: { icons: cfg.emblem?.icons ?? [], colors: cfg.emblem?.colors ?? [] },
    museum: [...L.museum].reverse(),
    cups: (L.shelf || []).length,
  };
}
