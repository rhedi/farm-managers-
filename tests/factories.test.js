import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';

const P = Object.fromEntries(DATA.PRODUCTS.map((p) => [p.id, p]));
const mill = () => DATA.FACTORIES.find((f) => f.id === 'mill');

/** Rich game at `level` that owns the mill with plenty of wheat. */
function withMill(seed = 1, wheat = 50) {
  const g = newGame(seed);
  g.state.level = 11;
  g.state.money = 1e6;
  g.state.storageUpgrades.silo = 4; // 1350 t
  assert.equal(g.buyFactory('mill').ok, true);
  g.state.silo.wheat = wheat;
  return g;
}

test('factory data: unlock levels, products exist, value-add 25–60%', () => {
  assert.deepEqual(DATA.FACTORIES.map((f) => f.unlockLevel), [11, 13, 15, 18, 19, 21, 24]);
  for (const f of DATA.FACTORIES) for (const r of f.recipes) {
    const val = (m) => Object.entries(m).reduce((s, [id, q]) => { assert.ok(P[id], `${f.id}/${r.id}: ${id}`); return s + q * P[id].basePrice; }, 0);
    const add = val(r.outputs) / val(r.inputs) - 1;
    assert.ok(add >= 0.25 && add <= 0.6, `${f.id}/${r.id} value-add ${add}`);
  }
});

test('buyFactory is gated by level and money', () => {
  const g = newGame(2);
  g.state.money = 1e6;
  const r = g.buyFactory('mill');
  assert.equal(r.ok, false);
  assert.match(r.reason, /level 11/);
  g.state.level = 11;
  assert.equal(g.buyFactory('dairy').ok, false);
  const money = g.state.money;
  assert.equal(g.buyFactory('mill').ok, true);
  assert.equal(g.state.money, money - mill().price);
  assert.equal(g.buyFactory('mill').ok, false);
  const v = g.factoriesView();
  assert.deepEqual(v.map((f) => [f.id, f.owned, f.level]).slice(0, 2), [['mill', true, 1], ['dairy', false, 0]]);
});

test('a batch consumes inputs at once and produces outputs after its hours', () => {
  const g = withMill(3, 25);
  const events = [];
  g.on((e) => events.push(e));
  const xp = g.state.xp;
  assert.equal(g.startBatch('mill', 1).ok, true);
  assert.equal(g.state.silo.wheat, 15);
  g.advance(5);
  assert.equal(g.state.silo.flour ?? 0, 0, 'not done before 6 hours');
  g.advance(1);
  assert.equal(g.state.silo.flour, 7.5);
  const done = events.filter((e) => e.type === 'factory_done');
  assert.deepEqual(done.map((e) => [e.factoryId, e.productId, e.qty]), [['mill', 'flour', 7.5]]);
  assert.ok(g.state.xp > xp);
  g.advance(24);
  assert.equal(g.state.silo.wheat, 15, 'manual mode stops after the queued batch');
  assert.equal(g.factoriesView()[0].running, false);
});

test('blocked when inputs are missing (feed reserve kept) or the silo is full', () => {
  const g = withMill(4, 8);
  const r = g.startBatch('mill', 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Bahan kurang/);
  g.state.silo.wheat = 12;
  g.setFeedReserve('wheat', 5);
  assert.equal(g.startBatch('mill', 1).ok, false, 'reserve is not processed');
  g.setFeedReserve('wheat', 0);
  const blocked = [];
  g.on((e) => e.type === 'factory_blocked' && blocked.push(e));
  assert.equal(g.startBatch('mill', 1).ok, true);
  g.state.silo.corn = g.storageInfo('silo').free; // fill the silo while milling
  g.advance(12);
  assert.equal(g.state.silo.flour ?? 0, 0);
  assert.equal(blocked.length, 1, 'blocked emitted once');
  assert.match(g.factoriesView()[0].blocked, /Silo penuh/);
  g.state.silo.corn -= 10;
  g.advance(1);
  assert.equal(g.state.silo.flour, 7.5);
  assert.equal(g.factoriesView()[0].blocked, null);
});

