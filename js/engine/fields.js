// Field state, crop growth, and yield calculation.
import { randRange, round2 } from './rng.js';
import { weatherFactor } from './weather.js';
import { availableActions } from './tasks.js';
import { nextStepFor } from './plans.js';
import { phOf, nutrientsOf, soilFactors, ensureSoil, FERTILIZE_NUTRIENTS, START_NUTRIENTS } from './soil.js';
import { cropGrowthMult, seasonYieldNow, seasonOf, cropSeasonFit, seasonIdAt } from './seasons.js';
import { forecastView } from './weather.js';
import { eventGrowthMult, pestFactor, treatPestCost } from './events.js';
import { fieldUnlockLevel } from './defs.js';
import { orchardFactors, stepOrchardHour, orchardView } from './orchard.js';
import { greenhouseFactors, greenhouseView, hasGreenhouse } from './greenhouse.js';
import { perk } from './research.js';
import { boostMult } from './calendar.js';

export const WITHER_AFTER_HOURS = 72;
export const WITHER_PER_DAY = 0.1;

/** Fresh field state. Pass the field definition to seed its soil pH (F6); without it pH is filled lazily. */
export function newFieldState(def) {
  return {
    state: 'idle', cropId: null, fertilized: false, irrigated: false,
    growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0, busy: null, plan: null,
    ...(def ? { ph: def.ph } : {}), nutrients: 0.8, lastCropId: null,
    pest: false, damage: 1, seasonSum: 0, seasonN: 0, // per crop cycle (F5 events/seasons)
    orchard: null, greenhouse: null, // kebun buah trees (orchard.js) · rumah kaca (greenhouse.js)
  };
}

/** Clear per-cycle crop data (pest, storm damage, season average). */
export function resetCropCycle(f) {
  f.pest = false; f.damage = 1; f.seasonSum = 0; f.seasonN = 0;
}

export function phFactor(game, fieldDef, crop, ph = fieldDef.ph) {
  const [lo, hi] = crop.idealPh;
  const d = ph < lo ? lo - ph : ph > hi ? ph - hi : 0;
  return Math.max(0.3, 1 - d * game.data.BALANCE.yieldPhPenaltyPerUnit);
}

export function witherFactor(f) {
  if (f.state !== 'ready' || f.readyHours <= WITHER_AFTER_HOURS) return 1;
  return Math.max(0, 1 - WITHER_PER_DAY * (f.readyHours - WITHER_AFTER_HOURS) / 24);
}

/**
 * Yield multipliers (1 = neutral) for a crop on a field. `assume` lets estimates
 * treat fertilized/irrigated as given. Returns null for unknown field/crop.
 */
export function yieldFactorsOf(game, fieldId, cropId, assume = {}) {
  const B = game.data.BALANCE;
  const def = game.idx.fields.get(fieldId);
  const crop = game.idx.crops.get(cropId);
  if (!def || !crop) return null;
  const f = game.state.fields[fieldId] || newFieldState();
  const fert = assume.fertilized ?? f.fertilized;
  const irr = assume.irrigated ?? f.irrigated;
  const current = f.cropId === cropId; // pest/damage/season history belong to the planted crop only
  const soil = soilFactors(game, fieldId, cropId);
  if (fert && !f.fertilized) soil.nutrients = 0.6 + 0.4 * Math.min(1, nutrientsOf(game, fieldId) + FERTILIZE_NUTRIENTS);
  const fac = {
    soil: B.soilYield[def.soil] ?? 1,
    ph: phFactor(game, def, crop, phOf(game, fieldId)),
    fert: 1 + (fert ? B.fertilizerBonus : 0),
    irrig: 1 + (irr ? B.irrigationBonus : 0),
    contamination: 1 - (B.contaminationPenalty[def.contamination] ?? 0),
    weather: weatherFactor(game, { ...f, irrigated: irr }, crop),
    wither: witherFactor(f),
    season: current && f.seasonN > 0 ? f.seasonSum / f.seasonN : seasonYieldNow(game, def.regionId, crop),
    nutrients: soil.nutrients,
    rotation: soil.rotation,
    pest: current ? pestFactor(game, f) : 1,
    storm: current ? (f.damage ?? 1) : 1,
    research: 1 + perk(game, 'yield'), // research tree (research.js)
  };
  // Trees: season only sets the fruiting window, no rotation penalty, age/prune factors (orchard.js).
  // Greenhouse: no dry/storm/season penalty, +yield (greenhouse.js).
  return { ...fac, ...orchardFactors(game, f, crop), ...greenhouseFactors(game, f, fac) };
}

