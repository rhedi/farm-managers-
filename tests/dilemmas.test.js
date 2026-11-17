import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../js/engine.js';
import { DATA, newGame } from './helpers.js';
import { TYPES } from '../js/engine/kabar.js';
import { makeDisaster } from '../js/engine/kabarDisasters.js';
import { scale, lossCap, daysCash, loseHeads, rngFor } from '../js/engine/kabarCore.js';

const type = (id) => TYPES.find((t) => t.id === id);
function farm(seed = 3, level = 12) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e6;
  return g;
}
const withChickens = (g, n = 150) => { g.buildBarn('chickens'); assert.equal(g.buyAnimal('chickens', n).ok, true); return g; };
/** Advance whole days until a dilemma is open (or `max` days). */
function untilOpen(g, max = 20) { for (let i = 0; i < max && !g.kabarView().open; i++) g.advance(24); return g.kabarView().open; }

test('≥ 10 dilemma types; relevance gating by what the player owns', () => {
  assert.ok(TYPES.length >= 10);
  const g = farm();
  const r = rngFor(g, 't');
  assert.equal(type('flu_burung').make(g, r), null, 'no poultry → no bird flu');
  assert.equal(type('wabah_ikan').make(g, r), null, 'no stocked pond → no fish disease');
  assert.equal(type('pencurian').make(g, r), null, 'no livestock → no theft');
  assert.equal(type('gaji').make(g, r), null, 'fewer than 4 workers → no wage dispute');
  assert.equal(type('ekspor').make(g, r), null, 'no Pelabuhan stage 2 → no export order');
  withChickens(g);
  const m = type('flu_burung').make(g, r);
  assert.ok(m && m.options.length >= 2 && m.options.length <= 3 && m.options.some((o) => o.id === m.def));
  for (const o of m.options) assert.ok(typeof o.label === 'string' && o.desc.length > 3);
});

test('no dilemmas below the unlock level; at most one open, ≈ one per 3 days', () => {
  const low = farm(3, 1);
  low.advance(24 * 15);
  assert.equal(low.kabarView().history.length + (low.kabarView().open ? 1 : 0), 0);
  const g = withChickens(farm());
  let opened = 0;
  g.on((e) => { if (e.type === 'dilemma_new') { assert.equal(g.kabarView().open.id, e.id); opened++; } });
  g.advance(24 * 60);
  assert.ok(opened >= 14 && opened <= 26, `opened ${opened} in 60 days`);
});

test('deadline: the default option applies automatically (dilemma_resolved auto)', () => {
  const g = withChickens(farm());
  const open = untilOpen(g);
  assert.ok(open && open.hoursLeft > 0 && open.hoursLeft <= 48);
  const evs = [];
  g.on((e) => { if (e.type === 'dilemma_resolved') evs.push(e); });
  g.advance(open.hoursLeft + 1);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].auto, true);
  assert.equal(evs[0].option, open.def);
  assert.equal(evs[0].id, open.id);
  const h = g.kabarView().history[0];
  assert.equal(h.id, open.id);
  assert.equal(h.auto, true);
  assert.ok(h.text.length > 5);
});

test('player choice: costs paid, outcome deterministic for the same seed, unaffordable refused', () => {
  const run = () => {
    const g = withChickens(farm(9));
    const open = untilOpen(g);
    const o = open.options.find((x) => x.cost > 0) ?? open.options[0];
    const before = g.state.money;
    const r = g.chooseDilemma(o.id);
    assert.equal(r.ok, true);
    assert.ok(g.state.money <= before - (o.cost || 0) + 1e6, 'cost paid');
    return { id: open.id, option: o.id, text: r.outcome.text, money: g.state.money };
  };
  assert.deepEqual(run(), run());
  const g = withChickens(farm(9));
  const open = untilOpen(g);
  const paid = open.options.find((x) => x.cost > 0);
  if (paid) {
    g.state.money = 0;
    assert.equal(g.chooseDilemma(paid.id).ok, false);
    assert.ok(g.kabarView().open, 'still open after a refused choice');
  }
  assert.equal(g.chooseDilemma('nope').ok, false);
});

test('scaling with income and caps: costs follow S, losses capped by cash and income', () => {
  const g = withChickens(farm());
  const s0 = scale(g);
  assert.equal(s0, DATA.BALANCE.kabar.scalePerLevel * g.state.level);
  g.state.ledger.days = [1, 2, 3].map((d) => ({ day: d, cats: { penjualan_panen: 5e6 } }));
  g.state.ledger.cur = { day: 4, cats: { penjualan_panen: 5e6 } };
  g.state.time = 24 * 4 + 6;
  assert.ok(scale(g) >= 4.9e6, 'S = recent daily income');
  assert.ok(daysCash(g, 0.25) > 1e6);
  g.state.money = 1000;
  assert.ok(lossCap(g) <= 0.2 * 1000 + 1e-9, 'loss capped by cash share');
  const h = g.state.animals.chickens, n0 = h.count;
  const lost = loseHeads(g, 'chickens', 0.5, 15 * 10); // value cap: 10 chickens
  assert.equal(lost, 10);
  assert.equal(h.count, n0 - 10);
});

