import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField, comparable } from './helpers.js';
import { createGame, loadGame } from '../js/engine.js';

/** Game whose daily event roll always fires and only picks `types`. */
function forced(types, seed = 9) {
  const weights = Object.fromEntries(types.map((t) => [t, 1]));
  const BALANCE = { ...DATA.BALANCE, events: { ...DATA.BALANCE.events, chancePerDay: 1, weights } };
  return createGame({ seed, data: { ...DATA, BALANCE } });
}

const toMidnight = (g) => g.advance(24 - g.hour);

function growWheat(g) {
  const f = g.state.fields[startField()];
  Object.assign(f, { state: 'growing', cropId: 'wheat', growHours: 0 });
  return f;
}

test('events are deterministic by seed, continue identically after save/load, and stay modest', () => {
  const a = newGame(21); const b = newGame(21);
  a.advance(24 * 30); b.advance(24 * 30);
  assert.deepEqual(a.state.events, b.state.events);
  const c = loadGame(a.serialize());
  a.advance(24 * 30); c.advance(24 * 30);
  assert.deepEqual(comparable(a), comparable(c));
  let started = 0;
  const g = newGame(4);
  g.on((e) => { if (e.type === 'event_start' || e.type === 'pest') started++; });
  g.advance(24 * 200);
  assert.ok(started >= 20 && started <= 80, `events in 200 days: ${started}`);
});

test('pest cuts yield 25% until treated; treatPest charges per ha', () => {
  const g = forced(['pest']);
  const id = startField();
  const f = growWheat(g);
  const seen = [];
  g.on((e) => seen.push(e.type));
  toMidnight(g);
  assert.ok(seen.includes('pest'));
  assert.equal(f.pest, true);
  const v = g.getFieldView(id);
  assert.equal(v.pest, true);
  assert.equal(v.yieldFactors.pest, 0.75);
  const ev = g.activeEvents().find((e) => e.type === 'pest');
  assert.equal(ev.fieldId, id);
  const cost = g.treatPestCost(id);
  assert.equal(ev.cost, cost);
  const money = g.state.money;
  const r = g.treatPest(id);
  assert.equal(r.ok, true);
  assert.equal(r.cost, cost);
  assert.equal(g.state.money, money - cost);
  assert.equal(g.getFieldView(id).yieldFactors.pest, 1);
  assert.equal(g.activeEvents().some((e) => e.type === 'pest'), false);
  assert.equal(g.treatPest(id).ok, false);
});

test('storm damages growing crops and brings rain to its region', () => {
  const g = forced(['storm']);
  const f = growWheat(g);
  toMidnight(g);
  const ev = g.activeEvents().find((e) => e.type === 'storm');
  assert.equal(ev.regionId, 'jabar');
  assert.equal(g.state.weather.jabar.rain, true);
  assert.ok(f.damage >= 0.85 && f.damage <= 0.95, String(f.damage));
  assert.equal(g.getFieldView(startField()).yieldFactors.storm, f.damage);
});

test('heatwave keeps its region dry and hot, and the forecast shows it', () => {
  const g = forced(['heatwave']);
  toMidnight(g);
  const ev = g.activeEvents().find((e) => e.type === 'heatwave');
  assert.ok(ev && ev.endsDay >= g.day + 2);
  assert.equal(g.state.weather.jabar.rain, false);
  assert.equal(g.forecast('jabar')[0].rain, false);
});

test('market boom raises a price and it falls back when the event ends', () => {
  const g = forced(['boom']);
  const before = { ...g.state.market };
  const ends = [];
  g.on((e) => { if (e.type === 'event_end') ends.push(e.eventId); });
  toMidnight(g);
  const ev = g.activeEvents().find((e) => e.type === 'boom');
  assert.ok(ev.mult >= 1.3 && ev.mult <= 1.5);
  assert.ok(g.state.market[ev.productId] > before[ev.productId] * 1.15);
  g.state.market[ev.productId] = 1000;
  g.state.events = g.state.events.filter((e) => e.id === ev.id); // only this boom
  g.state.events[0].endsDay = g.day - 1;
  g.data.BALANCE.events.chancePerDay = 0;
  g.advance(24);
  assert.ok(ends.includes(ev.id));
});

test('subsidy pays money; perfect weather speeds growth', () => {
  const g = forced(['subsidy']);
  const earned = g.state.stats.totalEarned;
  toMidnight(g);
  const ev = g.activeEvents().find((e) => e.type === 'subsidy');
  assert.ok(ev.amount >= DATA.BALANCE.events.subsidyMin);
  assert.ok(g.state.stats.totalEarned >= earned + ev.amount);
  const p = forced(['perfect']);
  growWheat(p);
  toMidnight(p);
  assert.equal(p.getFieldView(startField()).growthMult, DATA.BALANCE.events.perfectGrowth);
});

test('up to 3 concurrent events of different kinds; an untreated pest does not block others', () => {
  const g = forced(['pest', 'heatwave', 'boom', 'crash']);
  growWheat(g);
  for (let d = 0; d < 6; d++) toMidnight(g), g.advance(1);
  const kinds = g.state.events.map((e) => e.type);
  assert.ok(kinds.length >= 2 && kinds.length <= 3, kinds.join(','));
  assert.equal(new Set(kinds).size, kinds.length);
  assert.ok(kinds.includes('pest'));
});
