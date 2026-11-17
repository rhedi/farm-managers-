import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { unlocksBetween } from '../js/engine/economy.js';
import { cityMult, lateNonCropBonus } from '../js/engine/logistics.js';

const P = Object.fromEntries(DATA.PRODUCTS.map((p) => [p.id, p]));
const value = (m) => Object.entries(m).reduce((s, [id, q]) => s + q * P[id].basePrice, 0);

test('v17 content unlocks at Lv 30 / 36 / 42 / 48 and shows in the level-up list', () => {
  assert.deepEqual(unlocksBetween(DATA, 29, 30).factories, ['coffee_roaster']);
  assert.deepEqual(unlocksBetween(DATA, 35, 36).animals, ['walet']);
  assert.deepEqual(unlocksBetween(DATA, 41, 42).animals, ['wagyu']);
  assert.deepEqual(unlocksBetween(DATA, 47, 48).factories, ['chocolate_factory']);
  for (const id of ['kopi_bubuk', 'chocolate']) assert.equal(P[id].category, 'processed');
  for (const id of ['sarang_walet', 'wagyu_beef']) assert.equal(P[id].category, 'animal');
});

test('recipes are valid: products exist, value-add 25–60%, chocolate needs cocoa + milk + sugar', () => {
  for (const id of ['coffee_roaster', 'chocolate_factory']) {
    const f = DATA.FACTORIES.find((x) => x.id === id);
    for (const r of f.recipes) {
      for (const p of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) assert.ok(P[p], `${id}/${r.id}: ${p}`);
      const add = value(r.outputs) / value(r.inputs) - 1;
      assert.ok(add >= 0.25 && add <= 0.6, `${r.id} +${(add * 100).toFixed(0)}%`);
    }
  }
  assert.deepEqual(Object.keys(DATA.FACTORIES.find((x) => x.id === 'chocolate_factory').recipes[0].inputs).sort(), ['cocoa', 'milk', 'sugar']);
  const g = newGame(3);
  g.state.level = 30; g.state.money = 1e7; g.state.silo.coffee = 40;
  assert.ok(g.buyFactory('coffee_roaster').ok);
  assert.ok(g.startBatch('coffee_roaster', 1).ok);
  g.advance(9);
  assert.equal(g.state.silo.kopi_bubuk, 16);
});

test('no dead zone: every 3-level window from 25 to 50 has a meaningful unlock', () => {
  const meaningful = (l) => ['CROPS', 'TREES', 'ANIMALS', 'FACTORIES', 'PONDS', 'REGIONS']
    .some((k) => (DATA[k] || []).some((x) => x.unlockLevel === l));
  for (let l = 25; l <= 48; l++) assert.ok([l, l + 1, l + 2].some(meaningful), `levels ${l}–${l + 2}`);
});

test('late animals pay back in ≈ 35–45 days (first barn, base prices); walet is light for the Gudang dingin', () => {
  for (const id of ['walet', 'wagyu']) {
    const a = DATA.ANIMALS.find((x) => x.id === id);
    const net = a.productPerDay * P[a.product].basePrice - a.feedPerDay * Math.min(...a.feedCrops.map((c) => P[c].basePrice));
    const days = (a.price + a.barnCost / a.barnCapacity) / net;
    assert.ok(days >= 35 && days <= 45, `${id} ${days.toFixed(1)} d`);
    assert.ok(a.barnCapacity * net > 5000, `${id}: one barn earns > $5k/day`);
  }
  const w = DATA.ANIMALS.find((x) => x.id === 'walet');
  assert.ok(w.barnCapacity * w.productPerDay < 20, 'kg/day per Rumah Walet');
});

test('city demand: new goods listed; non-crop city bonus grows with level, crops and buyable goods excluded', () => {
  const g = newGame(4);
  const van = DATA.CITIES.find((c) => c.id === 'vancouver');
  for (const id of ['sarang_walet', 'wagyu_beef', 'chocolate']) assert.ok(van.demand[id] > 1);
  assert.ok(DATA.CITIES.some((c) => c.demand.kopi_bubuk > 1.15));
  g.state.level = 20;
  assert.equal(lateNonCropBonus(g, 'wagyu_beef'), 0);
  g.state.level = 50;
  assert.equal(lateNonCropBonus(g, 'wagyu_beef'), DATA.BALANCE.diversify.city.max);
  assert.equal(lateNonCropBonus(g, 'wheat'), 0);
  assert.equal(lateNonCropBonus(g, 'pelet_ikan'), 0, 'buyable: buy-and-ship never profits');
  assert.equal(cityMult(g, van, 'wagyu_beef'), Math.round(1.25 * 1.15 * 1e4) / 1e4);
  assert.ok(cityMult(g, van, 'blueberry') <= DATA.BALANCE.logistics.cropCap);
});

/** Lv `lvl` farm with a cow herd and an advanced day so contract offers roll. */
function herdFarm(lvl, seed = 9) {
  const g = newGame(seed);
  g.state.level = lvl; g.state.money = 1e7;
  g.buildBarn('cows'); g.buyAnimal('cows', 20);
  g.advance(24 * 2);
  return g;
}

test('⭐ premium contracts: only non-crop goods the farm makes, better price, own active slot', () => {
  const g = herdFarm(30);
  const sp = g.contractsView().filter((c) => c.special);
  assert.equal(sp.length, 1);
  const c = sp[0];
  assert.notEqual(P[c.productId].category, 'crop');
  assert.ok(!P[c.productId].buyable);
  const m = Math.max(g.state.market[c.productId], P[c.productId].basePrice * 0.9);
  assert.ok(c.price >= m * DATA.BALANCE.diversify.special.priceMin * (1 + 0.006 * 15) - 1e-6, 'price grows with level');
  const normal = g.contractsView().filter((x) => !x.special && x.status === 'offer');
  for (const x of normal) g.acceptContract(x.id);
  assert.ok(g.acceptContract(c.id).ok, 'premium has its own slot');
  const crops = newGame(9);
  crops.state.level = 30;
  crops.advance(24 * 2);
  assert.equal(crops.contractsView().filter((x) => x.special).length, 0, 'a crop-only farm gets no premium offers');
  const low = herdFarm(10);
  assert.equal(low.contractsView().filter((x) => x.special).length, 0, `not before Lv ${DATA.BALANCE.diversify.special.fromLevel}`);
});

test('Manajer Pabrik Direktur: new hires start with 🛒 Beli bahan kurang on; the player choice wins', () => {
  const g = newGame(5);
  g.state.level = 25; g.state.money = 1e6;
  g.buyFactory('mill');
  g.hireFactoryManager('direktur');
  assert.equal(g.state.factoryManager.settings.buyInputs, true);
  g.setFactoryManagerSettings({ buyInputs: false });
  g.replaceFactoryManager('kepala'); g.replaceFactoryManager('direktur');
  assert.equal(g.state.factoryManager.settings.buyInputs, false);
});
