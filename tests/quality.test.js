import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { scoreHarvest, noteHarvest, blendStock, stockMult, gradeForScore } from '../js/engine/quality.js';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const G = Object.fromEntries(DATA.BALANCE.quality.grades.map((g) => [g.id, g]));

/** Starter field ready with wheat in ideal soil: fertilized, rich, rotated, harvested at once. */
function readyField(patch = {}) {
  const g = newGame(11), fid = startField();
  Object.assign(g.state.fields[fid], { state: 'ready', cropId: 'wheat', growHours: 120, readyHours: 0, fertilized: true,
    ph: 6.8, nutrients: 1, lastCropId: 'barley', dryDays: 0, wetDays: 5, ...patch });
  return { g, fid };
}

test('grade factors: ideal harvest is A★; fertilizer, rotation, pH, timing each cost points', () => {
  const { g, fid } = readyField();
  const best = scoreHarvest(g, fid, 'wheat');
  assert.equal(best.score, 100);
  assert.equal(best.grade, 'S');
  assert.equal(best.label, 'A★');
  near(best.mult, 1.15);
  const pts = (patch) => { Object.assign(g.state.fields[fid], { fertilized: true, lastCropId: 'barley', ph: 6.8, readyHours: 0, ...patch }); return scoreHarvest(g, fid, 'wheat'); };
  const noFert = pts({ fertilized: false });
  assert.equal(noFert.score, 100 - DATA.BALANCE.quality.penalty.fertilizer);
  assert.ok(noFert.parts.some((p) => p.id === 'fert'));
  const same = pts({ lastCropId: 'wheat' });
  assert.equal(same.score, 100 - DATA.BALANCE.quality.penalty.rotation);
  assert.ok(same.parts.some((p) => p.id === 'rotation'));
  const acid = pts({ ph: 5.0 }); // 1 pH unit below wheat's 6.0 → yield ×0.85
  assert.ok(acid.score < 100 && acid.parts.some((p) => p.id === 'ph'));
  const late = pts({ readyHours: 60 });
  assert.ok(late.score < 100 && late.parts.some((p) => p.id === 'timing'));
  const withered = pts({ readyHours: 72 + 48 });
  assert.ok(withered.score < late.score, 'withering costs more than a late harvest');
  const limed = pts({ fertilized: false, limed: true });
  assert.equal(limed.score, noFert.score + DATA.BALANCE.quality.limeBonus);
  g.state.fields[fid].limed = false;
  // Grade bands
  assert.equal(gradeForScore(g, 92).id, 'S');
  assert.equal(gradeForScore(g, 91).id, 'A');
  assert.equal(gradeForScore(g, 78).id, 'A');
  assert.equal(gradeForScore(g, 60).id, 'B');
  assert.equal(gradeForScore(g, 40).id, 'C');
  assert.deepEqual([G.S.mult, G.A.mult, G.B.mult, G.C.mult], [1.15, 1.08, 1, 0.9]);
});

test('price multiplier: sales earn the stock average; bought stock counts as B; non-crops unaffected', () => {
  const g = newGame(12);
  g.state.money = 1e6;
  g.state.silo.wheat = 0;
  blendStock(g, 'wheat', 10, G.S.mult);
  g.state.silo.wheat = 10;
  near(stockMult(g, 'wheat'), 1.15, 1e-6);
  const price = g.state.market.wheat;
  const r = g.sellProduct('wheat', 4);
  assert.equal(r.ok, true);
  near(r.earned, 4 * price * 1.15);
  assert.equal(g.siloView().items.find((i) => i.id === 'wheat').grade.label, 'A★');
  assert.ok(g.buyProduct('wheat', 6).ok); // 6 t A★ + 6 t bought (B)
  near(stockMult(g, 'wheat'), (6 * 1.15 + 6) / 12, 1e-3);
  assert.equal(g.stockGrade('wheat').id, 'B'); // ×1.075 is below A (×1.08): the bought half dilutes it
  g.state.silo.milk = 100;
  assert.equal(stockMult(g, 'milk'), 1);
  assert.equal(g.stockGrade('milk'), null);
});

