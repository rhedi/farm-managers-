import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, comparable } from './helpers.js';
import { loadGame } from '../js/engine.js';

const CHICK = DATA.ANIMALS.find((a) => a.id === 'chickens');
const base = (id) => DATA.PRODUCTS.find((p) => p.id === id).basePrice;

/** Level-30 game with `n` chickens in `barns` barns; `feed` keeps the silo stocked each day. */
function herd(n, { barns = 1, seed = 5 } = {}) {
  const g = newGame(seed);
  g.state.level = 30;
  g.state.money = 1e7;
  for (let i = 0; i < barns; i++) assert.equal(g.buildBarn('chickens').ok, true);
  assert.equal(g.buyAnimal('chickens', n).ok, true);
  return { g, h: g.state.animals.chickens };
}
const days = (g, d, feed = true) => { for (let i = 0; i < d; i++) { if (feed) g.state.silo.wheat = 50; g.advance(24); } };

test('fed, happy herds with room give birth every cycle; newborns, event and XP', () => {
  const { g, h } = herd(100);
  assert.equal(g.setBreeding('chickens', true).ok, true);
  const born = [];
  g.on((e) => e.type === 'animals_born' && born.push(e));
  const xp = g.state.xp;
  days(g, 4);
  // 100 × 0.026 × 4 (intensive) = 10.4 → 10 born, 0.4 carried
  assert.equal(h.count, 110);
  assert.equal(born.length, 1);
  assert.deepEqual([born[0].animalId, born[0].n], ['chickens', 10]);
  assert.ok(Math.abs(h.birthCarry - 0.4) < 1e-6);
  assert.ok(g.state.xp > xp);
  const v = g.animalsView().find((a) => a.id === 'chickens');
  assert.equal(v.bornToday, 10);
  assert.equal(v.bornTotal, 10);
  assert.equal(g.state.stats.animalsOwned >= 110, true, 'counts synced');
});

test('no births when unfed, unhappy, alone or full (herd_full fires once)', () => {
  const unfed = herd(100);
  days(unfed.g, 12, false);
  assert.equal(unfed.h.bornTotal, 0);
  const sad = herd(100);
  sad.h.happiness = 0.2; // +0.05/day when fed → still ≤ 0.7 after 9 days
  days(sad.g, 9);
  assert.equal(sad.h.bornTotal, 0);
  assert.equal(sad.h.breedDays, 0);
  const alone = herd(1);
  days(alone.g, 20);
  assert.equal(alone.h.count, 1);
  const full = herd(CHICK.barnCapacity);
  full.g.setBreeding('chickens', true);
  const ev = [];
  full.g.on((e) => e.type === 'herd_full' && ev.push(e));
  days(full.g, 12);
  assert.equal(full.h.count, CHICK.barnCapacity);
  assert.equal(ev.length, 1);
  const v = full.g.animalsView().find((a) => a.id === 'chickens');
  assert.equal(v.breedPaused, 'Kandang penuh.');
  assert.equal(v.breedingActive, false, 'intensive mode pauses (no extra feed) when full');
});

test('births never exceed barn capacity', () => {
  const { g, h } = herd(CHICK.barnCapacity - 3);
  g.setBreeding('chickens', true);
  days(g, 8);
  assert.equal(h.count, CHICK.barnCapacity);
});

test('breeding is deterministic per seed and survives save/load', () => {
  const run = () => { const { g } = herd(120, { seed: 9 }); g.setBreeding('chickens', true); days(g, 30); return g; };
  const a = run(), b = run();
  assert.deepEqual(comparable(a), comparable(b));
  const c = loadGame(a.serialize());
  days(a, 12); days(c, 12);
  assert.deepEqual(comparable(a), comparable(c));
  assert.ok(a.state.animals.chickens.bornTotal > 0);
});

test('newborns inherit herd genetics within ±drift and 0.5–1.5 bounds', () => {
  for (const start of [0.5, 1, 1.5]) {
    const { g, h } = herd(150, { barns: 3 });
    g.setBreeding('chickens', true);
    h.breedQuality = start;
    let prev = start;
    for (let i = 0; i < 60; i++) {
      days(g, 1);
      assert.ok(h.breedQuality >= 0.5 && h.breedQuality <= 1.5);
      assert.ok(Math.abs(h.breedQuality - prev) <= 0.02 + 1e-9, `step ${prev} → ${h.breedQuality}`);
      prev = h.breedQuality;
    }
  }
});

