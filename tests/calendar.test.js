import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField, starterCrop, runTask } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { boostMult, dayNumber } from '../js/engine/calendar.js';

const DAY = 864e5, T0 = Date.UTC(2026, 10, 16, 9);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const claimOn = (g, n) => g.claimCalendar(iso(T0 + n * DAY), T0 + n * DAY);

test('streak counts real days; same day twice fails; a missed day restarts at day 1 and keeps the best', () => {
  const g = newGame(71);
  assert.equal(g.calendarView(iso(T0), T0).cycleDay, 1);
  for (let n = 0; n < 4; n++) assert.equal(claimOn(g, n).day, n + 1);
  assert.equal(claimOn(g, 3).ok, false, 'already claimed today');
  assert.equal(g.calendarView(iso(T0 + 3 * DAY), T0 + 3 * DAY).claimedToday, true);
  const v = g.calendarView(iso(T0 + 5 * DAY), T0 + 5 * DAY); // day 5 skipped
  assert.equal(v.cycleDay, 1);
  assert.equal(v.broken, true);
  const r = claimOn(g, 5);
  assert.equal(r.day, 1);
  assert.equal(r.streak, 1);
  assert.equal(r.best, 4);
  assert.equal(g.state.calendar.best, 4);
});

test('7-day cycle: research points on day 3 and 7, badge on day 7, then day 1 again', () => {
  const g = newGame(72);
  const pts = g.researchPoints().available;
  for (let n = 0; n < 7; n++) assert.equal(claimOn(g, n).ok, true);
  assert.equal(g.researchPoints().available, pts + 2);
  assert.equal(g.state.calendar.badges, 1);
  assert.equal(claimOn(g, 7).day, 1);
  assert.equal(g.state.calendar.streak, 8);
});

test('clock rollback: an earlier date or clock is refused and changes nothing', () => {
  const g = newGame(73);
  claimOn(g, 2);
  const before = structuredClone(g.state.calendar);
  assert.match(claimOn(g, 1).reason, /mundur/);
  assert.match(g.claimCalendar(iso(T0 + 3 * DAY), T0 - DAY).reason, /mundur/, 'date ahead but clock behind');
  assert.deepEqual(g.state.calendar, before);
  assert.equal(g.claimCalendar('kemarin', T0).ok, false);
  assert.equal(dayNumber('2026-11-17') - dayNumber('2026-11-16'), 1);
  assert.equal(claimOn(g, 3).ok, true);
});

test('boosters: seed cost −50% for 5 game days, yield +10% on the harvest roll, then expire', () => {
  const g = newGame(74), crop = starterCrop().id, fid = startField();
  runTask(g, fid, 'plow');
  const full = g.estimateTask(fid, 'seed', { cropId: crop }).cost;
  claimOn(g, 0); // day 1: Benih Hemat
  assert.equal(boostMult(g, 'seedCost'), 0.5);
  const cheap = g.estimateTask(fid, 'seed', { cropId: crop });
  assert.ok(Math.abs(cheap.materialCost - (full - cheap.fuelCost) / 2) < 0.02, `${cheap.materialCost} vs ${full}`);
  assert.equal(g.activeBoosters()[0].kind, 'seedCost');
  g.advance(6 * 24); // past the expiry and the following midnight
  assert.equal(boostMult(g, 'seedCost'), 1);
  assert.equal(g.activeBoosters().length, 0);
  assert.equal(g.state.boosters.length, 0, 'pruned at the rollover');
  // Yield: identical games, one with Pupuk Super → harvest roll ×1.1.
  const roll = (boost) => {
    const h = newGame(75);
    runTask(h, fid, 'plow'); runTask(h, fid, 'seed', { cropId: crop });
    h.advance(starterCrop().growDays * 24 + 2);
    if (boost) { claimOn(h, 0); claimOn(h, 1); }
    return h.startTask(fid, 'harvest', { rent: true }).ok && h.state.fields[fid].busy.yieldTons;
  };
  const base = roll(false), boosted = roll(true);
  assert.ok(Math.abs(boosted / base - 1.1) < 0.002, `${boosted} / ${base}`);
});

test('booster of the same kind extends the time and keeps the stronger multiplier; survives save/load', () => {
  const g = newGame(76);
  for (let n = 0; n < 7; n++) claimOn(g, n); // day 2 (+10%, 10 d), day 6 (+10%, 10 d), day 7 (+20%, 10 d)
  const y = g.activeBoosters().find((b) => b.kind === 'yield');
  assert.equal(y.mult, 1.2);
  assert.ok(y.hoursLeft > 20 * 24, `${y.hoursLeft}`);
  const l = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(l.activeBoosters(), g.activeBoosters());
  assert.equal(l.state.calendar.streak, 7);
});
