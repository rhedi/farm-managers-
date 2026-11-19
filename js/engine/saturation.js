// 📉 Pasar jenuh (v17 balance): selling a lot of one animal, fish or processed product in a short time pushes its
// local price down. Crops and buyable goods (pelet) never saturate.
// state.saturation[productId] = { p /* pressure: recent units sold */, day /* last game day with a sale */ }.
// Every sold unit adds to p; each daily rollover keeps `carry` of it (≈ 2–3 days to recover).
// dip(p) = min(maxDip, p / depthUnits), depthUnits = depth$(level) / basePrice, where depth$ is log-interpolated
// from BALANCE.market.saturation.depth [[level, $]]: the market grows with the player's level. Selling q units
// earns the average multiplier over [p, p + q], so dumping a big stock at once costs more than selling it over days.
import { round2 } from './rng.js';

const cfgOf = (game) => game.data.BALANCE.market?.saturation ?? null;
const r4 = (v) => Math.round(v * 10000) / 10000;

/** True when selling `productId` moves its price (animal, fish and processed goods that can't be bought). */
export function saturates(game, productId) {
  const p = game.idx.products.get(productId);
  return !!(cfgOf(game) && p && p.category !== 'crop' && !p.buyable && !game.idx.crops.has(productId));
}

/**
 * Market depth in $/day at base price for the current level (log-interpolated keypoints). v20: `animalDepth` keypoints
 * (Lv 50+) replace `depth` for animal and fish goods (category 'animal') above their first level, so the herd/pond
 * market grows slower than the processed one in Lv 51–100 (growth brake; Lv ≤ 50 unchanged).
 */
export function depthValue(game, level = game.state.level, productId = null) {
  const cfg = cfgOf(game), late = cfg?.animalDepth;
  const animal = productId && late?.length && level > late[0][0] && game.idx.products.get(productId)?.category === 'animal';
  const pts = (animal ? late : cfg?.depth) ?? [];
  if (!pts.length) return Infinity;
  if (level <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [l1, v1] = pts[i];
    if (level <= l1) {
      const [l0, v0] = pts[i - 1];
      return v0 * (v1 / v0) ** ((level - l0) / (l1 - l0));
    }
  }
  return pts[pts.length - 1][1];
}

const depthUnits = (game, productId) => depthValue(game, game.state.level, productId) / (game.idx.products.get(productId)?.basePrice || 1);
const pressureOf = (game, productId) => game.state.saturation?.[productId]?.p ?? 0;

/** Average dip over selling `q` units starting at pressure `p0` (linear up to maxDip, flat after). */
function avgDip(p0, q, D, maxDip) {
  if (!(q > 0)) return Math.min(maxDip, p0 / D);
  const k = maxDip * D; // pressure where the dip reaches its cap
  const a = Math.min(p0, k), b = Math.min(p0 + q, k);
  const linear = (b * b - a * a) / (2 * D);
  const capped = maxDip * Math.max(0, p0 + q - Math.max(p0, k));
  return (linear + capped) / q;
}

/**
 * Price effect of selling `qty` now: `{ qty, dip (current, 0–1), dipAfter, mult (average price factor),
 * price (average unit price), value, recoverDays, today (dip comes from today's sales) }`.
 * `steady: true` = the average day when `qty` is sold every day (pressure carried from earlier days).
 */
export function saleQuote(game, productId, qty = 0, { steady = false } = {}) {
  const c = cfgOf(game), market = game.state.market[productId] ?? 0;
  qty = Math.max(0, Number(qty) || 0);
  if (!saturates(game, productId)) {
    return { qty, dip: 0, dipAfter: 0, mult: 1, price: market, value: round2(qty * market), recoverDays: 0, today: false };
  }
  const D = depthUnits(game, productId);
  const p0 = steady ? qty * c.carry / (1 - c.carry) : pressureOf(game, productId);
  const dip = Math.min(c.maxDip, p0 / D);
  const dipAfter = Math.min(c.maxDip, (p0 + qty) / D);
  const mult = 1 - avgDip(p0, qty, D, c.maxDip);
  const recoverDays = dip > 0.01 ? Math.ceil(Math.log(0.01 / dip) / Math.log(c.carry)) : 0;
  return { qty, dip: r4(dip), dipAfter: r4(dipAfter), mult: r4(mult), price: round2(market * mult),
    value: round2(qty * market * mult), recoverDays, today: game.state.saturation?.[productId]?.day === game.day };
}

/** Book a sale of `qty` units: returns the average price factor and adds the units to the pressure. */
export function takeSale(game, productId, qty) {
  if (!(qty > 0) || !saturates(game, productId)) return 1;
  const c = cfgOf(game), D = depthUnits(game, productId);
  const p0 = pressureOf(game, productId);
  const mult = 1 - avgDip(p0, qty, D, c.maxDip);
  const s = (game.state.saturation ||= {});
  s[productId] = { p: r4(p0 + qty), day: game.day };
  return mult;
}

/** Daily rollover: every product keeps `carry` of its pressure; tiny leftovers are dropped. */
export function stepSaturationDay(game) {
  const s = game.state.saturation, c = cfgOf(game);
  if (!s || !c) return;
  for (const [id, e] of Object.entries(s)) {
    const p = r4(e.p * c.carry);
    if (!game.idx.products.has(id) || p < depthUnits(game, id) * 0.001) delete s[id];
    else e.p = p;
  }
}
