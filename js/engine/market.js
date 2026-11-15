// Market prices: daily random walk with mild mean reversion and a seasonal sine.
import { randNormal, clamp, round2 } from './rng.js';
import { cropPriceTilt } from './seasons.js';
import { marketEventMult } from './events.js';
import { BUY_MARKUP } from './purchase.js';

export const PRICE_MIN = 0.5;
export const PRICE_MAX = 1.8;
export const MEAN_REVERSION = 0.08;
export const SEASONAL_AMP = 0.08;
export const HISTORY_DAYS = 30;

const r4 = (v) => Math.round(v * 10000) / 10000;

const LEGACY_YEAR_DAYS = 365;

/** Mean-reversion target: crops with seasons tilt cheaper in season (F5); others keep a slow sine. */
function seasonalTarget(game, p, index, day) {
  const tilt = cropPriceTilt(game, game.idx.crops.get(p.id), day);
  if (tilt != null) return p.basePrice * tilt;
  const phase = (index * 2 * Math.PI) / 7;
  return p.basePrice * (1 + SEASONAL_AMP * Math.sin((day / LEGACY_YEAR_DAYS) * 2 * Math.PI + phase));
}

export function initMarket(game) {
  const { state, data } = game;
  state.market = {};
  state.priceHistory = {};
  for (const p of data.PRODUCTS) {
    state.market[p.id] = p.basePrice;
    state.priceHistory[p.id] = [p.basePrice];
  }
}

export function stepMarket(game, day) {
  const { state, data } = game;
  data.PRODUCTS.forEach((p, i) => {
    const cur = state.market[p.id] ?? p.basePrice;
    const ev = marketEventMult(game, p.id); // active boom/crash (F5 events)
    const target = seasonalTarget(game, p, i, day) * ev;
    const drift = MEAN_REVERSION * (target - cur) / p.basePrice;
    const next = cur * (1 + drift + p.volatility * randNormal(state));
    const price = r4(clamp(next, p.basePrice * PRICE_MIN, p.basePrice * PRICE_MAX));
    state.market[p.id] = price;
    const h = (state.priceHistory[p.id] ||= []);
    h.push(price);
    if (h.length > HISTORY_DAYS) h.splice(0, h.length - HISTORY_DAYS);
  });
}

/** Keep a price inside the market band (used by boom/crash events). */
export const clampPrice = (p, v) => r4(clamp(v, p.basePrice * PRICE_MIN, p.basePrice * PRICE_MAX));

export function priceOf(game, productId) {
  return game.state.market[productId] ?? 0;
}

export function marketView(game) {
  const { state, data } = game;
  return data.PRODUCTS.map((p) => {
    const price = state.market[p.id];
    const hist = state.priceHistory[p.id] || [];
    const prev = hist.length > 1 ? hist[hist.length - 2] : price;
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      unit: p.unit,
      category: p.category,
      price,
      buyPrice: round2(price * BUY_MARKUP),
      buyable: game.idx.crops.has(p.id),
      basePrice: p.basePrice,
      ratio: round2(price / p.basePrice),
      change: prev ? round2((price - prev) / prev * 100) : 0,
      history: hist.slice(),
      stock: state.silo[p.id] || 0,
      reserve: Math.min(state.silo[p.id] || 0, state.feedReserve?.[p.id] || 0), // feed reserve sellProduct keeps
    };
  });
}
