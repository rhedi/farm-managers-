import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../js/engine.js';
import { STREAK_GOAL, generateMissions } from '../js/engine/missions.js';
import { DATA, newGame, runTask, startField } from './helpers.js';

/** Replace today's missions with controlled ones. */
function setMissions(g, specs) {
  g.state.missions.list = specs.map((s, i) => ({ id: `t${i}`, progress: 0, base: 0, reward: 100, xp: 10,
    done: false, claimed: false, ...s }));
}
const collect = (g) => { const ev = []; g.on((e) => ev.push(e)); return ev; };

test('3 missions per day, deterministic per seed and day, regenerated with missions_new', () => {
  const a = newGame(11), b = newGame(11);
  const va = a.missionsView();
  assert.equal(va.list.length, 3);
  assert.equal(new Set(va.list.map((m) => m.type)).size, 3, 'distinct types');
  assert.deepEqual(va, b.missionsView());
  for (const m of va.list) {
    assert.ok(m.target > 0 && m.reward > 0 && m.xp > 0, m.label);
    assert.equal(typeof m.label, 'string');
  }
  const ev = collect(a);
  a.advance(24);
  assert.equal(ev.filter((e) => e.type === 'missions_new').length, 1);
  assert.equal(a.missionsView().day, a.day);
  assert.notDeepEqual(a.missionsView().list.map((m) => m.id), va.list.map((m) => m.id));
  assert.deepEqual(generateMissions(a, 5), generateMissions(a, 5));
});

test('mission RNG does not disturb the simulation RNG', () => {
  const g = newGame(5), rng = g.state.rng;
  g.missionsView(); generateMissions(g, 9);
  assert.equal(g.state.rng, rng);
});

test('task progress from events; mission_done once; claim pays once', () => {
  const g = newGame(3), ev = collect(g);
  setMissions(g, [{ type: 'task', task: 'plow', target: 1 }, { type: 'tasks_any', target: 5 }, { type: 'xp', target: 999999, base: g.state.xp }]);
  assert.equal(g.claimMission('t0').ok, false, 'not done yet');
  runTask(g, startField(), 'plow');
  const v = g.missionsView();
  assert.equal(v.list[0].done, true);
  assert.equal(v.list[1].progress, 1);
  assert.ok(v.list[2].progress >= DATA.BALANCE.xpPerTask, 'xp delta tracked');
  assert.equal(v.claimable, 1);
  assert.equal(ev.filter((e) => e.type === 'mission_done').length, 1);
  const money = g.state.money, xp = g.state.xp;
  const r = g.claimMission('t0');
  assert.deepEqual(r, { ok: true, reward: 100, xp: 10, rp: 0 });
  assert.equal(g.state.money, money + 100);
  assert.equal(g.state.xp, xp + 10);
  assert.equal(g.claimMission('t0').ok, false, 'claim once');
  assert.equal(g.claimMission('nope').ok, false);
  assert.equal(ev.filter((e) => e.type === 'mission_done').length, 1);
});

test('sell, harvest, feed, contract and factory missions track progress', () => {
  const g = newGame(4);
  g.state.silo.wheat = 20;
  g.state.animals.chickens = { count: 100, barns: 1, quality: 1, happiness: 1, fed: 1 };
  setMissions(g, [{ type: 'sell', target: 1000, base: g.state.stats.salesValue },
    { type: 'feed', target: 1 }, { type: 'factory', target: 2 }]);
  g.sellProduct('wheat', 10);
  assert.equal(g.missionsView().list[0].done, true);
  g.buyProduct('rice', 1); // not chicken feed
  assert.equal(g.missionsView().list[1].progress, 0);
  g.buyProduct('corn', 0.5);
  assert.equal(g.missionsView().list[1].done, false, 'needs the full tonnage');
  g.buyProduct('corn', 0.5);
  assert.equal(g.missionsView().list[1].done, true);
  g.emit('factory_done', 'x', { factoryId: 'mill', productId: 'flour', qty: 3 });
  assert.equal(g.missionsView().list[2].progress, 1);
  setMissions(g, [{ type: 'harvest', cropId: 'wheat', target: 5 }, { type: 'contract', target: 1 }, { type: 'xp', target: 1e9 }]);
  g.emit('task_done', 'x', { task: 'harvest', cropId: 'barley', tons: 9 });
  g.emit('task_done', 'x', { task: 'harvest', cropId: 'wheat', tons: 3 });
  assert.equal(g.missionsView().list[0].progress, 3);
  g.emit('task_done', 'x', { task: 'harvest', cropId: 'wheat', tons: 4 });
  assert.equal(g.missionsView().list[0].done, true);
  g.emit('contract_done', 'x', { contractId: 'k1' });
  assert.equal(g.missionsView().list[1].done, true);
});

