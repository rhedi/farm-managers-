// 🌳 Generasi Baru: small read-only hooks that other engine modules call (no imports, so no import cycles).
// The legacy block lives on the Game (`game.legacy`, outside the run state); the run's challenge in
// `state.generation` (see js/engine/legacy.js for the full feature: stars, perks, inheritance, museum).
const NO_CFG = { perks: [], challenges: [], paints: [] };

export const legacyCfg = (game) => game.data.BALANCE.legacy ?? NO_CFG;
export const perkDef = (game, id) => legacyCfg(game).perks.find((p) => p.id === id) ?? null;
export const hasPerk = (game, id) => !!game.legacy?.perks?.includes(id);

/** Sum of `key` over the perks bought (0 when none). */
export function perkSum(game, key) {
  const owned = game.legacy?.perks;
  if (!owned?.length) return 0;
  let sum = 0;
  for (const id of owned) sum += perkDef(game, id)?.effects?.[key] ?? 0;
  return sum;
}

/** The run's active challenge definition (null when none or given up). */
export function activeChallenge(game) {
  const g = game.state.generation;
  if (!g?.challenge || g.forfeited) return null;
  return legacyCfg(game).challenges.find((c) => c.id === g.challenge) ?? null;
}

const isTropicalRegion = (region) => !!region?.climate?.tropical;

/**
 * Why the active challenge forbids an action ('' = allowed). `kind`: 'field' (arg = field def), 'rent' (renting a
 * harvester or pickers), 'staff' (arg = state key of the role: 'dispatcher' | 'factoryManager' | 'mandor').
 */
export function challengeBlock(game, kind, arg) {
  const c = activeChallenge(game);
  if (!c) return '';
  const tag = `🌳 Tantangan "${c.name}"`;
  if (c.id === 'tropis' && kind === 'field' && !isTropicalRegion(game.idx.regions.get(arg?.regionId)))
    return `${tag}: hanya ladang di wilayah tropis.`;
  if (c.id === 'tanpaSewa' && kind === 'rent') return `${tag}: tidak boleh menyewa pemanen/pemetik.`;
  if (c.id === 'tanpaManajer' && kind === 'staff' && (arg === 'dispatcher' || arg === 'factoryManager'))
    return `${tag}: tidak boleh merekrut manajer.`;
  return '';
}

/** Bab Petani steps the active challenge makes impossible count as met (js/engine/chapters.js). */
export const chapterWaived = (game, stepId) => !!activeChallenge(game)?.waive?.includes(stepId);

/** XP multiplier from the perks (addXp). */
export const xpMult = (game) => 1 + perkSum(game, 'xp');

/** Extra daily mission slots (missions.generateMissions). */
export const missionSlots = (game) => perkSum(game, 'missionSlot');

/** Hire cost of the first Mandor of this generation after the 'mandorDiscount' perk. */
export function mandorHireCost(game, base) {
  const d = Math.min(0.9, perkSum(game, 'mandorDiscount'));
  return d > 0 && !game.state.generation?.mandorHired ? Math.round(base * (1 - d)) : base;
}

/** Heritage machine paints unlocked by the 'paints' perk (machine upgrade dialog). */
export const legacyPaints = (game) => (perkSum(game, 'paints') > 0 ? legacyCfg(game).paints ?? [] : []);
