import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { METRICS, ensureSeason, playerValue, rivalTargets, standings, stepLeagueDay, trackHarvest, seasonIndex, ensureLeague } from '../js/engine/league.js';
import { RIVALS } from '../js/engine/rivals.js';

const C = DATA.BALANCE.league;
const Y = DATA.BALANCE.yearDays;
const RS = DATA.BALANCE.realSecondsPerGameHour;

/** A rated season that just started (day 1, level ≥ unlock); `metric` forces the season's metric. */
function rated(seed = 3, metric = 'contracts', division = 0) {
  const g = newGame(seed);
  g.state.level = 12;
  g.state.league.division = division;
  const se = ensureSeason(g);
  assert.equal(se.rated, true);
  se.metric = metric;
  se.rivals = rivalTargets(g, metric, se.n);
  return g;
}
/** Jump to the next season start and run the league rollover step only. */
function endSeason(g) {
  const day = (seasonIndex(g) + 1) * Y + 1;
  g.state.time = (day - 1) * 24;
  stepLeagueDay(g, day);
}
/** A planted mid-game farm (plans + own harvester + Mandor). */
function farm(seed = 7) {
  const g = newGame(seed);
  g.state.level = 12; g.state.money = 3e6;
  for (const f of DATA.FIELDS.filter((x) => (x.unlockLevel ?? 1) <= 1).slice(0, 6)) g.buyField(f.id);
  g.buyMachine('mf_activa');
  g.hireMandor('mandor');
  const crops = DATA.CROPS.filter((c) => !c.perennial && c.unlockLevel <= 5);
  Object.keys(g.state.fields).forEach((id, i) => g.setFieldPlan(id, { cropId: crops[i % crops.length].id, rent: true, sell: true }));
  return g;
}

test('metrics are normalized by size: a 10× bigger farm with the same skill scores the same', () => {
  const small = rated(1, 'yieldIdx'), big = rated(2, 'yieldIdx');
  trackHarvest(small, 'wheat', 70, 10);
  trackHarvest(big, 'wheat', 700, 100);
  assert.equal(playerValue(small, 'yieldIdx').value, 1);
  assert.equal(playerValue(big, 'yieldIdx').value, 1);
  trackHarvest(small, 'barley', 33, 5); // 6,6 t/ha = 1,2 × base: the best crop counts
  trackHarvest(small, 'corn', 20, 1); // 20 t/ha but < minHa harvested: ignored
  assert.equal(playerValue(small, 'yieldIdx').value, 1.2);
  assert.match(playerValue(small, 'yieldIdx').detail, /Barley/);
  // $/ha/day, fuel per ton and herd productivity do not grow with size either.
  for (const [g, ha] of [[small, 6], [big, 60]]) {
    const se = g.state.league.season, t = g.state.ledger.total;
    se.t0 = g.state.time - 48;
    Object.assign(se.acc, { haDays: ha * 2, days: 2 });
    t.penjualan_panen = (t.penjualan_panen || 0) + 100 * ha * 2;
    t.bbm = (t.bbm || 0) + 20 * ha * 2;
    g.state.stats.tonsHarvested += (20 * ha * 2) / DATA.BALANCE.fuelPrice / 4; // 4 L/t
    g.state.animals.chickens = { count: ha * 10, barns: 1, quality: 0.9, happiness: 1, fed: 1, breedQuality: 1 };
    se.acc.std = 0; se.acc.act = 0;
  }
  assert.equal(playerValue(small, 'profitHa').value, 80);
  assert.equal(playerValue(big, 'profitHa').value, 80);
  assert.equal(playerValue(small, 'fuelT').value, 4);
  assert.equal(playerValue(big, 'fuelT').value, 4);
  for (const g of [small, big]) endSeason(g); // samples the herd for the season that ends
  assert.equal(small.state.league.form.animalIdx, big.state.league.form.animalIdx);
  assert.ok(Math.abs(small.state.league.form.animalIdx - 0.9) < 1e-9);
});

