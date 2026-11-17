import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, tier, near } from './factoryManager.helpers.js';
import { planPass, WAIT } from '../js/engine/factoryPlanner.js';
import { capacityOf, usedOf } from '../js/engine/storage.js';

const runs = (g) => { const evs = []; g.on((e) => e.type === 'factory_manager_run' && evs.push(e)); return evs; };

test('best margin/hour recipe wins; event, stats, recent, estimated profit', () => {
  // flour: 10 t wheat ($200) → 7.5 t ($400) = +$1000 / 6 h; malt: 10 barley → 7.5 malt at $300 = +$250 / 8 h
  const g = setup({ silo: { wheat: 20, barley: 20 } });
  const evs = runs(g);
  g.hireFactoryManager('supervisor');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].factory, 'mill'); assert.equal(evs[0].recipe, 'flour'); assert.equal(evs[0].batches, 1);
  const wage = tier('supervisor').wage;
  near(evs[0].estProfit, 7.5 * 400 - 10 * 200 - wage / 24 * 6 / 1);
  assert.equal(g.state.factories.mill.recipeId, 'flour');
  const v = g.factoryManagerView();
  assert.equal(v.stats.runs, 1); assert.equal(v.today.batches, 1); assert.equal(v.recent[0].recipeName, 'Tepung');
  g.state.market.malt = 900; g.state.market.flour = 250; // now malt pays more
  g.advance(6);
  assert.equal(evs.at(-1).recipe, 'malt');
});

test('queue fill matches the pass interval; queued inputs are never planned twice', () => {
  const g = setup({ silo: { wheat: 100 } });
  g.hireFactoryManager('direktur'); // hourly passes, 6 h batch → 1 batch in the queue at a time
  assert.equal(g.state.factories.mill.queued, 1);
  const h = setup({ silo: { wheat: 100 } });
  h.state.factories.mill.level = 5; // 6 h / 1.25^4 → 3 h batches
  h.hireFactoryManager('supervisor'); // every 6 h → 2 batches
  assert.equal(h.state.factories.mill.queued, 2);
  assert.equal(planPass(h, tier('supervisor'), h.state.factoryManager.settings, 0).plans.length, 0);
});

test('reserves: feed reserve, contract remaining and reserve % are not processed', () => {
  const g = setup({ silo: { wheat: 45 } });
  g.state.feedReserve.wheat = 10;
  g.state.contracts.push({ id: 'k1', productId: 'wheat', qty: 20, delivered: 5, status: 'active' });
  g.setFactoryManagerSettings({ reservePct: { wheat: 20 } }); // 45 × 20% = 9 kept
  g.state.factories.mill.level = 5;
  g.hireFactoryManager('supervisor'); // usable 45 − 10 − 15 − 9 = 11 → 1 batch (room for 2)
  assert.equal(g.state.factories.mill.queued, 1);
  near(g.state.silo.wheat, 35);
  g.setFactoryManagerSettings({ contracts: false }); // contract no longer kept: 35 − 10 − 15(queued: 0, started) − 7
  assert.ok(g.state.factories.mill.queued >= 1);
});

test('headroom: no batch that would push a store over the limit; shrinking batches still run', () => {
  const g = setup({ factories: ['dairy'], silo: { milk: 2000 } });
  g.state.storageUpgrades.cold = 0; // 10 t cold: 2 t milk
  g.hireFactoryManager('supervisor'); // butter/cheese are kg processed goods (no store) and shrink the cold store
  assert.ok(g.state.factories.dairy.queued >= 1);
  const h = setup({ factories: ['palm_mill'], silo: { palm_kernel: 30 } });
  h.state.silo.rice = capacityOf(h, 'silo') * 0.9 - 30 - 0.2; // 0.2 t under 90%
  h.state.market.palm_kernel = 100; h.state.market.palm_kernel_oil = 2000; h.state.market.oilpalm = 1;
  h.hireFactoryManager('supervisor'); // PKO: 2 t kernel → 0.9 t oil shrinks the silo: runs
  assert.ok(h.state.factories.palm_mill.queued >= 1);
  assert.ok(usedOf(h, 'silo') <= capacityOf(h, 'silo') * 0.9 + 1e-6);

  // CPO: 10 t bunches → 2.7 t, but bought inputs would add tons: the silo is at the limit, so nothing is bought
  const b = setup({ factories: ['mill'], silo: {} });
  b.state.silo.rice = capacityOf(b, 'silo') * 0.9;
  b.hireFactoryManager('direktur');
  b.setFactoryManagerSettings({ buyInputs: true, minMargin: 0 });
  assert.equal(b.state.factories.mill.queued, 0);
  assert.equal(b.factoryManagerView().factories[0].wait, WAIT.room);
  b.advance(48);
  assert.ok(usedOf(b, 'silo') <= capacityOf(b, 'silo') + 1e-6);
});

