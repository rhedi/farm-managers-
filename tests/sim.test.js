import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, loadFrom } from '../js/engine.js';
import { DATA, newGame, runTask, startField, starterCrop, comparable } from './helpers.js';

test('market prices stay within 0.5x–1.8x over 365 days; history capped at 30', () => {
  const g = newGame(99);
  const seen = Object.fromEntries(DATA.PRODUCTS.map((p) => [p.id, new Set()]));
  for (let d = 0; d < 365; d++) {
    g.advance(24);
    for (const p of DATA.PRODUCTS) {
      const price = g.state.market[p.id];
      assert.ok(price >= p.basePrice * 0.5 - 1e-9 && price <= p.basePrice * 1.8 + 1e-9, `${p.id} ${price}`);
      seen[p.id].add(price);
    }
  }
  for (const p of DATA.PRODUCTS) {
    assert.ok(seen[p.id].size > 30, `${p.id} prices move`);
    assert.equal(g.state.priceHistory[p.id].length, 30);
  }
  const mv = g.marketView();
  assert.equal(mv.length, DATA.PRODUCTS.length);
  assert.equal(mv[0].history.length, 30);
});

test('weather rolls per region daily', () => {
  const g = newGame(5);
  const types = [];
  g.on((e) => types.push(e.type));
  g.advance(24 * 30);
  assert.equal(types.filter((t) => t === 'weather').length, 30);
  const w = g.weatherView();
  assert.equal(w.length, DATA.REGIONS.length);
  for (const r of w) assert.equal(typeof r.rain, 'boolean');
});

function scripted(g) {
  const fid = startField();
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: starterCrop().id });
  g.advance(24 * 10);
}

test('determinism: same seed ⇒ same state', () => {
  const a = newGame(1234), b = newGame(1234), c = newGame(4321);
  scripted(a); scripted(b); scripted(c);
  assert.deepEqual(comparable(a), comparable(b));
  assert.notDeepEqual(comparable(a).market, comparable(c).market);
});

test('serialize/load roundtrip continues identically', () => {
  const a = newGame(77);
  scripted(a);
  const json = a.serialize();
  assert.equal(JSON.parse(json).version, 1);
  const b = loadGame(json, { data: DATA });
  a.advance(24 * 20);
  b.advance(24 * 20);
  assert.deepEqual(comparable(a), comparable(b));
});

test('save/loadFrom via injected storage and offline catch-up cap', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadFrom(storage), null);
  const a = newGame(8);
  a.save(storage);
  assert.ok(mem.has('farm-manager-save'));
  const b = loadFrom(storage, { data: DATA });
  assert.deepEqual(comparable(a), comparable(b));
  const t0 = b.state.time;
  const h = b.catchUp(10 * 24 * 3600); // capped at 8 real hours: 48 h exact + coarse days
  assert.equal(h, 8 * 3600 / DATA.BALANCE.realSecondsPerGameHour);
  assert.equal(b.lastCatchUp.exactHours, 48);
  assert.equal(b.state.time, t0 + h);
  assert.throws(() => loadGame('{"version":999}'));
});

test('tick respects speed; speed 0 pauses', () => {
  const g = newGame();
  const t0 = g.state.time;
  const rs = DATA.BALANCE.realSecondsPerGameHour;
  g.setSpeed(0);
  g.tick(100);
  assert.equal(g.state.time, t0);
  g.setSpeed(2);
  g.tick(rs * 3);
  assert.ok(Math.abs(g.state.time - (t0 + 6)) < 1e-6);
  assert.equal(g.setSpeed(3).ok, false);
  assert.deepEqual(Object.keys(g.clock()), ['time', 'day', 'hour', 'speed']);
});

test('loans: cap by level, repay, daily interest', () => {
  const g = newGame();
  const cap = g.loanInfo().cap;
  assert.equal(g.takeLoan(cap + 1).ok, false);
  const m0 = g.state.money;
  assert.equal(g.takeLoan(10000).ok, true);
  assert.equal(g.state.money, m0 + 10000);
  g.advance(24);
  assert.ok(g.state.money < m0 + 10000, 'interest charged');
  assert.equal(g.repayLoan(10000).ok, true);
  assert.equal(g.state.loan, 0);
  assert.equal(g.repayLoan(1).ok, false);
});
