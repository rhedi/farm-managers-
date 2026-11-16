import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { setup, tier, near } from './factoryManager.helpers.js';
import { loadGame } from '../js/engine.js';
import { dispatchableStock } from '../js/engine/dispatcher.js';

test('data: Lv 11 (first factory) / 15 / 25 tiers grow with skill; ≤2 / ≤5 / all factories; new game has no factory manager', () => {
  const tiers = DATA.BALANCE.factoryManager.tiers;
  assert.deepEqual(tiers.map((t) => [t.id, t.unlockLevel, t.factories, t.intervalHours]),
    [['supervisor', 11, 2, 6], ['kepala', 15, 5, 2], ['direktur', 25, null, 1]]);
  assert.ok(tiers[0].unlockLevel >= Math.min(...DATA.FACTORIES.map((f) => f.unlockLevel))); // never hireable with nothing to run
  for (let i = 1; i < tiers.length; i++) for (const k of ['hireCost', 'wage', 'skill']) assert.ok(tiers[i][k] > tiers[i - 1][k], `${tiers[i].id}.${k}`);
  assert.deepEqual(tiers.map((t) => t.buyInputs), [false, false, true]);
  const v = newGame().factoryManagerView();
  assert.equal(v.hired, null);
  assert.equal(v.candidates.length, 3);
  assert.equal(v.unlockLevel, 11);
  assert.ok(v.candidates.every((c) => c.locked && /Terbuka di level/.test(c.reason)));
});

test('level gate per tier for hire and promote', () => {
  const g = setup({ level: 14, silo: {} });
  assert.match(g.hireFactoryManager('kepala').reason, /level 15/);
  assert.equal(g.hireFactoryManager('supervisor').ok, true);
  assert.match(g.replaceFactoryManager('direktur').reason, /level 25/);
  g.state.level = 24;
  assert.match(g.replaceFactoryManager('direktur').reason, /level 25/);
  g.state.level = 25;
  assert.equal(g.replaceFactoryManager('direktur').ok, true);
  const early = setup({ level: 10, factories: [], silo: {} });
  assert.match(early.hireFactoryManager('supervisor').reason, /level 11/);
  early.state.level = 11;
  assert.equal(early.hireFactoryManager('supervisor').ok, true);
  assert.match(early.factoryManagerView().note, /Belum punya pabrik/);
});

test('hire / replace / fire: promote trade-in 50%, downgrade free, everything books to gaji', () => {
  const g = setup({ silo: {} });
  const evs = [];
  g.on((e) => evs.push(e.type));
  const gaji = () => g.state.ledger.total.gaji || 0;
  let m = g.state.money, l = gaji();
  assert.equal(g.hireFactoryManager('supervisor').ok, true);
  near(m - g.state.money, tier('supervisor').hireCost); near(gaji() - l, tier('supervisor').hireCost);
  assert.match(g.hireFactoryManager('kepala').reason, /Sudah ada/);
  assert.ok(evs.includes('factory_manager_hired'));

  m = g.state.money; l = gaji();
  const up = g.replaceFactoryManager('kepala');
  assert.equal(up.cost, tier('kepala').hireCost - tier('supervisor').hireCost * 0.5);
  near(m - g.state.money, up.cost); near(gaji() - l, up.cost);
  m = g.state.money; l = gaji();
  const down = g.replaceFactoryManager('supervisor');
  assert.equal(down.cost, 0); // 4000 − 7000 credit → $0, never a refund
  assert.equal(g.state.money, m); assert.equal(gaji(), l);
  assert.match(g.replaceFactoryManager('supervisor').reason, /sudah menjadi/);
  assert.ok(evs.includes('factory_manager_replaced'));

  const workerWages = g.state.workers.reduce((a, w) => a + w.wage, 0);
  l = gaji();
  g.advance(24 - g.state.time % 24);
  near(gaji() - l, workerWages + tier('supervisor').wage);
  assert.equal(g.fireFactoryManager().ok, true);
  assert.equal(g.state.factories.mill.managed, undefined);
  assert.match(g.fireFactoryManager().reason, /Belum ada/);
  l = gaji();
  g.advance(24);
  near(gaji() - l, workerWages);
});

