import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { saleCategory } from '../js/engine/ledger.js';

const pond = (id) => DATA.PONDS.find((p) => p.id === id);
const C = DATA.FISH_BALANCE;
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≈ ${b}`);

/** Rich game at `level` with one built pond; `stock` fills it with benih. */
function pondGame(id = 'lele', { level = 50, stock = true, pellet = 0, seed = 7 } = {}) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e7;
  const r = g.buildPond(id);
  assert.equal(r.ok, true, r.reason);
  if (stock) assert.equal(g.stockPond(r.uid).ok, true);
  if (pellet) g.state.silo[C.feed] = pellet;
  return { g, uid: r.uid, p: () => g.state.ponds.find((x) => x.uid === r.uid), def: pond(id) };
}
const day = (g, n = 1) => g.advance(24 * n);

test('pond data: products are cold-store animal goods, booked as animal income', () => {
  const g = newGame(1);
  for (const d of DATA.PONDS) {
    const prod = DATA.PRODUCTS.find((x) => x.id === d.product);
    assert.ok(prod, d.id);
    assert.equal(prod.category, 'animal');
    assert.equal(prod.unit, 'kg');
    assert.equal(saleCategory(g, d.product), 'penjualan_ternak_produk', d.id);
  }
  assert.equal(saleCategory(g, C.feed), 'penjualan_olahan', 'pelet is a processed feed good');
});

test('unlock gating: level first, then a tropical / cold field until anyRegionLevel', () => {
  const g = newGame(2);
  g.state.money = 1e7;
  assert.match(g.buildPond('lele').reason, /level 3/);
  g.state.level = 3;
  assert.equal(g.buildPond('lele').ok, true);
  // Tambak Udang: the starting field (Jawa Barat) is tropical
  g.state.level = 12;
  assert.equal(g.fishView().defs.find((d) => d.id === 'udang').unlocked, true);
  const f1 = g.state.fields.f1;
  delete g.state.fields.f1;
  const r = g.buildPond('udang');
  assert.equal(r.ok, false);
  assert.match(r.reason, /tropis/);
  g.state.fields.f1 = f1;
  assert.equal(g.buildPond('udang').ok, true);
  // Keramba Salmon needs a cold region (Hokkaido) — or level anyRegionLevel
  g.state.level = 22;
  assert.match(g.buildPond('salmon').reason, /dingin/);
  assert.equal(g.buyField('f17').ok, true);
  assert.equal(g.buildPond('salmon').ok, true);
  const h = newGame(3);
  h.state.money = 1e7; h.state.level = pond('salmon').anyRegionLevel;
  assert.equal(h.buildPond('salmon').ok, true, 'level gate lifts the climate requirement');
  assert.equal(g.fishView().defs.find((d) => d.id === 'salmon').owned, 1);
});

test('building and stocking cost money, book kolam / benih_ikan, and stocking needs an empty pond', () => {
  const { g, uid, p, def } = pondGame('nila', { stock: false });
  assert.equal(g.state.ledger.total.kolam, def.buildCost);
  const before = g.state.money;
  assert.equal(g.stockPond(uid, def.capacity + 1).ok, false);
  assert.equal(g.stockPond(uid, 1000).ok, true);
  near(g.state.money, before - 1000 * def.fryPrice, 1e-6);
  near(g.state.ledger.total.benih_ikan, 1000 * def.fryPrice);
  assert.equal(p().count, 1000);
  assert.match(g.stockPond(uid).reason, /berisi/);
  const poor = newGame(4);
  poor.state.level = 3; poor.state.money = pond('lele').buildCost;
  const r = poor.buildPond('lele');
  assert.equal(poor.stockPond(r.uid).ok, false, 'no money left for benih');
  assert.equal(poor.state.ponds[0].count, 0);
});

test('fish eat pelet from the silo each day: count × harvestKg × fcr / growDays kg', () => {
  const { g, p, def } = pondGame('lele', { pellet: 5 });
  g.setAutoFeed({ fish: false }); // 🛒 auto-feed (on by default) would top the pelet up
  const n = p().count;
  day(g);
  near(g.state.silo[C.feed], 5 - n * def.harvestKg * def.fcr / def.growDays / 1000, 1e-5);
  assert.equal(p().fed, 1);
  const growth = p().growth;
  near(growth, 1 / def.growDays, 1e-3, 'full growth step while fed and water is good');
  delete g.state.silo[C.feed];
  day(g);
  assert.equal(p().fed, 0);
  assert.equal(p().growth, growth, 'no pelet → no growth');
  assert.equal(p().alert, 'hungry');
});

test('kualitas air decays daily, the aerator halves it, ganti air restores it (and costs money)', () => {
  const { g, uid, p, def } = pondGame('lele', { pellet: 5 });
  day(g);
  assert.equal(p().water, 100 - def.waterDecay);
  assert.equal(g.buyAerator(uid).ok, true);
  near(g.state.ledger.total.kolam, def.buildCost * (1 + C.aeratorRate), 0.01);
  day(g);
  assert.equal(p().water, 100 - def.waterDecay * (1 + C.aeratorDecay));
  const m = g.state.money;
  assert.equal(g.changeWater(uid).ok, true);
  assert.equal(p().water, 100);
  assert.equal(g.state.money, m - def.waterCost);
  assert.equal(g.changeWater(uid).ok, false, 'clean water needs no change');
});

test('bad water slows growth and kills fish; good water keeps mortality at the base rate', () => {
  const good = pondGame('lele', { pellet: 5 });
  good.g.setPondAuto(good.uid, { water: true });
  const bad = pondGame('lele', { pellet: 5 });
  bad.p().water = 20;
  const n = bad.p().count;
  day(bad.g);
  const w = 20 - bad.def.waterDecay;
  const rate = C.baseMortality + C.badWaterMortality * (C.badWater - w) / C.badWater;
  assert.equal(bad.p().count, n - Math.round(n * rate));
  assert.equal(bad.p().alert, 'water');
  day(good.g, 6);
  day(bad.g, 5);
  assert.ok(good.p().water >= C.autoWaterBelow - good.def.waterDecay, 'auto ganti air kept the water up');
  assert.ok(good.g.state.ledger.total.air_kolam > 0);
  assert.ok(bad.p().growth < good.p().growth - 0.1, `slower growth ${bad.p().growth} vs ${good.p().growth}`);
  assert.ok(bad.p().count < good.p().count * 0.8, 'bad water killed far more fish');
  near(good.p().count / n, (1 - C.baseMortality) ** 6, 0.01);
});

test('harvest: only when grown, count × harvestKg kg into the Gudang dingin, XP, pond empties', () => {
  const { g, uid, p, def } = pondGame('lele', { pellet: 5 });
  g.setPondAuto(uid, { water: true });
  day(g, def.growDays - 1);
  assert.match(g.harvestPond(uid).reason, /belum siap/);
  day(g);
  assert.equal(p().growth, 1);
  const fish = p().count, xp = g.state.xp;
  const r = g.harvestPond(uid);
  assert.equal(r.ok, true);
  near(r.kg, fish * def.harvestKg, 0.01);
  near(g.state.silo[def.product], r.kg, 0.01);
  near(g.storageInfo('cold').used, r.kg / 1000, 0.002);
  assert.ok(g.state.xp > xp);
  assert.deepEqual([p().count, p().growth, p().water], [0, 0, 100]);
  assert.equal(g.harvestPond(uid).ok, false);
  const sold = g.sellProduct(def.product, r.kg);
  assert.equal(sold.ok, true);
  near(g.state.ledger.total.penjualan_ternak_produk, sold.earned, 0.01, 'fish sales count as animal income');
});

test('harvest overflow: what the Gudang dingin cannot hold is sold at the overflow rate', () => {
  const { g, uid, p, def } = pondGame('salmon', { pellet: 50 });
  p().growth = 1;
  const cold = g.storageInfo('cold');
  g.state.silo.milk = (cold.capacity - 1) * 1000; // 1 t free
  const kg = p().count * def.harvestKg;
  const price = g.state.market[def.product], mult = g.saleQuote(def.product, kg - 1000).mult; // 📉 pasar jenuh
  const r = g.harvestPond(uid);
  near(r.stored, 1000, 1);
  near(r.overflow, kg - 1000, 1);
  near(r.earned, (kg - 1000) * price * mult * cold.overflowRate, 1);
  near(g.state.ledger.total.penjualan_ternak_produk, r.earned, 0.01);
});

test('grown ponds left alone are harvested automatically and restocked when the toggle is on', () => {
  const { g, uid, p, def } = pondGame('lele', { pellet: 5 });
  g.setPondAuto(uid, { water: true, restock: true });
  const evs = [];
  g.on((e) => e.type === 'fish_harvest' && evs.push(e));
  day(g, def.growDays + C.autoHarvestDays);
  assert.equal(evs.length, 1);
  assert.ok(g.state.silo[def.product] > 0);
  assert.equal(p().count, def.capacity, 'restocked');
  assert.ok(p().growth < 0.2);
});

test('pelet: quote covers all stocked ponds, bought from the Pasar at ×1.2 as pakan; factory recipe exists', () => {
  const { g, def, p } = pondGame('lele');
  const q = g.pelletQuote(7);
  near(q.qty, Math.ceil(p().count * def.harvestKg * def.fcr / def.growDays * 7 / 10) / 100, 0.011);
  const r = g.buyPellet(7);
  assert.equal(r.ok, true);
  near(g.state.silo[C.feed], q.qty, 1e-6);
  near(g.state.ledger.total.pakan, q.cost, 0.01);
  assert.equal(g.marketView().find((m) => m.id === C.feed).buyable, true);
  assert.equal(g.buyProduct(C.feed, 1).ok, true);
  assert.equal(g.buyProduct('ikan_lele', 1).ok, false, 'fish cannot be bought back');
  assert.ok(DATA.FACTORIES.some((f) => f.recipes.some((rc) => rc.outputs[C.feed] > 0)));
  assert.equal(newGame(5).pelletQuote(3), null, 'no fish, nothing to buy');
});

test('save/load keeps ponds; old saves without ponds migrate to an empty list', () => {
  const { g, uid } = pondGame('nila', { pellet: 5 });
  g.buyAerator(uid);
  g.setPondAuto(uid, { water: true });
  day(g, 3);
  const back = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(back.state.ponds, g.state.ponds);
  assert.equal(back.buildPond('nila').uid, 'k2', 'uids continue');
  const old = JSON.parse(newGame(6).serialize());
  delete old.ponds; delete old.nextPondUid;
  const o = loadGame(JSON.stringify(old), { data: DATA });
  assert.deepEqual(o.state.ponds, []);
  o.state.level = 3;
  assert.equal(o.buildPond('lele').uid, 'k1');
  day(o, 2); // daily step runs on migrated state
});

test('level-up unlocks list ponds; net worth counts ponds', async () => {
  const { unlocksBetween, netWorth } = await import('../js/engine/economy.js');
  assert.deepEqual(unlocksBetween(DATA, 2, 3).ponds, ['lele']);
  assert.deepEqual(unlocksBetween(DATA, 11, 22).ponds.sort(), ['mas', 'salmon', 'udang']);
  const g = newGame(8);
  g.state.level = 3;
  const before = netWorth(g);
  g.buildPond('lele');
  near(netWorth(g), before - pond('lele').buildCost * 0.4, 0.01);
});

test('fish sell like milk: market sale, contracts for owned ponds, city demand on trucks', async () => {
  const { stepContractsDay, acceptContract, deliverContract } = await import('../js/engine/contracts.js');
  const { cityMult } = await import('../js/engine/logistics.js');
  const { g } = pondGame('lele', { level: 5, stock: false });
  const L = () => g.state.ledger.total;
  // Pasar › Jual
  g.state.silo.ikan_lele = 500;
  const t0 = L().penjualan_ternak_produk || 0, mult = g.saleQuote('ikan_lele', 100).mult; // 📉 pasar jenuh
  const r = g.sellProduct('ikan_lele', 100);
  assert.equal(r.ok, true, r.reason);
  near((L().penjualan_ternak_produk || 0) - t0, 100 * g.state.market.ikan_lele * mult, 0.01);
  // Kontrak: a built pond makes its species a contract candidate (was herds/crops only)
  let c;
  for (let i = 0; i < 200 && !c; i++) {
    g.state.contracts = [];
    stepContractsDay(g);
    c = g.state.contracts.find((x) => x.productId === 'ikan_lele');
  }
  assert.ok(c, 'a lele contract is offered');
  assert.equal(acceptContract(g, c.id).ok, true);
  g.state.silo.ikan_lele = c.qty;
  const k0 = L().kontrak || 0;
  const d = deliverContract(g, c.id);
  assert.equal(d.done, true, d.reason);
  near((L().kontrak || 0) - k0, c.value, 0.01);
  // Kirim: cities pay a premium for fish like for milk
  for (const id of ['ikan_lele', 'ikan_nila', 'ikan_mas', 'udang', 'salmon']) {
    assert.ok(DATA.CITIES.some((city) => cityMult(g, city, id) > (city.base ?? 1)), `${id} has city demand`);
  }
  const jakarta = DATA.CITIES.find((x) => x.id === 'jakarta');
  assert.ok(cityMult(g, jakarta, 'ikan_lele') > jakarta.base);
});
