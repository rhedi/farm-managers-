// Storage (F8 silo + Gudang Dingin): two upgradable stores, both measured in tons.
//   silo: products with unit 't' (crops, fruit, processed goods in t);
//   cold: animal products (category 'animal'): L/kg count 1 kg per unit, pcs use PRODUCTS[].kgPerUnit.
// Processed goods in kg/pcs take no space. Both read BALANCE.storage[kind]; state.storageUpgrades[kind] = upgrades bought.
// Built capacity after n upgrades: start, then each upgrade adds max(minStep, niceCeil(stepRate × capacity)) and costs
// that step × costPerT × costGrowth^n (3 significant digits). Research perk 'silo' multiplies both capacities.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { saleCategory } from './ledger.js';
import { perk } from './research.js';
import { recordOverflow } from './overflow.js';

export const STORAGE_KINDS = ['silo', 'cold'];
const NAMES = { silo: 'Silo', cold: 'Gudang dingin' };
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const r3 = (x) => Math.round(x * 1000) / 1000;

const cfgOf = (data, kind) => data.BALANCE.storage[kind];

/** Store a product uses ('silo' | 'cold'), or null when it takes no space. `p` = PRODUCTS entry. */
export function kindOf(p) {
  if (!p) return null;
  if (p.unit === 't') return 'silo';
  return p.category === 'animal' ? 'cold' : null;
}
export const storageOf = (game, productId) => kindOf(game.idx.products.get(productId));

/** Tons one unit of a product takes in its store. */
export const tonsPerUnit = (p) => (p.unit === 't' ? 1 : (p.kgPerUnit ?? 1) / 1000);

/** Smallest 1/1.2/1.5/2/2.5/3/4/5/6/8 × 10^k ≥ x. */
function niceCeil(x) {
  const e = 10 ** Math.floor(Math.log10(x));
  return NICE.find((m) => m * e >= x - 1e-9) * e;
}
const roundCost = (x) => {
  const e = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 2);
  return Math.round(x / e) * e;
};
const stepAt = (c, cap) => Math.max(c.minStep, niceCeil(c.stepRate * cap));

/** Built capacity (t, no perk) after `n` upgrades. */
export function builtCapacity(c, n) {
  let cap = c.start;
  for (let i = 0; i < n; i++) cap += stepAt(c, cap);
  return cap;
}
/** Cost of upgrade n+1 (from n upgrades). */
export const upgradeCost = (c, n) => roundCost(stepAt(c, builtCapacity(c, n)) * c.costPerT * c.costGrowth ** n);
/** Fewest upgrades whose built capacity holds `tons` (save migration). */
export function upgradesFor(c, tons) {
  let n = 0;
  while (builtCapacity(c, n) < tons - 1e-9) n++;
  return n;
}

/** Tons of `kind` in a stock map (`products`: Map id → PRODUCTS entry). */
export function stockTons(products, stock, kind) {
  let used = 0;
  for (const [id, q] of Object.entries(stock)) {
    const p = products.get(id);
    if (kindOf(p) === kind) used += q * tonsPerUnit(p);
  }
  return r3(used);
}

const upgradesOf = (game, kind) => game.state.storageUpgrades?.[kind] ?? 0;
const perkMult = (game) => 1 + perk(game, 'silo'); // research 'Gudang Rapi' enlarges both stores
export const usedOf = (game, kind) => stockTons(game.idx.products, game.state.silo, kind);
export const capacityOf = (game, kind) => round2(builtCapacity(cfgOf(game.data, kind), upgradesOf(game, kind)) * perkMult(game));
export const freeOf = (game, kind) => Math.max(0, r3(capacityOf(game, kind) - usedOf(game, kind)));

/** UI/info view of one store. `level` is 1-based (Lv 1 = no upgrades); `step`/`nextCapacity` include the perk. */
export function storageInfo(game, kind) {
  const c = cfgOf(game.data, kind), n = upgradesOf(game, kind), m = perkMult(game);
  const used = usedOf(game, kind), capacity = round2(builtCapacity(c, n) * m);
  const nextCapacity = round2(builtCapacity(c, n + 1) * m);
  return { kind, name: NAMES[kind], level: n + 1, upgrades: n, used, capacity, free: Math.max(0, r3(capacity - used)),
    step: round2(nextCapacity - capacity), nextCapacity, nextUpgradeCost: upgradeCost(c, n), overflowRate: c.overflowRate };
}

/** Buy the next upgrade of `kind` (ledger 'gudang', capex); emits `${kind}_upgraded`. */
export function upgradeStorage(game, kind) {
  if (!STORAGE_KINDS.includes(kind)) return { ok: false, reason: 'Gudang tidak dikenal.' };
  const cost = upgradeCost(cfgOf(game.data, kind), upgradesOf(game, kind));
  if (!game.spend(cost, 'gudang')) return { ok: false, reason: 'Uang tidak cukup.' };
  const ups = (game.state.storageUpgrades ||= {});
  ups[kind] = upgradesOf(game, kind) + 1;
  const { level, capacity } = storageInfo(game, kind);
  game.emit(`${kind}_upgraded`, `${NAMES[kind]} diperbesar ke Lv ${level}: ${fmtNum(capacity)} t (${fmtMoney(cost)}).`,
    { kind, level, capacity, cost });
  return { ok: true, level, capacity, cost };
}

/** Can all of `items` ({productId: qty}) be added? Returns '' or an Indonesian reason for the first full store. */
export function roomFor(game, items) {
  const need = {};
  for (const [id, q] of Object.entries(items)) {
    const p = game.idx.products.get(id), kind = kindOf(p);
    if (kind) need[kind] = (need[kind] || 0) + q * tonsPerUnit(p);
  }
  for (const [kind, tons] of Object.entries(need)) {
    const free = freeOf(game, kind);
    if (tons > free + 1e-9) return `${NAMES[kind]} penuh: sisa ruang ${fmtNum(free)} t.`;
  }
  return '';
}

/**
 * Add `qty` (product unit) to stock. What doesn't fit its store is sold at once at overflowRate × market,
 * booked as a sale, and `${kind}_overflow {kind, productId, qty, earned}` fires. Returns { stored, overflow, earned }.
 */
export function storeProduct(game, productId, qty) {
  const { state } = game;
  const p = game.idx.products.get(productId), kind = kindOf(p);
  const room = kind ? Math.floor(freeOf(game, kind) / tonsPerUnit(p) * 100 + 1e-6) / 100 : Infinity;
  const stored = round2(Math.min(qty, room));
  const overflow = round2(qty - stored);
  if (stored > 0) state.silo[productId] = round2((state.silo[productId] || 0) + stored);
  if (!(overflow > 0)) return { stored, overflow: 0, earned: 0 };
  const rate = cfgOf(game.data, kind).overflowRate;
  const earned = round2(overflow * (state.market[productId] ?? 0) * rate);
  const st = state.stats;
  st.productsSold = round2(st.productsSold + overflow);
  st.salesValue = round2((st.salesValue || 0) + earned);
  game.earn(earned, saleCategory(game, productId));
  recordOverflow(game, kind, overflow * tonsPerUnit(p), earned, overflow * (state.market[productId] ?? 0)); // daily summary (overflow.js)
  game.emit(`${kind}_overflow`, `${NAMES[kind]} penuh! ${fmtNum(overflow)} ${p.unit} ${p.name} dijual paksa seharga ${fmtMoney(earned)} (${Math.round(rate * 100)}% harga pasar).`,
    { kind, productId, qty: overflow, earned });
  return { stored, overflow, earned };
}
