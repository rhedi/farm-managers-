import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, near } from './factoryManager.helpers.js';
import { dispatchableStock } from '../js/engine/dispatcher.js';

const wheatFor = (g) => dispatchableStock(g).get('wheat') ?? 0;

test('hold rule: the Manajer Logistik does not load inputs the Manajer Pabrik planned', () => {
  const g = setup({ silo: { wheat: 25 } });
  g.state.level = 25;
  assert.equal(g.hireDispatcher('magang').ok, true);
  near(wheatFor(g), 25);
  g.hireFactoryManager('supervisor'); // 1 batch starts (10 t used); the next pass needs 10 t more
  near(g.state.silo.wheat, 15);
  near(wheatFor(g), 5);
  g.setFactoryManagerOn(false); // paused: nothing held
  near(wheatFor(g), 15);
  g.setFactoryManagerOn(true);
  g.setFactoryManagerSettings({ factories: [] }); // mill not controlled: nothing held
  near(wheatFor(g), 15);
  g.setFactoryManagerSettings({ factories: null });
  g.fireFactoryManager();
  near(wheatFor(g), 15);
});

test('hold rule: queued batches not started yet keep their inputs too', () => {
  const g = setup({ silo: { wheat: 100 } });
  g.state.factories.mill.level = 5; // 3 h batches → the 6 h Supervisor queues 2
  g.hireDispatcher('magang');
  g.hireFactoryManager('supervisor');
  assert.equal(g.state.factories.mill.queued, 2);
  // 100 − 10 (running) = 90 in the silo; 10 for the waiting batch + 20 for the next pass are held
  near(g.state.silo.wheat, 90);
  near(wheatFor(g), 60);
});

test('promote keeps settings, aktif/jeda, stats and recent runs; the new tier plans at once', () => {
  const g = setup({ silo: { wheat: 60 } });
  g.hireFactoryManager('supervisor');
  g.setFactoryManagerSettings({ minMargin: 10, reservePct: { wheat: 10 }, headroom: 80 });
  g.advance(12);
  const before = g.factoryManagerView();
  assert.ok(before.stats.runs >= 1 && before.recent.length >= 1);
  const evs = [];
  g.on((e) => e.type === 'factory_manager_run' && evs.push(e));
  g.state.silo.wheat = 60;
  const r = g.replaceFactoryManager('direktur');
  assert.equal(r.ok, true);
  const v = g.factoryManagerView();
  assert.equal(v.hired.id, 'direktur');
  assert.deepEqual(v.settings, before.settings);
  assert.equal(v.on, true);
  assert.ok(v.stats.runs >= before.stats.runs);
  assert.deepEqual(v.recent.slice(-before.recent.length).map((x) => x.day), before.recent.map((x) => x.day));
  assert.equal(g.state.factories.mill.outMult, 1.06);
  assert.equal(g.state.factories.mill.inMult, 0.95);
  assert.equal(g.replaceFactoryManager('supervisor').cost, 0); // downgrade: free, modifiers drop
  assert.equal(g.state.factories.mill.outMult, undefined);
});

test('view: last-run summary and next pass countdown follow the tier interval', () => {
  const g = setup({ factories: ['mill', 'sugar_mill'], silo: { wheat: 20, sugarcane: 80 } });
  g.hireFactoryManager('supervisor');
  const v = g.factoryManagerView();
  assert.equal(v.nextPassHours, 6);
  assert.match(v.lastRun.text, /Tepung/);
  assert.match(v.lastRun.text, /Gula/);
  g.advance(2);
  assert.equal(g.factoryManagerView().nextPassHours, 4);
});

test('factory limit: Supervisor 2, Kepala Produksi 5, Direktur all; the rest stay with the player', () => {
  const six = ['mill', 'dairy', 'sugar_mill', 'oil_press', 'palm_mill', 'bakery'];
  const g = setup({ factories: six, silo: {} });
  const managed = () => g.factoryManagerView().factories.filter((f) => f.managed).map((f) => f.id);
  g.hireFactoryManager('supervisor');
  assert.deepEqual(managed(), six.slice(0, 2));
  assert.deepEqual(g.factoryManagerView().factories.filter((f) => f.overCap).map((f) => f.id), six.slice(2));
  assert.equal(g.setFactoryAuto('bakery', true).ok, true);
  g.replaceFactoryManager('kepala');
  assert.deepEqual(managed(), six.slice(0, 5));
  assert.equal(g.state.factories.bakery.managed, undefined);
  g.replaceFactoryManager('direktur');
  assert.deepEqual(managed(), six);
  assert.equal(g.state.factories.bakery.auto, false);
});