test('exploits: buy-then-resell does not count for sell; no feed mission without animals', () => {
  const g = newGame(4);
  setMissions(g, [{ type: 'sell', target: 1000, base: g.state.stats.salesValue }, { type: 'feed', target: 1 }]);
  g.buyProduct('wheat', 10);
  g.sellProduct('wheat', 10);
  assert.equal(g.missionsView().list[0].progress, 0, 'resale of bought goods is netted out');
  assert.equal(g.missionsView().list[1].progress, 0, 'no herd ⇒ purchases are not feed');
  g.state.silo.wheat = 20; // own produce
  g.sellProduct('wheat', 20);
  assert.ok(g.missionsView().list[0].progress > 0);
  for (let d = 1; d <= 40; d++) assert.ok(!generateMissions(g, d).some((m) => m.type === 'feed'));
});

test('generated sell/feed targets are worth more than their reward', () => {
  const g = newGame(6);
  g.state.animals.cows = { count: 20, barns: 1, quality: 1, happiness: 1, fed: 1 };
  g.state.silo.wheat = 120;
  g.state.level = 12; // big rewards
  const seen = new Set();
  for (let d = 1; d <= 80; d++) {
    for (const m of generateMissions(g, d)) {
      seen.add(m.type);
      if (m.type === 'sell') assert.ok(m.target >= 2 * m.reward * 0.85, `sell ${m.target} vs ${m.reward}`);
      if (m.type === 'feed') {
        assert.ok(m.target >= 1 && m.target >= 20 * DATA.ANIMALS.find((a) => a.id === 'cows').feedPerDay);
        const price = Math.min(...['wheat', 'corn', 'barley', 'soybean'].map((id) => g.state.market[id] * 1.2));
        assert.ok(m.target * price >= m.reward, `feed ${m.target} t vs ${m.reward}`);
      }
    }
  }
  assert.ok(seen.has('sell') && seen.has('feed'));
});

test('unclaimed rewards are paid at the rollover', () => {
  const g = newGame(8);
  setMissions(g, [{ type: 'tasks_any', target: 1, reward: 777 }]);
  g.emit('task_done', 'x', { task: 'plow' });
  const earned = g.state.stats.totalEarned;
  g.advance(24);
  assert.ok(g.state.stats.totalEarned >= earned + 777);
});

test('streak: +1 per fully completed day, bonus every STREAK_GOAL days, resets after a missed day', () => {
  const g = newGame(9), ev = collect(g);
  const finishDay = () => {
    setMissions(g, [1, 2, 3].map(() => ({ type: 'tasks_any', target: 1 })));
    g.emit('task_done', 'x', { task: 'plow' });
    g.advance(24);
  };
  for (let i = 0; i < STREAK_GOAL; i++) finishDay();
  assert.equal(g.state.missions.streak, STREAK_GOAL);
  const bonus = ev.filter((e) => e.type === 'mission_streak');
  assert.equal(bonus.length, 1);
  assert.ok(bonus[0].money > 0 && bonus[0].xp > 0);
  g.advance(24); // missed a day
  assert.equal(g.state.missions.streak, 0);
});

test('missions survive save/load; old saves get missions', () => {
  const g = newGame(12);
  runTask(g, startField(), 'plow');
  const b = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(b.missionsView(), g.missionsView());
  const old = JSON.parse(g.serialize());
  delete old.missions; delete old.rivals;
  const c = loadGame(old, { data: DATA });
  assert.equal(c.missionsView().list.length, 3);
  assert.equal(c.leaderboard().length, b.leaderboard().length);
});

// ---- v16 Hadiah Berskala ----
import { recentIncome } from '../js/engine/rewards.js';
import { recentXpRate, xpTarget, baseReward } from '../js/engine/missions.js';

/** Fake the last 3 closed ledger days with `perDay` crop sales (+ optional market purchases). */
function fakeIncome(g, perDay, bought = 0) {
  const L = g.state.ledger, d = g.day;
  L.days = [1, 2, 3].map((k) => ({ day: d - k, cats: { penjualan_panen: perDay, ...(bought ? { pembelian_produk: bought } : {}) } }));
  L.since = d - 3;
}

