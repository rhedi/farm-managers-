// Stock kept from automatic and bulk selling — one rule shared by plan auto-sell (harvests), the Manajer Logistik
// (dispatchableStock) and "Jual semua" (siloView `bulk`):
//   feed  = max(feed reserve, auto-feed claim: today + N days of the herds/ponds, js/engine/autoFeed.js)
//   + remaining quantity of active contracts
//   + Manajer Pabrik hold (inputs of its queued batches + a dry run of its planning, js/engine/factoryManager.js).
// Plans and "Jual semua" keep `factoryHoldHours` (24 h) of factory inputs so the manager keeps working between
// harvests; the Manajer Logistik keeps one planning interval (factoryHours 0), as before.
import { round2 } from './rng.js';
import { contractNeed } from './factoryPlanner.js';
import { factoryHold } from './factoryManager.js';
import { feedClaims } from './autoFeed.js';
import { sellProduct } from './economy.js';
import { storeProduct } from './storage.js';

export const FACTORY_HOLD_HOURS = 24;
export const holdHours = (game) => game.data.BALANCE.smartPlans?.factoryHoldHours ?? FACTORY_HOLD_HOURS;

/**
 * {productId: qty kept}, plus `parts` {feed, contract, factory} maps for the UI. `factory`: a precomputed Manajer
 * Pabrik hold (coarse offline days reuse one for a week instead of re-planning daily).
 */
export function keptStock(game, { factoryHours = holdHours(game), factory = null } = {}) {
  const s = game.state, kept = {};
  const feed = { ...(s.feedReserve || {}) };
  for (const [id, q] of Object.entries(feedClaims(game))) feed[id] = Math.max(feed[id] || 0, q);
  const contract = contractNeed(game);
  factory ??= factoryHold(game, { hours: factoryHours });
  for (const part of [feed, contract, factory]) for (const [id, q] of Object.entries(part)) if (q > 0) kept[id] = round2((kept[id] || 0) + q);
  Object.defineProperty(kept, 'parts', { value: { feed, contract, factory }, enumerable: false });
  return kept;
}

/** Stock of one product that may be sold automatically / in bulk. */
export function freeStock(game, productId, kept = keptStock(game)) {
  return Math.max(0, round2((game.state.silo[productId] || 0) - (kept[productId] || 0)));
}

/** siloView items + `kept` (feed/contract/factory stock) and `bulk` (what "Jual semua" sells). */
export function withBulk(game, view) {
  const kept = keptStock(game);
  for (const it of view.items) {
    it.kept = Math.min(it.qty, kept[it.id] || 0);
    it.bulk = freeStock(game, it.id, kept);
  }
  return view;
}

/**
 * Put a harvest away. With `sell` (plan auto-sell) the part not kept is sold at market *before* storing, so a full
 * silo never force-sells (70%) what the plan would have sold at 100%; only the kept part can overflow.
 * Returns { stored, overflow, earned (overflow sale), sold, soldValue }.
 */
export function storeHarvest(game, productId, qty, { sell = false, kept } = {}) {
  const s = game.state.silo;
  let sold = 0, soldValue = 0;
  if (sell && qty > 0) {
    s[productId] = round2((s[productId] || 0) + qty); // the harvest counts when deciding what to keep
    const q = Math.min(qty, freeStock(game, productId, kept ?? keptStock(game)));
    s[productId] = round2(s[productId] - qty + q); // only the part to sell stays above capacity, for an instant
    if (s[productId] <= 0) delete s[productId];
    if (q > 0) {
      const r = sellProduct(game, productId, q, { quiet: true, ignoreReserve: true });
      if (r.ok) { sold = r.qty; soldValue = r.earned; } else { s[productId] = round2((s[productId] || 0) - q); if (s[productId] <= 0) delete s[productId]; }
    }
  }
  const rest = round2(qty - sold);
  const st = rest > 0 ? storeProduct(game, productId, rest) : { stored: 0, overflow: 0, earned: 0 };
  return { ...st, sold, soldValue };
}
