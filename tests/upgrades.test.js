import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField } from './helpers.js';
import { loadGame } from '../js/engine.js';

const def = (id) => DATA.MACHINES.find((m) => m.id === id);
const uidOf = (g, defId) => g.state.machines.find((m) => m.defId === defId).uid;
function rich(level = 30) {
  const g = newGame(3);
  g.state.level = level;
  g.state.money = 1e8;
  return g;
}

test('upgrade costs follow price × (0.15, 0.25, 0.4) and level gates', () => {
  const g = newGame(1);
  g.state.money = 1e6;
  const uid = uidOf(g, 'jd_5075');
  const price = def('jd_5075').price;
  const ev = [];
  g.on((e) => e.type === 'machine_upgraded' && ev.push(e));
  assert.deepEqual(g.upgradeMachine(uid, 'engine'), { ok: true, level: 1, cost: price * 0.15 });
  const info = g.machineUpgradeInfo(uid).tracks.find((t) => t.id === 'engine');
  assert.equal(info.cost, price * 0.25);
  assert.equal(info.reqLevel, 3);
  assert.equal(info.reason, 'Butuh level 3.');
  assert.deepEqual(g.upgradeMachine(uid, 'engine'), { ok: false, reason: 'Butuh level 3.' });
  g.state.level = 5;
  assert.equal(g.upgradeMachine(uid, 'engine').cost, price * 0.25);
  assert.equal(g.upgradeMachine(uid, 'engine').cost, price * 0.4);
  assert.equal(g.upgradeMachine(uid, 'engine').reason, 'Sudah level maksimal.');
  assert.equal(ev.length, 3);
  assert.equal(g.upgradeMachine(uid, 'turbo').ok, false);
  g.state.money = 0;
  assert.equal(g.upgradeMachine(uid, 'efficiency').reason, 'Uang tidak cukup.');
  const plow = uidOf(g, 'plow_s');
  assert.equal(g.upgradeMachine(plow, 'engine').ok, false, 'implements only have a transmission');
  assert.equal(g.machineUpgradeInfo(plow).tracks.filter((t) => t.applies).map((t) => t.id).join(), 'transmission');
});

test('engine upgrade lets a tractor pull a bigger implement', () => {
  const g = rich();
  g.buyMachine('jd_9rx'); g.buyMachine('plow_xxxl');
  const opts = { tractorId: uidOf(g, 'jd_9rx'), implementId: uidOf(g, 'plow_xxxl') };
  const before = g.estimateTask(startField(), 'plow', opts);
  assert.equal(before.ok, false);
  assert.match(before.reason, /Tenaga traktor/);
  assert.equal(g.upgradeMachine(opts.tractorId, 'engine').ok, true); // 640 → 736
  assert.equal(g.estimateTask(startField(), 'plow', opts).ok, false);
  assert.equal(g.upgradeMachine(opts.tractorId, 'engine').ok, true); // → 832 ≥ 800
  assert.equal(g.estimateTask(startField(), 'plow', opts).ok, true);
  assert.equal(g.machinesView().find((m) => m.uid === opts.tractorId).hp, 832);
  assert.equal(g.shopView().find((m) => m.id === 'plow_xxxl').hpOk, true);
});

test('transmission shortens tasks, efficiency cuts fuel', () => {
  const g = rich();
  const t = uidOf(g, 'jd_5075');
  const e0 = g.estimateTask(startField(), 'plow');
  g.upgradeMachine(t, 'transmission');
  const e1 = g.estimateTask(startField(), 'plow');
  assert.ok(Math.abs(e1.hours - e0.hours / 1.1) < 0.02, `${e0.hours} → ${e1.hours}`);
  g.upgradeMachine(t, 'efficiency');
  g.upgradeMachine(t, 'efficiency');
  const e2 = g.estimateTask(startField(), 'plow');
  assert.equal(e2.hours, e1.hours);
  assert.ok(Math.abs(e2.fuelCost - e1.fuelCost * 0.8) < 0.05);
  assert.equal(g.availableMachinesFor('plow').tractors[0].speed, 1.1);
  assert.equal(g.availableMachinesFor('plow').tractors[0].fuelPerHour, 6.4);
  const r = g.startTask(startField(), 'plow');
  assert.ok(Math.abs(r.hours - e2.hours) < 1e-9);
});

test('harvester engine + transmission stack on ha/jam', () => {
  const g = rich();
  g.buyMachine('mf_activa');
  const uid = uidOf(g, 'mf_activa');
  g.upgradeMachine(uid, 'engine');
  g.upgradeMachine(uid, 'transmission');
  assert.equal(g.availableMachinesFor('harvest').harvesters[0].haPerHour, 1.82); // 1.5 × 1.1 × 1.1
});

test('cannot upgrade a busy machine', () => {
  const g = rich();
  const t = uidOf(g, 'jd_5075');
  assert.equal(g.startTask(startField(), 'plow').ok, true);
  assert.deepEqual(g.upgradeMachine(t, 'engine'), { ok: false, reason: 'Mesin sedang dipakai.' });
  assert.equal(g.machineUpgradeInfo(t).tracks[0].reason, 'Mesin sedang dipakai.');
});

test('resale adds 50% of upgrade spend × condition', () => {
  const g = rich();
  const t = uidOf(g, 'jd_5075');
  const price = def('jd_5075').price;
  g.upgradeMachine(t, 'engine'); g.upgradeMachine(t, 'transmission');
  const spent = price * 0.3;
  g.state.machines.find((m) => m.uid === t).condition = 0.5;
  const expect = (price * 0.6 + 0.5 * spent) * 0.5;
  assert.equal(g.machinesView().find((m) => m.uid === t).sellValue, expect);
  assert.equal(g.machineUpgradeInfo(t).resaleValue, expect);
  assert.equal(g.machineUpgradeInfo(t).spent, spent);
  const money = g.state.money;
  assert.equal(g.sellMachine(t).refund, expect);
  assert.equal(g.state.money, money + expect);
});

test('upgrades and paint survive save/load; old saves get zero upgrades', () => {
  const g = rich();
  const t = uidOf(g, 'jd_5075');
  g.upgradeMachine(t, 'efficiency');
  assert.equal(g.paintMachine(t, DATA.BALANCE.machineUpgrades.paints[0]).ok, true);
  assert.equal(g.paintMachine(t, '#123456').ok, false);
  const g2 = loadGame(g.serialize());
  assert.deepEqual(g2.state.machines, g.state.machines);
  assert.equal(g2.machinesView().find((m) => m.uid === t).fuelPerHour, 7.2);
  const s = JSON.parse(g.serialize());
  for (const m of s.machines) delete m.upgrades;
  const g3 = loadGame(JSON.stringify(s));
  assert.deepEqual(g3.state.machines[0].upgrades, { engine: 0, transmission: 0, efficiency: 0 });
  assert.equal(g3.machinesView().find((m) => m.uid === t).fuelPerHour, def('jd_5075').fuelPerHour);
});
