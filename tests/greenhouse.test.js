import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { growthMultOf } from '../js/engine/fields.js';

const GH = DATA.BALANCE.greenhouse;
const ha = (id) => DATA.FIELDS.find((f) => f.id === id).sizeHa;
function rich(seed) {
  const g = newGame(seed);
  g.state.level = 30; g.state.money = 1e7;
  g.state.stats.level = 30; // as syncCounts would (loadGame re-syncs it)
  return g;
}

test('build: level gate, size limit, cost under rumah_kaca; quote shows cost/upkeep/refund', () => {
  const g = newGame(80);
  const fid = startField();
  g.state.money = 1e7;
  const q0 = g.greenhouseQuote(fid);
  assert.equal(q0.ok, false);
  assert.match(q0.reason, new RegExp(`level ${GH.unlockLevel}`));
  g.state.level = GH.unlockLevel;
  const q = g.greenhouseQuote(fid);
  assert.equal(q.ok, true);
  assert.equal(q.cost, ha(fid) * GH.costPerHa);
  assert.equal(q.upkeepPerDay, ha(fid) * GH.upkeepPerHaDay);
  assert.equal(g.buildGreenhouse(fid).ok, true);
  assert.equal(g.state.ledger.total.rumah_kaca, q.cost);
  assert.equal(g.buildGreenhouse(fid).ok, false, 'only once');
  const big = DATA.FIELDS.find((f) => f.sizeHa > GH.maxHa);
  g.state.fields[big.id] = { ...g.state.fields[fid], greenhouse: null };
  const r = g.buildGreenhouse(big.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /terlalu luas/);
});

test('daily upkeep is booked as listrik_rumah_kaca', () => {
  const g = rich(81);
  const fid = startField();
  g.buildGreenhouse(fid);
  g.advance(3 * 24);
  assert.equal(g.state.ledger.total.listrik_rumah_kaca, 3 * ha(fid) * GH.upkeepPerHaDay);
});

test('inside: no minTemp stall or off-season slowdown, +yield factor, no dry penalty', () => {
  const g = rich(82);
  const fid = startField();
  const region = DATA.FIELDS.find((f) => f.id === fid).regionId;
  const crop = DATA.CROPS.find((c) => c.id === 'vanilla');
  g.state.weather[region] = { temp: (crop.minTemp ?? 0) - 10, rain: false };
  assert.equal(growthMultOf(g, fid, crop), 0, 'too cold outdoors');
  g.buildGreenhouse(fid);
  assert.equal(growthMultOf(g, fid, crop), 1);
  Object.assign(g.state.fields[fid], { dryDays: 10, wetDays: 0 });
  const fac = g.getFieldView(fid).yieldFactors ?? null;
  assert.equal(fac, null); // nothing planted yet
  runTask(g, fid, 'plow');
  const f = g.state.fields[fid];
  Object.assign(f, { state: 'growing', cropId: crop.id, dryDays: 10, wetDays: 0, damage: 0.8 });
  const yf = g.getFieldView(fid).yieldFactors;
  assert.equal(yf.greenhouse, 1 + GH.yieldBonus);
  assert.equal(yf.weather, 1);
  assert.equal(yf.storm, 1);
  assert.ok(yf.season >= 1);
});

test('storms skip greenhouse fields', () => {
  const g = rich(83);
  const fid = startField();
  g.buildGreenhouse(fid);
  runTask(g, fid, 'plow');
  Object.assign(g.state.fields[fid], { state: 'growing', cropId: 'wheat' });
  g.data.BALANCE.events = { ...g.data.BALANCE.events, chancePerDay: 1, weights: { storm: 1 } };
  try {
    for (let d = 0; d < 6; d++) g.advance(24);
  } finally { g.data.BALANCE.events = DATA.BALANCE.events; }
  assert.ok(g.state.events.some((e) => e.type === 'storm') || g.state.log.some((l) => /Badai/.test(l.msg)), 'a storm hit');
  assert.equal(g.state.fields[fid].damage ?? 1, 1);
});

test('remove refunds 30% under penjualan_aset; orchards cannot get a greenhouse', () => {
  const g = rich(84);
  const fid = startField();
  const { cost } = g.buildGreenhouse(fid);
  const m = g.state.money;
  const r = g.removeGreenhouse(fid);
  assert.equal(r.ok, true);
  assert.equal(r.refund, cost * GH.refund);
  assert.equal(g.state.money, m + r.refund);
  assert.ok(g.state.ledger.total.penjualan_aset >= r.refund);
  assert.equal(g.state.fields[fid].greenhouse, null);
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: 'orange' });
  assert.match(g.greenhouseQuote(fid).reason, /kebun/);
});

test('greenhouse survives save/load; old saves load without one', () => {
  const g = rich(85);
  const fid = startField();
  g.buildGreenhouse(fid);
  g.advance(30);
  const g2 = loadGame(g.serialize());
  assert.deepEqual(comparable(g2), comparable(g));
  assert.ok(g2.getFieldView(fid).greenhouse.upkeepPerDay > 0);
  const old = JSON.parse(newGame(86).serialize());
  for (const f of Object.values(old.fields)) delete f.greenhouse;
  assert.equal(loadGame(JSON.stringify(old)).getFieldView(startField()).greenhouse, null);
});
