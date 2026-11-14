import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';

test('field plan runs the full cycle on its own and repeats', () => {
  const g = newGame(11);
  const fid = startField();
  const crop = starterCrop();
  assert.equal(g.setFieldPlan(fid, { cropId: crop.id, fertilize: true, rent: true }).ok, true);
  assert.equal(g.getFieldView(fid).task, 'plow', 'plan starts immediately');
  g.advance((crop.growDays + 2) * 24);
  assert.ok(g.state.stats.harvests >= 1);
  const v = g.getFieldView(fid);
  assert.ok(v.plan && v.plan.repeat);
  assert.ok(['busy', 'plowed', 'growing'].includes(v.state), `cycle continued (${v.state})`);
});

test('non-repeating plan clears itself after harvest', () => {
  const g = newGame(12);
  const fid = startField();
  g.setFieldPlan(fid, { cropId: starterCrop().id, repeat: false });
  g.advance((starterCrop().growDays + 2) * 24);
  assert.equal(g.state.stats.harvests, 1);
  assert.equal(g.getFieldView(fid).plan, null);
  assert.equal(g.getFieldView(fid).state, 'idle');
});

test('plan records an Indonesian blocked reason when money runs out', () => {
  const g = newGame(13);
  const fid = startField();
  runTask(g, fid, 'plow');
  g.state.money = 0;
  g.setFieldPlan(fid, { cropId: starterCrop().id, fertilize: false });
  const v = g.getFieldView(fid);
  assert.equal(v.plan.blocked, 'Uang tidak cukup.');
  assert.equal(v.nextStep, 'seed');
});

test('setFieldPlan validates crop and ownership; null clears', () => {
  const g = newGame(14);
  const fid = startField();
  const locked = DATA.CROPS.find((c) => c.unlockLevel > 1);
  assert.equal(g.setFieldPlan(fid, { cropId: locked.id }).ok, false);
  assert.equal(g.setFieldPlan(cheapestOtherField(g).id, { cropId: starterCrop().id }).ok, false);
  g.setFieldPlan(fid, { cropId: starterCrop().id });
  assert.equal(g.setFieldPlan(fid, null).ok, true);
  assert.equal(g.getFieldView(fid).plan, null);
});

test('nextStep and yieldFactors on the field view', () => {
  const g = newGame(15);
  const fid = startField();
  assert.equal(g.getFieldView(fid).nextStep, 'plow');
  assert.equal(g.getFieldView(fid).yieldFactors, null);
  runTask(g, fid, 'plow');
  assert.equal(g.getFieldView(fid).nextStep, 'fertilize');
  runTask(g, fid, 'seed', { cropId: starterCrop().id });
  const v = g.getFieldView(fid);
  for (const k of ['soil', 'ph', 'fert', 'irrig', 'contamination', 'weather', 'wither']) assert.equal(typeof v.yieldFactors[k], 'number');
  const product = Object.values(v.yieldFactors).reduce((p, x) => p * x, v.sizeHa * starterCrop().baseYield);
  assert.ok(Math.abs(product - v.predictedYield) < 0.5);
  assert.ok(g.estimateYield(fid, starterCrop().id, { fertilized: true }) > v.predictedYield);
});

test('startTaskAll plows every idle field and reports skipped ones', () => {
  const g = newGame(16);
  g.state.money = 1e6;
  g.buyField(cheapestOtherField(g).id);
  const r = g.startTaskAll('plow');
  assert.equal(r.started.length, 1, 'one tractor → one field started');
  assert.equal(r.skipped.length, 1);
  assert.equal(typeof r.skipped[0].reason, 'string');
  assert.equal(g.startTaskAll('dance').ok, false);
});

test('startTaskAll harvest with rent covers every ready field', () => {
  const g = newGame(17);
  g.state.money = 1e6;
  g.buyField(cheapestOtherField(g).id);
  for (const fid of Object.keys(g.state.fields)) {
    runTask(g, fid, 'plow');
    runTask(g, fid, 'seed', { cropId: starterCrop().id });
  }
  g.advance(starterCrop().growDays * 24 + 1);
  assert.equal(g.startTaskAll('harvest').started.length, 0, 'no harvester owned and no rent');
  const r = g.startTaskAll('harvest', { rent: true });
  assert.equal(r.started.length, 2);
});
