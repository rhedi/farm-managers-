import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { fieldRates } from '../js/engine/offline.js';
import { fieldUnlockLevel } from '../js/engine/defs.js';

const M = DATA.BALANCE.mandor;
const tier = (id) => M.tiers.find((t) => t.id === id);
const crop = DATA.CROPS.find((c) => c.unlockLevel <= 1).id;

/** Game at `level` with `n` owned fields (starter + the next cheapest open ones), money to spare. */
function farm(n, level = 1, seed = 7) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e8;
  const open = DATA.FIELDS.filter((f) => !g.state.fields[f.id] && fieldUnlockLevel(DATA, f) <= level).sort((a, b) => a.price - b.price);
  for (const f of open.slice(0, n - 1)) assert.ok(g.buyField(f.id).ok, f.id);
  return g;
}
const owned = (g) => Object.keys(g.state.fields);
const ha = (id) => DATA.FIELDS.find((f) => f.id === id).sizeHa;
const planAll = (g, ids = owned(g)) => ids.map((id) => g.setFieldPlan(id, { cropId: crop }));
const paused = (g) => owned(g).filter((id) => g.state.fields[id].plan?.paused);

test('BALANCE.mandor: 2 free fields, tiers Lv 4 / 12 / 20 / 77 cover 12 / 30 / all / all, Kepala +5%, Agronom +10% speed', () => {
  assert.equal(M.freeFields, 2);
  assert.deepEqual(M.tiers.map((t) => [t.unlockLevel, t.fields]), [[4, 12], [12, 30], [20, null], [77, null]]);
  assert.equal(tier('kepala').speed, 0.05);
  assert.equal(tier('agronom').speed, 0.1);
  assert.ok(M.tiers.every((t, i) => !i || (t.hireCost > M.tiers[i - 1].hireCost && t.wage > M.tiers[i - 1].wage)));
});

test('cap: plans run on 2 fields; the rest stay configured but paused with the label', () => {
  const g = farm(3);
  const ids = owned(g).sort((a, b) => ha(b) - ha(a));
  planAll(g, ids);
  assert.deepEqual(paused(g), [ids[2]]);
  const f = g.state.fields[ids[2]];
  assert.equal(f.plan.cropId, crop, 'plan kept');
  assert.equal(f.plan.blocked, 'Butuh Mandor (2/2 ladang gratis)');
  assert.equal(g.getFieldView(ids[2]).plan.paused, true);
  g.advance(6);
  assert.equal(g.state.fields[ids[2]].state, 'idle', 'a paused plan never starts work');
  assert.equal(g.state.fields[ids[2]].busy, null);
  const v = g.mandorView();
  assert.equal(v.cap, 2); assert.equal(v.running, 2); assert.equal(v.paused, 1);
  // ⚡ Kerjakan sekaligus still works on the paused field
  const r = g.startTaskAll('plow');
  assert.ok(r.started.some((s) => s.fieldId === ids[2]) || r.skipped.some((s) => s.fieldId === ids[2]));
});

test('setFieldPlan reports paused; 📌 pin chooses which fields run', () => {
  const g = farm(3);
  const ids = owned(g).sort((a, b) => ha(b) - ha(a));
  g.setFieldPlan(ids[0], { cropId: crop }); g.setFieldPlan(ids[1], { cropId: crop });
  assert.equal(g.setFieldPlan(ids[2], { cropId: crop }).paused, true);
  const r = g.pinMandorField(ids[2], true);
  assert.ok(r.ok); assert.equal(r.paused, false);
  assert.deepEqual(paused(g), [ids[1]]);
  g.pinMandorField(ids[2], false);
  assert.deepEqual(paused(g), [ids[2]]);
});

test('a running plan is never paused by a newer or bigger field; new plans beyond the cap wait', () => {
  const g = farm(3, 5);
  const small = owned(g).sort((a, b) => ha(a) - ha(b));
  planAll(g, small.slice(0, 2)); // the two smallest run first
  assert.equal(g.setFieldPlan(small[2], { cropId: crop }).paused, true, 'the biggest, planned last, waits');
  assert.deepEqual(paused(g), [small[2]]);
  const big = DATA.FIELDS.filter((f) => !g.state.fields[f.id] && fieldUnlockLevel(DATA, f) <= 5 && f.sizeHa > ha(small[2]))[0];
  assert.ok(big && g.buyField(big.id).ok);
  g.setFieldPlan(big.id, { cropId: crop });
  assert.deepEqual(paused(g).sort(), [small[2], big.id].sort());
  g.advance(3);
  assert.deepEqual(paused(g).sort(), [small[2], big.id].sort(), 'stays stable over time');
  assert.ok(g.hireMandor('mandor').ok);
  assert.equal(paused(g).length, 0);
  g.fireMandor();
  assert.deepEqual(paused(g).sort(), [small[2], big.id].sort(), 'firing keeps the first-activated plans running');
  const l = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(l.state.mandor.active.slice(0, 2), small.slice(0, 2), 'activation order survives save/load');
});

