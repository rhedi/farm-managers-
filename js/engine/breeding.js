// Animal breeding: herd genetics (breedQuality), natural/intensive births and breeding stock (studs).
// Births draw from a separate RNG stream (state.breedRng) so the main simulation stream is unaffected.
import { clamp, round2, random, hashSeed } from './rng.js';
import { xpForValue } from './taskrun.js';
import { fmtMoney } from './defs.js';
import { perk } from './research.js';

const DEFAULTS = { minHappiness: 0.7, drift: 0.02, min: 0.5, max: 1.5, xpFactor: 0.5,
  intensive: { births: 4, feed: 1.5, production: 0.75 }, stud: { maxTier: 5, step: 0.1, costFactor: 0.2, perDay: 0.01 } };

export const HERD_DEFAULTS = { breedQuality: 1, breedPeak: 10, breeding: false, breedDays: 0, birthCarry: 0,
  bornTotal: 0, bornLast: 0, lastBirthDay: null, studTier: 0, studCap: 0, fullNotified: false };

export function breedCfg(game) {
  const b = game.data.BALANCE.breeding ?? {};
  return { ...DEFAULTS, ...b, intensive: { ...DEFAULTS.intensive, ...b.intensive },
    stud: { ...DEFAULTS.stud, ...b.stud }, animals: b.animals ?? {} };
}

/** `{days, rate}` birth cycle of a species, or null (no births). */
const cycleOf = (cfg, a) => cfg.animals[a.id] ?? null;
const capOf = (h, a) => h.barns * a.barnCapacity;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** 0.5–1.5 genetics → 1–5 stars (1.0 = 3★). */
export const starsOf = (bq) => round2(1 + (bq - 0.5) * 4);

/** Intensive breeding only runs (and costs) while births are possible: on, ≥ 2 head, free room. */
export const intensiveActive = (h, a) => !!h.breeding && h.count >= 2 && h.count < capOf(h, a);

/** Today's multipliers, decided before feeding: `feed` on need, `production` on output (incl. genetics). */
export function breedingMods(game, a, h) {
  const c = breedCfg(game);
  const on = intensiveActive(h, a) && !!cycleOf(c, a);
  // Research perks: 'feed' lowers the need, 'animalProd' raises output.
  return { intensive: on, feed: (on ? c.intensive.feed : 1) * (1 - perk(game, 'feed')),
    production: (on ? c.intensive.production : 1) * (h.breedQuality ?? 1) * (1 + perk(game, 'animalProd')) };
}

/** Herd average genetics after adding `n` head with genes `q`. */
export function mixQuality(h, n, q) {
  const total = h.count + n;
  return total > 0 ? r4((h.count * (h.breedQuality ?? 1) + n * q) / total) : q;
}

function breedRandom(state) {
  if (typeof state.breedRng !== 'number') state.breedRng = hashSeed(`breed:${state.rng}`);
  const holder = { rng: state.breedRng };
  const v = random(holder);
  state.breedRng = holder.rng;
  return v;
}

/** Set genetics; 'breed_improved' fires once per new 0.1 step above the best reached so far. */
function setQuality(game, a, h, v) {
  const c = breedCfg(game);
  h.breedQuality = r4(clamp(v, c.min, c.max));
  const tenth = Math.floor(h.breedQuality * 10 + 1e-6);
  if (tenth > (h.breedPeak ?? 10)) {
    h.breedPeak = tenth;
    game.emit('breed_improved', `🧬 Genetika ${a.name} naik ke ★${starsOf(h.breedQuality).toFixed(1)} (×${h.breedQuality.toFixed(2)}).`,
      { animalId: a.id, breedQuality: h.breedQuality });
  }
}

/** Effective stud target: 1 + tier·step, diluted when the herd outgrew the capacity the studs were bought for. */
export function studTarget(game, h) {
  if (!h.studTier) return 1;
  const cover = h.count > 0 ? Math.min(1, (h.studCap || 0) / h.count) : 1;
  return 1 + h.studTier * breedCfg(game).stud.step * cover;
}

function notifyFull(game, a, h) {
  if (h.fullNotified || !(h.breeding || h.bornTotal > 0)) return;
  h.fullNotified = true;
  game.emit('herd_full', `${a.emoji} Kandang ${a.name} penuh — kelahiran berhenti. Bangun kandang atau jual ternak.`, { animalId: a.id });
}

