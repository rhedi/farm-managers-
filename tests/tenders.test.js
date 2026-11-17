import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';

const C = DATA.BALANCE.tenders;
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
// Calm world: no Kabar Desa dilemmas spending cash in the background.
const CALM = { ...DATA, BALANCE: { ...DATA.BALANCE, kabar: { ...DATA.BALANCE.kabar, unlockLevel: 999 } } };

/** Lv 35 farm in Jawa Barat (export port: Jakarta) with `trucks` road trains and spare drivers. */
function lateFarm({ seed = 31, level = C.unlockLevel, trucks = 2, fields = 4 } = {}) {
  const g = loadGame(newGame(seed).serialize(), { data: CALM });
  g.state.level = Math.max(level, C.unlockLevel); g.state.money = 5e8;
  for (const f of DATA.FIELDS.filter((x) => x.regionId === 'jabar').slice(1, fields)) g.buyField(f.id);
  for (let i = 0; i < trucks; i++) assert.ok(g.buyMachine('truk_scanya_s').ok);
  for (let i = 0; i < 3; i++) g.hireWorker(g.workerCandidates()[0].id);
  g.state.level = level;
  return g;
}
/** Advance whole days until a tender offer shows up (≤ 10 days). */
function untilOffer(g) {
  for (let i = 0; i < 10 && !g.state.tenders.offer; i++) g.advance(24);
  return g.state.tenders.offer;
}

test('gating: no offers below the unlock level or without trucks; one offer every ~40 days', () => {
  const low = lateFarm({ level: C.unlockLevel - 1 });
  low.advance(24 * 6);
  assert.equal(low.state.tenders.offer, null);
  assert.equal(low.tenderView().unlocked, false);
  const noTruck = lateFarm({ trucks: 0 });
  noTruck.advance(24 * 6);
  assert.equal(noTruck.state.tenders.offer, null, 'trucks are required');
  const g = lateFarm();
  const o = untilOffer(g);
  assert.ok(o, 'an offer arrives a few days after unlocking');
  assert.equal(o.cityId, 'jakarta');
  assert.ok(o.qty >= C.minQty);
  assert.equal(o.days, C.durationDays);
  const p = DATA.PRODUCTS.find((x) => x.id === o.productId);
  assert.ok(o.price >= Math.round(0.9 * p.basePrice * C.priceRate * 100) / 100 - 0.01);
  assert.equal(g.declineTender().ok, true);
  assert.equal(g.state.tenders.next, g.day + C.everyDays);
  g.advance(24 * 10);
  assert.equal(g.state.tenders.offer, null, 'no new offer before everyDays');
});

test('size follows the farm (fields and fleet), so money alone cannot buy it', () => {
  const small = lateFarm({ fields: 1, trucks: 1 });
  const big = lateFarm({ fields: 12, trucks: 3 });
  const a = untilOffer(small), b = untilOffer(big);
  assert.ok(a && b);
  assert.equal(a.qty, C.minQty, 'a tiny farm gets the minimum');
  assert.ok(b.qty / DATA.CROPS.find((c) => c.id === b.productId).baseYield >= a.qty / DATA.CROPS.find((c) => c.id === a.productId).baseYield);
  const v = big.tenderView().offer;
  assert.ok(v.fleetPerDay > 0 && v.trucks === 3);
  assert.equal(v.value, Math.round(v.qty * v.price * 100) / 100);
});

test('one active at a time; trucks deliver chunks paid on arrival; tender stock is kept from auto-selling', () => {
  const g = lateFarm();
  const o = untilOffer(g);
  g.setTenderAuto(false);
  const r = g.acceptTender();
  assert.equal(r.ok, true);
  assert.equal(g.acceptTender().ok, false);
  const a = g.state.tenders.active;
  assert.equal(a.dueDay, g.day + C.durationDays);
  g.state.silo[o.productId] = 500;
  assert.ok(g.keptStock()[o.productId] >= 500 - 1e-9, 'kept for the tender');
  const kontrak0 = g.state.ledger.total.kontrak || 0;
  const s = g.shipTender();
  assert.equal(s.ok, true, s.reason);
  assert.equal(s.trips, 2);
  assert.equal(s.tons, 180);
  assert.equal(a.inTransit, 180);
  assert.equal(g.state.silo[o.productId], 320);
  assert.equal(g.tenderView().active.onRoad, 2);
  const evs = [];
  g.on((e) => e.type === 'tender_delivery' && evs.push(e));
  g.advance(3);
  assert.equal(a.delivered, 180);
  assert.equal(a.inTransit, 0);
  near(a.paid, 180 * a.price);
  near((g.state.ledger.total.kontrak || 0) - kontrak0, 180 * a.price);
  assert.equal(evs.length, 2);
  // The trucks keep their trip info and come home
  g.advance(3);
  assert.equal(g.state.shipments.length, 0);
});