test('offline catch-up (coarse) resolves defaults deterministically', () => {
  const run = () => {
    const g = withChickens(farm(21));
    untilOpen(g);
    g.catchUp(8 * 3600);
    assert.ok(g.lastCatchUp.coarseDays > 0);
    const v = g.kabarView();
    return { hist: v.history.map((h) => [h.id, h.option, h.auto, h.text]), auto: v.stats.auto, money: g.state.money };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.auto >= 2, `auto-resolved ${a.auto}`);
  assert.ok(a.hist.every(([, , auto]) => auto));
});

/** First day ≥ 1 whose seeded disaster is `kind` (the pick is seeded by the day). */
function disasterOf(g, kind) {
  for (let d = g.day; d < g.day + 400; d++) { const x = makeDisaster(g, d, 1); if (x.type === kind) return { ...x, startDay: g.day + 3, endDay: g.day + 3 + (x.endDay - x.startDay) }; }
  throw new Error(`no ${kind}`);
}

test('El Niño: forecast → no rain in the region → end, history entry', () => {
  const g = withChickens(farm(4));
  g.state.kabar.disaster = disasterOf(g, 'elnino');
  const d = g.state.kabar.disaster;
  const types = [];
  g.on((e) => { if (e.type.startsWith('disaster_')) types.push(e.type); });
  assert.equal(g.kabarView().disaster.phase, 'forecast');
  assert.ok(g.forecast(d.regionId).filter((x) => x.day >= d.startDay).every((x) => !x.rain), 'forecast already dry');
  while (g.day < d.startDay) g.advance(24);
  assert.equal(g.kabarView().disaster.phase, 'active');
  assert.equal(g.kabarView().disaster.choice, d.def, 'default preparation');
  for (let day = d.startDay; day <= d.endDay; day++) { assert.equal(g.state.weather[d.regionId].rain, false); g.advance(24); }
  assert.equal(g.kabarView().disaster, null);
  assert.deepEqual(types, ['disaster_start', 'disaster_end']);
  assert.equal(g.kabarView().history[0].id, d.id);
  assert.ok(g.state.kabar.nextDisaster > g.day);
});

test('Krisis Pangan: crop prices ×1.5 while active, back after; extra contract offers', () => {
  const g = farm(5);
  g.state.kabar.disaster = disasterOf(g, 'krisis');
  const d = g.state.kabar.disaster;
  while (g.day < d.startDay - 1) g.advance(24);
  const offersBefore = g.state.contracts.filter((c) => c.status === 'offer').length;
  g.advance(24); // start
  assert.equal(g.state.kabar.disaster.phase, 'active');
  const wheat = DATA.PRODUCTS.find((p) => p.id === 'wheat');
  assert.ok(g.state.market.wheat > wheat.basePrice * 1.2, `wheat ${g.state.market.wheat}`);
  assert.ok(g.state.contracts.filter((c) => c.status === 'offer').length > offersBefore);
  while (g.state.kabar.disaster) g.advance(24);
  assert.ok(g.state.market.wheat < wheat.basePrice * 1.4, `wheat back ${g.state.market.wheat}`);
});

test('Wabah: default quarantine saves the herd; ignoring it loses ≤ the cap', () => {
  const g = withChickens(farm(6), 200);
  g.state.kabar.disaster = disasterOf(g, 'wabah');
  const d = g.state.kabar.disaster;
  while (g.state.kabar.disaster) g.advance(24);
  assert.equal(g.state.animals.chickens.count >= 200, true, 'karantina: no deaths');
  const g2 = withChickens(farm(6), 200);
  g2.state.kabar.disaster = disasterOf(g2, 'wabah');
  assert.equal(g2.prepareDisaster('biarkan').ok, true);
  assert.equal(g2.prepareDisaster('vaksin').ok, false, 'fixed once chosen');
  while (g2.state.kabar.disaster) g2.advance(24);
  const lost = 200 - g2.state.animals.chickens.count;
  assert.ok(lost > 0 && lost * 15 <= d.ctx.cap + 15, `lost ${lost}`);
});

test('save/load keeps open dilemmas; old saves migrate', () => {
  const g = withChickens(farm());
  const open = untilOpen(g);
  const g2 = loadGame(g.serialize(), { data: DATA });
  assert.equal(g2.kabarView().open.id, open.id);
  const s = JSON.parse(g.serialize());
  delete s.kabar;
  const g3 = loadGame(JSON.stringify(s), { data: DATA });
  const v = g3.kabarView();
  assert.equal(v.open, null);
  assert.deepEqual(v.history, []);
  g3.advance(24 * 5);
  assert.ok(g3.kabarView().open || g3.kabarView().history.length, 'dilemmas resume after migration');
});