test('genetics scale production and sale price; bought animals dilute them', () => {
  const a = herd(100), b = herd(100);
  b.h.breedQuality = 1.4;
  days(a.g, 1); days(b.g, 1);
  assert.ok(Math.abs(b.g.state.silo.eggs / a.g.state.silo.eggs - 1.4) < 0.01);
  const ea = a.g.sellAnimal('chickens', 10).earned, eb = b.g.sellAnimal('chickens', 10).earned;
  assert.ok(Math.abs(eb / ea - 1.4) < 0.01);
  b.g.buyAnimal('chickens', 90); // 90 × 1.4 + 90 × 1 → 1.2
  assert.ok(Math.abs(b.h.breedQuality - 1.2) < 1e-6);
});

test('breeding stock: tiered cost, level gate, raises genetics toward target', () => {
  const { g, h } = herd(100);
  g.state.level = 2;
  const offer = g.animalsView().find((a) => a.id === 'chickens').nextStud;
  assert.equal(offer.cost, CHICK.price * CHICK.barnCapacity * 0.2);
  assert.equal(offer.target, 1.1);
  const money = g.state.money;
  const ev = [];
  g.on((e) => e.type === 'breed_improved' && ev.push(e));
  assert.deepEqual(g.buyBreedingStock('chickens'), { ok: true, tier: 1, cost: offer.cost, target: 1.1 });
  assert.equal(g.state.money, money - offer.cost);
  const r = g.buyBreedingStock('chickens');
  assert.equal(r.ok, false);
  assert.match(r.reason, /level 3/);
  days(g, 12);
  // newborn genes drift ±0.02, so the herd mean may sit a hair above the stud target (RNG-stream dependent)
  assert.ok(h.breedQuality > 1.09 && h.breedQuality <= 1.1 + 0.005, `bq ${h.breedQuality}`);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].animalId, 'chickens');
  g.state.level = 30;
  for (let t = 2; t <= 5; t++) assert.equal(g.buyBreedingStock('chickens').ok, true);
  assert.equal(g.buyBreedingStock('chickens').ok, false, 'max tier');
  days(g, 45);
  assert.ok(h.breedQuality > 1.45 && h.breedQuality <= 1.5);
});

test('stud coverage: herds that outgrow the bought capacity get a diluted target', () => {
  const { g, h } = herd(100);
  g.buyBreedingStock('chickens');
  g.buildBarn('chickens');
  g.buyAnimal('chickens', CHICK.barnCapacity * 2 - 100);
  const v = g.animalsView().find((a) => a.id === 'chickens');
  assert.equal(v.studTarget, 1.05); // covers 200 of 400 head
  days(g, 20);
  assert.ok(h.breedQuality <= 1.05 + 0.02);
});

/** Net $/head/day over 120 days at base prices, newborns sold daily (herd kept at one barn, 2nd barn = room). */
function loop(mode) {
  const { g, h } = herd(CHICK.barnCapacity, { barns: 2 });
  if (mode === 'none') g.data.BALANCE.breeding.animals.chickens = undefined;
  g.setBreeding('chickens', mode === 'intensive');
  let value = 0;
  try {
    for (let d = 0; d < 120; d++) {
      g.state.silo.barley = 1e3; g.state.silo.eggs = 0;
      g.advance(24);
      value += g.state.silo.eggs * base('eggs') - (1e3 - g.state.silo.barley) * base('barley');
      if (h.count > CHICK.barnCapacity) value += g.sellAnimal('chickens', h.count - CHICK.barnCapacity).earned;
    }
  } finally { g.data.BALANCE.breeding.animals.chickens = { days: 4, rate: 0.026 }; }
  return value / 120 / CHICK.barnCapacity;
}

test('no money loop: selling newborns stays near plain production', () => {
  const none = loop('none'), natural = loop('natural'), intensive = loop('intensive');
  assert.ok(natural > none && natural < none * 1.1, `natural ${natural} vs ${none}`);
  assert.ok(intensive < none, `intensive ${intensive} vs ${none}`);
  // incl. the extra barn kept free for newborns, payback stays ≥ 28 days
  assert.ok((CHICK.price + 2 * CHICK.barnCost / CHICK.barnCapacity) / natural >= 28);
});

test('old saves get breeding defaults', () => {
  const { g } = herd(10);
  const s = JSON.parse(g.serialize());
  s.animals.chickens = { count: 10, barns: 1, quality: 1, happiness: 1, fed: 1 };
  const g2 = loadGame(JSON.stringify(s));
  const h = g2.state.animals.chickens;
  assert.equal(h.breedQuality, 1);
  assert.equal(h.breeding, false);
  assert.equal(h.studTier, 0);
  days(g2, 5);
  assert.ok(Number.isFinite(h.breedQuality));
});
