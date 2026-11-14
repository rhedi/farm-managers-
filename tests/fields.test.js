import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';

test('full loop: plow → fertilize → seed → grow → harvest (rented) → sell', () => {
  const g = newGame(7);
  const fid = startField();
  const crop = starterCrop();
  const events = [];
  g.on((e) => events.push(e.type));
  const money0 = g.state.money;

  runTask(g, fid, 'plow');
  assert.equal(g.getFieldView(fid).state, 'plowed');
  runTask(g, fid, 'fertilize');
  assert.equal(g.state.fields[fid].fertilized, true);
  runTask(g, fid, 'seed', { cropId: crop.id });
  const v = g.getFieldView(fid);
  assert.equal(v.state, 'growing');
  assert.equal(v.crop.id, crop.id);
  assert.ok(v.predictedYield > 0);

  g.advance(crop.growDays * 24);
  assert.equal(g.getFieldView(fid).state, 'ready');
  assert.ok(events.includes('crop_ready'));
  assert.deepEqual(g.getFieldView(fid).actions, ['harvest']);

  const noHarv = g.startTask(fid, 'harvest');
  if (!g.state.machines.some((m) => g.idx.machines.get(m.defId).type === 'harvester')) {
    assert.equal(noHarv.ok, false);
    assert.match(noHarv.reason, /pemanen/i);
  }
  const est = g.estimateTask(fid, 'harvest', { rent: true });
  assert.equal(est.ok, true);
  assert.ok(est.rentCost > 0);
  runTask(g, fid, 'harvest', { rent: true });
  assert.equal(g.getFieldView(fid).state, 'idle');
  const tons = g.state.silo[crop.id];
  assert.ok(tons > 0, 'harvest goes to silo');
  assert.equal(g.state.stats.harvests, 1);
  assert.ok(g.state.xp > 0);

  const sale = g.sellProduct(crop.id);
  assert.equal(sale.ok, true);
  assert.equal(g.state.silo[crop.id] ?? 0, 0);
  assert.ok(g.state.money > money0, `money ${g.state.money} should exceed start ${money0}`);
  assert.ok(events.includes('task_done'));
  assert.ok(g.state.log.length > 0 && g.state.log.length <= 50);
});

test('field shows busy with progress while a task runs', () => {
  const g = newGame();
  const fid = startField();
  const r = g.startTask(fid, 'plow');
  assert.equal(r.ok, true);
  g.advance(r.hours / 2);
  const v = g.getFieldView(fid);
  assert.equal(v.state, 'busy');
  assert.ok(v.progress > 0.3 && v.progress < 0.7);
  assert.deepEqual(v.actions, []);
});

test('validation: insufficient money', () => {
  const g = newGame();
  g.state.money = 0;
  const r = g.startTask(startField(), 'plow');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Uang tidak cukup.');
  assert.equal(g.buyField(cheapestOtherField(g).id).ok, false);
});

test('validation: tractor hp too low', () => {
  const g = newGame();
  const tractor = g.machinesView().find((m) => m.type === 'tractor');
  const heavy = DATA.MACHINES.find((m) => m.type === 'implement' && m.task === 'plow' && m.hpRequired > tractor.hp);
  g.state.level = heavy.unlockLevel;
  g.state.money = 1e6;
  const { uid } = g.buyMachine(heavy.id);
  const r = g.startTask(startField(), 'plow', { tractorId: tractor.uid, implementId: uid });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Tenaga traktor tidak cukup/);
});

test('validation: locked crop and locked machine', () => {
  const g = newGame();
  const fid = startField();
  runTask(g, fid, 'plow');
  const locked = DATA.CROPS.find((c) => c.unlockLevel > 1);
  const r = g.startTask(fid, 'seed', { cropId: locked.id });
  assert.equal(r.ok, false);
  assert.match(r.reason, /level/);
  const lockedM = DATA.MACHINES.find((m) => m.unlockLevel > 1);
  g.state.money = 1e7;
  assert.match(g.buyMachine(lockedM.id).reason, /level/);
});

test('validation: busy machine, wrong state, not owned', () => {
  const g = newGame();
  const fid = startField();
  const other = cheapestOtherField(g);
  g.state.money = 1e6;
  assert.equal(g.buyField(other.id).ok, true);
  assert.equal(g.startTask(fid, 'plow').ok, true);
  const r = g.startTask(other.id, 'plow');
  assert.equal(r.ok, false);
  assert.match(r.reason, /sedang dipakai/);
  assert.equal(g.startTask(fid, 'plow').reason, 'Ladang sedang dikerjakan.');
  assert.equal(g.startTask(other.id, 'harvest').ok, false);
  const notOwned = DATA.FIELDS.find((f) => !g.state.fields[f.id]);
  assert.equal(g.startTask(notOwned.id, 'plow').ok, false);
  const busyUid = g.state.machines.find((m) => m.busy).uid;
  assert.equal(g.sellMachine(busyUid).ok, false);
  assert.equal(g.sellField(fid).ok, false);
});

test('crops wither when left ready too long', () => {
  const g = newGame(3);
  const fid = startField();
  const crop = starterCrop();
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: crop.id });
  g.advance(crop.growDays * 24 + 1);
  const fresh = g.getFieldView(fid).predictedYield;
  g.advance(24 * 5);
  const v = g.getFieldView(fid);
  assert.equal(v.withering, true);
  assert.ok(v.predictedYield < fresh * 0.85);
});

test('buy/sell field and machine refunds', () => {
  const g = newGame();
  const other = cheapestOtherField(g);
  g.state.money = 1e6;
  g.buyField(other.id);
  const before = g.state.money;
  const r = g.sellField(other.id);
  assert.equal(r.ok, true);
  assert.equal(g.state.money, before + other.price * 0.7);
  const m = g.machinesView()[0];
  const m0 = g.state.money;
  assert.equal(g.sellMachine(m.uid).ok, true);
  assert.equal(g.state.money, m0 + m.price * 0.6);
});