test('rewards scale with recent income (5–12% each, ≤ ~30% for all 3), with today\'s fixed amounts as the floor', () => {
  const g = newGame(21);
  g.state.level = 45;
  const floorOnly = generateMissions(g, 7);
  fakeIncome(g, 2e7); // $20M a day
  assert.equal(recentIncome(g), 2e7);
  for (let d = 1; d <= 40; d++) {
    const scaled = generateMissions(g, d);
    for (const m of scaled) assert.ok(m.reward >= 0.05 * 0.9 * 2e7 * 0.95 && m.reward <= 0.12 * 2e7 * 1.05, `${m.type} ${m.reward}`);
    assert.ok(scaled.reduce((t, m) => t + m.reward, 0) <= 0.32 * 2e7, 'all 3 ≤ ~30% of a day');
  }
  const scaled = generateMissions(g, 7);
  scaled.forEach((m, i) => assert.ok(m.reward >= floorOnly[i].reward, 'never below the floor'));
  assert.ok(Math.min(...scaled.map((m) => m.reward)) > 50 * baseReward(g), 'meaningful at Lv 45');
  // Buy-and-resell does not inflate the income used for rewards.
  fakeIncome(g, 1e6, 1.2e6);
  assert.equal(recentIncome(g), 0);
});

test('streak bonus and achievements scale too; achievements may add research points', () => {
  const g = newGame(22);
  fakeIncome(g, 5e7);
  assert.ok(g.missionsView().streakBonus.money >= 0.5 * 5e7 * 0.95);
  const pts = g.researchPoints().available, m0 = g.state.money;
  g.state.achievements = DATA.ACHIEVEMENTS.filter((a) => a.id !== 'contracts_100').map((a) => a.id);
  g.state.stats.contractsDone = 100;
  assert.deepEqual(g.checkAchievements(), ['contracts_100']);
  const a = DATA.ACHIEVEMENTS.find((x) => x.id === 'contracts_100');
  assert.ok(g.state.money - m0 >= a.incomeDays * 5e7 * 0.95, 'a day of income, not the fixed 150k');
  assert.ok(a.incomeDays <= 1 && DATA.ACHIEVEMENTS.every((x) => (x.incomeDays ?? 0.25) >= 0.25 && (x.incomeDays ?? 0.25) <= 1));
  assert.equal(g.researchPoints().available, pts + 1);
  const v = g.achievementsView().find((x) => x.id === 'ponds_5');
  assert.equal(v.value, 0);
  assert.ok(v.payout.money >= 0.25 * 5e7 * 0.95 && v.payout.money <= 0.25 * 5e7 * 1.05);
});

test('XP target follows the XP actually earned in the last 3 game days (achievable at Lv 45)', () => {
  const g = newGame(23);
  g.state.level = 45;
  g.state.missions.xpDays = [40000, 50000, 60000];
  assert.equal(recentXpRate(g), 50000);
  for (let d = 1; d <= 30; d++) {
    const t = xpTarget(g, { rng: d * 7919 });
    assert.ok(t >= 0.6 * 50000 * 0.95 && t <= 0.9 * 50000 * 1.05, `target ${t}`);
  }
  // Measured at each rollover from the game's own XP.
  const h = newGame(24);
  h.state.missions.xpDays = [];
  h.advance(24 - (h.state.time % 24) + 0.5);
  h.addXp(300);
  h.advance(24);
  assert.equal(h.state.missions.xpDays.length, 2, 'day 1 (from the start) and day 2');
  assert.ok(h.state.missions.xpDays[1] >= 300);
  for (let d = 0; d < 5; d++) h.advance(24);
  assert.equal(h.state.missions.xpDays.length, 3, 'only the last 3 days');
});

test('feed mission counts harvested feed crops (plans), not only purchases', () => {
  const g = newGame(25);
  g.state.animals.chickens = { count: 100, barns: 1, quality: 1, happiness: 1, fed: 1 };
  setMissions(g, [{ type: 'feed', target: 5 }]);
  g.emit('task_done', 'x', { task: 'harvest', cropId: 'wheat', tons: 3 });
  assert.equal(g.missionsView().list[0].progress, 3);
  g.buyProduct('corn', 2);
  assert.equal(g.missionsView().list[0].done, true);
});

test('migration: pre-v16 saves get xpDays, a partial XP mark and no research bonus field', () => {
  const g = newGame(26);
  const old = JSON.parse(g.serialize());
  delete old.missions.xpDays; delete old.missions.xpMark; delete old.chapters;
  const b = loadGame(old, { data: DATA });
  assert.deepEqual(b.state.missions.xpDays, []);
  assert.equal(b.state.missions.xpMark.partial, true, 'mid-day load is not a full day');
  assert.equal(b.researchPoints().earned, b.state.level - 1);
  b.advance(24);
  assert.deepEqual(b.state.missions.xpDays, [], 'partial day skipped');
  b.advance(24);
  assert.equal(b.state.missions.xpDays.length, 1);
});