test('hire / promote / downgrade / fire: level gate, 50% trade-in, wages to gaji, plans pause again', () => {
  const g = farm(14, 3);
  planAll(g);
  assert.equal(paused(g).length, 12);
  assert.equal(g.hireMandor('mandor').reason, 'Butuh level 4.');
  g.state.level = 4;
  const m0 = g.state.money;
  assert.ok(g.hireMandor('mandor').ok);
  assert.equal(g.state.money, m0 - tier('mandor').hireCost);
  assert.equal(paused(g).length, 2, '12 of 14 run');
  assert.match(g.state.fields[paused(g)[0]].plan.blocked, /^Butuh Mandor Senior \(12\/12 ladang\)$/);
  assert.equal(g.hireMandor('senior').ok, false, 'one mandor at a time');
  assert.equal(g.replaceMandor('senior').reason, 'Butuh level 12.');
  g.state.level = 12;
  const m1 = g.state.money;
  const up = g.replaceMandor('senior');
  assert.equal(up.cost, tier('senior').hireCost - 0.5 * tier('mandor').hireCost);
  assert.equal(g.state.money, m1 - up.cost);
  assert.equal(paused(g).length, 0);
  assert.equal(g.replaceMandor('mandor').cost, 0, 'downgrade free');
  const gaji = () => g.state.ledger.total.gaji ?? 0, workers = () => g.state.workers.reduce((a, w) => a + w.wage, 0);
  const g0 = gaji(), w0 = workers();
  g.advance(24);
  assert.ok(Math.abs(gaji() - g0 - w0 - tier('mandor').wage) < 1, 'one day of worker wages + the Mandor wage');
  assert.ok(g.fireMandor().ok);
  assert.equal(g.state.mandor.hired, null);
  assert.equal(paused(g).length, 12);
  assert.ok(owned(g).every((id) => g.state.fields[id].plan), 'firing keeps every plan');
});

test('Kepala Mandor: all fields, own-rig tasks on planned fields 5% faster', () => {
  const g = farm(3, 20);
  const id = owned(g)[0];
  const before = g.estimateTask(id, 'plow').hours;
  g.setFieldPlan(id, { cropId: crop });
  g.state.fields[id].busy = null; g.state.fields[id].state = 'idle';
  for (const m of g.state.machines) m.busy = false;
  for (const w of g.state.workers) w.busy = false;
  assert.ok(g.hireMandor('kepala').ok);
  g.state.fields[id].busy = null; for (const m of g.state.machines) m.busy = false; for (const w of g.state.workers) w.busy = false;
  const after = g.estimateTask(id, 'plow').hours;
  assert.ok(Math.abs(after - before / 1.05) < 0.02, `${before} → ${after}`);
  assert.equal(g.mandorView().cap, null);
});

/** An old save: today's state without the `mandor` key. */
function oldSave(g, level) {
  const s = JSON.parse(g.serialize());
  delete s.mandor;
  s.level = level;
  return s;
}

test('grandfathering: old save with > 2 plans gets the covering tier free, one notice, nothing paused', () => {
  const g = farm(5, 2);
  planAll(g);
  const old = oldSave(g, 2);
  for (const id of Object.keys(old.fields)) { old.fields[id].plan.paused = false; old.fields[id].plan.blocked = null; }
  const money = old.money;
  const l = loadGame(old, { data: DATA });
  assert.equal(l.state.mandor.hired.tierId, 'mandor', 'smallest covering tier, even below its level');
  assert.equal(l.state.money, money, 'free');
  l.advance(1);
  assert.equal(paused(l).length, 0);
  assert.equal(l.takeMandorNotice(), true);
  assert.equal(l.takeMandorNotice(), false, 'toast once');
  const again = loadGame(l.serialize(), { data: DATA });
  assert.equal(again.takeMandorNotice(), false, 'not after a re-save');
  assert.equal(again.state.mandor.hired.tierId, 'mandor');
});

test('grandfathering: Lv 33 save with 30 planned fields → Kepala Mandor, all 30 run; ≤ 2 plans → no mandor', () => {
  const g = farm(30, 33);
  planAll(g);
  assert.equal(owned(g).length, 30);
  const l = loadGame(oldSave(g, 33), { data: DATA });
  assert.equal(l.state.mandor.hired.tierId, 'kepala');
  l.advance(2);
  assert.equal(paused(l).length, 0);
  const many = farm(32, 40);
  planAll(many);
  assert.equal(loadGame(oldSave(many, 15), { data: DATA }).state.mandor.hired.tierId, 'kepala', '> 30 fields');
  const mid = farm(14, 15);
  planAll(mid);
  assert.equal(loadGame(oldSave(mid, 15), { data: DATA }).state.mandor.hired.tierId, 'senior');
  const two = farm(4, 30);
  planAll(two, owned(two).slice(0, 2));
  const t = loadGame(oldSave(two, 30), { data: DATA });
  assert.equal(t.state.mandor.hired, null);
  assert.equal(t.takeMandorNotice(), false);
});

test('a new save keeps the rule after load (no grandfathering), pins and tier survive save/load', () => {
  const g = farm(4, 5);
  planAll(g);
  g.pinMandorField(owned(g)[3], true);
  const l = loadGame(g.serialize(), { data: DATA });
  assert.equal(l.state.mandor.hired, null);
  assert.deepEqual(l.state.mandor.pins, [owned(g)[3]]);
  assert.deepEqual(paused(l).sort(), paused(g).sort());
  assert.ok(l.hireMandor('mandor').ok);
  const l2 = loadGame(l.serialize(), { data: DATA });
  assert.equal(l2.state.mandor.hired.tierId, 'mandor');
  assert.equal(paused(l2).length, 0);
});

test('offline coarse mode only runs the covered plans', () => {
  const g = farm(4, 5);
  for (let i = 0; i < 6; i++) g.state.workers.push({ ...g.state.workers[0], id: `wx${i}`, busy: false });
  planAll(g);
  const rates = fieldRates(g).map((r) => r.fieldId).sort();
  assert.deepEqual(rates, owned(g).filter((id) => !g.state.fields[id].plan.paused).sort());
  assert.equal(rates.length, 2);
  g.hireMandor('mandor');
  assert.equal(fieldRates(g).length, 4);
});
