import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField } from './helpers.js';
import { loadGame } from '../js/engine.js';

const rigOf = (g, task) => g.estimateTask(startField(), task).machineUids;
const machine = (g, uid) => g.state.machines.find((m) => m.uid === uid);

test('machines start at full condition and wear with working hours', () => {
  const g = newGame(1);
  for (const m of g.machinesView()) {
    assert.equal(m.condition, 1);
    assert.equal(m.repairCost, 0);
  }
  const [t] = rigOf(g, 'plow');
  const r = runTask(g, startField(), 'plow');
  const cond = machine(g, t).condition;
  assert.ok(Math.abs(cond - (1 - 0.002 * r.hours)) < 1e-4, `${cond}`);
});

test('worn machines (<0.5) make tasks 20% slower', () => {
  const g = newGame(2);
  const base = g.estimateTask(startField(), 'plow').hours;
  for (const uid of rigOf(g, 'plow')) machine(g, uid).condition = 0.4;
  const slow = g.estimateTask(startField(), 'plow').hours;
  assert.ok(Math.abs(slow / base - 1.25) < 0.01, `${slow} vs ${base}`);
});

test('very worn machines (<0.2) sometimes break down: +50% time and an event', () => {
  let breakdowns = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = newGame(seed);
    const evs = [];
    g.on((e) => e.type === 'machine_breakdown' && evs.push(e));
    const uids = rigOf(g, 'plow');
    for (const uid of uids) machine(g, uid).condition = 0.1;
    const est = g.estimateTask(startField(), 'plow').hours;
    const r = g.startTask(startField(), 'plow');
    if (evs.length) {
      breakdowns++;
      assert.ok(uids.includes(evs[0].uid));
      assert.ok(Math.abs(r.hours - est * 1.5) < 0.02);
    } else assert.equal(r.hours, est);
  }
  assert.ok(breakdowns > 2 && breakdowns < 25, `${breakdowns} breakdowns / 200`);
});

test('repairMachine restores condition for price·(1−condition)·0.3; not while busy', () => {
  const g = newGame(3);
  const [uid] = rigOf(g, 'plow');
  const m = machine(g, uid);
  const price = DATA.MACHINES.find((d) => d.id === m.defId).price;
  assert.equal(g.repairMachine(uid).ok, false, 'nothing to repair');
  m.condition = 0.6;
  const view = g.machinesView().find((x) => x.uid === uid);
  assert.ok(Math.abs(view.repairCost - price * 0.4 * 0.3) < 0.01);
  assert.ok(Math.abs(view.sellValue - price * 0.6 * 0.6) < 0.01, 'resale scales with condition');
  g.startTask(startField(), 'plow');
  assert.equal(g.repairMachine(uid).ok, false);
  g.advance(24);
  const money = g.state.money;
  const r = g.repairMachine(uid);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(money - g.state.money - r.cost) < 1e-6);
  assert.equal(machine(g, uid).condition, 1);
  assert.equal(g.repairMachine('nope').ok, false);
});

test('selling a worn machine refunds less; old saves default to condition 1', () => {
  const g = newGame(4);
  const [uid] = rigOf(g, 'plow');
  machine(g, uid).condition = 0.5;
  const price = DATA.MACHINES.find((d) => d.id === machine(g, uid).defId).price;
  assert.ok(Math.abs(g.sellMachine(uid).refund - price * 0.6 * 0.5) < 0.01);
  const s = JSON.parse(g.serialize());
  for (const m of s.machines) delete m.condition;
  const g2 = loadGame(JSON.stringify(s), { data: DATA });
  assert.ok(g2.state.machines.every((m) => m.condition === 1));
});
