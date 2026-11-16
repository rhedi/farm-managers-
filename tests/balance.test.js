import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField } from './helpers.js';
import { BUY_MARKUP } from '../js/engine/purchase.js';

const { CROPS, PRODUCTS, MACHINES, ANIMALS, LEVELS, ACHIEVEMENTS, BALANCE, STARTING, FIELDS } = DATA;
const P = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const MACHINE_REFUND = 0.6;
/** Net $/ha/day on fertilized loam at base price (no rent/fuel). */
const netPerDay = (c) => (c.baseYield * BALANCE.soilYield.loam * (1 + BALANCE.fertilizerBonus) * P[c.id].basePrice
  - c.seedCostPerHa - BALANCE.fertilizerCostPerHa) / c.growDays;
const cheapestFeed = (a) => Math.min(...a.feedCrops.map((id) => P[id].basePrice));
const animalNet = (a) => a.productPerDay * P[a.product].basePrice - a.feedPerDay * cheapestFeed(a);
const reward = (id) => ACHIEVEMENTS.find((a) => a.id === id).reward;

test('levels: faster early curve, every level 2–10 unlocks something (11–50: levels.test.js)', () => {
  assert.equal(LEVELS.length, 50);
  assert.ok(LEVELS[1] <= 300 && LEVELS[2] <= 1000, 'early thresholds halved');
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i] > LEVELS[i - 1]);
  for (let lvl = 2; lvl <= 10; lvl++) {
    const n = [...CROPS, ...MACHINES, ...ANIMALS].filter((x) => x.unlockLevel === lvl).length;
    assert.ok(n > 0, `level ${lvl} unlocks content`);
  }
});

test('data integrity: products, feed crops, starter content', () => {
  for (const c of CROPS) assert.ok(P[c.id], `product for ${c.id}`);
  for (const a of ANIMALS) {
    assert.ok(P[a.product], `product for ${a.id}`);
    for (const f of a.feedCrops) assert.ok(P[f], `${a.id} feed ${f}`);
    assert.ok(a.feedCrops.some((f) => CROPS.find((c) => c.id === f).unlockLevel <= a.unlockLevel), `${a.id} has growable feed`);
    assert.ok(a.sellPrice < a.price, `${a.id} cannot be bought and resold at a profit`);
  }
  const startHa = STARTING.fieldIds.reduce((s, id) => s + FIELDS.find((f) => f.id === id).sizeHa, 0);
  assert.ok(startHa >= 6, 'richer start');
});

test('balance keys: XP by value, loan rate, harvester rent', () => {
  assert.equal(BALANCE.xpPerHarvestTon, undefined);
  assert.ok(BALANCE.xpPerHarvestValue > 0 && BALANCE.xpPerHarvestValue <= 0.02);
  assert.ok(BALANCE.loanDailyRate >= 0.004 && BALANCE.loanDailyRate <= 0.006);
  assert.ok(STARTING.harvesterRentPerHa >= 110 && STARTING.harvesterRentPerHa <= 150);
  for (const m of MACHINES.filter((x) => x.type === 'harvester')) {
    const fuelPerHa = m.fuelPerHour * BALANCE.fuelPrice / m.haPerHour;
    assert.ok(fuelPerHa < STARTING.harvesterRentPerHa / 2, `${m.id} saves money over renting`);
  }
  assert.ok(BALANCE.contracts.priceMax < BUY_MARKUP, 'no buy-to-deliver arbitrage');
});

test('crop roles: barley cheap + fast, niches differ, best crop improves with level', () => {
  const barley = CROPS.find((c) => c.id === 'barley');
  const lv1 = CROPS.filter((c) => c.unlockLevel === 1);
  assert.ok(lv1.every((c) => c === barley || (barley.seedCostPerHa < c.seedCostPerHa && barley.growDays < c.growDays)));
  const potato = CROPS.find((c) => c.id === 'potato'), rice = CROPS.find((c) => c.id === 'rice');
  assert.ok(potato.idealPh[0] < rice.idealPh[0], 'potato owns the acid niche');
  const canola = CROPS.find((c) => c.id === 'canola'), sun = CROPS.find((c) => c.id === 'sunflower');
  assert.notEqual(canola.growDays, sun.growDays);
  assert.notEqual(canola.waterNeed, sun.waterNeed);
  assert.ok(sun.idealPh[1] > canola.idealPh[1], 'sunflower tolerates alkaline soil');
  let best = 0;
  for (let lvl = 1; lvl <= LEVELS.length; lvl++) {
    const top = Math.max(...CROPS.filter((c) => c.unlockLevel <= lvl).map(netPerDay));
    assert.ok(top >= best, `level ${lvl}`);
    best = top;
  }
});

test('animals pay back in 20–45 days and pigs/sheep are no longer traps', () => {
  for (const a of ANIMALS) {
    const days = (a.price + a.barnCost / a.barnCapacity) / animalNet(a);
    assert.ok(days >= 20 && days <= 45, `${a.id} payback ${days.toFixed(1)} d`);
  }
});

test('B6: achievement rewards stay below the round-trip loss of farming them', () => {
  const starter = new Set(STARTING.machineIds);
  const need = 8 - starter.size;
  const cheapest = MACHINES.filter((m) => !starter.has(m.id)).map((m) => m.price).sort((a, b) => a - b).slice(0, need);
  const machineLoss = cheapest.reduce((s, p) => s + p * (1 - MACHINE_REFUND), 0);
  assert.ok(machineLoss > reward('machines_8'), `machines ${machineLoss}`);
  const livestock = ANIMALS.filter((a) => a.livestock);
  assert.ok(livestock.length && !ANIMALS.find((a) => a.id === 'chickens').livestock);
  const herdLoss = Math.min(...livestock.map((a) => a.barnCost * Math.ceil(20 / a.barnCapacity) + 20 * (a.price - a.sellPrice)));
  assert.ok(herdLoss > reward('animals_20'), `herd ${herdLoss}`);
  const sold = ACHIEVEMENTS.find((a) => a.id === 'sold_50');
  assert.equal(sold.condition.stat, 'salesValue');
  assert.ok(sold.condition.gte * (1 - 1 / BUY_MARKUP) > sold.reward);
});

test('sim: one starter field on wheat reaches level 2 within 2 weeks and makes money', () => {
  const g = newGame(7);
  const fid = startField();
  const money0 = g.state.money;
  let lvl2Day = null;
  for (let h = 0; h < 30 * 24; h++) {
    const v = g.getFieldView(fid);
    if (v.state === 'idle') g.startTask(fid, 'plow');
    else if (v.state === 'plowed' && !v.fertilized && v.actions.includes('fertilize')) g.startTask(fid, 'fertilize');
    else if (v.state === 'plowed') g.startTask(fid, 'seed', { cropId: 'wheat' });
    else if (v.state === 'ready') g.startTask(fid, 'harvest', { rent: true });
    for (const id of Object.keys(g.state.silo)) g.sellProduct(id);
    g.advance(1);
    if (lvl2Day == null && g.state.level >= 2) lvl2Day = g.day;
  }
  assert.ok(lvl2Day != null && lvl2Day <= 14, `level 2 on day ${lvl2Day}`);
  assert.ok(g.state.money > money0 + 10000, `money ${g.state.money}`);
});
