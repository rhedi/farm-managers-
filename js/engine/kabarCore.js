// 📰 Kabar Desa shared helpers (kabar.js, kabarTypes.js, kabarDisasters.js): seeded RNG per decision (never touches
// state.rng), the money scale S ("one day of income"), XP per day, loss caps, sourced boosters and herd/field picks.
import { hashSeed, random, round2 } from './rng.js';
import { recentIncome, nice } from './rewards.js';
import { recentXpRate } from './missions.js';
import { addSourcedBooster } from './calendar.js';
import { fmtMoney } from './defs.js';

export const kcfg = (game) => game.data.BALANCE.kabar || {};
export const fmt = fmtMoney;
/** Hash-seeded RNG stream `{rng}` for `salt` (same seed + salt ⇒ same draws). */
export const rngFor = (game, salt) => ({ rng: hashSeed(`${game.state.seed}|kabar|${salt}`) });
export const draw = (r) => random(r);
export const pick = (r, arr) => arr[Math.floor(random(r) * arr.length)];
export const pctText = (v) => `${Math.round(v * 100)}%`;

/** S: one day of income, never below scalePerLevel × level (early game). */
export const scale = (game) => Math.max((kcfg(game).scalePerLevel ?? 400) * game.state.level, recentIncome(game));
/** `days` × S rounded to 2 significant digits. */
export const daysCash = (game, days) => nice(days * scale(game));
/** XP of one recent game day (fallback: 2% of the level gap). */
export function xpDay(game) {
  const r = recentXpRate(game);
  if (r > 0) return r;
  const L = game.data.LEVELS, i = Math.min(game.state.level, L.length - 1);
  return Math.max(30, 0.02 * ((L[i] ?? 0) - (L[i - 1] ?? 0)));
}
export const xpReward = (game, days) => Math.max(10, Math.round(days * xpDay(game)));

/** Most money a bad outcome may take: maxLossDays × S and maxLossCash × cash. */
export function lossCap(game) {
  const C = kcfg(game);
  return Math.max(0, Math.min((C.maxLossDays ?? 1.5) * scale(game), (C.maxLossCash ?? 0.2) * Math.max(0, game.state.money)));
}

/** Pay a chosen cost; false when cash is short. */
export const pay = (game, amount) => !(amount > 0) || game.spend(round2(amount), 'kabar_desa');
/** Lose money from a bad outcome (capped); returns what was taken. */
export function loseMoney(game, amount) {
  const v = round2(Math.min(amount, lossCap(game), Math.max(0, game.state.money)));
  if (v > 0) game.spend(v, 'kabar_desa');
  return v;
}

/** Timed effect through the booster list (calendar.boostMult): kind 'yield' | 'animalProd' | 'taskSpeed' | 'seedCost'. */
export function effect(game, src, kind, mult, days, name, emoji, text) {
  addSourcedBooster(game, { kind, mult, days, src: `kabar:${src}`, name, emoji, text });
}

/** Owned herds with ≥ min head: [{id, def, h}] largest value first. */
export function herds(game, filter = () => true, min = 1) {
  return Object.entries(game.state.animals || {}).map(([id, h]) => ({ id, def: game.idx.animals.get(id), h }))
    .filter((x) => x.def && x.h.count >= min && filter(x.def))
    .sort((a, b) => b.h.count * b.def.price - a.h.count * a.def.price);
}

/** Remove up to `share` of a herd, the lost head's value capped at `capValue`; returns heads lost. */
export function loseHeads(game, animalId, share, capValue) {
  const h = game.state.animals?.[animalId], def = game.idx.animals.get(animalId);
  if (!h || !def || !(share > 0)) return 0;
  let n = Math.floor(h.count * share);
  if (capValue != null) n = Math.min(n, Math.floor(capValue / Math.max(1, def.price)));
  n = Math.max(0, Math.min(h.count, n));
  h.count -= n;
  return n;
}

/** Growing outdoor fields of a region: [[fieldId, f]]. */
export const growingIn = (game, regionId) => Object.entries(game.state.fields)
  .filter(([id, f]) => f.state === 'growing' && !f.greenhouse && game.idx.fields.get(id)?.regionId === regionId);

/** Owned region with the most growing outdoor fields (null when none). */
export function busiestRegion(game) {
  const n = new Map();
  for (const [id, f] of Object.entries(game.state.fields)) {
    if (f.state !== 'growing' || f.greenhouse) continue;
    const r = game.idx.fields.get(id)?.regionId;
    n.set(r, (n.get(r) || 0) + 1);
  }
  let best = null;
  for (const [r, c] of n) if (!best || c > best.c) best = { r, c };
  return best?.r ?? null;
}

/** Multiply the storm-style damage factor of fields (reset with the crop cycle). */
export function damage(fields, mult) {
  for (const [, f] of fields) f.damage = round2((f.damage ?? 1) * mult);
  return fields.length;
}

/** Stock item with the highest market value among `ids` (all silo products when omitted). */
export function richestStock(game, ok = () => true) {
  let best = null;
  for (const [id, q] of Object.entries(game.state.silo || {})) {
    const p = game.idx.products.get(id), sellable = q - (game.state.feedReserve?.[id] || 0);
    if (!p || !(sellable > 0) || !ok(p)) continue;
    const v = sellable * (game.state.market[id] ?? 0);
    if (!best || v > best.value) best = { id, p, qty: sellable, value: v };
  }
  return best;
}

/** Take stock (silo minus feed reserve); returns the qty actually taken. */
export function takeStock(game, id, qty) {
  const s = game.state, have = Math.max(0, (s.silo[id] || 0) - (s.feedReserve?.[id] || 0));
  const q = round2(Math.min(qty, have));
  if (q <= 0) return 0;
  s.silo[id] = round2(s.silo[id] - q);
  if (s.silo[id] <= 0) delete s.silo[id];
  return q;
}

export const unitQty = (p, q) => (p.unit === 't' ? Math.round(q * 10) / 10 : Math.round(q));
