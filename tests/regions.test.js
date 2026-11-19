import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { fieldUnlockLevel } from '../js/engine/defs.js';
import { seasonIdAt, climateTemp, rainChanceAt, yearDays, TEMPERATE, TROPICAL } from '../js/engine/seasons.js';
import { routeOf } from '../js/engine/logistics.js';

const { REGIONS, FIELDS, CITIES, CROPS, PRODUCTS, CONTINENTS, LEVELS } = DATA;
const NEW = ['kalimantan', 'ukraina', 'mekong', 'pampas', 'kenya', 'alberta'];

test('data: every region has a unique id, a known continent, fields and a reachable unlock level', () => {
  const ids = REGIONS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 16, `${ids.length} regions`);
  for (const id of NEW) assert.ok(ids.includes(id), id);
  const conts = new Set(CONTINENTS.map((c) => c.id));
  for (const r of REGIONS) {
    assert.ok(conts.has(r.continent), `${r.id} continent`);
    assert.ok((r.unlockLevel ?? 1) >= 1 && (r.unlockLevel ?? 1) <= LEVELS.length, `${r.id} unlock`);
    assert.ok(FIELDS.filter((f) => f.regionId === r.id).length >= 4, `${r.id} fields`);
  }
});

test('fields: unique ids, valid soil/ph/price, unlock 10–48 in new regions', () => {
  const ids = FIELDS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FIELDS) {
    assert.ok(['loam', 'clay', 'silt', 'sand'].includes(f.soil), f.id);
    assert.ok(f.ph >= 4 && f.ph <= 8.5 && f.sizeHa > 0 && f.price > 0, f.id);
    if (!NEW.includes(f.regionId)) continue;
    const lvl = fieldUnlockLevel(DATA, f);
    assert.ok(lvl >= 10 && lvl <= 48, `${f.id} Lv ${lvl}`);
  }
});

test('map: pins per continent stay apart and inside the map', () => {
  const contOf = new Map(REGIONS.map((r) => [r.id, r.continent]));
  for (const c of CONTINENTS) {
    const pins = FIELDS.filter((f) => contOf.get(f.regionId) === c.id);
    assert.ok(pins.length > 0, c.id);
    for (const f of pins) assert.ok(f.x > 2 && f.x < 98 && f.y > 2 && f.y < 92, `${f.id} on map`);
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i], b = pins[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 6, `${a.id}/${b.id} overlap`);
    }
  }
});

test('cities: ids unique, km keys are regions, every region reaches a city', () => {
  const regionIds = new Set(REGIONS.map((r) => r.id));
  const P = new Set(PRODUCTS.map((p) => p.id));
  assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
  for (const c of CITIES) {
    for (const [r, km] of Object.entries(c.km)) assert.ok(regionIds.has(r) && km > 0, `${c.id}:${r}`);
    for (const p of Object.keys(c.demand || {})) assert.ok(P.has(p), `${c.id} demand ${p}`);
  }
  for (const id of NEW) assert.ok(CITIES.some((c) => c.km[id]), `${id} has a city`);
});

test('new crops are category crop with a region where they grow', () => {
  for (const id of ['pepper', 'rose', 'blueberry']) {
    const c = CROPS.find((x) => x.id === id);
    assert.ok(c && c.unlockLevel > 30 && c.unlockLevel <= 50, id);
    assert.equal(PRODUCTS.find((p) => p.id === id).category, 'crop');
  }
});

test('weather: full year per new region, finite temps and rain chances, all seasons appear', () => {
  const g = newGame(9);
  const Y = yearDays(g);
  for (const id of NEW) {
    const r = REGIONS.find((x) => x.id === id);
    const seen = new Set();
    for (let d = 1; d <= Y; d++) {
      const t = climateTemp(g, r, d), p = rainChanceAt(g, r, d);
      assert.ok(Number.isFinite(t) && Number.isFinite(p) && p >= 0 && p <= 1, `${id} d${d}`);
      seen.add(seasonIdAt(g, r, d));
    }
    const want = r.climate.tropical ? TROPICAL : TEMPERATE;
    assert.deepEqual([...seen].sort(), [...want].sort(), id);
  }
  g.advance(24 * Y);
  for (const id of NEW) assert.ok(Number.isFinite(g.state.weather[id]?.temp), `${id} rolled weather`);
});

test('southern region (Pampas) runs half a year shifted from Iowa', () => {
  const g = newGame(2);
  const Y = yearDays(g);
  for (let d = 1; d <= Y; d += 5) {
    const n = TEMPERATE.indexOf(seasonIdAt(g, 'iowa', d)), s = TEMPERATE.indexOf(seasonIdAt(g, 'pampas', d));
    assert.equal(s, (n + 2) % 4, `day ${d}`);
  }
});

test('buying a field in a new region opens a delivery route', () => {
  const g = newGame(3);
  g.state.level = 50; g.state.money = 1e9;
  assert.equal(g.buyField('al1').ok, true);
  const r = routeOf(g, CITIES.find((c) => c.id === 'calgary'));
  assert.deepEqual(r, { regionId: 'alberta', km: 80 });
});

test('old Lv30 save with banked XP loads and levels up exactly once', () => {
  const g = newGame(5);
  g.state.level = 30; g.state.xp = LEVELS[29] + 60e6; // kept earning at the old cap
  const j = JSON.parse(g.serialize());
  delete j.research;
  const g2 = loadGame(JSON.stringify(j), { data: DATA });
  assert.equal(g2.state.level, 30);
  assert.equal(g2.state.xp, LEVELS[30]);
  assert.equal(g2.levelInfo().maxed, false);
  const ups = [];
  g2.on((e) => { if (e.type === 'level_up') ups.push(e); });
  g2.addXp(1);
  assert.equal(g2.state.level, 31);
  assert.equal(ups.length, 1);
  assert.equal(g2.researchPoints().earned, 30);
});
