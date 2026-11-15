import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { planShipment, cityMult } from '../js/engine/logistics.js';

const tier = (id) => DATA.BALANCE.dispatcher.tiers.find((t) => t.id === id);
const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Level-N game with trucks, extra drivers and silo stock; minimums off unless `settings` says otherwise. */
function setup({ seed = 3, level = 10, trucks = ['truk_elf'], silo = { rice: 20 }, workers = 2, settings = {} } = {}) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 500000;
  const uids = trucks.map((id) => g.buyMachine(id).uid);
  for (let i = 1; i < workers; i++) g.state.workers.push({ id: `w${g.state.nextWorkerId++}`, name: `Sopir ${i}`, skill: 0.2, wage: 80, busy: false });
  Object.assign(g.state.silo, silo);
  g.setDispatcherSettings({ minProfit: 0, minMargin: 0, reserveWorkers: 0, ...settings });
  return { g, uids };
}
const autoTrips = (g) => g.shipmentsView().filter((t) => t.auto);
const cargoOf = (g) => Object.fromEntries(autoTrips(g).flatMap((t) => t.cargo.map((c) => [c.productId, c.qty])));

test('data: tiers unlock at/after trucks, cost more with skill; new game has no manager', () => {
  const tiers = DATA.BALANCE.dispatcher.tiers;
  const truckLevel = Math.min(...DATA.MACHINES.filter((m) => m.type === 'truck').map((m) => m.unlockLevel));
  assert.ok(tiers.length >= 2 && tiers.length <= 3);
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    assert.ok(t.unlockLevel >= truckLevel && t.hireCost > 0 && t.wage > 0 && t.trucks >= 1 && t.radiusKm > 0, t.id);
    if (i) for (const k of ['unlockLevel', 'hireCost', 'wage', 'skill', 'radiusKm']) assert.ok(t[k] > tiers[i - 1][k], `${t.id}.${k}`);
  }
  const v = newGame().dispatcherView();
  assert.equal(v.hired, null);
  assert.equal(v.candidates.length, tiers.length);
  assert.equal(v.unlockLevel, tiers[0].unlockLevel);
});

test('hire / fire: level gate, hire cost and daily wage book to the gaji ledger', () => {
  const { g } = setup({ level: 5, silo: {} });
  const T = tier('magang');
  assert.match(g.hireDispatcher('magang').reason, /level 6/);
  assert.match(g.hireDispatcher('nope').reason, /tidak ditemukan/);
  g.state.level = 6;
  const evs = [];
  g.on((e) => evs.push(e.type));
  const money = g.state.money, gaji0 = g.state.ledger.total.gaji || 0;
  const r = g.hireDispatcher('magang');
  assert.equal(r.ok, true);
  assert.equal(r.cost, T.hireCost);
  near(money - g.state.money, T.hireCost);
  near((g.state.ledger.total.gaji || 0) - gaji0, T.hireCost);
  assert.ok(evs.includes('dispatcher_hired'));
  assert.match(g.hireDispatcher('magang').reason, /Sudah ada/);
  assert.equal(g.dispatcherView().hired.name, T.name);

  const workerWages = g.state.workers.reduce((a, w) => a + w.wage, 0);
  const before = g.state.ledger.total.gaji;
  g.advance(24 - g.state.time % 24); // midnight
  near(g.state.ledger.total.gaji - before, workerWages + T.wage);
  assert.equal(g.fireDispatcher().ok, true);
  assert.match(g.fireDispatcher().reason, /Belum ada/);
  const before2 = g.state.ledger.total.gaji;
  g.advance(24);
  near(g.state.ledger.total.gaji - before2, workerWages);
  g.state.money = 10;
  assert.match(g.hireDispatcher('magang').reason, /Uang tidak cukup/);
});