test('rubber band: rival targets follow the player\'s form and the division strength (lower is better for fuel)', () => {
  const g = rated(4, 'profitHa');
  g.state.league.form.profitHa = 100;
  const t100 = rivalTargets(g, 'profitHa', 5).map((r) => r.target);
  g.state.league.form.profitHa = 1000;
  const t1000 = rivalTargets(g, 'profitHa', 5).map((r) => r.target);
  t100.forEach((v, i) => assert.ok(Math.abs(t1000[i] / v - 10) < 1e-3, 'scales with the player'));
  assert.equal(t100.length, RIVALS.length);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const byDiv = C.divisions.map((_, d) => mean(rivalTargets(g, 'profitHa', 5, d).map((r) => r.target)));
  byDiv.forEach((v, d) => d && assert.ok(v > byDiv[d - 1], `division ${d} is stronger`));
  assert.ok(Math.abs(byDiv[0] / 1000 - C.divisions[0].strength) < 0.06);
  g.state.league.form.fuelT = 5;
  const fuel = C.divisions.map((_, d) => mean(rivalTargets(g, 'fuelT', 5, d).map((r) => r.target)));
  fuel.forEach((v, d) => d && assert.ok(v < fuel[d - 1], 'stronger rivals burn less fuel per ton'));
  // No form yet: the floor keeps rivals meaningful; targets differ per season (seeded) but repeat for the same season.
  delete g.state.league.form.contracts;
  assert.ok(rivalTargets(g, 'contracts', 2).every((r) => r.target >= METRICS.contracts.floor * 0.7));
  assert.deepEqual(rivalTargets(g, 'contracts', 2), rivalTargets(g, 'contracts', 2));
  assert.notDeepEqual(rivalTargets(g, 'contracts', 2), rivalTargets(g, 'contracts', 3));
});

test('promotion, relegation and rewards: cups, research points and a booster — never cash', () => {
  const g = rated(5, 'contracts');
  g.state.stats.contractsDone += 999;
  const money = g.state.money, rp = g.researchPoints().earned;
  endSeason(g);
  const L = g.state.league;
  assert.equal(L.division, 1, 'top 2 go up');
  assert.equal(g.state.money, money, 'no cash');
  const h = L.history.at(-1);
  assert.equal(h.rank, 1);
  assert.equal(h.cup, 'emas');
  assert.equal(g.researchPoints().earned, rp + C.rewards[0].rp[0]);
  assert.ok(g.activeBoosters().some((b) => b.src === 'liga' && b.kind === C.boosters.contracts.kind));
  assert.deepEqual(g.legacy.shelf.at(-1), { gen: 1, season: h.season, cup: 'emas', division: 0, metric: 'contracts' });
  // Next season: no value (no harvest for the yield metric) → last → relegated.
  const se = g.state.league.season;
  se.metric = 'yieldIdx'; se.rated = true; se.rivals = rivalTargets(g, 'yieldIdx', se.n);
  endSeason(g);
  assert.equal(g.state.league.history.at(-1).rank, 8);
  assert.equal(g.state.league.history.at(-1).relegated, true);
  assert.equal(g.state.league.division, 0);
  assert.equal(g.state.league.best, 1);
  // Perunggu can't fall further; Berlian can't rise further.
  const low = rated(6, 'yieldIdx', 0);
  endSeason(low);
  assert.equal(low.state.league.division, 0);
  assert.equal(low.state.league.history.at(-1).relegated, false);
  const top = rated(7, 'contracts', 3);
  top.state.stats.contractsDone += 999;
  endSeason(top);
  assert.equal(top.state.league.division, 3);
  assert.equal(top.state.league.history.at(-1).rp, C.rewards[0].rp[3]);
  const v = top.leagueView();
  assert.equal(v.cups.emas, 1);
  assert.equal(v.shelf.length, 1);
});

