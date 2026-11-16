import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';

const RS = DATA.BALANCE.realSecondsPerGameHour;
const MAX = 8 * 3600 / RS; // 8 real hours of game time

/** A mid-game farm: every Lv ≤ 20 field with a sell plan, a herd, a pond, a mill run by a Supervisor. */
function farm(seed = 61) {
  const g = newGame(seed);
  g.state.level = 20; g.state.money = 5e6;
  for (const f of DATA.FIELDS.filter((x) => (x.unlockLevel ?? 1) <= 1).slice(0, 8)) g.buyField(f.id);
  const crops = DATA.CROPS.filter((c) => !c.perennial && c.unlockLevel <= 5);
  Object.keys(g.state.fields).forEach((id, i) => g.setFieldPlan(id, { cropId: crops[i % crops.length].id, rent: true, sell: i % 3 !== 0 }));
  g.buildBarn('chickens'); g.buyAnimal('chickens', 100);
  const p = g.buildPond('lele'); g.stockPond(p.uid);
  g.buyFactory('mill'); g.hireFactoryManager('supervisor');
  g.state.silo.wheat = 60;
  g.state.money = 3e5;
  g.advance(30);
  return g.serialize();
}
const load = (json) => loadGame(json, { data: DATA });

test('catch-up: 48 h exact, then coarse days up to 8 real hours; returns the hours and clock moves exactly', () => {
  const g = load(farm());
  const t0 = g.state.time;
  assert.equal(g.catchUp(24 * 3600), MAX);
  assert.deepEqual({ ...g.lastCatchUp, coarseDays: g.lastCatchUp.coarseDays > 0 }, { exactHours: 48, coarseHours: MAX - 48, coarseDays: true });
  assert.ok(Math.abs(g.state.time - (t0 + MAX)) < 1e-6);
  const short = load(farm());
  assert.equal(short.catchUp(10 * RS), 10);
  assert.equal(short.lastCatchUp.coarseDays, 0);
});

test('coarse progress is monotonic in the time away and runs at 50% of the exact rate', () => {
  const json = farm();
  const run = (hours) => { const g = load(json); const r = g.catchUpReport(hours * 3600); return { g, r: r.report }; };
  const rs = [1, 2, 4, 8].map((h) => run(h));
  for (let i = 1; i < rs.length; i++) {
    assert.ok(rs[i].r.harvestTons >= rs[i - 1].r.harvestTons, 'harvest');
    assert.ok(rs[i].r.sales >= rs[i - 1].r.sales, 'sales');
    assert.ok(rs[i].g.state.time > rs[i - 1].g.state.time, 'time');
  }
  assert.ok(rs[3].r.harvestTons > 0 && rs[3].r.sales > 0 && rs[3].r.animalOutput > 0 && rs[3].r.wages > 0);
  // Mode hemat = 50% of the plan rate the owned machines allow: half of a 100% run, and never better than playing.
  const tons = (g) => g.state.stats.tonsHarvested;
  const span = (48 + 24 * 40) * RS;
  const withEff = (efficiency) => { const g = loadGame(json, { data: { ...DATA, BALANCE: { ...DATA.BALANCE, offline: { efficiency } } } }); g.catchUp(span); return tons(g); };
  const window = load(json);
  window.catchUp(48 * RS);
  const half = withEff(0.5) - tons(window), full = withEff(1) - tons(window);
  assert.ok(Math.abs(half / full - 0.5) < 0.05, `50% vs 100%: ${half} / ${full}`);
  const exact = load(json), e0 = tons(exact);
  exact.advance(48 + 24 * 40);
  const ratio = (withEff(0.5) - e0) / (tons(exact) - e0);
  assert.ok(ratio > 0.25 && ratio <= 1, `coarse/exact ${ratio}`);
});

test('coarse catch-up is deterministic, bounded and silent (listeners muted; log still kept)', () => {
  const json = farm();
  const a = load(json), b = load(json);
  const evs = [];
  a.on((e) => evs.push(e));
  const t0 = performance.now();
  a.catchUp(8 * 3600);
  const ms = performance.now() - t0;
  b.catchUp(8 * 3600);
  assert.deepEqual(comparable(a), comparable(b));
  assert.ok(ms < 3000, `8 h away took ${ms} ms`);
  const exactEvents = evs.length;
  assert.ok(exactEvents < 2000, `${exactEvents} events reached listeners`);
  assert.ok(a.state.log.length > 0);
  assert.ok(!a.muted, 'listeners back on');
});

test('paused: nothing runs and the report is empty', () => {
  const g = load(farm());
  g.setSpeed(0);
  const before = comparable(g);
  const r = g.catchUpReport(8 * 3600);
  assert.equal(r.hours, 0);
  assert.deepEqual(comparable(g), before);
  assert.equal(r.report.harvestTons, 0);
  assert.equal(r.report.days, 0);
});

test('morning report sums sales, wages, level-ups and net worth change; contracts are delivered while away', () => {
  const g = load(farm());
  const crop = 'wheat';
  g.state.silo.wheat = 200;
  g.state.contracts.push({ id: 'kOff', productId: crop, qty: 30, delivered: 0, price: 300, value: 9000, days: 30,
    offeredDay: g.day, expiresDay: g.day + 3, dueDay: g.day + 30, penalty: 900, xp: 50, status: 'active' });
  const r = g.catchUpReport(8 * 3600).report;
  assert.ok(r.contractsDone >= 1);
  assert.ok(r.days >= 470);
  assert.ok(r.levelTo >= r.levelFrom);
  assert.equal(typeof r.netWorthChange, 'number');
  assert.ok(r.wages > 0 && r.feed > 0);
  assert.ok(r.coarseDays > 400);
});