test('takes over controlled factories: auto off, player calls refused; paused or released = player again', () => {
  const g = setup({ factories: ['mill', 'dairy', 'sugar_mill'], silo: {} });
  g.setFactoryAuto('sugar_mill', true);
  g.hireFactoryManager('supervisor'); // ≤ 2 factories: the first two in data order
  const f = g.state.factories;
  assert.equal(f.mill.managed, true); assert.equal(f.dairy.managed, true); assert.equal(f.sugar_mill.managed, undefined);
  assert.equal(f.sugar_mill.auto, true);
  assert.match(g.setFactoryAuto('mill', true).reason, /Dikelola Manajer Pabrik/);
  assert.match(g.startBatch('mill', 1).reason, /Dikelola/);
  assert.match(g.setRecipe('mill', 'malt').reason, /Dikelola/);
  g.setFactoryManagerSettings({ factories: ['sugar_mill'] });
  assert.equal(f.sugar_mill.managed, true); assert.equal(f.sugar_mill.auto, false); assert.equal(f.mill.managed, undefined);
  assert.equal(g.setFactoryAuto('mill', true).ok, true);
  g.setFactoryManagerOn(false);
  assert.equal(f.sugar_mill.managed, undefined);
  assert.deepEqual(g.factoryManagerView().factories.map((x) => x.managed), [false, false, false]);
});

test('tier modifiers: Kepala −5% input, Direktur +6% output on its batches', () => {
  const g = setup({ silo: { wheat: 10 } });
  g.hireFactoryManager('kepala');
  near(10 - (g.state.silo.wheat || 0), 9.5);
  const h = setup({ silo: { wheat: 10 } });
  h.hireFactoryManager('direktur');
  h.advance(8);
  near(h.state.silo.flour, 7.5 * 1.06);
});

test('save/load keeps the manager; old saves load as not hired', () => {
  const g = setup();
  g.hireFactoryManager('kepala');
  g.setFactoryManagerSettings({ minMargin: 10, reservePct: { wheat: 25 }, headroom: 80 });
  g.advance(10);
  const back = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(comparable(back), comparable(g));
  assert.deepEqual(back.factoryManagerView().stats, g.factoryManagerView().stats);
  const old = JSON.parse(setup().serialize());
  delete old.factoryManager;
  const o = loadGame(JSON.stringify(old), { data: DATA });
  assert.equal(o.factoryManagerView().hired, null);
  assert.deepEqual(o.factoryManagerView().settings, { factories: null, reservePct: {}, minMargin: 5, buyInputs: false, headroom: 90, contracts: true });
  const bad = JSON.parse(setup().serialize());
  bad.factoryManager = { hired: { tierId: 'gone' }, settings: { factories: ['nope', 'mill'], minMargin: -3, headroom: 400, reservePct: { wheat: 300, x: 5 } } };
  const b = loadGame(JSON.stringify(bad), { data: DATA }).factoryManagerView();
  assert.equal(b.hired, null);
  assert.deepEqual(b.settings, { factories: ['mill'], reservePct: { wheat: 90 }, minMargin: 0, buyInputs: false, headroom: 100, contracts: true });
});

test('deterministic: same actions, same state', () => {
  const run = () => { const g = setup({ factories: ['mill', 'sugar_mill'], silo: { wheat: 60, barley: 40, sugarcane: 120 } }); g.hireFactoryManager('kepala'); g.advance(72); return comparable(g); };
  assert.deepEqual(run(), run());
});

test('offline catch-up is bounded: ≤ 48 h of exact passes, one wage per midnight', () => {
  const g = setup({ silo: { wheat: 400 } });
  g.hireFactoryManager('direktur');
  const runs0 = g.factoryManagerView().stats.runs, t0 = g.state.time, gaji0 = g.state.ledger.total.gaji;
  const workerWages = g.state.workers.reduce((a, w) => a + w.wage, 0);
  g.catchUp(48 * DATA.BALANCE.realSecondsPerGameHour); // the exact window; longer absences continue coarsely (offline.test.js)
  assert.equal(g.state.time - t0, 48);
  const runs = g.factoryManagerView().stats.runs - runs0;
  assert.ok(runs >= 6 && runs <= 48, `${runs}`); // hourly passes, a 6 h flour batch: one new batch at a time
  near(g.state.ledger.total.gaji - gaji0, 2 * (workerWages + tier('direktur').wage));
});
