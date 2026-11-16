import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField, starterCrop } from './helpers.js';
import { setup, near } from './factoryManager.helpers.js';
import { loadGame } from '../js/engine.js';
import { storeProduct } from '../js/engine/storage.js';
import { dispatchableStock } from '../js/engine/dispatcher.js';

const addContract = (g, productId, qty) => g.state.contracts.push({ id: 'kT', productId, qty, delivered: 0, price: 1, value: 100,
  days: 30, offeredDay: g.day, expiresDay: g.day + 3, dueDay: g.day + 30, penalty: 10, xp: 1, status: 'active' });
const growHours = () => (starterCrop().growDays + 2) * 24;

test('plan auto-sell keeps the remaining quantity of active contracts', () => {
  const g = newGame(41);
  const crop = starterCrop().id;
  addContract(g, crop, 5);
  g.setFieldPlan(startField(), { cropId: crop, repeat: false });
  g.advance(growHours());
  assert.equal(g.state.stats.harvests, 1);
  near(g.state.silo[crop] ?? 0, 5);
  assert.ok(g.state.stats.salesValue > 0, 'the rest was sold');
  // "Jual semua" (siloView bulk) and the Manajer Logistik keep it too.
  const it = g.siloView().items.find((x) => x.id === crop);
  near(it.kept, 5);
  assert.equal(it.bulk, 0);
  g.state.silo[crop] = 12;
  assert.equal(g.siloView().items.find((x) => x.id === crop).bulk, 7);
  g.state.level = 6;
  g.hireDispatcher('magang');
  near(dispatchableStock(g).get(crop) ?? 0, 7);
});

test('Manajer Pabrik gets its inputs when plans auto-sell the harvest (a day of batches is kept)', () => {
  const run = (hire) => {
    const g = setup({ silo: {} });
    g.state.market.flour = 600; // clearly worth milling
    if (hire) assert.equal(g.hireFactoryManager('supervisor').ok, true);
    g.setFieldPlan(startField(), { cropId: 'wheat', repeat: false, fertilize: false });
    g.advance((DATA.CROPS.find((c) => c.id === 'wheat').growDays + 3) * 24);
    assert.equal(g.state.stats.harvests, 1);
    return g;
  };
  const without = run(false);
  assert.equal(without.state.silo.wheat ?? 0, 0, 'no manager: everything sold');
  const g = run(true);
  const v = g.factoryManagerView();
  assert.ok(v.stats.batches >= 2, `batches ${v.stats.batches}`);
  assert.ok((g.state.silo.flour || 0) > 0 || g.state.factories.mill.running);
});

test('auto-feed buys missing feed before the animals eat; costs money (ledger pakan); off = starvation', () => {
  const herd = (on) => {
    const g = newGame(43);
    g.state.level = 10; g.state.money = 1e6;
    g.buildBarn('chickens'); g.buyAnimal('chickens', 50);
    if (!on) g.setAutoFeed({ animals: false });
    const evs = [];
    g.on((e) => e.type === 'auto_feed' && evs.push(e));
    g.advance(24 * 4);
    return { g, evs, h: g.state.animals.chickens };
  };
  const on = herd(true);
  assert.equal(on.h.fed, 1);
  assert.ok(on.g.state.ledger.total.pakan > 0);
  assert.ok(on.evs.length >= 1 && on.evs.length <= 4, 'one summary per day at most');
  const a = DATA.ANIMALS.find((x) => x.id === 'chickens');
  const stock = a.feedCrops.reduce((t, c) => t + (on.g.state.silo[c] || 0), 0);
  assert.ok(stock >= 50 * a.feedPerDay * 3 - 0.02, `≥ 3 days left after eating (${stock})`);
  assert.equal(on.h.feedAlert, 'ok');
  const off = herd(false);
  assert.ok(off.h.fed < 1);
  assert.equal(off.g.state.ledger.total.pakan ?? 0, 0);
  // No money: nothing bought, no loan.
  const broke = newGame(44);
  broke.state.level = 10; broke.state.money = 1e6;
  broke.buildBarn('chickens'); broke.buyAnimal('chickens', 50);
  broke.state.money = 0;
  broke.advance(24);
  assert.equal(broke.state.ledger.total.pakan ?? 0, 0, 'auto-feed never borrows (wages may)');
  assert.ok(broke.state.animals.chickens.fed < 1);
});

