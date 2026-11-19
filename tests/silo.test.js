import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { builtCapacity, upgradeCost } from '../js/engine/storage.js';

const crop = () => starterCrop().id;
const S = DATA.BALANCE.storage;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Game at `level` with herds of `barns` full barns, fed for `feedDays`. */
function withHerds(barns, { level = 2, feedDays = 10, seed = 7 } = {}) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e7;
  for (const [id, n] of Object.entries(barns)) {
    const a = DATA.ANIMALS.find((x) => x.id === id);
    for (let i = 0; i < n; i++) assert.equal(g.buildBarn(id).ok, true);
    assert.equal(g.buyAnimal(id, a.barnCapacity * n).ok, true);
    assert.equal(g.buyFeed(id, feedDays).ok, true);
  }
  return g;
}

test('silo counts ton products, the Gudang dingin animal products by weight', () => {
  const g = newGame(1);
  const silo = g.storageInfo('silo'), cold = g.storageInfo('cold');
  assert.deepEqual([silo.level, silo.capacity, silo.used], [1, S.silo.start, 0]);
  assert.deepEqual([cold.level, cold.capacity, cold.used], [1, S.cold.start, 0]);
  g.state.silo[crop()] = 40;
  g.state.silo.flour = 2; // processed goods in t use the silo
  g.state.silo.butter = 500; // processed goods in kg take no space
  g.state.silo.milk = 5000; // 5 t
  g.state.silo.eggs = 1000; // 1000 × 60 g = 0.06 t
  g.state.silo.wool = 30;
  assert.equal(g.storageInfo('silo').used, 42);
  near(g.storageInfo('cold').used, 5.09);
  const kinds = Object.fromEntries(g.siloView().items.map((i) => [i.id, i.storage]));
  assert.deepEqual(kinds, { [crop()]: 'silo', flour: 'silo', butter: null, milk: 'cold', eggs: 'cold', wool: 'cold' });
  near(g.siloView().items.find((i) => i.id === 'eggs').tons, 0.06);
});

test('starter silo holds about two starter-field harvests', () => {
  const g = newGame(2);
  const f = DATA.FIELDS.find((x) => x.id === startField());
  const tons = g.estimateYield(f.id, crop(), { fertilized: true });
  assert.ok(g.storageInfo('silo').capacity >= 1.8 * tons, `${g.storageInfo('silo').capacity} t vs ${tons} t per harvest`);
});

test('upgrade curve: steps grow with capacity (nice numbers), cost per step grows', () => {
  const caps = Array.from({ length: 11 }, (_, n) => builtCapacity(S.silo, n));
  assert.deepEqual(caps, [150, 350, 550, 850, 1350, 2150, 3350, 5350, 8350, 13350, 21350]);
  assert.deepEqual([0, 1, 2, 3].map((n) => upgradeCost(S.silo, n)), [3000, 3150, 4960, 8680]);
  assert.deepEqual(Array.from({ length: 6 }, (_, n) => builtCapacity(S.cold, n)), [10, 20, 30, 45, 70, 110]);
  assert.deepEqual([0, 1, 2].map((n) => upgradeCost(S.cold, n)), [5000, 5250, 8270]);
  for (const c of [S.silo, S.cold]) {
    for (let n = 1; n < 20; n++) {
      const step = builtCapacity(c, n + 1) - builtCapacity(c, n), prev = builtCapacity(c, n) - builtCapacity(c, n - 1);
      assert.ok(step >= prev, `step ${n}`);
      assert.ok(upgradeCost(c, n) > upgradeCost(c, n - 1), `cost ${n}`);
      assert.ok(step <= 0.6 * builtCapacity(c, n) || step === c.minStep, `step ${n} ≤ 60% of capacity`);
    }
  }
});

