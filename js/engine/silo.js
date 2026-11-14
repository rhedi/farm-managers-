// Silo capacity (F8): only products measured in tons ('t') take silo space.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { saleCategory } from './ledger.js';

export const SILO_START = 150;
export const SILO_STEP = 200;
export const SILO_UPGRADE_COST = 3000;
export const SILO_COST_GROWTH = 1.2;
export const OVERFLOW_PRICE_RATE = 0.7;

const cfg = (game) => game.data.BALANCE.silo ?? {};
export const siloStart = (game) => cfg(game).start ?? SILO_START;
const siloStep = (game) => cfg(game).step ?? SILO_STEP;

const usesSpace = (game, productId) => game.idx.products.get(productId)?.unit === 't';

/** Tons currently stored (products with unit 't'). */
export function siloUsed(game) {
  let used = 0;
  for (const [id, q] of Object.entries(game.state.silo)) if (usesSpace(game, id)) used += q;
  return round2(used);
}

export const siloCapacity = (game) => game.state.siloCapacity ?? siloStart(game);
export const siloFree = (game) => Math.max(0, round2(siloCapacity(game) - siloUsed(game)));

/** Number of upgrades bought so far (derived from capacity). */
const upgradesDone = (game) => Math.max(0, Math.round((siloCapacity(game) - siloStart(game)) / siloStep(game)));

export function nextUpgradeCost(game) {
  const c = cfg(game);
  return Math.round((c.upgradeCost ?? SILO_UPGRADE_COST) * (c.costGrowth ?? SILO_COST_GROWTH) ** upgradesDone(game));
}

export function siloInfo(game) {
  const used = siloUsed(game), capacity = siloCapacity(game);
  return { used, capacity, free: Math.max(0, round2(capacity - used)), step: siloStep(game),
    nextUpgradeCost: nextUpgradeCost(game), upgrades: upgradesDone(game) };
}

export function upgradeSilo(game) {
  const cost = nextUpgradeCost(game);
  if (!game.spend(cost, 'gudang')) return { ok: false, reason: 'Uang tidak cukup.' };
  game.state.siloCapacity = siloCapacity(game) + siloStep(game);
  game.emit('silo_upgraded', `Silo diperbesar menjadi ${fmtNum(game.state.siloCapacity)} t (${fmtMoney(cost)}).`,
    { capacity: game.state.siloCapacity, cost });
  return { ok: true, capacity: game.state.siloCapacity, cost };
}

/** Can `qty` of a product be added? Returns '' or an Indonesian reason. */
export function roomFor(game, productId, qty) {
  if (!usesSpace(game, productId)) return '';
  const free = siloFree(game);
  return qty > free + 1e-9 ? `Silo penuh: sisa ruang ${fmtNum(free)} t.` : '';
}

/**
 * Put harvested tons in the silo. What doesn't fit is sold at once at
 * OVERFLOW_PRICE_RATE × market and a 'silo_overflow' event fires.
 * Returns { stored, overflow, earned }.
 */
export function storeHarvest(game, productId, tons) {
  const { state } = game;
  const stored = usesSpace(game, productId) ? Math.min(tons, siloFree(game)) : tons;
  const overflow = round2(tons - stored);
  if (stored > 0) state.silo[productId] = round2((state.silo[productId] || 0) + stored);
  if (!(overflow > 0)) return { stored: round2(stored), overflow: 0, earned: 0 };
  const rate = cfg(game).overflowRate ?? OVERFLOW_PRICE_RATE;
  const earned = round2(overflow * (state.market[productId] ?? 0) * rate);
  const st = state.stats;
  st.productsSold = round2(st.productsSold + overflow);
  st.salesValue = round2((st.salesValue || 0) + earned);
  game.earn(earned, saleCategory(game, productId));
  const name = game.idx.products.get(productId)?.name ?? productId;
  game.emit('silo_overflow', `Silo penuh! ${fmtNum(overflow)} t ${name} dijual paksa seharga ${fmtMoney(earned)} (${Math.round(rate * 100)}% harga pasar).`,
    { productId, qty: overflow, earned });
  return { stored: round2(stored), overflow, earned };
}