test('auto-send runs every hour with idle trucks and spare drivers', () => {
  const g = lateFarm();
  const o = untilOffer(g);
  g.state.silo[o.productId] = 1000;
  g.acceptTender(); // auto is on by default: ships at once
  assert.equal(g.state.tenders.active.inTransit, 180);
  g.advance(12);
  assert.ok(g.state.tenders.active.delivered >= 360, `${g.state.tenders.active.delivered}`);
});

test('completion pays the premium, research points, a trophy and tender cosmetics', () => {
  const g = lateFarm();
  const o = untilOffer(g);
  g.setTenderAuto(false);
  g.acceptTender();
  const a = g.state.tenders.active;
  a.delivered = a.qty - 50;
  g.state.silo[o.productId] = 50;
  const rp0 = g.researchPoints().earned, money0 = g.state.money;
  const evs = [];
  g.on((e) => (e.type === 'tender_done' || e.type === 'cosmetic_unlocked') && evs.push(e));
  assert.ok(g.shipTender().ok);
  g.advance(3);
  assert.equal(g.state.tenders.active, null);
  const done = evs.find((e) => e.type === 'tender_done');
  assert.ok(done);
  const value = a.qty * a.price;
  near(done.bonus, value * C.premium, 1);
  assert.equal(g.researchPoints().earned - rp0, C.rp);
  assert.ok(g.state.money > money0 + done.bonus - 1);
  assert.equal(g.state.tenders.trophies[o.destId].count, 1);
  assert.equal(g.state.tenders.done, 1);
  assert.ok(g.state.encyclopedia.cosmetics.includes('banner_ekspor'));
  assert.ok(g.state.encyclopedia.cosmetics.includes('paint_rotterdam'));
  assert.ok(evs.some((e) => e.type === 'cosmetic_unlocked'));
  assert.equal(g.tenderView().history[0].status, 'done');
});

test('deadline: a missed tender fails with a small penalty on the undelivered part', () => {
  const g = lateFarm();
  untilOffer(g);
  g.setTenderAuto(false);
  g.acceptTender();
  const a = g.state.tenders.active;
  a.delivered = 100;
  const pen0 = g.state.ledger.total.penalti_kontrak || 0;
  const evs = [];
  g.on((e) => e.type === 'tender_failed' && evs.push(e));
  g.advance(24 * (C.durationDays + 1));
  assert.equal(g.state.tenders.active, null);
  assert.equal(evs.length, 1);
  const expect = Math.round((a.qty - 100) * a.price * C.penaltyRate * 100) / 100;
  near((g.state.ledger.total.penalti_kontrak || 0) - pen0, expect);
  assert.ok(expect < a.qty * a.price * 0.05, 'penalty is small');
  assert.equal(g.state.tenders.failed, 1);
});

test('⚓ Pelabuhan Ekspor loads part of the tender from the silo every midnight', () => {
  const g = lateFarm();
  const o = untilOffer(g);
  g.setTenderAuto(false);
  g.state.projects.regions.jabar = { pelabuhan: { stage: 2, build: null } };
  g.acceptTender();
  g.state.silo[o.productId] = o.qty;
  g.advance(24 - g.hour);
  const a = g.state.tenders.active;
  near(a.delivered, Math.round(o.qty * C.portLoadPerStage * 2 * 100) / 100);
  assert.equal(g.tenderView().active.portStage, 2);
});

test('offline coarse days keep auto-sending (fleet haul × efficiency); save/load + migration', () => {
  const g = lateFarm();
  const o = untilOffer(g);
  g.state.silo[o.productId] = 20000;
  g.acceptTender();
  g.state.storageUpgrades.silo = 14;
  const json = g.serialize();
  const back = loadGame(json, { data: CALM });
  assert.equal(back.state.tenders.active.id, g.state.tenders.active.id);
  assert.ok(back.state.shipments.some((s) => s.tender === back.state.tenders.active.id), 'tender trips survive a reload');
  back.catchUp(8 * 3600);
  assert.ok(back.lastCatchUp.coarseDays > 0);
  const a = back.state.tenders.active ?? back.state.tenders.history.at(-1);
  assert.ok(a.delivered > 1000, `coarse deliveries ${a.delivered}`);
  const old = JSON.parse(json);
  delete old.tenders;
  const mig = loadGame(JSON.stringify(old), { data: CALM }).state.tenders;
  assert.deepEqual({ ...mig }, { next: null, seq: 0, auto: true, offer: null, active: null, history: [], trophies: {}, done: 0, failed: 0 });
});