test('season rollover in play: one metric per game year, history, results for the modal, live standings with zones', () => {
  const g = farm();
  g.advance(24 * 2);
  let v = g.leagueView();
  assert.equal(v.season.rated, true, 'a season that started ≤ graceDays ago is rated');
  assert.equal(v.standings.length, RIVALS.length + 1);
  assert.deepEqual(v.standings.map((r) => r.rank), v.standings.map((_, i) => i + 1));
  assert.ok(v.standings.filter((r) => r.zone === 'up').length === C.promote);
  assert.ok(v.standings.every((r) => r.zone !== 'down'), 'no relegation from Perunggu');
  assert.equal(v.season.days, Y);
  assert.equal(v.season.daysLeft, Y - 2);
  const first = v.season.metric.id;
  g.advance(24 * (Y - 1));
  v = g.leagueView();
  assert.equal(v.season.n, 2);
  assert.notEqual(v.season.metric.id, first, 'a new metric each season');
  assert.equal(v.history.length, 1);
  assert.equal(v.history[0].metric, first);
  assert.ok(g.state.log.some((e) => e.type === 'league_season_end'));
  assert.equal(v.pending, 1);
  const res = g.takeLeagueResults();
  assert.equal(res.length, 1);
  assert.equal(res[0].top.length, RIVALS.length + 1);
  assert.equal(g.takeLeagueResults().length, 0);
  // Saved and loaded mid-season: the same standings.
  const back = loadGame(g.serialize());
  assert.deepEqual(back.leagueView().standings, g.leagueView().standings);
  assert.ok(Object.keys(g.state.league.form).length >= 3, 'every metric with data feeds the form');
});

test('offline coarse mode: seasons keep turning, coarse harvests count for t/ha, deterministic', () => {
  const g = farm(9);
  g.advance(30);
  const json = g.serialize();
  const run = () => {
    const x = loadGame(json);
    x.catchUp(8 * 3600);
    return x;
  };
  const a = run(), b = run();
  assert.ok(a.lastCatchUp.coarseDays > 100);
  assert.deepEqual(a.state.league, b.state.league);
  const seasons = Math.floor((a.day - 1) / Y) - Math.floor((loadGame(json).day - 1) / Y);
  assert.ok(seasons >= 10, `${seasons} seasons`);
  assert.equal(a.state.league.history.length, C.history, 'history capped');
  assert.ok(a.state.league.pending.length > 0);
  // Coarse fields report harvests to the league (no task_done events while away).
  const x = loadGame(json), se = ensureSeason(x);
  const crops0 = JSON.stringify(se.acc.crops);
  x.catchUp(4 * 24 * RS + 48 * RS); // 48 h exact + 4 coarse days
  assert.ok(x.lastCatchUp.coarseDays >= 3);
  assert.notEqual(JSON.stringify(x.state.league.season.acc.crops), crops0);
});

test('migration: old saves start with a warm-up when joined mid-season; broken league data is repaired', () => {
  const g = farm(12);
  g.advance(24 * 10);
  const old = JSON.parse(g.serialize());
  delete old.league;
  const m = loadGame(JSON.stringify(old));
  assert.equal(m.state.league.division, 0);
  const v = m.leagueView();
  assert.equal(v.season.rated, false, 'joined 10 days into the season → warm-up');
  assert.deepEqual(v.standings, []);
  assert.equal(v.metrics.length, Object.keys(METRICS).length);
  m.advance(24 * (Y - 9));
  assert.equal(m.leagueView().season.rated, true);
  assert.equal(m.state.league.history.length, 0, 'the warm-up gives no result');
  const s = { league: { division: 9, best: -2, form: { profitHa: 50, bogus: 1 }, season: { n: 'x' }, history: [{ metric: 'nope' }, { metric: 'contracts', rank: 1 }] } };
  ensureLeague(s, DATA);
  assert.equal(s.league.division, C.divisions.length - 1);
  assert.equal(s.league.best, C.divisions.length - 1);
  assert.deepEqual(s.league.form, { profitHa: 50 });
  assert.equal(s.league.season, null);
  assert.equal(s.league.history.length, 1);
  // Below the unlock level the season is a warm-up too.
  const fresh = newGame(13);
  assert.equal(fresh.leagueView().unlocked, false);
  assert.equal(fresh.leagueView().season.rated, false);
  assert.deepEqual(standings(fresh), []);
});
