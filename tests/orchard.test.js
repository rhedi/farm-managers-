import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { ageFactor, windowOpen } from '../js/engine/orchard.js';

const TREE = DATA.TREES.find((t) => t.id === 'orange');

function planted(seed = 61) {
  const g = newGame(seed);
  const fid = startField();
  g.state.level = 30; g.state.money = 1e6;
  runTask(g, fid, 'plow');
  const r = runTask(g, fid, 'seed', { cropId: TREE.id });
  return { g, fid, r };
}
/** Advance until the field is ripe (or `max` days pass). */
function untilReady(g, fid, max = 120) {
  for (let d = 0; d < max * 24 && g.state.fields[fid].state !== 'ready'; d++) g.advance(1);
  return g.state.fields[fid].state === 'ready';
}

test('data: every tree is perennial with a product (unit t) and sane timings', () => {
  const P = new Map(DATA.PRODUCTS.map((p) => [p.id, p]));
  for (const t of DATA.TREES) {
    assert.ok(t.perennial, t.id);
    assert.equal(P.get(t.id)?.unit, 't', `${t.id} product`);
    assert.ok(t.maturityDays >= 30 && t.maturityDays <= 130, `${t.id} maturity`);
    assert.ok(t.lifespanDays > t.maturityDays && t.plantCostPerHa > 0 && t.harvestEveryDays > 0);
  }
});

test('planting is manual (worker, no seeder), costs saplings under bibit_pohon, field becomes an orchard', () => {
  const g = newGame(60);
  const fid = startField();
  g.state.level = 30; g.state.money = 1e6;
  runTask(g, fid, 'plow');
  const est = g.estimateTask(fid, 'seed', { cropId: TREE.id });
  assert.equal(est.ok, true);
  assert.deepEqual(est.machineUids, []);
  assert.ok(est.workerId);
  const ha = DATA.FIELDS.find((f) => f.id === fid).sizeHa;
  assert.equal(est.materialCost, ha * TREE.plantCostPerHa);
  runTask(g, fid, 'seed', { cropId: TREE.id });
  assert.equal(g.state.fields[fid].state, 'orchard');
  assert.equal(g.state.ledger.total.bibit_pohon, ha * TREE.plantCostPerHa);
  const v = g.getFieldView(fid);
  assert.equal(v.orchard.stage, 'young');
  assert.ok(v.crop.perennial);
  assert.ok(!v.actions.includes('harvest') && !v.actions.includes('plow') && v.actions.includes('clear'));
});

test('trees mature, then fruit repeatedly without replanting; harvest with rented pickers (sewa_pemetik)', () => {
  const { g, fid } = planted();
  g.advance(10 * 24);
  assert.equal(g.state.fields[fid].state, 'orchard', 'juvenile trees bear no fruit');
  let picks = 0;
  for (let i = 0; i < 3; i++) {
    assert.ok(untilReady(g, fid), `ripe #${i + 1}`);
    assert.ok(g.getFieldView(fid).orchard.mature);
    const before = g.state.silo.orange || 0;
    runTask(g, fid, 'harvest', { rent: true });
    assert.ok((g.state.silo.orange || 0) > before, 'fruit stored');
    assert.equal(g.state.fields[fid].state, 'orchard', 'trees stay after harvest');
    assert.equal(g.state.fields[fid].cropId, 'orange');
    picks++;
  }
  assert.equal(g.state.fields[fid].orchard.harvests, picks);
  assert.ok(g.state.ledger.total.sewa_pemetik > 0);
  assert.ok(!g.state.ledger.total.sewa_pemanen);
});

test('fruit only grows inside the fruiting window', () => {
  const { g, fid } = planted(62);
  g.advance(TREE.maturityDays * 24 + 24);
  const region = DATA.FIELDS.find((f) => f.id === fid).regionId;
  // hour by hour for a year: fruit (growHours) never advances while the window is closed
  let closed = 0, openGrowth = 0;
  for (let h = 0; h < DATA.BALANCE.yearDays * 24; h++) {
    if (g.state.fields[fid].state === 'ready') runTask(g, fid, 'harvest', { rent: true });
    if (g.state.fields[fid].busy) continue;
    const before = g.state.fields[fid].growHours;
    g.advance(1);
    const open = windowOpen(g, region, TREE); // the hourly step runs on the new clock
    const grew = g.state.fields[fid].state === 'orchard' && g.state.fields[fid].growHours > before;
    if (!open) { closed++; assert.equal(grew, false, `closed-window growth at day ${g.day}`); }
    else if (grew) openGrowth++;
  }
  assert.ok(closed > 0 && openGrowth > 0, `closed ${closed} open ${openGrowth}`);
});

