import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop } from './helpers.js';

const limeImpl = () => DATA.MACHINES.find((m) => m.type === 'implement' && m.task === 'lime');

test('lime task: needs an implement, costs material, moves pH, once per cycle', (t) => {
  if (!limeImpl()) return t.skip('no lime implement in data');
  const g = newGame(21);
  const fid = startField();
  assert.ok(!g.getFieldView(fid).actions.includes('lime'));
  assert.equal(g.estimateTask(fid, 'lime').ok, false);
  g.state.level = 10;
  g.buyMachine(limeImpl().id);
  assert.ok(g.getFieldView(fid).actions.includes('lime'));
  const est = g.estimateTask(fid, 'lime');
  const ha = DATA.FIELDS.find((f) => f.id === fid).sizeHa;
  assert.equal(est.materialCost, ha * (DATA.BALANCE.limeCostPerHa ?? 90));
  const ph0 = DATA.FIELDS.find((f) => f.id === fid).ph;
  runTask(g, fid, 'lime');
  assert.ok(Math.abs(g.state.fields[fid].ph - 6.8) < Math.abs(ph0 - 6.8));
  assert.equal(g.state.fields[fid].limed, true);
  assert.ok(!g.getFieldView(fid).actions.includes('lime'), 'once per cycle');
  runTask(g, fid, 'plow');
  assert.equal(g.state.fields[fid].limed, false);
});

test('plan with lime limes a plowed field before fertilizing', (t) => {
  if (!limeImpl()) return t.skip('no lime implement in data');
  const g = newGame(22);
  const fid = startField();
  g.state.level = 10;
  g.state.money = 1e6;
  g.buyMachine(limeImpl().id);
  g.state.fields[fid].ph = 5.5;
  const tasks = [];
  g.on((e) => e.type === 'task_done' && tasks.push(e.task));
  g.setFieldPlan(fid, { cropId: starterCrop().id, lime: true });
  g.advance(48);
  assert.deepEqual(tasks.slice(0, 3), ['plow', 'lime', 'fertilize']);
  assert.ok(g.state.fields[fid].ph > 5.5);
});
