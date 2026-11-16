// Peternakan ikan: UI views, pelet quotes/purchase and pond value (net worth). Rules live in fish.js.
import { round2 } from './rng.js';
import { buyProduct, BUY_MARKUP } from './purchase.js';
import { fishCfg, pondsOf, pondAccess, feedNeed, totalFeedNeed, waterGrowth, mortality, aeratorCost } from './fish.js';

const fail = (reason) => ({ ok: false, reason });

/** Pelet to buy for `days` days of all stocked ponds (rounded up to 0.01 t), or null when nothing eats. */
export function pelletQuote(game, days) {
  const id = fishCfg(game).feed, need = totalFeedNeed(game);
  days = Number(days);
  if (!(need > 0) || !(days > 0)) return null;
  const qty = Math.max(0.01, Math.ceil(round2(need * days * 100)) / 100);
  const cost = round2(qty * (game.state.market[id] ?? 0) * BUY_MARKUP);
  return { productId: id, qty, cost, affordable: cost <= game.state.money + 1e-9 };
}

/** Buy pelet for `days` days (ledger 'pakan'). */
export function buyPellet(game, days) {
  const q = pelletQuote(game, days);
  if (!q) return fail('Belum ada kolam berisi ikan.');
  return buyProduct(game, q.productId, q.qty, 'pakan');
}

/** Expected numbers for one full cycle at current market prices (UI economics + README balance). */
export function pondEconomics(game, def) {
  const m = game.state.market, pellet = (m[fishCfg(game).feed] ?? 0) * BUY_MARKUP;
  const kg = def.capacity * def.harvestKg;
  const revenue = kg * (m[def.product] ?? 0) * (1 - fishCfg(game).baseMortality) ** def.growDays;
  const feed = kg * def.fcr / 1000 * pellet;
  const fry = def.capacity * def.fryPrice;
  const water = def.waterCost * Math.floor(def.growDays * def.waterDecay / (100 - fishCfg(game).autoWaterBelow));
  const profitPerDay = (revenue - feed - fry - water) / def.growDays;
  return { kg: round2(kg), revenue: round2(revenue), feedCost: round2(feed), fryCost: round2(fry), waterCost: round2(water),
    profitPerDay: round2(profitPerDay), paybackDays: profitPerDay > 0 ? Math.ceil((def.buildCost + fry) / profitPerDay) : null };
}

/** Everything the Ternak › Peternakan Ikan section shows. */
export function fishView(game) {
  const c = fishCfg(game), s = game.state;
  const defs = (game.data.PONDS || []).map((def) => {
    const access = pondAccess(game, def);
    return { ...def, ...access, owned: pondsOf(game).filter((p) => p.pondId === def.id).length,
      aeratorCost: aeratorCost(game, def), economics: pondEconomics(game, def) };
  });
  const ponds = pondsOf(game).map((p) => {
    const def = game.idx.ponds.get(p.pondId);
    const daysLeft = p.count > 0 && p.growth < 1 ? Math.ceil((1 - p.growth) * def.growDays - 1e-9) : 0;
    return { ...p, def, product: game.idx.products.get(def.product), feedPerDay: round2(feedNeed(def, p) * 1000),
      expectedKg: round2(p.count * def.harvestKg), ready: p.count > 0 && p.growth >= 1, daysLeft,
      growthRate: round2(waterGrowth(game, p.water)), mortalityPct: round2(mortality(game, p.water, p.fed ?? 1) * 100),
      survival: p.stocked > 0 ? round2(p.count / p.stocked) : 1, waterBad: p.count > 0 && p.water < c.badWater,
      waterLow: p.water < c.goodWater, aeratorCost: aeratorCost(game, def) };
  }).filter((p) => p.def);
  const need = totalFeedNeed(game), stock = s.silo[c.feed] || 0;
  return { defs, ponds, cfg: c, pellet: { productId: c.feed, stock: round2(stock), needPerDay: round2(need * 1000) / 1000,
    daysLeft: need > 0 ? Math.floor(stock / need) : null } };
}

/** Net worth of ponds: 60% of build + aerator cost (fish in water are not counted until harvested). */
export function pondsValue(game) {
  let v = 0;
  for (const p of game.state.ponds || []) {
    const def = game.idx.ponds.get(p.pondId);
    if (def) v += 0.6 * (def.buildCost + (p.aerator ? aeratorCost(game, def) : 0));
  }
  return v;
}
