// F5 seasons: a short in-game year (BALANCE.yearDays, default 40). Temperate regions cycle
// spring → summer → autumn → winter; tropical regions (climate.tropical) alternate wet/dry.
// Everything here is derived from the day number: no state, no RNG.

export const DEFAULT_YEAR_DAYS = 40;
export const TEMPERATE = ['spring', 'summer', 'autumn', 'winter'];
export const TROPICAL = ['wet', 'dry'];
export const OFF_SEASON_GROWTH = 0.6;
/** Yield multiplier per hour of growth by crop/season fit (averaged over the crop's growth). */
export const SEASON_YIELD = { good: 1.1, neutral: 1, off: 0.95 };
/** Market tilt amplitude: crops are cheaper while in their (harvest) season, dearer off-season. */
export const PRICE_TILT = 0.16;
const TROPICAL_RAIN_SHIFT = 0.2;

export const SEASONS = {
  spring: { id: 'spring', name: 'Musim Semi', emoji: '🌱', growthMult: 1 },
  summer: { id: 'summer', name: 'Musim Panas', emoji: '☀️', growthMult: 1 },
  autumn: { id: 'autumn', name: 'Musim Gugur', emoji: '🍂', growthMult: 1 },
  winter: { id: 'winter', name: 'Musim Dingin', emoji: '❄️', growthMult: 0.7 },
  wet: { id: 'wet', name: 'Musim Hujan', emoji: '🌧️', growthMult: 1 },
  dry: { id: 'dry', name: 'Musim Kemarau', emoji: '🌵', growthMult: 1 },
};

export const yearDays = (game) => game.data.BALANCE.yearDays ?? DEFAULT_YEAR_DAYS;

/** 0..1 position in the year; day 1 = start of spring (wet season in the tropics). */
export function yearPhase(game, day) {
  const y = yearDays(game);
  return ((((day - 1) % y) + y) % y) / y;
}

export const isTropical = (region) => !!(region?.climate?.tropical ?? region?.climate?.baseTemp >= 22);

function regionOf(game, regionOrId) {
  return typeof regionOrId === 'string' ? game.idx.regions.get(regionOrId) : regionOrId;
}

export function seasonIdAt(game, regionOrId, day) {
  const region = regionOf(game, regionOrId);
  const ph = yearPhase(game, day);
  if (isTropical(region)) return ph >= 0.25 && ph < 0.75 ? 'dry' : 'wet';
  return TEMPERATE[Math.min(3, Math.floor(ph * 4))];
}

/** Public season object for a region on a day (defaults to today). */
export function seasonOf(game, regionOrId, day = game.day) {
  return { ...SEASONS[seasonIdAt(game, regionOrId, day)] };
}

/** Climate mean temperature for a day: temperate peaks mid-summer, tropics a little warmer when dry. */
export function climateTemp(game, regionOrId, day) {
  const region = regionOf(game, regionOrId);
  const c = region.climate;
  const ph = yearPhase(game, day);
  if (isTropical(region)) return c.baseTemp + 0.3 * c.tempSwing * Math.sin(2 * Math.PI * (ph - 0.25));
  return c.baseTemp + c.tempSwing * Math.sin(2 * Math.PI * (ph - 0.125));
}

/** Rain chance for a day: tropical wet season +0.2, dry season −0.2. */
export function rainChanceAt(game, regionOrId, day) {
  const region = regionOf(game, regionOrId);
  const base = region.climate.rainChance;
  if (!isTropical(region)) return base;
  const shift = seasonIdAt(game, region, day) === 'wet' ? TROPICAL_RAIN_SHIFT : -TROPICAL_RAIN_SHIFT;
  return Math.max(0.05, Math.min(0.9, base + shift));
}

/** 'good' | 'off' | 'neutral': crops only judge seasons of a family (temperate/tropical) they list. */
export function cropSeasonFit(crop, seasonId) {
  const list = crop?.seasons;
  if (!list?.length) return 'neutral';
  const family = TROPICAL.includes(seasonId) ? TROPICAL : TEMPERATE;
  if (!list.some((s) => family.includes(s))) return 'neutral';
  return list.includes(seasonId) ? 'good' : 'off';
}

/** Growth multiplier from season + temperature: 0 below crop.minTemp, 0.6 off-season. */
export function cropGrowthMult(game, regionId, crop, temp = game.state.weather[regionId]?.temp) {
  if (crop?.minTemp != null && typeof temp === 'number' && temp < crop.minTemp) return 0;
  const sid = seasonIdAt(game, regionId, game.day);
  const fit = cropSeasonFit(crop, sid);
  if (fit === 'good') return 1;
  if (fit === 'off') return OFF_SEASON_GROWTH;
  return SEASONS[sid].growthMult;
}

/** Per-hour yield weight for a crop in a region today (see SEASON_YIELD). */
export function seasonYieldNow(game, regionId, crop) {
  return SEASON_YIELD[cropSeasonFit(crop, seasonIdAt(game, regionId, game.day))];
}

/**
 * Seasonal price multiplier for a crop on a day (global temperate calendar). Cheaper in its
 * good seasons, dearer otherwise; the yearly average is 1. Null for crops without temperate seasons.
 */
export function cropPriceTilt(game, crop, day) {
  const good = (crop?.seasons || []).filter((s) => TEMPERATE.includes(s));
  if (!good.length || good.length === 4) return null;
  const k = good.length;
  const sid = TEMPERATE[Math.min(3, Math.floor(yearPhase(game, day) * 4))];
  return good.includes(sid) ? 1 - PRICE_TILT * (4 - k) / 4 : 1 + PRICE_TILT * k / 4;
}

/** Emit `season_change` for each region with owned fields whose season differs from yesterday. */
export function stepSeasonsDay(game, day) {
  const owned = new Set(Object.keys(game.state.fields).map((id) => game.idx.fields.get(id)?.regionId));
  for (const r of game.data.REGIONS) {
    if (!owned.has(r.id)) continue;
    const now = seasonIdAt(game, r, day);
    if (now === seasonIdAt(game, r, day - 1)) continue;
    const s = SEASONS[now];
    game.emit('season_change', `${s.emoji} ${s.name} dimulai di ${r.name}.`,
      { regionId: r.id, season: { id: s.id, name: s.name, emoji: s.emoji } });
  }
}
