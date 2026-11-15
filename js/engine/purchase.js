// Buying crops from the market (animal feed or stock).
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { roomFor } from './storage.js';
import { breedingMods } from './breeding.js';

export const BUY_MARKUP = 1.2;

const fail = (reason) => ({ ok: false, reason });
const buyPriceOf = (game, productId) => (game.state.market[productId] ?? 0) * BUY_MARKUP;

/** `category`: ledger id ('pembelian_produk'; buyFeed books 'pakan'). */
export function buyProduct(game, productId, qty, category = 'pembelian_produk') {
  const p = game.idx.products.get(productId);
  if (!p) return fail('Produk tidak ditemukan.');
  if (!game.idx.crops.has(productId)) return fail(`${p.name} tidak bisa dibeli.`);
  qty = round2(Number(qty));
  if (!(qty > 0)) return fail('Jumlah tidak valid.');
  const full = roomFor(game, { [productId]: qty });
  if (full) return fail(full);
  const cost = round2(qty * buyPriceOf(game, productId));
  if (!game.spend(cost, category)) return fail('Uang tidak cukup.');
  const s = game.state.silo;
  s[productId] = Math.round(((s[productId] || 0) + qty) * 1e6) / 1e6;
  game.emit('purchase', `Membeli ${fmtNum(qty)} ${p.unit} ${p.name} seharga ${fmtMoney(cost)}.`, { productId, qty, cost });
  return { ok: true, cost, qty };
}

/** Cheapest accepted feed crop and the amount needed for `days` days, or null. */
function planFeed(game, animalId, days) {
  const a = game.idx.animals.get(animalId);
  if (!a) return { error: 'Hewan tidak ditemukan.' };
  const herd = game.state.animals[animalId];
  const count = herd?.count || 0;
  if (!(count > 0)) return { error: 'Belum ada ternak.' };
  days = Number(days);
  if (!(days > 0)) return { error: 'Jumlah hari tidak valid.' };
  const crops = a.feedCrops.filter((c) => game.idx.crops.has(c) && game.state.market[c] != null);
  if (!crops.length) return { error: 'Tidak ada pakan yang bisa dibeli.' };
  const productId = crops.reduce((best, c) => (game.state.market[c] < game.state.market[best] ? c : best));
  // Round up to 0.01 t so the herd is fully fed for the whole period.
  const qty = Math.max(0.01, Math.ceil(round2(count * a.feedPerDay * breedingMods(game, a, herd).feed * days * 100)) / 100);
  return { productId, qty, cost: round2(qty * buyPriceOf(game, productId)) };
}

export function feedQuote(game, animalId, days) {
  const plan = planFeed(game, animalId, days);
  if (plan.error) return null;
  const p = game.idx.products.get(plan.productId);
  return { productId: plan.productId, name: p.name, qty: plan.qty, cost: plan.cost,
    affordable: plan.cost <= game.state.money + 1e-9 };
}

export function buyFeed(game, animalId, days) {
  const plan = planFeed(game, animalId, days);
  if (plan.error) return fail(plan.error);
  const r = buyProduct(game, plan.productId, plan.qty, 'pakan');
  return r.ok ? { ok: true, productId: plan.productId, qty: r.qty, cost: r.cost } : r;
}