test('picks the city with the highest profit over selling locally', () => {
  const { g, uids } = setup({ level: 14, trucks: ['truk_hinu'], silo: { rice: 20 } });
  g.state.money = 2e6;
  g.buyField('f9'); // Iowa: Des Moines + Chicago become reachable
  const T = tier('direktur');
  const options = DATA.CITIES.filter((c) => c.unlockLevel <= 14 && (c.km.jabar || c.km.iowa))
    .filter((c) => cityMult(g, c, 'rice', T.bonus) > 1)
    .map((c) => ({ id: c.id, profit: planShipment(g, uids[0], c.id, { rice: 20 }, { bonus: T.bonus }).profit }))
    .sort((a, b) => b.profit - a.profit);
  assert.ok(options.length >= 3, 'several cities to choose from');
  const evs = [];
  g.on((e) => e.type === 'auto_dispatch' && evs.push(e));
  assert.equal(g.hireDispatcher('direktur').ok, true);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].city, options[0].id);
  assert.equal(evs[0].truck, uids[0]);
  assert.deepEqual(evs[0].cargo, { rice: 20 });
  near(evs[0].estProfit, options[0].profit);
  const v = g.dispatcherView();
  assert.equal(v.stats.trips, 1);
  near(v.stats.extraProfit, options[0].profit);
  assert.equal(v.today.trips, 1);
  assert.equal(v.recent[0].cityId, options[0].id);
  assert.equal(g.state.silo.rice ?? 0, 0);
});

test('capacity: ton goods fill the truck by best gain per ton, kg/L/pcs ride along', () => {
  const { g } = setup({ level: 6, silo: { rice: 10, wheat: 10, milk: 3000 } });
  g.hireDispatcher('magang'); // radius 100 km: Bandung only from Jawa Barat
  const trips = autoTrips(g);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].cityId, 'bandung');
  assert.deepEqual(cargoOf(g), { rice: 4, milk: 3000 }); // rice +8 % beats wheat +3 %
  assert.ok(trips[0].tons <= 4 + 1e-9);
});

test('feed reserve, active contracts and "sisakan %" stay in the silo', () => {
  const a = setup({ level: 6, silo: { rice: 10 } }).g;
  a.setFeedReserve('rice', 8);
  a.hireDispatcher('magang');
  assert.deepEqual(cargoOf(a), { rice: 2 });

  const b = setup({ level: 6, silo: { rice: 10 } }).g;
  b.state.contracts.push({ id: 'k1', productId: 'rice', qty: 9, delivered: 2, status: 'active', price: 300, value: 2700, dueDay: 20 });
  b.hireDispatcher('magang');
  assert.deepEqual(cargoOf(b), { rice: 3 });

  const c = setup({ level: 6, silo: { rice: 40 }, settings: { keepPct: { rice: 50 } } }).g;
  c.hireDispatcher('magang');
  for (let h = 0; h < 48; h++) { c.advance(1); assert.ok(c.state.silo.rice >= 20 - 1e-9, `rice ${c.state.silo.rice}`); }
  near(c.state.silo.rice, 20);
  c.state.silo.rice += 20; // a harvest arrives: half of it is kept too
  for (let h = 0; h < 48; h++) c.advance(1);
  near(c.state.silo.rice, 30);
  assert.equal(c.dispatcherView().products.find((p) => p.id === 'rice').held, 30);
  c.setDispatcherSettings({ keepPct: { rice: 0 } });
  for (let h = 0; h < 48; h++) c.advance(1);
  assert.equal(c.state.silo.rice ?? 0, 0);
});

test('minimum profit ($ and % over local) blocks weak trips', () => {
  const { g } = setup({ level: 6, silo: { rice: 4 }, settings: { minProfit: 100000 } });
  g.hireDispatcher('magang');
  g.advance(24);
  assert.equal(g.state.shipments.length, 0);
  assert.match(g.dispatcherView().note, /untung minimum/);
  g.setDispatcherSettings({ minProfit: 0, minMargin: 50 });
  assert.equal(g.state.shipments.length, 0);
  g.setDispatcherSettings({ minMargin: 1 });
  assert.equal(autoTrips(g).length, 1);
});

