import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { BUY_MARKUP } from '../js/engine/purchase.js';

const cows = () => DATA.ANIMALS.find((a) => a.id === 'cows');

function herd(money = 1e7) {
  const g = newGame(7);
  const a = cows();
  g.state.level = a.unlockLevel;
  g.state.money = 1e7;
  assert.equal(g.buildBarn(a.id).ok, true);
  assert.equal(g.buyAnimal(a.id, 4).ok, true);
  g.state.silo = {};
  g.state.money = money;
  return { g, a };
}

test('bought feed keeps an empty-silo herd fed through a rollover', () => {
  const { g, a } = herd();
  const events = [];
  g.on((e) => events.push(e));
  const r = g.buyFeed(a.id, 3);
  assert.equal(r.ok, true, r.reason);
  assert.ok(a.feedCrops.includes(r.productId));
  assert.ok(r.qty >= 4 * a.feedPerDay * 3 - 1e-9);
  assert.ok(events.some((e) => e.type === 'purchase' && e.productId === r.productId));
  g.advance(24 - g.hour);
  assert.equal(g.state.animals[a.id].fed, 1);
  assert.ok((g.state.silo[a.product] || 0) > 0);
});

test('buyFeed picks the cheapest accepted crop and charges the markup', () => {
  const { g, a } = herd();
  for (const c of a.feedCrops) g.state.market[c] = 300;
  const cheap = a.feedCrops[2];
  g.state.market[cheap] = 100;
  const q = g.feedQuote(a.id, 7);
  assert.equal(q.productId, cheap);
  assert.equal(q.affordable, true);
  const before = g.state.money, spent = g.state.stats.totalSpent;
  const r = g.buyFeed(a.id, 7);
  assert.equal(r.ok, true);
  assert.equal(r.productId, cheap);
  assert.equal(r.cost, Math.round(r.qty * 100 * BUY_MARKUP * 100) / 100);
  assert.equal(r.cost, q.cost);
  assert.equal(g.state.silo[cheap], r.qty);
  assert.ok(Math.abs(g.state.money - (before - r.cost)) < 1e-6);
  assert.ok(Math.abs(g.state.stats.totalSpent - (spent + r.cost)) < 1e-6);
});

test('insufficient money fails without changing silo or money', () => {
  const { g, a } = herd(1);
  const q = g.feedQuote(a.id, 7);
  assert.equal(q.affordable, false);
  const r = g.buyFeed(a.id, 7);
  assert.deepEqual(r, { ok: false, reason: 'Uang tidak cukup.' });
  assert.equal(g.state.money, 1);
  assert.deepEqual(g.state.silo, {});
});

test('buyFeed without animals fails', () => {
  const g = newGame(3);
  assert.deepEqual(g.buyFeed('chickens', 3), { ok: false, reason: 'Belum ada ternak.' });
  assert.equal(g.feedQuote('chickens', 3), null);
});

test('buyProduct rejects animal products and non-positive qty', () => {
  const g = newGame(5);
  g.state.money = 1e6;
  assert.equal(g.buyProduct('milk', 1).ok, false);
  assert.equal(g.buyProduct('wheat', 0).ok, false);
  assert.equal(g.buyProduct('wheat', -2).ok, false);
  assert.equal(g.state.money, 1e6);
  assert.deepEqual(g.state.silo, {});
  const r = g.buyProduct('wheat', 1.234);
  assert.equal(r.ok, true);
  assert.equal(r.qty, 1.23);
  assert.equal(g.state.silo.wheat, 1.23);
  const row = g.marketView().find((p) => p.id === 'wheat');
  assert.equal(row.buyable, true);
  assert.equal(row.buyPrice, Math.round(row.price * BUY_MARKUP * 100) / 100);
  assert.equal(g.marketView().find((p) => p.id === 'milk').buyable, false);
});
