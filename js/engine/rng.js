// Seeded PRNG (mulberry32). The generator state lives in game.state.rng so the
// simulation is reproducible after save/load.

export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? 'farm');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Advance state.rng and return a float in [0,1). */
export function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state, min, max) {
  return min + (max - min) * random(state);
}

/** Approximately standard-normal value (sum of uniforms). */
export function randNormal(state) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += random(state);
  return (s - 3) / Math.sqrt(0.5);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round2 = (v) => Math.round(v * 100) / 100;
