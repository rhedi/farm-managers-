import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { kindOf, tonsPerUnit } from '../js/engine/storage.js';

// 🐦 Rumah Walet (sarang_walet) and 🐂 Sapi Wagyu (wagyu_beef): daily production stays in the Gudang dingin and shows in
// Gudang › Peternakan / Pasar › Jual unless the Manajer Logistik ships it — and then autoShippedView says where it went.
const W = ['sarang_walet', 'wagyu_beef'];
const P = Object.fromEntries(DATA.PRODUCTS.map((p) => [p.id, p]));
const A = Object.fromEntries(DATA.ANIMALS.map((a) => [a.id, a]));

/** Lv 44 farm (start field in Jawa Barat) with a full Rumah Walet and a full Wagyu barn, auto-feed on. */
function farm({ seed = 21, manager = false } = {}) {
  const g = newGame(seed);
  g.state.level = 44; g.state.money = 5e7;
  for (const id of ['walet', 'wagyu']) {
    assert.ok(g.buildBarn(id).ok, id);
    assert.ok(g.buyAnimal(id, A[id].barnCapacity).ok, id);
  }
  if (manager) {
    assert.ok(g.buyMachine('truk_scanya_s').ok);
    for (let i = 0; i < 3; i++) g.state.workers.push({ id: `w${g.state.nextWorkerId++}`, name: `Sopir ${i}`, skill: 0.2, wage: 80, busy: false });
    assert.ok(g.hireDispatcher('senior').ok);
    g.setDispatcherSettings({ minProfit: 0, minMargin: 0, reserveWorkers: 0 });
  }
  return g;
}
const herdOf = (productId) => DATA.ANIMALS.find((a) => a.product === productId);
const perDay = (productId) => herdOf(productId).barnCapacity * herdOf(productId).productPerDay;
const toMidnight = (g) => 24 - (g.state.time % 24);

test('data: walet + wagyu goods are cold-stored animal products weighed per kg, on the market', () => {
  for (const id of W) {
    assert.equal(P[id].category, 'animal', id);
    assert.equal(P[id].unit, 'kg', id);
    assert.equal(kindOf(P[id]), 'cold', id);
    assert.equal(tonsPerUnit(P[id]), 0.001, `${id}: 1 kg = 0,001 t`);
  }
  assert.equal(A.walet.product, 'sarang_walet');
  assert.equal(A.wagyu.product, 'wagyu_beef');
  const g = newGame(1);
  for (const id of W) assert.ok(g.marketView().some((p) => p.id === id && p.price > 0), `${id} priced in the Pasar`);
});

test('city demand: sarang walet and wagyu have premium buyers (and sell at base everywhere else)', () => {
  const buyers = (id) => DATA.CITIES.filter((c) => c.demand[id] > c.base).map((c) => c.id).sort();
  assert.deepEqual(buyers('sarang_walet'), ['hcmc', 'jakarta', 'vancouver']);
  assert.deepEqual(buyers('wagyu_beef'), ['buenosaires', 'paris', 'vancouver']);
  const jkt = DATA.CITIES.find((c) => c.id === 'jakarta');
  const g = farm();
  const r = g.cityPrices('sarang_walet').find((c) => c.cityId === 'jakarta');
  assert.ok(r && r.reachable && r.unlocked, 'Jakarta is reachable from the Jawa Barat start field');
  assert.ok(r.mult >= jkt.demand.sarang_walet, 'late-game city bonus on top of the demand');
});

