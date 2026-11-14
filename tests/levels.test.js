import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { unlocksBetween, levelReward } from '../js/engine/economy.js';
import { fieldUnlockLevel } from '../js/engine/defs.js';

const { LEVELS, CROPS, PRODUCTS, MACHINES, ANIMALS, FIELDS, REGIONS, ACHIEVEMENTS, BALANCE, STARTING } = DATA;

test('LEVELS: 30 strictly increasing thresholds, first 10 unchanged', () => {
  assert.equal(LEVELS.length, 30);
  assert.deepEqual(LEVELS.slice(0, 10), [0, 250, 900, 2200, 4500, 8000, 13000, 20000, 30000, 45000]);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i] > LEVELS[i - 1], `level ${i + 1}`);
});

test('every level 2–30 unlocks at least one thing (factories included when present)', () => {
  for (let lvl = 2; lvl <= 30; lvl++) {
    const n = Object.values(unlocksBetween(DATA, lvl - 1, lvl)).reduce((s, ids) => s + ids.length, 0);
    assert.ok(n > 0, `level ${lvl} unlocks content`);
  }
});

test('new content is consistent: products, feed, regions, map coordinates', () => {
  const P = new Set(PRODUCTS.map((p) => p.id));
  for (const c of CROPS) assert.ok(P.has(c.id), `product for ${c.id}`);
  for (const a of ANIMALS) assert.ok(P.has(a.product), `product for ${a.id}`);
  for (const m of MACHINES) assert.ok(m.unlockLevel >= 1 && m.unlockLevel <= 30, m.id);
  const regionIds = new Set(REGIONS.map((r) => r.id));
  for (const f of FIELDS) {
    assert.ok(regionIds.has(f.regionId), `${f.id} region`);
    assert.ok(f.x > 2 && f.x < 98 && f.y > 2 && f.y < 92, `${f.id} on the map`);
    assert.ok(fieldUnlockLevel(DATA, f) <= 30, `${f.id} reachable`);
  }
  for (const id of STARTING.fieldIds) assert.equal(fieldUnlockLevel(DATA, FIELDS.find((f) => f.id === id)), 1);
  assert.ok(REGIONS.filter((r) => (r.unlockLevel ?? 1) > 1).length >= 2, 'two gated regions');
});

test('locked field: buy refused with level reason; view flags it; opens at its level', () => {
  const g = newGame(3);
  const f = FIELDS.find((x) => fieldUnlockLevel(DATA, x) > 1);
  const need = fieldUnlockLevel(DATA, f);
  g.state.money = 1e9;
  const v = g.getFieldView(f.id);
  assert.equal(v.locked, true);
  assert.equal(v.unlockLevel, need);
  const r = g.buyField(f.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, new RegExp(`level ${need}`));
  assert.equal(g.state.fields[f.id], undefined);
  g.state.level = need;
  assert.equal(g.getFieldView(f.id).locked, false);
  assert.equal(g.buyField(f.id).ok, true);
});

test('xp caps at level 30: levelInfo maxed, no further level_up', () => {
  const g = newGame(4);
  const ups = [];
  g.on((e) => { if (e.type === 'level_up') ups.push(e); });
  g.addXp(LEVELS[29] * 10);
  assert.equal(g.state.level, 30);
  const li = g.levelInfo();
  assert.equal(li.maxed, true);
  assert.equal(li.next, null);
  assert.equal(li.progress, 1);
  g.addXp(1e6);
  assert.equal(g.state.level, 30);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].level, 30);
  assert.ok(ups[0].unlocks.regions.length >= 2 && ups[0].unlocks.fields.length > 0);
});

test('level-up pays levelReward × level for every level gained, reported on the event', () => {
  const g = newGame(5);
  const ups = [];
  g.on((e) => { if (e.type === 'level_up') ups.push(e); });
  g.state.achievements = ACHIEVEMENTS.map((a) => a.id); // isolate level rewards from achievement payouts
  const m0 = g.state.money;
  g.addXp(LEVELS[1]); // → level 2
  assert.equal(ups.at(-1).reward, BALANCE.levelReward * 2);
  assert.equal(g.state.money, m0 + levelReward(DATA, 2));
  const m1 = g.state.money;
  g.addXp(LEVELS[4] - g.state.xp); // 2 → 5 in one jump
  assert.equal(g.state.level, 5);
  const expected = levelReward(DATA, 3) + levelReward(DATA, 4) + levelReward(DATA, 5);
  assert.equal(ups.at(-1).reward, expected);
  assert.equal(g.state.money, m1 + expected);
  assert.match(ups.at(-1).msg, /Hadiah/);
});

test('late achievements exist; region achievement tracks regionsOwned', () => {
  for (const id of ['level_20', 'level_30', 'regions_7']) assert.ok(ACHIEVEMENTS.find((a) => a.id === id), id);
  const g = newGame(6);
  assert.equal(g.state.stats.regionsOwned, 1);
  g.state.level = 30; g.state.money = 1e9;
  for (const r of REGIONS) g.buyField(FIELDS.find((f) => f.regionId === r.id && !g.state.fields[f.id]).id);
  assert.equal(g.state.stats.regionsOwned, REGIONS.length);
  assert.ok(g.state.achievements.includes('regions_7'));
  const land = REGIONS.map((r) => Math.min(...FIELDS.filter((f) => f.regionId === r.id).map((f) => f.price)));
  const roundTripLoss = 0.3 * land.slice(1).reduce((s, p) => s + p, 0);
  assert.ok(roundTripLoss > ACHIEVEMENTS.find((a) => a.id === 'regions_7').reward, 'not farmable by buy/sell');
});