test('late game: about a dozen silo upgrades hold 1.5 cycles of 1000 ha mixed crops', () => {
  const ha = 1000, tPerHa = 15 * 1.1 * 1.25; // average crop yield, loam, fertilized
  let n = 0, spent = 0;
  while (builtCapacity(S.silo, n) < 1.5 * ha * tPerHa) spent += upgradeCost(S.silo, n++);
  assert.ok(n >= 10 && n <= 13, `${n} upgrades`);
  assert.ok(spent < 1e6, `$${spent}`); // ≈ 10% of the land price (≈ $7.5M for 1000 ha)
});

test('upgradeStorage adds the next step at its cost, booked as capex', () => {
  const g = newGame(3);
  g.state.money = 1e6;
  for (const kind of ['silo', 'cold']) {
    const before = g.storageInfo(kind);
    const evs = [];
    const off = g.on((e) => e.type === `${kind}_upgraded` && evs.push(e));
    const r = g.upgradeStorage(kind);
    assert.equal(r.ok, true);
    assert.equal(r.cost, before.nextUpgradeCost);
    assert.equal(r.capacity, before.nextCapacity);
    const after = g.storageInfo(kind);
    assert.deepEqual([after.level, after.capacity], [2, before.capacity + before.step]);
    assert.ok(after.nextUpgradeCost > before.nextUpgradeCost);
    assert.equal(evs.length, 1);
    off?.();
  }
  assert.equal(g.state.ledger.total.gudang, 3000 + 5000);
  assert.equal(g.upgradeStorage('attic').ok, false);
  g.state.money = 0;
  assert.equal(g.upgradeStorage('silo').ok, false);
  assert.equal(g.storageInfo('silo').level, 2);
});

test('buyProduct refuses to overfill the silo', () => {
  const g = newGame(4);
  g.state.money = 1e7;
  const cap = g.storageInfo('silo').capacity;
  const r = g.buyProduct(crop(), cap + 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Silo penuh/);
  assert.equal(g.buyProduct(crop(), cap).ok, true);
  assert.equal(g.buyProduct(crop(), 0.01).ok, false);
});

test('harvest overflow is force-sold at 70% of market with an event', () => {
  const g = newGame(5);
  const fid = startField();
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: crop() });
  g.advance(starterCrop().growDays * 24);
  const cap = g.storageInfo('silo').capacity;
  const filler = DATA.CROPS.find((c) => c.id !== crop()).id;
  g.state.silo[filler] = cap - 1; // only 1 t of room left
  const evs = [];
  g.on((e) => e.type === 'silo_overflow' && evs.push({ ...e, price: g.state.market[e.productId] }));
  g.state.money = 1e6;
  runTask(g, fid, 'harvest', { rent: true });
  assert.equal(evs.length, 1);
  const ev = evs[0];
  assert.equal(ev.productId, crop());
  assert.ok(ev.qty > 0 && ev.earned > 0);
  assert.ok(Math.abs(ev.earned - ev.qty * ev.price * 0.7) < 0.02);
  assert.ok(Math.abs(g.state.silo[crop()] - 1) < 1e-6);
  assert.ok(g.storageInfo('silo').used <= cap + 1e-6);
});

test('a first cow + chicken barn never fills the Gudang dingin in the first week', () => {
  const g = withHerds({ chickens: 1, cows: 1 });
  const evs = [];
  g.on((e) => e.type === 'cold_overflow' && evs.push(e));
  g.advance(24 * 7);
  assert.equal(evs.length, 0);
  const cold = g.storageInfo('cold');
  assert.ok(cold.used > 2 && cold.used < cold.capacity, `${cold.used} / ${cold.capacity} t`);
});

