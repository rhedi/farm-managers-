import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';
import { loadGame } from '../js/engine.js';

test('game starts with one free worker and three candidates', () => {
  const g = newGame(1);
  assert.equal(g.workersView().length, 1);
  assert.equal(g.workersView()[0].busy, false);
  const cs = g.workerCandidates();
  assert.equal(cs.length, 3);
  for (const c of cs) {
    assert.ok(c.skill >= 0 && c.skill <= 1);
    assert.ok(c.wage > 0 && typeof c.name === 'string');
  }
});

test('a task occupies a worker; a second field waits for a free worker', () => {
  const g = newGame(2);
  g.state.money = 1e7;
  const other = cheapestOtherField(g).id;
  g.buyField(other);
  g.buyMachine('jd_5075');
  g.buyMachine('plow_s');
  const fid = startField();
  const r = g.startTask(fid, 'plow');
  assert.equal(r.ok, true);
  assert.equal(g.state.workers[0].busy, fid);
  const est = g.estimateTask(other, 'plow');
  assert.equal(est.ok, false);
  assert.equal(est.reason, 'Tidak ada pekerja bebas.');
  assert.ok(est.hours > 0, 'estimate still has hours');
  const all = g.startTaskAll('plow');
  assert.equal(all.started.length, 0);
  assert.equal(all.skipped[0].reason, 'Tidak ada pekerja bebas.');
  assert.equal(g.hireWorker(g.workerCandidates()[0].id).ok, true);
  assert.equal(g.workerCandidates().length, 2);
  assert.equal(g.startTask(other, 'plow').ok, true);
});

test('rented harvest needs no worker', () => {
  const g = newGame(3);
  const fid = startField();
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: starterCrop().id });
  g.advance(starterCrop().growDays * 24);
  g.state.workers[0].busy = 'elsewhere';
  assert.equal(g.startTask(fid, 'harvest', { rent: true }).ok, true);
});

test('skill speeds tasks up to 20% and grows with work', () => {
  const g = newGame(4);
  const fid = startField();
  const w = g.state.workers[0];
  w.skill = 0;
  const slow = g.estimateTask(fid, 'plow').hours;
  w.skill = 1;
  const fast = g.estimateTask(fid, 'plow').hours;
  assert.ok(Math.abs(fast / slow - 0.8) < 0.01, `${fast} vs ${slow}`);
  w.skill = 0.3;
  runTask(g, fid, 'plow');
  assert.ok(w.skill > 0.3 && w.skill < 0.32);
});

test('wages are paid daily; shortfall goes to the loan with an event', () => {
  const g = newGame(5);
  const wage = g.state.workers[0].wage;
  const m0 = g.state.money;
  g.advance(24);
  assert.ok(Math.abs(m0 - g.state.money - wage) < 1e-6);
  const evs = [];
  g.on((e) => e.type === 'wages_unpaid' && evs.push(e));
  g.state.money = 10;
  g.advance(24);
  assert.equal(evs.length, 1);
  assert.equal(g.state.money, 0);
  assert.ok(Math.abs(g.state.loan - (wage - 10)) < 1e-6);
});

test('candidates refresh weekly; hire/fire rules', () => {
  const g = newGame(6);
  const first = g.workerCandidates().map((c) => c.id).join();
  g.advance(24 * 3);
  assert.equal(g.workerCandidates().map((c) => c.id).join(), first);
  g.advance(24 * 5);
  assert.notEqual(g.workerCandidates().map((c) => c.id).join(), first);
  const w1 = g.state.workers[0].id;
  assert.equal(g.fireWorker(w1).ok, false, 'cannot fire the last worker');
  const evs = [];
  g.on((e) => e.type === 'worker_hired' && evs.push(e));
  const { id } = g.hireWorker(g.workerCandidates()[1].id);
  assert.equal(evs.length, 1);
  assert.equal(g.hireWorker('nope').ok, false);
  g.state.workers.find((w) => w.id === id).busy = startField();
  assert.equal(g.fireWorker(id).ok, false);
  g.state.workers.find((w) => w.id === id).busy = false;
  assert.equal(g.fireWorker(id).ok, true);
  assert.equal(g.workersView().length, 1);
});

test('plans record the worker-blocked reason; old saves get a starter worker', () => {
  const g = newGame(7);
  const fid = startField();
  g.state.workers[0].busy = 'elsewhere';
  g.setFieldPlan(fid, { cropId: starterCrop().id });
  assert.equal(g.getFieldView(fid).plan.blocked, 'Tidak ada pekerja bebas.');
  const s = JSON.parse(g.serialize());
  delete s.workers; delete s.candidates; delete s.candidatesWeek;
  const g2 = loadGame(JSON.stringify(s), { data: DATA });
  assert.equal(g2.workersView().length, 1);
  assert.equal(g2.workerCandidates().length, 3);
});
