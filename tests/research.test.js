import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, startField, starterCrop } from './helpers.js';
import { loadGame } from '../js/engine.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
/** Game at `level` (points = level − 1) with the given nodes forced unlocked. */
function at(level, nodes = [], seed = 4) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.money = 1e6;
  g.state.research.unlocked.push(...nodes);
  return g;
}

test('data: 4 branches, ~5 nodes each, prerequisites exist, some cost > 1', () => {
  assert.deepEqual(DATA.RESEARCH_BRANCHES.map((b) => b.id), ['tani', 'ternak', 'bisnis', 'mesin']);
  for (const b of DATA.RESEARCH_BRANCHES) assert.equal(DATA.RESEARCH.filter((n) => n.branch === b.id).length, 5);
  const ids = new Set(DATA.RESEARCH.map((n) => n.id));
  for (const n of DATA.RESEARCH) for (const r of n.requires) assert.ok(ids.has(r), `${n.id} → ${r}`);
  assert.ok(DATA.RESEARCH.some((n) => n.cost > 1));
});

test('1 point per level-up (multi-level jumps too) and level_up carries researchPoints', () => {
  const g = newGame();
  assert.deepEqual(g.researchPoints(), { earned: 0, spent: 0, available: 0 });
  const evs = [];
  g.on((e) => e.type === 'level_up' && evs.push(e));
  g.addXp(DATA.LEVELS[1]);
  assert.equal(g.researchPoints().available, 1);
  g.addXp(DATA.LEVELS[4] - g.state.xp); // 2 → 5
  assert.equal(g.researchPoints().available, 4);
  assert.deepEqual(evs.map((e) => e.researchPoints), [1, 3]);
  assert.match(evs[1].msg, /\+3 poin riset/);
});

test('prerequisites and cost gate unlocking; view statuses', () => {
  const g = at(3); // 2 points
  assert.match(g.unlockResearch('tani_benih').reason, /Butuh Benih Unggul I/);
  assert.equal(g.unlockResearch('tani_panen1').ok, true);
  assert.equal(g.unlockResearch('tani_panen1').ok, false);
  const st = (id) => g.researchView().branches.flatMap((b) => b.nodes).find((n) => n.id === id).status;
  assert.equal(st('tani_panen1'), 'unlocked');
  assert.equal(st('tani_benih'), 'ready');
  assert.equal(st('tani_panen2'), 'locked');
  assert.equal(g.unlockResearch('bisnis_gaji').ok, true);
  assert.equal(g.researchPoints().available, 0);
  assert.equal(st('tani_benih'), 'open');
  assert.match(g.unlockResearch('tani_benih').reason, /poin/);
  assert.match(g.unlockResearch('nope').reason, /tidak ditemukan/);
  assert.equal(g.perk('yield'), 0.05);
  assert.ok(g.researchView().branches[0].nodes[0].desc.includes('Hasil panen +5%'));
});

test('perks: yield, seed & fertilizer cost, fuel, task speed', () => {
  const fid = startField(), crop = starterCrop().id;
  const g0 = at(30), g1 = at(30, ['tani_panen1', 'tani_benih', 'tani_pupuk', 'mesin_bbm1', 'mesin_cepat']);
  near(g1.estimateYield(fid, crop) / g0.estimateYield(fid, crop), 1.05, 1e-3);
  const p0 = g0.estimateTask(fid, 'plow'), p1 = g1.estimateTask(fid, 'plow');
  near(p1.hours, p0.hours / 1.1, 0.02);
  near(p1.fuelCost, p1.hours * 8 * DATA.BALANCE.fuelPrice * 0.9, 0.05);
  for (const g of [g0, g1]) { g.state.fields[fid].state = 'plowed'; }
  near(g1.estimateTask(fid, 'seed').materialCost, g0.estimateTask(fid, 'seed').materialCost * 0.9, 0.01);
  near(g1.estimateTask(fid, 'fertilize').materialCost, g0.estimateTask(fid, 'fertilize').materialCost * 0.8, 0.01);
  Object.assign(g1.state.fields[fid], { state: 'growing', cropId: crop });
  assert.equal(g1.getFieldView(fid).yieldFactors.research, 1.05);
});