test('auto mode loops until inputs run out, then reports why', () => {
  const g = withMill(5, 35);
  const blocked = [];
  g.on((e) => e.type === 'factory_blocked' && blocked.push(e));
  assert.equal(g.setFactoryAuto('mill', true).ok, true);
  g.advance(48);
  assert.equal(g.state.silo.flour, 22.5);
  assert.equal(g.state.silo.wheat, 5);
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].reason, /Gandum/);
  g.state.silo.wheat = 15;
  g.advance(8);
  assert.equal(g.state.silo.flour, 30, 'resumes when stock returns');
});

test('upgrades speed batches up and setRecipe switches products', () => {
  const g = withMill(6, 20);
  assert.equal(g.upgradeFactory('mill').cost, mill().upgradeCost);
  assert.equal(g.upgradeFactory('mill').ok, true);
  const v = g.factoriesView()[0];
  assert.equal(v.level, 3);
  assert.equal(v.recipe.hours, Math.ceil(6 / 1.25 ** 2));
  assert.equal(g.setRecipe('mill', 'malt').ok, true);
  g.state.silo.barley = 10;
  g.startBatch('mill', 1);
  assert.equal(g.setRecipe('mill', 'flour').ok, false, 'busy');
  g.advance(Math.ceil(8 / 1.25 ** 2) + 1);
  assert.equal(g.state.silo.malt, 7.5);
  for (let i = 0; i < 5; i++) g.upgradeFactory('mill');
  assert.equal(g.factoriesView()[0].level, mill().maxLevel);
});

test('factories are deterministic and survive save/load', () => {
  const run = () => { const g = withMill(7, 60); g.setFactoryAuto('mill', true); g.advance(20); return g; };
  const a = run(), b = run();
  assert.deepEqual(comparable(a), comparable(b));
  const l = loadGame(a.serialize());
  assert.deepEqual(l.state.factories, a.state.factories);
  l.advance(30); a.advance(30);
  assert.deepEqual(comparable(l), comparable(a));
  const old = JSON.parse(a.serialize());
  delete old.factories;
  assert.deepEqual(loadGame(JSON.stringify(old)).state.factories, {});
});

test('processed goods are on the market and sell', () => {
  const g = withMill(8);
  g.state.silo.flour = 3;
  assert.ok(g.marketView().some((p) => p.id === 'flour' && p.stock === 3));
  assert.equal(g.sellProduct('flour').ok, true);
});

test('palm mill: TBS → CPO + kernel, kernel → PKO, CPO → cooking oil', () => {
  const palm = DATA.FACTORIES.find((f) => f.id === 'palm_mill');
  const crop = DATA.CROPS.find((c) => c.id === 'oilpalm');
  assert.ok(palm.unlockLevel >= crop.unlockLevel);
  const g = newGame(9);
  g.state.money = 1e6;
  g.state.storageUpgrades.silo = 4; // 1350 t
  g.state.level = palm.unlockLevel - 1;
  assert.equal(g.buyFactory('palm_mill').ok, false);
  g.state.level = palm.unlockLevel;
  assert.equal(g.buyFactory('palm_mill').ok, true);
  g.state.silo.oilpalm = 25;
  assert.equal(g.startBatch('palm_mill', 2).ok, true);
  assert.equal(g.state.silo.oilpalm, 15);
  g.advance(17);
  assert.equal(g.state.silo.oilpalm, 5);
  assert.equal(g.state.silo.palm_cpo, 4.4);
  assert.equal(g.state.silo.palm_kernel, 1);
  assert.equal(g.setRecipe('palm_mill', 'palm_pko').ok, true);
  g.state.silo.palm_kernel = 2;
  assert.equal(g.startBatch('palm_mill', 1).ok, true);
  assert.equal(g.state.silo.palm_kernel ?? 0, 0);
  g.advance(7);
  assert.equal(g.state.silo.palm_kernel_oil, 0.9);
  assert.equal(g.setRecipe('palm_mill', 'cooking_oil').ok, true);
  assert.equal(g.startBatch('palm_mill', 1).ok, true);
  g.advance(9);
  assert.equal(g.state.silo.palm_cpo, 2.4);
  assert.equal(g.state.silo.cooking_oil, 1.6);
  assert.ok(['palm_cpo', 'palm_kernel', 'palm_kernel_oil', 'cooking_oil'].every((id) => g.marketView().some((p) => p.id === id)));
});