/** Current growth speed (0 = stalled by cold) of a crop on a field: season/temp × event bonus. */
export function growthMultOf(game, fieldId, crop) {
  const regionId = game.idx.fields.get(fieldId)?.regionId;
  const inside = hasGreenhouse(game.state.fields[fieldId]); // rumah kaca: season/minTemp don't slow growth
  return (inside ? 1 : cropGrowthMult(game, regionId, crop)) * eventGrowthMult(game, regionId);
}

/**
 * How well a crop suits a region right now (crop pickers): `fit` 'good'|'neutral'|'off'|'cold',
 * today's `growthMult`, the region `season`, and forecast counts `coldDays` (< minTemp) / `dryDays`.
 */
export function cropFitView(game, regionId, cropId) {
  const crop = game.idx.crops.get(cropId);
  if (!crop || !game.idx.regions.has(regionId)) return null;
  const growthMult = cropGrowthMult(game, regionId, crop) * eventGrowthMult(game, regionId);
  const fc = forecastView(game, regionId);
  const fit = growthMult === 0 ? 'cold' : cropSeasonFit(crop, seasonIdAt(game, regionId, game.day));
  return { fit, growthMult: round2(growthMult), season: seasonOf(game, regionId), minTemp: crop.minTemp ?? null,
    coldDays: crop.minTemp == null ? 0 : fc.filter((d) => d.temp < crop.minTemp).length,
    dryDays: fc.filter((d) => !d.rain).length, days: fc.length };
}

/** Deterministic yield (tons) without the random ±10% roll. */
export function expectedYield(game, fieldId, cropId, assume = {}) {
  const fac = yieldFactorsOf(game, fieldId, cropId, assume);
  if (!fac) return 0;
  const def = game.idx.fields.get(fieldId);
  const crop = game.idx.crops.get(cropId);
  const tons = Object.values(fac).reduce((p, x) => p * x, def.sizeHa * crop.baseYield);
  return round2(tons);
}

/** Rolled harvest: expected × rand(0.9–1.1) × the 🧪 Pupuk Super booster (calendar.js), if active. */
export function rollYield(game, fieldId) {
  const f = game.state.fields[fieldId];
  return round2(expectedYield(game, fieldId, f.cropId) * randRange(game.state, 0.9, 1.1) * boostMult(game, 'yield'));
}

/** One game hour of growth for every owned field. */
export function stepFieldsHour(game) {
  for (const [fid, f] of Object.entries(game.state.fields)) {
    if (typeof f.ph !== 'number') ensureSoil(game, fid);
    if (f.state === 'idle' || f.state === 'plowed') {
      if (f.pest || f.seasonN || (f.damage ?? 1) !== 1) resetCropCycle(f);
    } else if (f.state === 'orchard') stepOrchardHour(game, fid, f);
    else if (f.state === 'growing') {
      const crop = game.idx.crops.get(f.cropId);
      const mult = crop ? growthMultOf(game, fid, crop) : 1;
      if (mult > 0 && crop) {
        f.seasonSum = (f.seasonSum || 0) + seasonYieldNow(game, game.idx.fields.get(fid)?.regionId, crop);
        f.seasonN = (f.seasonN || 0) + 1;
      }
      f.growHours = Math.round((f.growHours + mult) * 1e6) / 1e6;
      if (crop && f.growHours >= crop.growDays * 24) {
        f.state = 'ready';
        f.readyHours = 0;
        const name = game.idx.fields.get(fid)?.name ?? fid;
        game.emit('crop_ready', `${crop.emoji} ${crop.name} di ${name} siap dipanen!`, { fieldId: fid });
      }
    } else if (f.state === 'ready' && !f.busy) {
      f.readyHours++;
      if (f.readyHours === WITHER_AFTER_HOURS + 1) {
        const name = game.idx.fields.get(fid)?.name ?? fid;
        game.emit('wither', `Tanaman di ${name} mulai layu! Segera panen.`, { fieldId: fid });
      }
    }
  }
}