test('old trees decline after lifespan (floor), yield factor shows it', () => {
  const g = newGame(63);
  assert.equal(ageFactor(g, TREE, TREE.lifespanDays), 1);
  assert.ok(ageFactor(g, TREE, TREE.lifespanDays * 1.25) < 0.7);
  assert.equal(ageFactor(g, TREE, TREE.lifespanDays * 5), DATA.BALANCE.orchard.minAgeFactor);
  const { g: g2, fid } = planted(64);
  const young = g2.getFieldView(fid).yieldFactors.age;
  g2.state.fields[fid].orchard.plantedAt -= TREE.lifespanDays * 1.3 * 24;
  const v = g2.getFieldView(fid);
  assert.equal(young, 1);
  assert.ok(v.yieldFactors.age < 0.7 && v.orchard.stage === 'old');
});

test('prune: optional, mature trees only, +yield this cycle (perawatan_kebun)', () => {
  const { g, fid } = planted(65);
  assert.equal(g.estimateTask(fid, 'prune').ok, false);
  g.advance(TREE.maturityDays * 24 + 2);
  const y0 = g.estimateYield(fid, TREE.id);
  runTask(g, fid, 'prune');
  assert.ok(g.state.fields[fid].orchard.pruned);
  assert.equal(g.getFieldView(fid).yieldFactors.prune, 1 + DATA.BALANCE.orchard.pruneBonus, `y0 ${y0}`); // weather may differ by seed
  assert.ok(g.state.ledger.total.perawatan_kebun > 0);
  assert.equal(g.estimateTask(fid, 'prune').ok, false, 'once per cycle');
});

test('tebang (clear) returns the field to idle and drops the tree plan', () => {
  const { g, fid } = planted(66);
  g.setFieldPlan(fid, { cropId: TREE.id });
  runTask(g, fid, 'clear');
  const f = g.state.fields[fid];
  assert.equal(f.state, 'idle');
  assert.equal(f.orchard, null);
  assert.equal(f.cropId, null);
  assert.equal(f.plan, null);
});

test('plan auto-harvests (rented pickers) and auto-sells an orchard', () => {
  const { g, fid } = planted(67);
  g.setFieldPlan(fid, { cropId: TREE.id, fertilize: true, rent: true, sell: true });
  g.advance((TREE.maturityDays + 60) * 24);
  assert.ok(g.state.fields[fid].orchard.harvests >= 2, `harvests ${g.state.fields[fid].orchard.harvests}`);
  assert.equal(g.state.fields[fid].cropId, TREE.id, 'never replanted');
  assert.ok(g.state.ledger.total.penjualan_panen > 0);
  assert.equal(g.state.silo.orange || 0, 0);
});

test('orchardOutlook: payback ≥ 1.5 game years in the best region for every tree', () => {
  const g = newGame(68);
  g.state.level = 30;
  const Y = DATA.BALANCE.yearDays;
  for (const t of DATA.TREES) {
    const o = g.orchardOutlook(startField(), t.id);
    assert.ok(o.harvestsPerYear > 0 && o.yearlyProfit > 0, t.id);
    assert.ok(o.paybackDays >= 1.5 * Y, `${t.id} payback ${o.paybackDays}`);
  }
});

test('save/load keeps the orchard; pre-orchard saves load with orchard: null', () => {
  const { g, fid } = planted(69);
  g.advance(50 * 24);
  const g2 = loadGame(g.serialize());
  assert.deepEqual(comparable(g2), comparable(g));
  const old = JSON.parse(newGame(70).serialize());
  for (const f of Object.values(old.fields)) { delete f.orchard; delete f.greenhouse; }
  const g3 = loadGame(JSON.stringify(old));
  assert.equal(g3.state.fields[startField()].orchard, null);
  g3.advance(24);
});