test('min margin: below the setting the factory waits with "margin terlalu kecil"', () => {
  const g = setup({ silo: { wheat: 20 }, market: { flour: 280, malt: 1 } }); // 7.5 × 280 = 2100 vs 2000 + wage share
  g.setFactoryManagerSettings({ minMargin: 10 });
  g.hireFactoryManager('supervisor');
  assert.equal(g.state.factories.mill.queued, 0);
  const v = g.factoryManagerView();
  assert.equal(v.factories[0].wait, WAIT.margin);
  assert.match(v.note, /margin terlalu kecil/);
  g.state.market.flour = 400;
  g.setFactoryManagerSettings({ minMargin: 10 });
  assert.equal(g.state.factories.mill.queued, 1);
});

test('buy inputs: only Direktur with the toggle on, only when still profitable, booked to pembelian_produk', () => {
  const g = setup({ silo: {} });
  g.hireFactoryManager('kepala');
  g.setFactoryManagerSettings({ buyInputs: true });
  assert.equal(g.state.factories.mill.queued, 0);
  assert.equal(g.factoryManagerView().factories[0].wait, WAIT.input);
  g.replaceFactoryManager('direktur');
  assert.equal(g.state.factories.mill.queued, 1); // 9.5 t × 200 × 1.2 = 2280 < 7.95 t × 400 = 3180
  near(g.factoryManagerView().stats.bought, 9.5 * 200 * 1.2);
  near(g.state.ledger.total.pembelian_produk, 9.5 * 200 * 1.2);
  const n = setup({ silo: {}, market: { flour: 290 } }); // 7.95 × 290 = 2305 − 2280 − wage: not worth it
  n.hireFactoryManager('direktur');
  n.setFactoryManagerSettings({ buyInputs: true, minMargin: 0 });
  assert.equal(n.state.factories.mill.queued, 0);
  assert.equal(n.state.ledger.total.pembelian_produk ?? 0, 0);
  const def = setup({ silo: {} });
  def.hireFactoryManager('direktur'); // v17: a new Direktur starts with 🛒 Beli bahan kurang on
  assert.equal(def.state.factoryManager.settings.buyInputs, true);
  assert.equal(def.state.factories.mill.queued, 1);
  const off = setup({ silo: {} });
  off.setFactoryManagerSettings({ buyInputs: false }); // the player's own choice is kept
  off.hireFactoryManager('direktur');
  assert.equal(off.state.factoryManager.settings.buyInputs, false);
  assert.equal(off.state.factories.mill.queued, 0);
});

test('independent factories run in the same pass; an active contract output beats margin/hour', () => {
  // wheat → flour (mill) and sugarcane → sugar (sugar mill) don't compete: both run in the same pass
  const g = setup({ factories: ['mill', 'sugar_mill'], silo: { wheat: 10, sugarcane: 40 } });
  g.hireFactoryManager('supervisor');
  assert.equal(g.state.factories.mill.queued, 1); assert.equal(g.state.factories.sugar_mill.queued, 1);

  // malt at 250 with barley at 150: +$322 / 8 h; flour +$960 / 6 h pays more per hour…
  const c = setup({ factories: ['mill'], silo: { wheat: 10, barley: 10 }, market: { malt: 250, barley: 150 } });
  c.state.contracts.push({ id: 'k9', productId: 'malt', qty: 5, delivered: 0, status: 'active' });
  c.hireFactoryManager('supervisor'); // flour pays more per hour, but an active malt contract comes first
  assert.equal(c.state.factories.mill.recipeId, 'malt');
  const d = setup({ factories: ['mill'], silo: { wheat: 10, barley: 10 }, market: { malt: 250, barley: 150 } });
  d.state.contracts.push({ id: 'k9', productId: 'malt', qty: 5, delivered: 0, status: 'active' });
  d.setFactoryManagerSettings({ contracts: false });
  d.hireFactoryManager('supervisor');
  assert.equal(d.state.factories.mill.recipeId, 'flour');
});

test('controlled subset: settings and the tier cap pick the factories', () => {
  const g = setup({ factories: ['mill', 'sugar_mill'], silo: { wheat: 20, sugarcane: 80 } });
  g.setFactoryManagerSettings({ factories: ['sugar_mill'] });
  g.hireFactoryManager('direktur');
  assert.equal(g.state.factories.mill.queued, 0);
  assert.equal(g.state.factories.sugar_mill.queued, 1);
  assert.deepEqual(g.factoryManagerView().factories.map((f) => [f.id, f.managed]), [['mill', false], ['sugar_mill', true]]);
});
