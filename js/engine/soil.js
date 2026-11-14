// F6 soil: mutable pH, nutrients (0–1) and crop rotation per owned field.
// Field states gain `ph`, `nutrients`, `lastCropId`. Missing values are filled lazily
// (ensureSoil) so fields created anywhere (buyField, old saves) work without migration.
import { clamp, round2 } from './rng.js';

export const LIME_TARGET_PH = 6.8;
export const LIME_STEP = 0.5;
export const START_NUTRIENTS = 0.8;
export const FERTILIZE_NUTRIENTS = 0.4;
export const LEGUME_NUTRIENTS = 0.15;
export const ROTATION_PENALTY = 0.9;

/** Set soil keys on a fresh field state from its definition. */
export function initSoil(game, fieldState, fieldDef) {
  fieldState.ph = fieldDef?.ph ?? LIME_TARGET_PH;
  fieldState.nutrients = START_NUTRIENTS;
  fieldState.lastCropId = null;
  return fieldState;
}

/** Fill any missing soil keys on an owned field state. Returns the state (or null). */
export function ensureSoil(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!f) return null;
  const def = game.idx.fields.get(fieldId);
  if (typeof f.ph !== 'number') f.ph = def?.ph ?? LIME_TARGET_PH;
  if (typeof f.nutrients !== 'number') f.nutrients = START_NUTRIENTS;
  if (f.lastCropId === undefined) f.lastCropId = null;
  return f;
}

/** Current pH of a field: field state when owned, else the definition. */
export function phOf(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (f && typeof f.ph === 'number') return f.ph;
  return game.idx.fields.get(fieldId)?.ph ?? LIME_TARGET_PH;
}

export function nutrientsOf(game, fieldId) {
  const f = game.state.fields[fieldId];
  return f && typeof f.nutrients === 'number' ? f.nutrients : START_NUTRIENTS;
}

/** Lime task completed: move pH 0.5 toward 6.8. */
export function applyLime(game, fieldId) {
  const f = ensureSoil(game, fieldId);
  if (!f) return null;
  const d = LIME_TARGET_PH - f.ph;
  f.ph = round2(f.ph + clamp(d, -LIME_STEP, LIME_STEP));
  return f.ph;
}

/** Fertilize task completed: +0.4 nutrients (cap 1). */
export function onFertilize(game, fieldId) {
  const f = ensureSoil(game, fieldId);
  if (!f) return null;
  f.nutrients = round2(Math.min(1, f.nutrients + FERTILIZE_NUTRIENTS));
  return f.nutrients;
}

/** Harvest completed: crops use nutrients, legumes add them. Records lastCropId. */
export function onHarvest(game, fieldId, cropId) {
  const f = ensureSoil(game, fieldId);
  if (!f) return null;
  const crop = game.idx.crops.get(cropId);
  const delta = crop?.legume ? LEGUME_NUTRIENTS : -(crop?.nutrientUse ?? 0.2);
  f.nutrients = round2(clamp(f.nutrients + delta, 0, 1));
  f.lastCropId = cropId ?? null;
  f.pest = false; f.damage = 1; f.seasonSum = 0; f.seasonN = 0; // crop cycle over (see fields.resetCropCycle)
  return f.nutrients;
}

/** Yield multipliers from soil: {nutrients: 0.6+0.4·n, rotation: ×0.9 for the same crop twice}. */
export function soilFactors(game, fieldId, cropId) {
  const f = game.state.fields[fieldId];
  const n = nutrientsOf(game, fieldId);
  const same = !!f && !!cropId && f.lastCropId === cropId;
  return { nutrients: 0.6 + 0.4 * n, rotation: same ? ROTATION_PENALTY : 1 };
}