test('perks: feed, animal production, births', () => {
  const herd = (nodes) => {
    const g = at(30, nodes, 5);
    g.buildBarn('cows'); g.buyAnimal('cows', 10);
    return g;
  };
  const a = herd([]), b = herd(['ternak_pakan1', 'ternak_produksi1', 'ternak_lahir']);
  for (const g of [a, b]) { g.state.silo.wheat = 50; g.advance(24); }
  const used = (g) => 50 - g.state.silo.wheat;
  near(used(b) / used(a), 0.9, 1e-3);
  near(b.state.silo.milk / a.state.silo.milk, 1.1, 1e-3);
  const v = (g) => g.animalsView().find((x) => x.id === 'cows');
  const ea = v(a).expectedBirths, eb = v(b).expectedBirths;
  assert.ok(eb > ea, `${eb} > ${ea}`);
});

test('perks: wages, loan interest, contract price, silo + cold storage capacity, wear', () => {
  const g0 = at(30), g1 = at(30, ['bisnis_gaji', 'bisnis_bunga', 'bisnis_gudang', 'bisnis_kontrak', 'mesin_bbm1', 'mesin_aus']);
  const before = (g) => g.state.ledger.total.gaji || 0;
  const w0 = before(g0), w1 = before(g1);
  g0.advance(24); g1.advance(24);
  near((before(g1) - w1) / (before(g0) - w0), 0.9, 1e-3);
  near(g1.loanInfo().dailyRate, g0.loanInfo().dailyRate * 0.75);
  near(g1.storageInfo('silo').capacity, g0.storageInfo('silo').capacity * 1.1, 0.01);
  near(g1.storageInfo('cold').capacity, g0.storageInfo('cold').capacity * 1.1, 0.01);
  const c0 = g0.state.contracts.filter((c) => c.status === 'offer'), c1 = g1.state.contracts.filter((c) => c.status === 'offer');
  assert.ok(c0.length && c1.length);
  for (const c of c1) assert.ok(c.price < g1.state.market[c.productId] * 1.2);
  const ratio = (cs, g) => cs.reduce((s, c) => s + c.price / Math.max(g.state.market[c.productId], DATA.PRODUCTS.find((p) => p.id === c.productId).basePrice * 0.9), 0) / cs.length;
  assert.ok(ratio(c1, g1) > ratio(c0, g0), 'contract offers pay more');
  for (const g of [g0, g1]) g.startTask(startField(), 'plow');
  for (const g of [g0, g1]) g.advance(10);
  const wear = (g) => 1 - g.state.machines[0].condition;
  near(wear(g1) / wear(g0), 0.8, 0.01); // same plow hours (no taskSpeed perk): wear rate × 0.8
});

test('respec costs money (ledger riset), refunds all points', () => {
  const g = at(6, ['mesin_bbm1', 'mesin_cepat']);
  assert.equal(g.researchPoints().available, 2);
  const cost = g.researchView().respecCost;
  assert.equal(cost, DATA.BALANCE.research.respecPerLevel * 6);
  const money = g.state.money;
  const r = g.respecResearch();
  assert.deepEqual(r, { ok: true, cost, refunded: 3 });
  assert.equal(g.state.money, money - cost);
  assert.equal(g.state.ledger.total.riset, cost);
  assert.equal(g.researchPoints().available, 5);
  assert.equal(g.perk('fuel'), 0);
  assert.equal(g.respecResearch().ok, false);
  const p = at(6, ['mesin_bbm1']);
  p.state.money = 10;
  assert.match(p.respecResearch().reason, /Uang/);
});

test('old saves get points for their level; unknown nodes dropped; tree survives save/load', () => {
  const s = JSON.parse(newGame().serialize());
  s.level = 8;
  delete s.research;
  const l = loadGame(JSON.stringify(s));
  assert.equal(l.researchPoints().available, 7);
  l.unlockResearch('tani_panen1');
  const j = JSON.parse(l.serialize());
  j.research.unlocked.push('gone_node');
  const l2 = loadGame(JSON.stringify(j));
  assert.deepEqual(l2.state.research.unlocked, ['tani_panen1']);
  assert.equal(l2.researchPoints().available, 6);
});
