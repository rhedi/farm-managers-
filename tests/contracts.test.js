import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { stepContractsDay, contractsView, acceptContract, deliverContract, contractConfig } from '../js/engine/contracts.js';
import { BUY_MARKUP } from '../js/engine/purchase.js';

function withOffers(seed = 3) {
  const g = newGame(seed);
  g.state.contracts = [];
  stepContractsDay(g);
  return g;
}
const offers = (g) => g.state.contracts.filter((c) => c.status === 'offer');

test('rollover keeps 3 distinct offers for unlocked products, priced below the buy markup', () => {
  const g = withOffers();
  const cfg = contractConfig(g);
  assert.equal(offers(g).length, Math.min(cfg.offers, DATA.CROPS.filter((c) => c.unlockLevel <= 1).length));
  const ids = new Set(offers(g).map((c) => c.productId));
  assert.equal(ids.size, offers(g).length, 'no duplicate products');
  for (const c of offers(g)) {
    const crop = DATA.CROPS.find((x) => x.id === c.productId);
    assert.ok(crop && crop.unlockLevel <= g.state.level, `${c.productId} unlocked`);
    const ratio = c.price / g.state.market[c.productId];
    assert.ok(ratio >= cfg.priceMin - 1e-3 && ratio < BUY_MARKUP, `ratio ${ratio}`);
    assert.ok(c.qty > 0 && c.days >= cfg.dueMin && c.days <= cfg.dueMax);
    assert.ok(Math.abs(c.penalty - c.value * cfg.penaltyRate) < 0.01);
  }
});

test('offers are deterministic per seed and expire after offerDays', () => {
  const a = withOffers(9), b = withOffers(9);
  assert.deepEqual(a.state.contracts, b.state.contracts);
  const first = offers(a).map((c) => c.id);
  a.state.time += 24 * (contractConfig(a).offerDays + 1);
  stepContractsDay(a);
  assert.ok(first.every((id) => !a.state.contracts.some((c) => c.id === id)), 'old offers dropped');
  assert.equal(offers(a).length > 0, true, 'refilled');
});

test('accept respects maxActive; deliver partially then fully pays value + XP', () => {
  const g = withOffers();
  g.state.level = 4; // more crops → more offers
  const cfg = contractConfig(g);
  for (let i = 0; i < 3; i++) { stepContractsDay(g); offers(g).forEach((c) => acceptContract(g, c.id)); }
  assert.equal(g.state.contracts.filter((c) => c.status === 'active').length, cfg.maxActive);
  const extra = offers(g)[0];
  if (extra) assert.equal(acceptContract(g, extra.id).ok, false);

  const c = g.state.contracts.find((x) => x.status === 'active');
  assert.equal(deliverContract(g, c.id).ok, false, 'empty silo');
  const events = [];
  g.on((e) => events.push(e.type));
  g.state.silo[c.productId] = c.qty / 2;
  const r1 = deliverContract(g, c.id);
  assert.equal(r1.ok, true);
  assert.equal(r1.done, false);
  assert.equal(g.state.silo[c.productId] ?? 0, 0);
  const money0 = g.state.money, xp0 = g.state.xp, done0 = g.state.stats.contractsDone || 0;
  g.state.silo[c.productId] = c.qty * 2;
  const r2 = deliverContract(g, c.id);
  assert.equal(r2.done, true);
  assert.ok(g.state.money >= money0 + c.value - 0.01);
  assert.ok(g.state.xp >= xp0 + c.xp);
  assert.equal(g.state.stats.contractsDone, done0 + 1);
  assert.ok(Math.abs(g.state.silo[c.productId] - c.qty * 1.5) < 0.02, 'only the remainder is taken');
  assert.ok(events.includes('contract_done'));
  assert.equal(contractsView(g).find((v) => v.id === c.id).status, 'done');
});

test('delivery keeps the feed reserve', () => {
  const g = withOffers();
  const c = offers(g)[0];
  acceptContract(g, c.id);
  g.state.feedReserve = { [c.productId]: 5 };
  g.state.silo[c.productId] = 5;
  assert.equal(deliverContract(g, c.id).ok, false);
  g.state.silo[c.productId] = 6;
  const r = deliverContract(g, c.id);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.delivered - Math.min(1, c.qty)) < 1e-9);
  assert.equal(contractsView(g).find((v) => v.id === c.id).available, 5 - 5);
});

test('overdue contract fails, pays delivered goods at market and charges the penalty', () => {
  const g = withOffers();
  const c = offers(g)[0];
  acceptContract(g, c.id);
  g.state.silo[c.productId] = 0.5;
  deliverContract(g, c.id, 0.5);
  const events = [];
  g.on((e) => events.push(e.type));
  const money0 = g.state.money;
  g.state.time += 24 * (c.days + 1);
  stepContractsDay(g);
  assert.equal(c.status, 'failed');
  const paid = 0.5 * g.state.market[c.productId];
  assert.ok(Math.abs(g.state.money - (money0 + paid - c.penalty)) < 0.02);
  assert.ok(events.includes('contract_failed'));
});

test('penalty beyond cash is added to the loan', () => {
  const g = withOffers();
  const c = offers(g)[0];
  acceptContract(g, c.id);
  g.state.money = 0;
  g.state.time += 24 * (c.days + 1);
  stepContractsDay(g);
  assert.equal(g.state.money, 0);
  assert.ok(Math.abs(g.state.loan - c.penalty) < 0.01);
});

test('facade wiring (when present) exposes the same view', () => {
  const g = withOffers();
  if (typeof g.contractsView !== 'function') return;
  assert.deepEqual(g.contractsView(), contractsView(g));
  const c = offers(g)[0];
  assert.equal(g.acceptContract(c.id).ok, true);
});
