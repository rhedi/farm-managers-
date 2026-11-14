import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';

const producer = () => DATA.ANIMALS.find((a) => a.productPerDay > 0);

function herdGame(fed) {
  const g = newGame(11);
  const a = producer();
  g.state.level = a.unlockLevel;
  g.state.money = 1e7;
  assert.equal(g.buyAnimal(a.id, 1).ok, false, 'needs a barn first');
  assert.equal(g.buildBarn(a.id).ok, true);
  const n = Math.min(10, a.barnCapacity);
  assert.equal(g.buyAnimal(a.id, n).ok, true);
  assert.equal(g.buyAnimal(a.id, a.barnCapacity).ok, false, 'capacity enforced');
  if (fed) g.state.silo[a.feedCrops[0]] = n * a.feedPerDay * 100;
  return { g, a, n };
}

test('animals produce when fed and stay healthy', () => {
  const { g, a } = herdGame(true);
  g.advance(24 * 5);
  const h = g.state.animals[a.id];
  assert.ok((g.state.silo[a.product] || 0) > 0);
  assert.equal(h.fed, 1);
  assert.ok(h.quality > 0.95);
  const view = g.animalsView().find((x) => x.id === a.id);
  assert.ok(view.feedDaysLeft > 0);
});

test('unfed animals degrade, produce nothing, and warn once per change (B13)', () => {
  const { g, a } = herdGame(false);
  const warnings = [];
  g.on((e) => e.type === 'low_feed' && warnings.push(e));
  g.advance(24 * 5);
  const h = g.state.animals[a.id];
  assert.equal(g.state.silo[a.product] ?? 0, 0);
  assert.ok(h.quality < 1 && h.happiness < 1);
  assert.equal(warnings.length, 1, 'starving is reported once, not every day');
});

test('sell animals', () => {
  const { g, a, n } = herdGame(true);
  const m0 = g.state.money;
  assert.equal(g.sellAnimal(a.id, n + 1).ok, false);
  assert.equal(g.sellAnimal(a.id, 1).ok, true);
  assert.ok(g.state.money > m0);
  assert.equal(g.state.animals[a.id].count, n - 1);
});

test('achievements unlock with reward + event', () => {
  const g = newGame(2);
  const got = [];
  g.on((e) => e.type === 'achievement' && got.push(e.achievementId));
  const fid = startField();
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: starterCrop().id });
  g.advance(starterCrop().growDays * 24);
  const harvestAch = DATA.ACHIEVEMENTS.find((a) => a.condition.stat === 'harvests' && a.condition.gte === 1);
  const r = g.startTask(fid, 'harvest', { rent: true });
  assert.equal(r.ok, true);
  const before = g.state.money;
  g.advance(24);
  assert.ok(g.state.achievements.includes(harvestAch.id));
  assert.ok(got.includes(harvestAch.id));
  // rent is charged on completion (B2); one daily rollover pays worker wages (F9)
  const wages = g.state.workers.reduce((s, w) => s + w.wage, 0);
  assert.ok(g.state.money >= before + harvestAch.reward - r.cost - wages - 1e-6);

  const fieldsAch = DATA.ACHIEVEMENTS.find((a) => a.condition.stat === 'fieldsOwned');
  g.state.money = 1e8;
  while (Object.keys(g.state.fields).length < fieldsAch.condition.gte) g.buyField(cheapestOtherField(g).id);
  assert.ok(g.state.achievements.includes(fieldsAch.id));
  const n = g.state.achievements.length;
  g.checkAchievements();
  assert.equal(g.state.achievements.length, n, 'no duplicate unlocks');
  assert.ok(g.achievementsView().some((a) => a.unlocked));
});

test('level up via XP emits event and unlocks content', () => {
  const g = newGame();
  const ev = [];
  g.on((e) => e.type === 'level_up' && ev.push(e.level));
  g.addXp(DATA.LEVELS[1]);
  assert.equal(g.state.level, 2);
  assert.deepEqual(ev, [2]);
  assert.equal(g.levelInfo().level, 2);
  assert.ok(g.shopView().some((m) => m.unlockLevel === 2 && m.unlocked));
});
