// Daily weather per region, driven by REGIONS[].climate + seasons (F5) + a 3-day forecast.
// Forecast days are rolled ahead from the game RNG into state.forecast; when the day arrives the
// actual weather consumes its entry (temp gets a small error; rain re-checks the stored draw
// against that day's rain chance), then events (heatwave/storm) may override it.
import { random, randNormal, round2 } from './rng.js';
import { climateTemp, rainChanceAt, seasonOf } from './seasons.js';
import { weatherOverride } from './events.js';
import { projectPerk } from './projects.js';

/** Rain chance with a 🏞️ Bendungan (Proyek Warisan): never below its floor. */
const rainChance = (game, r, day) => Math.max(rainChanceAt(game, r, day), projectPerk(game, 'rainFloor', r.id));

export const FORECAST_DAYS = 3;
const FORECAST_TEMP_ERROR = 0.8;
const FORECAST_RAIN_MISS = 0.08; // chance the forecast's rain call is simply wrong

function genEntry(game, region, day) {
  const { state } = game;
  const temp = climateTemp(game, region, day) + randNormal(state) * region.climate.tempSwing * 0.25;
  const u = random(state);
  return { day, temp: round2(temp), rain: u < rainChance(game, region, day), u: Math.round(u * 1e6) / 1e6 };
}

/** Make sure every region has forecast entries for day+1..day+FORECAST_DAYS. */
export function fillForecast(game, day) {
  const fc = (game.state.forecast ||= {});
  for (const r of game.data.REGIONS) {
    const list = (fc[r.id] || []).filter((e) => e.day > day && e.day <= day + FORECAST_DAYS);
    for (let d = day + 1; d <= day + FORECAST_DAYS; d++) {
      if (!list.some((e) => e.day === d)) list.push(genEntry(game, r, d));
    }
    fc[r.id] = list.sort((a, b) => a.day - b.day);
  }
}

export function rollWeather(game, day) {
  const { state, data } = game;
  const fc = (state.forecast ||= {});
  const out = {};
  for (const r of data.REGIONS) {
    const planned = (fc[r.id] || []).find((e) => e.day === day) || genEntry(game, r, day);
    let temp = planned.temp + randNormal(state) * FORECAST_TEMP_ERROR;
    let rain = planned.u < rainChance(game, r, day);
    if (random(state) < FORECAST_RAIN_MISS) rain = !rain;
    const o = weatherOverride(game, r.id, day);
    temp += o.tempAdd;
    if (o.rain != null) rain = o.rain;
    if (o.drought) rain = planned.u < projectPerk(game, 'rainFloor', r.id) / 2; // El Niño: a dam lets half its floor through
    out[r.id] = { temp: round2(temp), rain };
  }
  state.weather = out;
  fillForecast(game, day);
  return out;
}

/** Public 3-day forecast for a region: [{day, temp, rain}], known event effects applied. */
export function forecastView(game, regionId) {
  const list = game.state.forecast?.[regionId] || [];
  return list.filter((e) => e.day > game.day).slice(0, FORECAST_DAYS).map((e) => {
    const o = weatherOverride(game, regionId, e.day);
    return { day: e.day, temp: round2(e.temp + o.tempAdd), rain: o.rain ?? e.rain };
  });
}

/** Called once per day after rolling weather: record dry/wet days on growing fields and orchards. */
export function applyWeatherToFields(game) {
  const { state } = game;
  for (const [fid, f] of Object.entries(state.fields)) {
    if (f.state !== 'growing' && f.state !== 'orchard' && !(f.busy && f.busy.task === 'irrigate')) continue;
    const def = game.idx.fields.get(fid);
    const w = def && state.weather[def.regionId];
    if (!w) continue;
    if (w.rain) f.wetDays++;
    else f.dryDays++;
  }
}

export function weatherSummary(game) {
  const { state, data } = game;
  return data.REGIONS.map((r) => ({
    regionId: r.id,
    name: r.name,
    ...(state.weather[r.id] || { temp: r.climate.baseTemp, rain: false }),
    season: seasonOf(game, r),
  }));
}

/**
 * Weather yield factor from dry-day ratio vs crop water need.
 * Tolerated dry share: low 0.8, med 0.6, high 0.4. Each 10% over => dryPenalty/2.
 * Irrigation removes the dry penalty entirely (bonus applied separately).
 */
export function weatherFactor(game, field, crop) {
  const total = field.dryDays + field.wetDays;
  if (total === 0 || field.irrigated) return 1;
  const tol = { low: 0.8, med: 0.6, high: 0.4 }[crop.waterNeed] ?? 0.6;
  const dryShare = field.dryDays / total;
  const over = Math.max(0, dryShare - tol);
  const pen = game.data.BALANCE.dryPenalty * (over / 0.2);
  return Math.max(0.4, 1 - pen);
}
