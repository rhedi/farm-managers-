import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop } from './helpers.js';
import { loadGame } from '../js/engine.js';

const crop = () => starterCrop().id;

test('silo starts with capacity and counts only ton products', () => {
  const g = newGame(1);
  const info = g.siloInfo();
  assert.equal(info.used, 0);
  assert.ok(info.capacity >= 100);
  assert.ok(info.nextUpgradeCost > 0);
  g.state.silo[crop()] = 40;
  g.state.silo.milk = 5000; // litres don't take silo space
  assert.equal(g.siloInfo().used, 40);
});

test('starter silo holds about two starter-field harvests', () => {
  const g = newGame(2);
  const f = DATA.FIELDS.find((x) => x.id === startField());
  const tons = g.estimateYield(f.id, crop(), { fertilized: true });
  assert.ok(g.siloInfo().capacity >= 1.8 * tons, `${g.siloInfo().capacity} t vs ${tons} t per harvest`);
});

test('upgradeSilo adds capacity at a growing cost', () => {
  const g = newGame(3);
  g.state.money = 1e6;
  const { capacity, nextUpgradeCost: c1 } = g.siloInfo();
  const r = g.upgradeSilo();
  assert.equal(r.ok, true);
  assert.equal(r.cost, c1);
  assert.equal(g.siloInfo().capacity, capacity + 200);
  assert.ok(g.siloInfo().nextUpgradeCost > c1);
  g.state.money = 0;
  assert.equal(g.upgradeSilo().ok, false);
});

test('buyProduct refuses to overfill the silo', () => {
  const g = newGame(4);
  g.state.money = 1e7;
  const cap = g.siloInfo().capacity;
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
  const cap = g.siloInfo().capacity;
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
  assert.ok(g.siloInfo().used <= cap + 1e-6);
});

test('old saves get enough capacity for their stock', () => {
  const g = newGame(6);
  const s = JSON.parse(g.serialize());
  delete s.siloCapacity;
  s.silo = { [crop()]: 420 };
  const g2 = loadGame(JSON.stringify(s));
  assert.ok(g2.siloInfo().capacity >= 420);
});

test('every product has a storage category that matches how its sales are booked', async () => {
  const { saleCategory } = await import('../js/engine/ledger.js');
  const g = newGame(1);
  const LEDGER = { crop: 'penjualan_panen', animal: 'penjualan_ternak_produk', processed: 'penjualan_olahan' };
  for (const p of DATA.PRODUCTS) {
    assert.ok(p.category in LEDGER, `${p.id} has category ${p.category}`);
    assert.equal(saleCategory(g, p.id), LEDGER[p.category], p.id);
  }
  g.state.silo.wheat = 3; g.state.silo.milk = 40; g.state.silo.flour = 1;
  const cats = Object.fromEntries(g.siloView().items.map((i) => [i.id, i.category]));
  assert.deepEqual(cats, { wheat: 'crop', milk: 'animal', flour: 'processed' });
  assert.equal(g.marketView().find((p) => p.id === 'eggs').category, 'animal');
});
