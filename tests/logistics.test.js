import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { CATEGORY } from '../js/engine/ledger.js';

const ELF = DATA.MACHINES.find((m) => m.id === 'truk_elf');
const BANDUNG = DATA.CITIES.find((c) => c.id === 'bandung');
const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Level-10 game with one Elf truck and stock in the silo. */
function setup(seed = 3, silo = { rice: 10, wheat: 10, milk: 3000 }) {
  const g = newGame(seed);
  g.state.level = 10;
  g.state.money = 100000;
  const uid = g.buyMachine('truk_elf').uid;
  Object.assign(g.state.silo, silo);
  return { g, uid };
}

test('data: 5 truck tiers, 8 cities, crop multipliers stay below the buy markup', () => {
  const trucks = DATA.MACHINES.filter((m) => m.type === 'truck');
  assert.ok(trucks.length >= 3 && trucks.length <= 5);
  for (const t of trucks) for (const k of ['capacity', 'speedKmh', 'fuelPerKm', 'price', 'unlockLevel']) assert.ok(t[k] > 0, `${t.id}.${k}`);
  assert.ok(DATA.CITIES.length >= 6 && DATA.CITIES.length <= 8);
  const g = newGame();
  g.state.level = 30;
  for (const c of DATA.CITIES) for (const p of DATA.PRODUCTS) {
    const r = g.cityPrices(p.id).find((x) => x.cityId === c.id);
    if (g.idx.crops.has(p.id)) assert.ok(r.mult < 1.2, `${c.id}/${p.id} ${r.mult}`);
  }
  assert.ok(CATEGORY.get('transportasi')?.group === 'opex');
});

test('trip time and fuel: 2·km / speed hours, 2·km·L/km·fuelPrice booked at departure', () => {
  const { g, uid } = setup();
  const e = g.estimateShipment(uid, 'bandung', { rice: 4 });
  assert.equal(e.ok, true, e.reason);
  assert.equal(e.km, BANDUNG.km.jabar);
  near(e.hours, (2 * 40) / ELF.speedKmh);
  near(e.fuelCost, 2 * 40 * ELF.fuelPerKm * DATA.BALANCE.fuelPrice);
  const money = g.state.money, fuel0 = g.state.ledger.total.transportasi || 0;
  const r = g.shipToCity(uid, 'bandung', { rice: 4 });
  assert.equal(r.ok, true);
  near(g.state.money, money - e.fuelCost);
  near((g.state.ledger.total.transportasi || 0) - fuel0, e.fuelCost);
  assert.equal(g.state.silo.rice, 6);
});

test('city sale: market × city multiplier on arrival, booked as normal sale income; delivery_done', () => {
  const { g, uid } = setup();
  const price = g.state.market.rice, mult = BANDUNG.demand.rice;
  const evs = [];
  g.on((ev) => ev.type === 'delivery_done' && evs.push(ev));
  const sale0 = g.state.ledger.total.penjualan_panen || 0;
  g.shipToCity(uid, 'bandung', { rice: 4 });
  const money = g.state.money;
  g.advance(0.5); // still on the way (arrival at hours / 2 ≈ 0.67)
  assert.equal(evs.length, 0);
  g.advance(0.3);
  assert.equal(evs.length, 1);
  near(evs[0].value, 4 * price * mult);
  near(g.state.money - money, 4 * price * mult);
  near((g.state.ledger.total.penjualan_panen || 0) - sale0, 4 * price * mult);
  assert.equal(g.shipmentsView()[0].phase, 'pulang');
});

test('mixed cargo: animal goods book penjualan_ternak_produk; kg/L/pcs do not use capacity', () => {
  const { g, uid } = setup();
  const e = g.estimateShipment(uid, 'bandung', { rice: 4, milk: 3000 });
  assert.equal(e.ok, true, e.reason);
  assert.equal(e.tons, 4);
  const t0 = g.state.ledger.total.penjualan_ternak_produk || 0;
  g.shipToCity(uid, 'bandung', { rice: 4, milk: 3000 });
  g.advance(3);
  near((g.state.ledger.total.penjualan_ternak_produk || 0) - t0, 3000 * g.state.market.milk * BANDUNG.base, 1);
});