test('reserve workers: the manager leaves N free workers for field work', () => {
  const { g } = setup({ level: 6, workers: 1, settings: { reserveWorkers: 1 } });
  g.hireDispatcher('magang');
  g.advance(5);
  assert.equal(g.state.shipments.length, 0);
  assert.match(g.dispatcherView().note, /pekerja bebas/);
  g.setDispatcherSettings({ reserveWorkers: 0 });
  assert.equal(autoTrips(g).length, 1);
});

test('allowed groups, excluded products and blocked cities', () => {
  const a = setup({ level: 6, silo: { rice: 4, milk: 3000 }, settings: { groups: { crop: false } } }).g;
  a.hireDispatcher('magang');
  assert.deepEqual(cargoOf(a), { milk: 3000 });

  const b = setup({ level: 6, silo: { rice: 4, milk: 3000 }, settings: { exclude: ['milk'] } }).g;
  b.hireDispatcher('magang');
  assert.deepEqual(cargoOf(b), { rice: 4 });

  const c = setup({ level: 14, trucks: ['truk_hinu'], silo: { rice: 20 } }).g;
  c.hireDispatcher('direktur');
  const best = autoTrips(c)[0].cityId;
  const d = setup({ level: 14, trucks: ['truk_hinu'], silo: { rice: 20 }, settings: { blockedCities: [best] } }).g;
  d.hireDispatcher('direktur');
  assert.equal(autoTrips(d).length, 1);
  assert.notEqual(autoTrips(d)[0].cityId, best);
  assert.ok(d.dispatcherView().cities.find((x) => x.id === best).allowed === false);
});

test('no double dispatch: stock leaves at departure, the next truck only takes what is left', () => {
  const a = setup({ level: 9, trucks: ['truk_elf', 'truk_elf'], silo: { rice: 4 }, workers: 3 }).g;
  a.hireDispatcher('senior');
  assert.equal(autoTrips(a).length, 1);
  a.advance(1);
  assert.equal(autoTrips(a).length, 1);
  const b = setup({ level: 9, trucks: ['truk_elf', 'truk_elf'], silo: { rice: 6 }, workers: 3 }).g;
  b.hireDispatcher('senior');
  assert.deepEqual(autoTrips(b).map((t) => t.cargo[0].qty).sort(), [2, 4]);
});

test('truck limits: tier "trucks" and the maks. truk setting; worn trucks stay home', () => {
  const a = setup({ level: 6, trucks: ['truk_elf', 'truk_elf'], silo: { rice: 20 }, workers: 3 }).g;
  a.hireDispatcher('magang'); // magang manages 1 truck
  a.advance(0.5);
  assert.equal(autoTrips(a).length, 1);
  const b = setup({ level: 9, trucks: ['truk_elf', 'truk_elf', 'truk_elf'], silo: { rice: 20 }, workers: 4, settings: { maxTrucks: 2 } }).g;
  b.hireDispatcher('senior');
  assert.equal(autoTrips(b).length, 2);
  const c = setup({ level: 6, silo: { rice: 20 } });
  c.g.state.machines.find((m) => m.uid === c.uids[0]).condition = 0.1;
  c.g.hireDispatcher('magang');
  assert.equal(c.g.state.shipments.length, 0);
  assert.match(c.g.dispatcherView().note, /hampir rusak/);
});

test('jeda (off) = no trips; aktif again plans at once; manual shipping still works', () => {
  const { g, uids } = setup({ level: 6, silo: {} });
  g.hireDispatcher('magang');
  assert.equal(g.setDispatcherOn(false).on, false);
  g.state.silo.rice = 20;
  g.advance(48);
  assert.equal(g.state.shipments.length, 0);
  assert.equal(g.shipToCity(uids[0], 'bandung', { rice: 4 }).ok, true);
  assert.equal(g.shipmentsView()[0].auto, false);
  g.advance(3);
  g.setDispatcherOn(true);
  assert.equal(autoTrips(g).length, 1);
});

