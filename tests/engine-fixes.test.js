import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';
import { loadGame } from '../js/engine.js';

const grow = (g, fid, cropId = starterCrop().id) => {
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId });
  g.advance(g.idx.crops.get(cropId).growDays * 24 + 1);
};

test('B1: catchUp does nothing while paused', () => {
  const g = newGame(1);
  g.setSpeed(0);
  const t = g.state.time;
  assert.equal(g.catchUp(3600), 0);
  assert.equal(g.state.time, t);
});

test('B2: harvest is free to start, paid at completion, auto-sells crop when broke', () => {
  const g = newGame(2);
  const fid = startField();
  grow(g, fid);
  g.state.money = 0;
  g.state.achievements = DATA.ACHIEVEMENTS.map((a) => a.id); // no reward cash in the way
  for (const w of g.state.workers) w.wage = 0; // unpaid wages would go to the loan (F9)
  const est = g.estimateTask(fid, 'harvest', { rent: true });
  assert.equal(est.ok, true);
  assert.equal(est.payOnCompletion, true);
  assert.ok(est.cost > 0);
  const msgs = [];
  g.on((e) => e.type === 'task_done' && msgs.push(e.msg));
  runTask(g, fid, 'harvest', { rent: true });
  assert.ok(g.state.money >= 0);
  assert.equal(g.state.loan, 0);
  assert.ok(g.state.silo[starterCrop().id] > 0, 'only part of the crop was sold');
  assert.match(msgs.at(-1), /dijual otomatis/);
  assert.ok(g.state.stats.salesValue > 0);
});

test('B3: a fully withered crop can be plowed under; a 0 t harvest adds nothing', () => {
  const g = newGame(3);
  const fid = startField();
  grow(g, fid);
  g.advance(72 + 24 * 11);
  const v = g.getFieldView(fid);
  assert.equal(v.witherFactor, 0);
  assert.ok(v.actions.includes('plow') && v.actions.includes('harvest'));
  runTask(g, fid, 'harvest', { rent: true });
  assert.equal(g.state.stats.harvests, 0);
  assert.equal(g.state.silo[starterCrop().id], undefined);
  assert.equal(g.getFieldView(fid).state, 'idle');
});

test('B4/B11: actions only list runnable tasks; no sell on the last field', () => {
  const g = newGame(4);
  const fid = startField();
  assert.deepEqual(g.getFieldView(fid).actions, ['plow']);
  runTask(g, fid, 'plow');
  runTask(g, fid, 'seed', { cropId: starterCrop().id });
  assert.ok(!g.getFieldView(fid).actions.includes('irrigate'), 'no irrigation implement owned');
  g.state.money = 1e6;
  g.buyField(cheapestOtherField(g).id);
  assert.ok(g.getFieldView(Object.keys(g.state.fields)[1]).actions.includes('sell'));
});

test('B5: animals eat the cheapest feed first; reserve blocks selling, not eating', () => {
  const g = newGame(5);
  const a = DATA.ANIMALS.find((x) => x.feedCrops.length > 1);
  g.state.level = a.unlockLevel; g.state.money = 1e7;
  g.buildBarn(a.id); g.buyAnimal(a.id, 10);
  // Cheapest vs dearest feed: a wide price gap that one day's market walk can't flip.
  const sorted = [...a.feedCrops].sort((x, y) => g.state.market[x] - g.state.market[y]);
  const [cheap, dear] = [sorted[0], sorted.at(-1)];
  g.state.silo = { [cheap]: 5, [dear]: 50 };
  g.advance(24);
  assert.equal(g.state.silo[dear], 50);
  assert.ok(g.state.silo[cheap] < 5);
  assert.equal(g.setFeedReserve(dear, 40).ok, true);
  assert.equal(g.sellProduct(dear, 20).ok, false);
  const r = g.sellProduct(dear);
  assert.equal(r.ok, true);
  assert.equal(g.state.silo[dear], 40);
});

test('B7: repayLoan() without amount pays what it can', () => {
  const g = newGame(6);
  g.takeLoan(20000);
  g.state.money = 500;
  const r = g.repayLoan();
  assert.equal(r.ok, true);
  assert.equal(g.state.loan, 19500);
  assert.equal(g.state.money, 0);
});

test('B10: old saves are normalized (missing keys, market entries, unknown machines)', () => {
  const g = newGame(7);
  const s = JSON.parse(g.serialize());
  delete s.stats.salesValue; delete s.history; delete s.contracts; delete s.feedReserve;
  delete s.market.wheat; s.priceHistory.wheat = [];
  s.machines.push({ uid: 'm99', defId: 'gone', busy: false });
  delete s.fields.f1.plan;
  const l = loadGame(JSON.stringify(s));
  assert.equal(l.state.stats.salesValue, 0);
  assert.deepEqual(l.state.contracts, []);
  assert.deepEqual(l.state.history, []);
  assert.equal(l.state.market.wheat, DATA.PRODUCTS.find((p) => p.id === 'wheat').basePrice);
  assert.ok(!l.state.machines.some((m) => m.defId === 'gone'));
  assert.equal(l.state.fields.f1.plan, null);
  assert.ok(Number.isFinite(l.marketView()[0].buyPrice ?? 0));
});

test('stats keys, level_up unlocks, history and net worth', () => {
  const g = newGame(8);
  assert.ok(g.state.stats.machineModels > 0);
  assert.equal(g.state.stats.livestockOwned, 0);
  const ev = [];
  g.on((e) => e.type === 'level_up' && ev.push(e));
  g.addXp(DATA.LEVELS[1]);
  assert.equal(ev.length, 1);
  assert.ok(Array.isArray(ev[0].unlocks.crops) && Array.isArray(ev[0].unlocks.machines));
  assert.ok(ev[0].unlocks.crops.every((id) => g.idx.crops.get(id).unlockLevel === 2));
  g.advance(48);
  assert.equal(g.state.history.length, 2);
  assert.ok(g.netWorth() > g.state.money);
  assert.equal(g.state.history[1].netWorth > 0, true);
});

test('B12: engine messages use id-ID numbers and no double "Ladang"', () => {
  const g = newGame(9);
  g.state.money = 1e6;
  const f = DATA.FIELDS.find((x) => x.name.startsWith('Ladang'));
  g.buyField(f.id);
  assert.ok(!g.state.log.at(-1).msg.includes('Ladang Ladang'));
  g.state.silo.wheat = 1.5;
  g.sellProduct('wheat');
  assert.match(g.state.log.at(-1).msg, /1,5 t/);
});