test('capacity, stock, feed reserve, locked/unreachable city are refused', () => {
  const { g, uid } = setup();
  assert.match(g.shipToCity(uid, 'bandung', { rice: 4.5 }).reason, /kapasitas/);
  assert.match(g.shipToCity(uid, 'bandung', { rice: 11 }).reason, /tidak cukup/);
  g.setFeedReserve('wheat', 8);
  assert.match(g.shipToCity(uid, 'bandung', { wheat: 3 }).reason, /tidak cukup/);
  assert.equal(g.shipToCity(uid, 'bandung', { wheat: 2 }).ok, true);
  const g2 = setup().g;
  const uid2 = g2.state.machines.find((m) => m.defId === 'truk_elf').uid;
  assert.match(g2.shipToCity(uid2, 'munchen', { rice: 1 }).reason, /Butuh ladang/);
  g2.state.level = 3;
  assert.match(g2.shipToCity(uid2, 'jakarta', { rice: 1 }).reason, /level 5/);
  assert.match(g2.shipToCity(uid2, 'bandung', {}).reason, /kosong/);
});

test('truck and driver are busy for the whole round trip, then free', () => {
  const { g, uid } = setup();
  assert.equal(g.state.workers.length, 1);
  g.shipToCity(uid, 'jakarta', { rice: 4 });
  const truck = g.state.machines.find((m) => m.uid === uid);
  assert.ok(truck.busy && g.state.workers[0].busy);
  assert.match(g.shipToCity(uid, 'bandung', { wheat: 1 }).reason, /di jalan/);
  assert.match(g.startTask('f1', 'plow').reason, /pekerja|sibuk|dipakai/i);
  assert.equal(g.sellMachine(uid).ok, false);
  g.advance(4.9);
  assert.ok(truck.busy);
  g.advance(0.2);
  assert.equal(truck.busy, false);
  assert.equal(g.state.workers[0].busy, false);
  assert.equal(g.shipmentsView().length, 0);
  assert.ok(truck.condition < 1, 'truck wears on the road');
});

test('upgrades and the truckCap/fuel perks change truck stats', () => {
  const { g, uid } = setup();
  g.state.level = 30;
  assert.equal(g.upgradeMachine(uid, 'engine').ok, true);
  assert.equal(g.upgradeMachine(uid, 'efficiency').ok, true);
  const t = g.trucksView()[0];
  near(t.capacity, 4.4);
  near(t.fuelPerKm, 0.117, 0.001);
  g.state.research.unlocked.push('mesin_bbm1', 'mesin_aus', 'mesin_truk');
  near(g.trucksView()[0].capacity, 4.4 * 1.15);
  const e = g.estimateShipment(uid, 'bandung', { rice: 5 });
  assert.equal(e.ok, true, e.reason);
  near(e.fuelCost, 80 * 0.117 * DATA.BALANCE.fuelPrice * 0.9);
});

test('deterministic and survives save/load mid-trip', () => {
  const run = () => {
    const { g, uid } = setup(9);
    g.shipToCity(uid, 'jakarta', { rice: 4 });
    g.advance(1);
    const json = g.serialize();
    const l = loadGame(json);
    assert.ok(l.state.machines.find((m) => m.uid === uid).busy, 'truck still busy after load');
    assert.ok(l.state.workers[0].busy, 'driver still busy after load');
    l.advance(10);
    assert.equal(l.state.machines.find((m) => m.uid === uid).busy, false);
    return comparable(l);
  };
  assert.deepEqual(run(), run());
});

test('old saves without shipments load; net worth counts cargo on the road', () => {
  const { g, uid } = setup();
  const nw = g.netWorth();
  g.shipToCity(uid, 'bandung', { rice: 4 });
  near(g.netWorth(), nw - g.state.ledger.total.transportasi, 1);
  const s = JSON.parse(newGame().serialize());
  delete s.shipments; delete s.nextTripId; delete s.research;
  const l = loadGame(JSON.stringify(s));
  assert.deepEqual(l.shipmentsView(), []);
  assert.equal(l.state.nextTripId, 1);
});