test('animal products that do not fit the Gudang dingin are force-sold at 70% with an event', () => {
  const g = withHerds({ cows: 1 });
  const cap = g.storageInfo('cold').capacity;
  g.state.silo.milk = cap * 1000 - 100; // room for 100 L
  const evs = [];
  g.on((e) => e.type === 'cold_overflow' && evs.push({ ...e, price: g.state.market[e.productId] }));
  const before = g.state.ledger.total.penjualan_ternak_produk || 0;
  g.advance(24);
  assert.equal(evs.length, 1);
  const ev = evs[0];
  assert.equal(ev.kind, 'cold');
  assert.equal(ev.productId, 'milk');
  assert.ok(ev.qty > 100 && ev.earned > 0);
  delete g.state.saturation.milk; // 📉 the quote for this sale = from zero pressure (the overflow was the only sale)
  near(ev.earned, ev.qty * ev.price * 0.7 * g.saleQuote('milk', ev.qty).mult, 0.1); // quote mult is rounded to 4 decimals
  near(g.state.silo.milk, cap * 1000, 1e-6);
  near((g.state.ledger.total.penjualan_ternak_produk || 0) - before, ev.earned, 0.01);
  assert.match(ev.msg, /Gudang dingin penuh! [\d.,]+ L Susu dijual paksa/);
});

test('old saves: silo upgrades map to the new curve without losing capacity; cold store fits the animal stock', () => {
  const g = newGame(6);
  const old = (patch) => {
    const s = JSON.parse(g.serialize());
    delete s.storageUpgrades;
    return loadGame(JSON.stringify({ ...s, ...patch }));
  };
  // Pre-F8 save (no capacity) with 420 t in stock.
  const g1 = old({ silo: { [crop()]: 420 } });
  assert.ok(g1.storageInfo('silo').capacity >= 420);
  // F8 save with 4 old upgrades (150 + 4 × 200 = 950 t) → Lv 5 (1350 t); siloCapacity is dropped.
  const g2 = old({ siloCapacity: 950, silo: { milk: 25000, eggs: 2000 } });
  assert.deepEqual([g2.storageInfo('silo').level, g2.storageInfo('silo').capacity], [5, 1350]);
  assert.equal('siloCapacity' in g2.state, false);
  // 25.12 t of animal products → Lv 3 (30 t), the first level that holds them.
  assert.deepEqual([g2.storageInfo('cold').level, g2.storageInfo('cold').capacity], [3, 30]);
  assert.equal(old({ siloCapacity: 150, silo: {} }).storageInfo('cold').level, 1);
  // Levels survive a save/load round trip.
  const g3 = loadGame(g2.serialize());
  assert.deepEqual(g3.state.storageUpgrades, { silo: 4, cold: 2 });
});

test('research Gudang Rapi enlarges both stores', () => {
  const g = newGame(8);
  const base = { silo: g.storageInfo('silo'), cold: g.storageInfo('cold') };
  g.state.research.unlocked.push('bisnis_gudang');
  for (const kind of ['silo', 'cold']) {
    const info = g.storageInfo(kind);
    near(info.capacity, base[kind].capacity * 1.1, 0.01);
    near(info.nextCapacity, base[kind].nextCapacity * 1.1, 0.01);
  }
});

test('every product has a storage category that matches how its sales are booked', async () => {
  const { saleCategory } = await import('../js/engine/ledger.js');
  const g = newGame(1);
  const LEDGER = { crop: 'penjualan_panen', animal: 'penjualan_ternak_produk', processed: 'penjualan_olahan' };
  for (const p of DATA.PRODUCTS) {
    assert.ok(p.category in LEDGER, `${p.id} has category ${p.category}`);
    assert.equal(saleCategory(g, p.id), LEDGER[p.category], p.id);
    if (p.unit === 'pcs') assert.ok(p.kgPerUnit > 0, `${p.id} has a weight per piece`);
  }
  g.state.silo.wheat = 3; g.state.silo.milk = 40; g.state.silo.flour = 1;
  const cats = Object.fromEntries(g.siloView().items.map((i) => [i.id, i.category]));
  assert.deepEqual(cats, { wheat: 'crop', milk: 'animal', flour: 'processed' });
  assert.equal(g.marketView().find((p) => p.id === 'eggs').category, 'animal');
});