test('without automation every day of walet/wagyu stays in the Gudang dingin and is sellable', () => {
  const g = farm();
  g.advance(toMidnight(g) + 1);
  const start = Object.fromEntries(W.map((id) => [id, g.state.silo[id] || 0]));
  const days = 8;
  g.advance(24 * days);
  for (const id of W) {
    const got = (g.state.silo[id] || 0) - start[id];
    assert.ok(Math.abs(got - perDay(id) * days) < perDay(id) * 0.05, `${id}: ${got} ≈ ${perDay(id) * days}`);
  }
  assert.equal(g.state.overflow.total?.cold?.tons ?? 0, 0, 'Lv 1 Gudang dingin holds it (kg weighed as kg)');
  const cold = g.storageInfo('cold');
  assert.ok(cold.used < cold.capacity);
  const items = g.siloView().items.filter((i) => W.includes(i.id));
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.equal(it.category, 'animal');
    assert.equal(it.storage, 'cold');
    assert.ok(it.sellable > 0 && it.bulk > 0, `${it.id} sellable`);
  }
  for (const id of W) assert.ok(g.marketView().find((p) => p.id === id).stock > 0, `${id} in Pasar › Jual`);
  assert.deepEqual(g.autoShippedView(), [], 'no manager, nothing shipped');
  const before = g.state.ledger.total.penjualan_ternak_produk || 0;
  const r = g.sellProduct('sarang_walet');
  assert.equal(r.ok, true);
  assert.ok(r.earned > 0);
  assert.equal(g.state.silo.sarang_walet ?? 0, 0);
  assert.ok(Math.abs((g.state.ledger.total.penjualan_ternak_produk || 0) - before - r.earned) < 0.01, 'booked as Produk ternak');
});

test('Manajer Logistik ships them at midnight: visible in autoShippedView + its product list; 📦 keeps them', () => {
  const g = farm({ manager: true });
  const trips = [];
  g.on((e) => e.type === 'auto_dispatch' && trips.push(e));
  g.advance(toMidnight(g) + 1);
  g.advance(24 * 2);
  assert.ok(trips.some((t) => t.cargo.sarang_walet > 0 && t.cargo.wagyu_beef > 0), 'the manager loads the day\'s output');
  for (const id of W) assert.equal(g.state.silo[id] ?? 0, 0, `${id} left the Gudang the hour it was made`);

  const view = g.autoShippedView();
  for (const id of W) {
    const x = view.find((v) => v.id === id);
    assert.ok(x, `${id} listed as shipped`);
    assert.equal(x.category, 'animal');
    assert.ok(x.cityName && x.qty > 0 && x.value > 0, `${id}: ${x.qty} → ${x.cityName}`);
    assert.equal(x.kept, false);
  }
  const prods = g.dispatcherView().products;
  for (const id of W) assert.ok(prods.some((p) => p.id === id && p.qty === 0), `${id} has a ✓ Kirim / 🚫 Tidak toggle at 0 stock`);

  assert.ok(g.setDispatcherSettings({ exclude: W }).ok);
  for (const id of W) assert.equal(g.autoShippedView().find((v) => v.id === id).kept, true);
  g.advance(24 * 3);
  for (const id of W) {
    assert.ok(Math.abs((g.state.silo[id] || 0) - perDay(id) * 3) < perDay(id) * 0.05, `${id} accumulates once excluded`);
    assert.ok(g.siloView().items.some((i) => i.id === id && i.sellable > 0));
  }
  assert.ok(g.sellProduct('wagyu_beef').ok);
});

test('shipped log survives save/load, ages out after 48 h, and old saves rebuild it from the recent loads', () => {
  const g = farm({ manager: true });
  g.advance(toMidnight(g) + 1);
  const g2 = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(g2.autoShippedView().map((x) => x.id).sort(), g.autoShippedView().map((x) => x.id).sort());
  const old = JSON.parse(g.serialize());
  delete old.dispatcher.shipped;
  const g3 = loadGame(JSON.stringify(old), { data: DATA });
  for (const id of W) assert.ok(g3.autoShippedView().some((x) => x.id === id), `${id} back-filled`);
  g2.fireDispatcher();
  assert.deepEqual(g2.autoShippedView(), [], 'no manager, no card');
  g3.setDispatcherOn(false);
  g3.advance(49);
  assert.deepEqual(g3.autoShippedView().filter((x) => W.includes(x.id)), [], 'older than 48 h');
});

test('⭐ premium contracts are offered for walet / wagyu output', () => {
  const g = farm();
  g.advance(24 * 2);
  const sp = g.contractsView().filter((c) => c.special);
  assert.equal(sp.length, 1);
  assert.ok(W.includes(sp[0].productId), sp[0].productId);
  assert.ok(sp[0].price > g.state.market[sp[0].productId]);
});
