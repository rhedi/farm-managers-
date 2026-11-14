import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { newFieldState } from '../js/engine/fields.js';
import { cropPriceTilt, seasonIdAt } from '../js/engine/seasons.js';

const dayTime = (day, hour = 1) => (day - 1) * 24 + hour;

function plant(g, fieldId, cropId, { day, temp }) {
  g.state.fields[fieldId] = { ...newFieldState(g.idx.fields.get(fieldId)), state: 'growing', cropId };
  g.state.time = dayTime(day);
  const regionId = g.idx.fields.get(fieldId).regionId;
  g.state.weather[regionId] = { temp, rain: false };
  return g.state.fields[fieldId];
}

test('temperate regions cycle 4 seasons per 40-day year; Jawa Barat alternates wet/dry', () => {
  const g = newGame();
  assert.deepEqual([1, 11, 21, 31, 41].map((d) => seasonIdAt(g, 'bavaria', d)), ['spring', 'summer', 'autumn', 'winter', 'spring']);
  assert.deepEqual([1, 11, 21, 31].map((d) => seasonIdAt(g, 'jabar', d)), ['wet', 'dry', 'dry', 'wet']);
  const s = g.seasonOf('hokkaido');
  for (const k of ['id', 'name', 'emoji', 'growthMult']) assert.ok(k in s, k);
  assert.equal(g.seasonOf('nope'), null);
});

test('winter is cold in Hokkaido and summer warm (season-driven temperatures)', () => {
  const g = newGame(3);
  const temps = { summer: [], winter: [] };
  for (let d = 0; d < 80; d++) {
    g.advance(24);
    const sid = seasonIdAt(g, 'hokkaido', g.day);
    if (temps[sid]) temps[sid].push(g.state.weather.hokkaido.temp);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(temps.winter) < 6, `winter avg ${avg(temps.winter)}`);
  assert.ok(avg(temps.summer) > 14, `summer avg ${avg(temps.summer)}`);
});

test('growth stops below minTemp, runs ×0.6 off-season and ×1 in season', () => {
  const g = newGame();
  const corn = g.idx.crops.get('corn');
  assert.ok(corn.minTemp > 0);
  let f = plant(g, 'f17', 'corn', { day: 31, temp: corn.minTemp - 5 }); // Hokkaido winter
  g.advance(3);
  assert.equal(f.growHours, 0);
  assert.equal(g.getFieldView('f17').growthMult, 0);
  f = plant(g, 'f17', 'corn', { day: 1, temp: 20 }); // spring: off-season for corn
  g.advance(1);
  assert.ok(Math.abs(f.growHours - 0.6) < 1e-6, String(f.growHours));
  f = plant(g, 'f17', 'corn', { day: 12, temp: 20 }); // summer: in season
  g.advance(1);
  assert.ok(Math.abs(f.growHours - 1) < 1e-6, String(f.growHours));
  assert.ok(g.getFieldView('f17').yieldFactors.season > 1);
});

test('forecast: 3 upcoming days per region, consumed by the actual weather', () => {
  const g = newGame(11);
  let rainHits = 0, n = 0;
  for (let d = 0; d < 40; d++) {
    const fc = g.forecast('bavaria');
    assert.equal(fc.length, 3);
    assert.deepEqual(fc.map((e) => e.day), [g.day + 1, g.day + 2, g.day + 3]);
    g.advance(24);
    const w = g.state.weather.bavaria;
    assert.ok(Math.abs(fc[0].temp - w.temp) < 5, `temp ${fc[0].temp} vs ${w.temp}`);
    n++; if (fc[0].rain === w.rain) rainHits++;
  }
  assert.ok(rainHits / n >= 0.75, `rain accuracy ${rainHits / n}`);
});

test('world simulation is deterministic per seed and survives save/load', () => {
  const a = newGame(5); const b = newGame(5);
  a.advance(24 * 45); b.advance(24 * 45);
  assert.deepEqual(comparable(a), comparable(b));
  assert.deepEqual(a.state.forecast, b.state.forecast);
});

test('seasonal price tilt: crops cheaper in season, neutral on average', () => {
  const g = newGame();
  const wheat = g.idx.crops.get('wheat');
  const tilts = [1, 11, 21, 31].map((d) => cropPriceTilt(g, wheat, d));
  assert.ok(tilts[0] < 1 && tilts[1] > 1);
  assert.ok(Math.abs(tilts.reduce((s, x) => s + x, 0) / 4 - 1) < 1e-9);
  assert.equal(cropPriceTilt(g, g.idx.crops.get('coffee'), 1), null);
  assert.ok(DATA.CROPS.every((c) => c.nutrientUse != null));
});
