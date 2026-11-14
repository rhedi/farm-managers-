import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField, starterCrop } from './helpers.js';

const other = () => DATA.CROPS.find((c) => c.unlockLevel <= 1 && c.id !== starterCrop().id).id;

test('plan sell (default on) sells the harvest at market; sell:false keeps it', () => {
  for (const sell of [undefined, false]) {
    const g = newGame(31);
    const fid = startField();
    g.setFieldPlan(fid, { cropId: starterCrop().id, repeat: false, ...(sell === false ? { sell } : {}) });
    assert.equal(g.state.fields[fid].plan.sell, sell ?? true);
    g.advance((starterCrop().growDays + 2) * 24);
    assert.equal(g.state.stats.harvests, 1);
    const stock = g.state.silo[starterCrop().id] || 0;
    if (sell === false) assert.ok(stock > 0);
    else assert.equal(stock, 0);
  }
});

test('plan sell respects the feed reserve', () => {
  const g = newGame(32);
  const fid = startField();
  g.setFeedReserve(starterCrop().id, 10);
  g.setFieldPlan(fid, { cropId: starterCrop().id, repeat: false });
  g.advance((starterCrop().growDays + 2) * 24);
  assert.ok(Math.abs((g.state.silo[starterCrop().id] || 0) - 10) < 1e-6);
});

test('rotateCropId alternates crops each cycle', () => {
  const g = newGame(33);
  const fid = startField();
  const seeded = [];
  g.on((e) => e.type === 'task_done' && e.task === 'seed' && seeded.push(g.state.fields[fid].cropId));
  assert.equal(g.setFieldPlan(fid, { cropId: starterCrop().id, rotateCropId: other() }).ok, true);
  g.advance(24 * 22);
  assert.ok(seeded.length >= 3, `${seeded}`);
  assert.deepEqual(seeded.slice(0, 3), [starterCrop().id, other(), starterCrop().id]);
  assert.equal(g.setFieldPlan(fid, { cropId: starterCrop().id, rotateCropId: 'nope' }).ok, false);
});

test('plans avoid a machine below 20% when another is free', () => {
  const g = newGame(34);
  g.state.money = 1e6;
  g.buyMachine('jd_5075');
  const fid = startField();
  const tractors = g.state.machines.filter((m) => m.defId === 'jd_5075');
  tractors[0].condition = 0.1;
  g.setFieldPlan(fid, { cropId: starterCrop().id });
  assert.ok(g.state.fields[fid].busy.machineUids.includes(tractors[1].uid));
});

test('autoRepair repairs a machine that finishes a task below 30%', () => {
  const g = newGame(35);
  const fid = startField();
  assert.equal(g.state.autoRepair, false);
  assert.equal(g.setAutoRepair(true).ok, true);
  const uids = g.estimateTask(fid, 'plow').machineUids;
  for (const uid of uids) g.state.machines.find((m) => m.uid === uid).condition = 0.25;
  const evs = [];
  g.on((e) => e.type === 'machine_repaired' && evs.push(e));
  const r = g.startTask(fid, 'plow');
  g.advance(Math.ceil(r.hours) + 1);
  assert.equal(evs.length, 2);
  for (const uid of uids) assert.equal(g.state.machines.find((m) => m.uid === uid).condition, 1);
});

test('contract offers during a crash are priced off ≥90% of base price', () => {
  const g = newGame(36);
  const seen = new Set(g.state.contracts.map((c) => c.id));
  let checked = 0;
  for (let d = 0; d < 20; d++) {
    for (const p of DATA.PRODUCTS) g.state.market[p.id] = p.basePrice * 0.5;
    g.advance(24);
    for (const c of g.contractsView()) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.offeredDay !== g.day) continue;
      checked++;
      assert.ok(c.premiumBase >= -0.011, `${c.productId} ${c.premiumBase}`);
    }
  }
  assert.ok(checked > 0);
});