test('auto-feed tops up pelet for fish ponds', () => {
  const g = newGame(45);
  g.state.level = 50; g.state.money = 1e7;
  const r = g.buildPond('lele');
  g.stockPond(r.uid);
  g.advance(24 * 3);
  assert.equal(g.state.ponds[0].fed, 1);
  assert.ok(g.state.ledger.total.pakan > 0);
  assert.ok(g.fishView().pellet.daysLeft >= 3);
});

test('overflow: one storage_overflow_summary per game day with the lost value; Gudang card data', () => {
  const g = newGame(46);
  const evs = [];
  g.on((e) => e.type === 'storage_overflow_summary' && evs.push(e));
  g.state.market.wheat = 200;
  storeProduct(g, 'wheat', 140);
  storeProduct(g, 'wheat', 30); // 20 t over the 150 t silo
  storeProduct(g, 'wheat', 10); // 10 t more
  assert.equal(evs.length, 0, 'not per overflow');
  const v = g.overflowView();
  near(v.kinds[0].today.tons, 30);
  g.advance(24);
  assert.equal(evs.length, 1);
  near(evs[0].earned, 30 * 200 * 0.7);
  near(evs[0].lost, 30 * 200 * 0.3);
  assert.equal(evs[0].day, 1);
  const card = g.overflowView();
  assert.equal(card.kinds[0].kind, 'silo');
  near(card.lost, 1800);
  assert.ok(card.kinds[0].upgradeCost > 0);
  g.advance(48);
  assert.equal(evs.length, 1, 'no overflow → no summary');
  assert.equal(g.overflowView(), null, 'card disappears after a quiet day');
});

test('plan auto-sell sells at market before the silo overflows', () => {
  const g = newGame(47);
  const crop = starterCrop().id;
  g.state.silo.wheat = 149.5; // almost full (other crop)
  const evs = [];
  g.on((e) => e.type === 'silo_overflow' && evs.push(e));
  g.setFieldPlan(startField(), { cropId: crop, repeat: false });
  g.advance(growHours());
  assert.equal(g.state.stats.harvests, 1);
  assert.equal(evs.length, 0);
  assert.equal(g.state.overflow.total.tons, 0);
});

test('Manajer Pabrik idle for a day shows the reason and a one-tap fix', () => {
  const g = setup({ silo: {} });
  g.hireFactoryManager('direktur');
  assert.equal(g.factoryManagerView().blocked, null, 'not before a full day');
  g.advance(25);
  const b = g.factoryManagerView().blocked;
  assert.equal(b.reason, 'bahan kurang');
  assert.equal(b.fix.action, 'buyInputs');
  assert.ok(b.missing.length > 0);
  g.setFactoryManagerSettings({ buyInputs: true });
  g.state.silo.wheat = 40;
  g.advance(2);
  assert.equal(g.factoryManagerView().blocked, null);
});

test('old saves migrate: auto-feed on (3 days), empty overflow tally, no calendar claims or boosters', () => {
  const g = newGame(48);
  const s = JSON.parse(g.serialize());
  for (const k of ['autoFeed', 'overflow', 'calendar', 'boosters']) delete s[k];
  delete s.factoryManager.idleSince;
  const l = loadGame(JSON.stringify(s), { data: DATA });
  assert.deepEqual(l.state.autoFeed, { animals: true, fish: true, days: 3 });
  assert.deepEqual(l.state.overflow.total, { tons: 0, earned: 0, lost: 0 });
  assert.equal(l.state.calendar.streak, 0);
  assert.deepEqual(l.state.boosters, []);
  assert.equal(l.state.factoryManager.idleSince, null);
  l.advance(48);
  assert.ok(l.state.time > g.state.time);
});