test('harvest flow: grade on task_done, field last harvest, records and "Rekor baru!" on a better t/ha', () => {
  const g = newGame(13), fid = startField();
  g.state.money = 1e6;
  const evs = [];
  g.on((e) => (e.type === 'task_done' || e.type === 'quality_record') && evs.push(e));
  runTask(g, fid, 'plow');
  runTask(g, fid, 'fertilize');
  runTask(g, fid, 'seed', { cropId: 'wheat' });
  g.advance(DATA.CROPS.find((c) => c.id === 'wheat').growDays * 24 + 30);
  runTask(g, fid, 'harvest', { rent: true });
  const done = evs.find((e) => e.type === 'task_done' && e.task === 'harvest');
  assert.ok(done.grade && done.tph > 0, 'task_done carries the grade');
  assert.match(done.msg, /kualitas/);
  const last = g.state.quality.fields[fid];
  assert.equal(last.cropId, 'wheat');
  assert.equal(last.grade, done.grade);
  const rec = g.state.quality.records.wheat;
  assert.equal(rec.harvests, 1);
  near(rec.tph, done.tph);
  assert.ok(!evs.some((e) => e.type === 'quality_record'), 'the first harvest sets a record silently');
  const view = g.getFieldView(fid).quality;
  assert.equal(view.last.grade, done.grade);
  assert.equal(view.last.fresh, false);
  // A bigger harvest beats the record
  const tons = rec.tph * DATA.FIELDS.find((f) => f.id === fid).sizeHa * 1.5;
  Object.assign(g.state.fields[fid], { state: 'ready', cropId: 'wheat', readyHours: 0, fertilized: true });
  const r = noteHarvest(g, fid, 'wheat', tons);
  assert.equal(r.record, true);
  const recEv = evs.find((e) => e.type === 'quality_record');
  assert.ok(recEv && /Rekor baru/.test(recEv.msg));
  assert.ok(g.getFieldView(fid).quality.last.fresh, 'field card shows the fresh record');
  const book = g.recordsView();
  assert.equal(book[0].cropId, 'wheat');
  assert.equal(book[0].harvests, 2);
  assert.ok(book.some((b) => b.tree), 'trees are in the record book');
  assert.equal(book.length, DATA.CROPS.length + DATA.TREES.length);
});

test('growing field shows a grade preview from the same factors', () => {
  const g = newGame(14), fid = startField();
  Object.assign(g.state.fields[fid], { state: 'growing', cropId: 'wheat', growHours: 10, fertilized: false });
  const p = g.getFieldView(fid).quality.preview;
  assert.ok(p && p.parts.some((x) => x.id === 'fert'));
  assert.deepEqual(g.qualityPreview(fid), p);
});

test('⭐ Kontrak kualitas: own offer slot, needs stock ≥ A, pays above the normal contract band', () => {
  const g = newGame(15);
  g.state.level = 6; g.state.money = 1e6;
  g.state.quality.records.wheat = { tph: 6, fieldId: 'f1', day: 1, grade: 'A', gradeFieldId: 'f1', gradeDay: 1, harvests: 1, tons: 36 };
  g.advance(24);
  const offers = g.contractsView().filter((c) => c.status === 'offer');
  const qc = offers.find((c) => c.minGrade);
  assert.ok(qc, 'a quality offer appears');
  assert.equal(qc.productId, 'wheat');
  assert.equal(qc.minGradeLabel, 'A');
  assert.equal(offers.filter((c) => !c.minGrade && !c.special).length, DATA.BALANCE.contracts.offers, 'normal offers unchanged');
  const base = Math.max(g.state.market.wheat, DATA.PRODUCTS.find((p) => p.id === 'wheat').basePrice * 0.9);
  const rate = qc.price / base;
  assert.ok(rate >= 1.2 && rate <= 1.31, `rate ${rate}`);
  assert.ok(g.acceptContract(qc.id).ok);
  g.state.silo.wheat = qc.qty;
  const bad = g.deliverContract(qc.id);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /kualitas/);
  assert.equal(g.contractsView().find((c) => c.id === qc.id).canDeliver, false);
  g.state.quality.stock.wheat = G.A.mult;
  const okr = g.deliverContract(qc.id);
  assert.equal(okr.ok, true, okr.reason);
  assert.equal(okr.done, true);
  near(okr.earned, qc.value);
});

test('save/load keeps quality; old saves migrate with safe defaults (stock B, no records)', () => {
  const g = newGame(16);
  g.state.quality.stock.wheat = 1.12;
  g.state.quality.records.corn = { tph: 9, fieldId: 'f1', day: 3, grade: 'S', gradeFieldId: 'f1', gradeDay: 3, harvests: 2, tons: 99 };
  g.state.quality.stock.ghost = 1.1;
  const back = loadGame(g.serialize(), { data: DATA });
  near(back.state.quality.stock.wheat, 1.12, 1e-9);
  assert.equal(back.state.quality.records.corn.grade, 'S');
  assert.equal(back.state.quality.stock.ghost, undefined, 'unknown products dropped');
  const old = JSON.parse(g.serialize());
  delete old.quality;
  const mig = loadGame(JSON.stringify(old), { data: DATA });
  assert.deepEqual(mig.state.quality, { stock: {}, records: {}, fields: {}, seq: 0 });
  assert.equal(stockMult(mig, 'wheat'), 1);
});

test('offline coarse days grade the plan harvests (on time) into the stock average', () => {
  const g = newGame(17);
  g.state.level = 10; g.state.money = 5e6;
  for (const f of DATA.FIELDS.filter((x) => (x.unlockLevel ?? 1) <= 1).slice(0, 4)) g.buyField(f.id);
  Object.keys(g.state.fields).forEach((id) => g.setFieldPlan(id, { cropId: 'barley', rotateCropId: 'wheat', fertilize: true, rent: true, sell: false }));
  g.state.storageUpgrades.silo = 12;
  const back = loadGame(g.serialize(), { data: DATA });
  back.catchUp(8 * 3600);
  assert.ok(back.lastCatchUp.coarseDays > 0);
  const q = back.state.quality.stock;
  assert.ok(Object.keys(q).length > 0, 'coarse harvests set a stock grade');
  for (const v of Object.values(q)) assert.ok(v >= 0.9 && v <= 1.15);
});
