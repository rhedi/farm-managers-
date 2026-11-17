import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../js/engine.js';
import { DATA, newGame } from './helpers.js';
import { cityMult } from '../js/engine/logistics.js';
import { totalWages } from '../js/engine/workers.js';
import { stageCost } from '../js/engine/projects.js';

const P = DATA.BALANCE.projects;
const START_REGION = DATA.FIELDS.find((f) => f.id === DATA.STARTING.fieldIds[0]).regionId; // jabar
function rich(level = 40, seed = 11) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e10;
  return g;
}
const slot = (g, r, t) => g.projectsView().regions.find((x) => x.id === r).projects.find((p) => p.typeId === t);
/** Finish whatever is building (whole days). */
const finish = (g) => { for (let i = 0; i < 40 && g.projectsView().building; i++) g.advance(24); };

test('every region offers 3–4 types, 3 stages; costs grow ~$1M → $50M → $1B and with the region level', () => {
  const g = rich();
  for (const r of g.projectsView().regions) {
    assert.ok(r.projects.length >= 3 && r.projects.length <= 4, r.id);
    assert.ok(r.projects.every((p) => p.maxStage === 3 && p.stage === 0));
  }
  const c = [1, 2, 3].map((k) => stageCost(g, 'alberta', k));
  assert.ok(c[0] >= 5e5 && c[0] <= 3e6 && c[1] >= 2e7 && c[1] <= 1.5e8 && c[2] >= 5e8 && c[2] <= 3e9, c.join());
  assert.ok(stageCost(g, 'alberta', 1) > stageCost(g, 'jabar', 1));
});

test('gating: unlock level, owned field in the region, stage level, max concurrent builds', () => {
  const low = rich(P.unlockLevel - 1);
  assert.match(low.startProject(START_REGION, 'riset').reason, /level/);
  const g = rich(20);
  assert.match(g.startProject('bavaria', 'riset').reason, /ladang/);
  assert.match(g.startProject('jabar', 'bendungan').reason, /tidak ada/);
  assert.equal(g.startProject('jabar', 'riset').ok, true);
  finish(g);
  assert.match(g.startProject('jabar', 'riset').reason, /level 25/);
  const g2 = rich(40);
  for (const t of ['riset', 'koperasi', 'pasar']) assert.equal(g2.startProject('jabar', t).ok, true);
  assert.match(g2.startProject('jabar', 'pelabuhan').reason, /Maksimal 3/);
  g2.state.money = 10;
  assert.match(slot(g2, 'jabar', 'pelabuhan').reason, /Maksimal|Uang/);
});

test('cost deduction, ledger capex, build time in days, events, RP for Pusat Riset, achievement', () => {
  const g = rich(20);
  const evs = [];
  g.on((e) => { if (e.type.startsWith('project_') || e.type === 'achievement') evs.push(e); });
  const money = g.state.money, rp = g.researchPoints().earned;
  const r = g.startProject('jabar', 'riset');
  assert.equal(r.ok, true);
  assert.equal(r.days, P.stages[0].days);
  assert.equal(g.state.money, money - r.cost);
  assert.equal(g.state.ledger.cur.cats.proyek_warisan, r.cost);
  const s = slot(g, 'jabar', 'riset');
  assert.ok(s.build && s.build.stage === 1 && s.build.daysLeft >= r.days - 1);
  g.advance(24 * (r.days - 1) - 1);
  assert.equal(slot(g, 'jabar', 'riset').stage, 0, 'not done early');
  finish(g);
  assert.equal(slot(g, 'jabar', 'riset').stage, 1);
  assert.equal(g.researchPoints().earned, rp + 1);
  assert.deepEqual(evs.filter((e) => e.type.startsWith('project_')).map((e) => e.type), ['project_started', 'project_done']);
  assert.ok(evs.some((e) => e.achievementId === 'proj_first'));
  assert.ok(g.netWorth() > 0 && g.projectsView().value === P.legacyValue * r.cost);
});