test('save/load keeps the manager, settings, hold ledger and auto trips; old saves load without a manager', () => {
  const run = () => {
    const { g } = setup({ level: 9, seed: 11, trucks: ['truk_elf', 'truk_canter'], workers: 3, silo: { rice: 30, milk: 2000 },
      settings: { keepPct: { rice: 25 }, blockedCities: ['jakarta'], maxTrucks: 2, minProfit: 50 } });
    g.hireDispatcher('senior');
    g.advance(1.5);
    const l = loadGame(g.serialize());
    assert.deepEqual(l.dispatcherView(), g.dispatcherView());
    assert.ok(l.state.shipments.some((t) => t.auto));
    g.advance(30); l.advance(30);
    assert.deepEqual(comparable(l), comparable(g));
    return comparable(l);
  };
  assert.deepEqual(run(), run(), 'deterministic');

  const { g } = setup({ level: 9, silo: { rice: 10 } });
  const old = JSON.parse(g.serialize());
  delete old.dispatcher;
  const l = loadGame(JSON.stringify(old));
  const v = l.dispatcherView();
  assert.equal(v.hired, null);
  assert.equal(v.settings.minProfit, 100);
  assert.deepEqual(v.settings.groups, { crop: true, animal: true, processed: true });
  l.advance(48);
  assert.equal(l.state.shipments.length, 0);
  const bad = JSON.parse(g.serialize());
  bad.dispatcher = { hired: { tierId: 'gone' }, settings: { exclude: ['nope', 'rice'], blockedCities: ['atlantis'], minProfit: -5, keepPct: { rice: 300 } } };
  const v2 = loadGame(JSON.stringify(bad)).dispatcherView();
  assert.equal(v2.hired, null);
  assert.deepEqual(v2.settings.exclude, ['rice']);
  assert.deepEqual(v2.settings.blockedCities, []);
  assert.equal(v2.settings.minProfit, 0);
  assert.equal(v2.settings.keepPct.rice, 90);
});

test('offline catch-up: 48 h of dispatching is bounded and keeps sending trucks', () => {
  const { g } = setup({ level: 6, silo: { rice: 200 } });
  g.hireDispatcher('magang');
  g.advance(0.1);
  const t0 = performance.now();
  const hours = g.catchUp(48 * DATA.BALANCE.realSecondsPerGameHour * 10);
  const ms = performance.now() - t0;
  assert.equal(hours, 48);
  const v = g.dispatcherView();
  assert.ok(v.stats.trips >= 10, `trips ${v.stats.trips}`);
  assert.ok(v.stats.extraProfit > 0);
  assert.ok(v.recent.length <= 6);
  assert.ok(ms < 1500, `catch-up took ${ms} ms`);
  assert.ok(g.state.log.some((e) => e.type === 'auto_dispatch'));
});

test('negotiation bonus is paid on arrival for manager trips; crops stay below the buy markup', () => {
  const { g } = setup({ level: 14, trucks: ['truk_hinu'], silo: { milk: 5000 } });
  const sales = [];
  g.on((e) => e.type === 'delivery_done' && sales.push(e));
  g.hireDispatcher('direktur');
  const trip = autoTrips(g)[0];
  const city = DATA.CITIES.find((c) => c.id === trip.cityId);
  const price = g.state.market.milk;
  g.advance(trip.hours / 2 + 0.01);
  assert.equal(sales.length, 1);
  near(sales[0].value, 5000 * price * cityMult(g, city, 'milk', tier('direktur').bonus), 1);
  for (const c of DATA.CITIES) for (const p of DATA.CROPS) assert.ok(cityMult(g, c, p.id, 0.04) < 1.2, `${c.id}/${p.id}`);
});