/** Daily step after feeding (`fed` 0–1, `intensive` from breedingMods). Returns newborns. */
export function stepBreedingDay(game, a, h, fed, intensive) {
  const c = breedCfg(game), cyc = cycleOf(c, a);
  if (h.studTier > 0 && fed >= 0.999 && h.count > 0) {
    const target = studTarget(game, h);
    if (h.breedQuality < target) setQuality(game, a, h, Math.min(target, h.breedQuality + c.stud.perDay));
  }
  const cap = capOf(h, a);
  if (h.count < cap) h.fullNotified = false;
  if (!cyc || fed < 0.999 || h.happiness <= c.minHappiness || h.count < 2) return 0;
  if (h.count >= cap) { notifyFull(game, a, h); return 0; }
  h.breedDays = (h.breedDays || 0) + 1;
  if (h.breedDays < cyc.days) return 0;
  h.breedDays = 0;
  const expected = (h.birthCarry || 0) + h.count * cyc.rate * (intensive ? c.intensive.births : 1) * (1 + perk(game, 'births'));
  const n = Math.min(Math.floor(expected), cap - h.count);
  h.birthCarry = n < Math.floor(expected) ? 0 : r4(expected - Math.floor(expected));
  if (n <= 0) return 0;
  const child = clamp(h.breedQuality + (breedRandom(game.state) * 2 - 1) * c.drift, c.min, c.max);
  setQuality(game, a, h, mixQuality(h, n, child));
  h.count += n;
  h.bornTotal = (h.bornTotal || 0) + n;
  h.bornLast = n;
  h.lastBirthDay = game.day;
  game.emit('animals_born', `${a.emoji} ${n} ${a.name} lahir!`, { animalId: a.id, n });
  game.addXp(round2(xpForValue(game, n * a.sellPrice) * c.xpFactor));
  if (h.count >= cap) notifyFull(game, a, h);
  return n;
}

/** Next stud tier offer for a herd, or null at max tier. */
export function studOffer(game, a, h) {
  const s = breedCfg(game).stud;
  const tier = (h.studTier || 0) + 1;
  if (tier > s.maxTier) return null;
  const capacity = capOf(h, a);
  return { tier, capacity, cost: round2(a.price * capacity * s.costFactor * tier), target: round2(1 + tier * s.step),
    reqLevel: a.unlockLevel + tier };
}

function studBlock(game, a, h, offer) {
  if (!offer) return 'Indukan sudah tingkat tertinggi.';
  if (a.unlockLevel > game.state.level) return `${a.name} terbuka di level ${a.unlockLevel}.`;
  if (!h.barns) return `Bangun kandang ${a.name} terlebih dahulu.`;
  if (h.count < 1) return 'Belum ada ternak.';
  if (game.state.level < offer.reqLevel) return `Indukan tingkat ${offer.tier} terbuka di level ${offer.reqLevel}.`;
  if (offer.cost > game.state.money + 1e-9) return 'Uang tidak cukup.';
  return null;
}

export function buyBreedingStock(game, herdOf, animalId) {
  const a = game.idx.animals.get(animalId);
  if (!a) return { ok: false, reason: 'Hewan tidak ditemukan.' };
  const h = herdOf(game, animalId);
  const offer = studOffer(game, a, h);
  const reason = studBlock(game, a, h, offer);
  if (reason || !game.spend(offer.cost, 'indukan')) return { ok: false, reason: reason ?? 'Uang tidak cukup.' };
  h.studTier = offer.tier;
  h.studCap = offer.capacity;
  game.emit('breeding_stock', `🐂 Indukan unggul ${a.name} tingkat ${offer.tier} dibeli (${fmtMoney(offer.cost)}).`,
    { animalId, tier: offer.tier, cost: offer.cost });
  return { ok: true, tier: offer.tier, cost: offer.cost, target: offer.target };
}

export function setBreeding(game, herdOf, animalId, on) {
  const a = game.idx.animals.get(animalId);
  if (!a) return { ok: false, reason: 'Hewan tidak ditemukan.' };
  if (a.unlockLevel > game.state.level) return { ok: false, reason: `${a.name} terbuka di level ${a.unlockLevel}.` };
  const h = herdOf(game, animalId);
  h.breeding = !!on;
  return { ok: true, breeding: h.breeding };
}

/** Why births are paused right now (null = breeding). */
function pauseReason(c, a, h) {
  if (!cycleOf(c, a)) return 'Spesies ini tidak berkembang biak.';
  if (h.count < 2) return 'Butuh minimal 2 ekor.';
  if (h.count >= capOf(h, a)) return 'Kandang penuh.';
  if ((h.fed ?? 1) < 0.999) return 'Pakan kurang.';
  if (h.happiness <= c.minHappiness) return 'Ternak kurang bahagia.';
  return null;
}

/** Breeding part of animalsView. */
export function breedingView(game, a, h) {
  const c = breedCfg(game), cyc = cycleOf(c, a);
  const bq = h.breedQuality ?? 1;
  const offer = studOffer(game, a, h);
  const active = intensiveActive(h, a) && !!cyc;
  return {
    breedQuality: round2(bq), stars: starsOf(bq), breeding: !!h.breeding, breedingActive: active,
    breedPaused: pauseReason(c, a, h), cycleDays: cyc?.days ?? null, breedDays: h.breedDays || 0,
    nextBirthIn: cyc ? Math.max(1, cyc.days - (h.breedDays || 0)) : null,
    expectedBirths: cyc ? round2((h.birthCarry || 0) + h.count * cyc.rate * (active ? c.intensive.births : 1) * (1 + perk(game, 'births'))) : 0,
    bornTotal: h.bornTotal || 0, bornLast: h.bornLast || 0, lastBirthDay: h.lastBirthDay ?? null,
    bornToday: h.lastBirthDay === game.day ? h.bornLast || 0 : 0,
    studTier: h.studTier || 0, studMaxTier: c.stud.maxTier, studTarget: round2(studTarget(game, h)),
    intensive: c.intensive,
    nextStud: offer && { ...offer, reason: studBlock(game, a, h, offer) },
  };
}