test('effects via projectPerk: koperasi seed cost, pelabuhan city price, bendungan rain floor, pasar contracts, wages', () => {
  const g = rich(40);
  const fid = DATA.STARTING.fieldIds[0];
  const crop = DATA.CROPS[0];
  g.startTask(fid, 'plow'); g.advance(24);
  const before = g.estimateTask(fid, 'seed', { cropId: crop.id }).materialCost;
  g.state.projects.regions.jabar = { koperasi: { stage: 2, build: null }, pasar: { stage: 3, build: null }, riset: { stage: 1, build: null } };
  g.state.projects.regions.iowa = { bendungan: { stage: 3, build: null } };
  g.state.projects.regions.kalimantan = { pelabuhan: { stage: 3, build: null } };
  const after = g.estimateTask(fid, 'seed', { cropId: crop.id }).materialCost;
  assert.ok(Math.abs(after - before * (1 - 0.05)) < 0.02, `${before} → ${after}`);
  assert.equal(g.projectPerk('koperasi', 'jabar'), 0.05);
  assert.equal(g.projectPerk('wages'), 0.05, 'all owned fields are in jabar');
  assert.ok(Math.abs(totalWages(g) - g.state.workers.reduce((a, w) => a + w.wage, 0) * 0.95) < 1e-6, 'wages −5%');
  assert.equal(g.projectPerk('rainFloor', 'iowa'), 0.45);
  assert.equal(g.projectPerk('cityPrice', 'asia'), 0.08);
  assert.equal(g.projectPerk('cityPrice', 'eropa'), 0);
  const jakarta = DATA.CITIES.find((c) => c.id === 'jakarta');
  const milk = cityMult(g, jakarta, 'milk');
  g.state.projects.regions.kalimantan.pelabuhan.stage = 0;
  assert.ok(cityMult(g, jakarta, 'milk') < milk);
  assert.equal(g.projectPerk('contractBonus'), 0.05);
  // a finished contract pays the Pasar Induk bonus once at the next rollover
  g.state.contracts.push({ id: 'kx', productId: 'wheat', qty: 1, delivered: 1, value: 10000, status: 'done', closedDay: g.day });
  const k0 = g.state.ledger.total?.kontrak ?? 0;
  g.advance(24);
  assert.ok((g.state.ledger.total?.kontrak ?? 0) - k0 >= 500 - 1e-6, 'Pasar Induk 5% bonus');
  assert.equal(g.state.contracts.find((c) => c.id === 'kx')?.bonusChecked ?? true, true);
});

test('bendungan keeps rain chance above its floor over many days', () => {
  const dry = (withDam) => {
    const g = rich(40, 31);
    if (withDam) g.state.projects.regions.iowa = { bendungan: { stage: 3, build: null } };
    let rain = 0;
    for (let d = 0; d < 120; d++) { g.advance(24); if (g.state.weather.iowa.rain) rain++; }
    return rain;
  };
  assert.ok(dry(true) > dry(false), 'more rain with a dam');
});

test('monument: needs every region of the continent at stage 3', () => {
  const g = rich(45);
  assert.match(g.startMonument('asia').reason, /setiap wilayah/);
  for (const r of DATA.REGIONS.filter((x) => x.continent === 'asia')) g.state.projects.regions[r.id] = { riset: { stage: 3, build: null } };
  const r = g.startMonument('asia');
  assert.equal(r.ok, true);
  finish(g);
  assert.equal(g.projectsView().monuments.find((m) => m.continentId === 'asia').done, true);
});

test('save/load roundtrip; old saves migrate (missing or broken state)', () => {
  const g = rich(20);
  g.startProject('jabar', 'riset');
  const g2 = loadGame(g.serialize(), { data: DATA });
  assert.deepEqual(g2.state.projects, g.state.projects);
  finish(g2);
  assert.equal(slot(g2, 'jabar', 'riset').stage, 1);
  const s = JSON.parse(g.serialize());
  delete s.projects;
  assert.deepEqual(loadGame(JSON.stringify(s), { data: DATA }).state.projects, { regions: {}, monuments: {}, spent: 0, value: 0 });
  s.projects = { regions: { atlantis: { riset: { stage: 2 } }, jabar: { nope: { stage: 1 }, pasar: { stage: 9, build: { stage: 3 } } } } };
  const p = loadGame(JSON.stringify(s), { data: DATA }).state.projects;
  assert.deepEqual(p.regions, { jabar: { pasar: { stage: 3, build: null } } });
});
