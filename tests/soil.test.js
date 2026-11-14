import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startField } from './helpers.js';
import { applyLime, onFertilize, onHarvest, soilFactors, initSoil } from '../js/engine/soil.js';
import { newFieldState } from '../js/engine/fields.js';
import { loadGame } from '../js/engine.js';

function own(g, fieldId) {
  g.state.fields[fieldId] = newFieldState(g.idx.fields.get(fieldId));
  return g.state.fields[fieldId];
}

test('field soil starts from the definition pH with 0.8 nutrients', () => {
  const g = newGame();
  const f = g.state.fields[startField()];
  assert.equal(f.ph, g.idx.fields.get(startField()).ph);
  assert.equal(f.nutrients, 0.8);
  assert.equal(f.lastCropId, null);
  const s = initSoil(g, {}, { ph: 5.1 });
  assert.deepEqual(s, { ph: 5.1, nutrients: 0.8, lastCropId: null });
});

test('lime moves pH 0.5 toward 6.8 without overshooting, and yield uses the field pH', () => {
  const g = newGame();
  const f = own(g, 'f2'); // pH 5.6
  const before = g.estimateYield('f2', 'wheat');
  assert.equal(applyLime(g, 'f2'), 6.1);
  assert.equal(f.ph, 6.1);
  assert.ok(g.estimateYield('f2', 'wheat') > before);
  assert.equal(g.getFieldView('f2').ph, 6.1);
  applyLime(g, 'f2'); applyLime(g, 'f2');
  assert.equal(f.ph, 6.8);
  const h = own(g, 'f15'); // pH 7.8
  applyLime(g, 'f15');
  assert.equal(h.ph, 7.3);
});

test('fertilizing adds nutrients (cap 1); harvests use them; legumes restore', () => {
  const g = newGame();
  const id = startField();
  const f = g.state.fields[id];
  assert.equal(onFertilize(g, id), 1);
  onHarvest(g, id, 'corn');
  assert.equal(f.nutrients, 0.7);
  assert.equal(f.lastCropId, 'corn');
  onHarvest(g, id, 'soybean');
  assert.equal(f.nutrients, 0.85);
  assert.equal(soilFactors(g, id, 'wheat').nutrients, 0.6 + 0.4 * 0.85);
  f.nutrients = 0.1;
  onHarvest(g, id, 'potato');
  assert.equal(f.nutrients, 0);
});

test('planting the same crop twice costs 10% (rotation)', () => {
  const g = newGame();
  const id = startField();
  const fresh = g.estimateYield(id, 'wheat');
  onHarvest(g, id, 'wheat');
  g.state.fields[id].nutrients = 0.8;
  assert.equal(soilFactors(g, id, 'wheat').rotation, 0.9);
  assert.equal(soilFactors(g, id, 'barley').rotation, 1);
  assert.ok(Math.abs(g.estimateYield(id, 'wheat') - fresh * 0.9) < 0.05);
  const v = g.getFieldView(id);
  assert.equal(v.soilState.lastCropId, 'wheat');
  assert.equal(v.soil, g.idx.fields.get(id).soil);
  assert.equal(g.getFieldView('f20').soilState.nutrients, 0.8);
});

test('nutrients scale yield and an assumed fertilize counts its nutrients', () => {
  const g = newGame();
  const id = startField();
  const f = g.state.fields[id];
  f.nutrients = 0;
  const poor = g.estimateYield(id, 'wheat');
  f.nutrients = 1;
  const rich = g.estimateYield(id, 'wheat');
  assert.ok(Math.abs(poor / rich - 0.6) < 0.01);
  f.nutrients = 0.5;
  const fac = (a) => g.estimateYield(id, 'wheat', a);
  assert.ok(fac({ fertilized: true }) > fac({ fertilized: false }) * 1.25);
});

test('old saves without soil keys get them on load', () => {
  const g = newGame();
  const s = JSON.parse(g.serialize());
  for (const f of Object.values(s.fields)) { delete f.ph; delete f.nutrients; delete f.lastCropId; }
  delete s.forecast; delete s.events;
  const l = loadGame(JSON.stringify(s));
  const f = l.state.fields[startField()];
  assert.equal(f.ph, l.idx.fields.get(startField()).ph);
  assert.equal(f.nutrients, 0.8);
  assert.equal(l.forecast('jabar').length, 3);
  assert.deepEqual(l.activeEvents(), []);
});