export function getFieldView(game, fieldId) {
  const def = game.idx.fields.get(fieldId);
  if (!def) return null;
  const f = game.state.fields[fieldId];
  const region = game.idx.regions.get(def.regionId);
  const unlockLevel = fieldUnlockLevel(game.data, def);
  const base = { ...def, region: region?.name ?? def.regionId, owned: !!f, unlockLevel, locked: !f && game.state.level < unlockLevel };
  if (!f) {
    return { ...base, state: 'unowned', progress: 0, crop: null, predictedYield: 0, yieldFactors: null,
      plan: null, nextStep: null, actions: ['buy'], weather: game.state.weather[def.regionId] || null,
      pest: false, season: seasonOf(game, def.regionId), soilState: { ph: def.ph, nutrients: START_NUTRIENTS, lastCropId: null } };
  }
  const crop = f.cropId ? game.idx.crops.get(f.cropId) : null;
  const fac = crop ? yieldFactorsOf(game, fieldId, crop.id) : null;
  const yieldFactors = fac && Object.fromEntries(Object.entries(fac).map(([k, v]) => [k, round2(v)]));
  const orchard = orchardView(game, fieldId, f); // kebun buah block (null for annual crops)
  const growth = orchard ? (orchard.mature ? orchard.fruit : orchard.maturity)
    : crop ? Math.min(1, f.growHours / (crop.growDays * 24)) : 0;
  let progress = 0;
  if (f.busy) progress = Math.min(1, f.busy.done / f.busy.hours);
  else if ((f.state === 'growing' && crop) || f.state === 'orchard') progress = growth;
  else if (f.state === 'ready') progress = 1;
  return {
    ...base,
    state: f.busy ? 'busy' : f.state,
    baseState: f.state,
    task: f.busy ? f.busy.task : null,
    hoursLeft: f.busy ? round2(f.busy.hours - f.busy.done) : 0,
    progress: round2(progress),
    growth: round2(growth),
    growthMult: crop && f.state === 'growing' ? round2(growthMultOf(game, fieldId, crop)) : orchard?.fruitMult ?? null,
    orchard,
    greenhouse: greenhouseView(game, fieldId),
    ph: round2(phOf(game, fieldId)),
    soilState: { ph: round2(phOf(game, fieldId)), nutrients: round2(nutrientsOf(game, fieldId)), lastCropId: f.lastCropId ?? null },
    pest: !!f.pest,
    pestCost: f.pest ? treatPestCost(game, fieldId) : 0,
    season: seasonOf(game, def.regionId),
    crop: crop ? { id: crop.id, name: crop.name, emoji: crop.emoji, perennial: !!crop.perennial } : null,
    fertilized: f.fertilized,
    irrigated: f.irrigated,
    withering: witherFactor(f) < 1,
    witherFactor: round2(witherFactor(f)),
    dryDays: f.dryDays,
    wetDays: f.wetDays,
    predictedYield: crop ? expectedYield(game, fieldId, crop.id) : 0,
    yieldFactors,
    plan: f.plan ? { ...f.plan } : null,
    nextStep: nextStepFor(game, fieldId),
    actions: availableActions(game, fieldId),
    weather: game.state.weather[def.regionId] || null,
  };
}
