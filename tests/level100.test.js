// v20 Level 100 (docs/LEVEL100_PLAN.md): XP curve, unlock schedule, old-save migration, research, achievements,
// staff/project/tender/league/legacy tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { unlocksBetween } from '../js/engine/economy.js';
import { fieldUnlockLevel } from '../js/engine/defs.js';
import { starFormula } from '../js/engine/legacy.js';
import { PERK_MAX } from '../js/engine/research.js';
import { CHAPTERS } from '../js/engine/chapters.js';
import { expansionCost } from '../js/engine/animals.js';
import { depthValue } from '../js/engine/saturation.js';

const { LEVELS, BALANCE } = DATA;
const MAX = LEVELS.length;
// Lv 1–50 thresholds as shipped before v20: no save may lose a level or XP.
const OLD50 = [0, 250, 900, 2200, 4200, 7200, 11500, 17500, 24000, 35000, 48000, 70000, 92000, 117000, 149000, 189000,
  240000, 305000, 387000, 491000, 634000, 817000, 1050000, 1360000, 1750000, 2260000, 2920000, 3770000, 4860000, 6270000,
  7460000, 8850000, 10500000, 12400000, 14500000, 17000000, 19900000, 23200000, 26900000, 31200000, 36000000, 41500000,
  47600000, 54500000, 62100000, 70700000, 80100000, 90500000, 102000000, 115000000];

const count = (u) => Object.values(u).reduce((s, ids) => s + ids.length, 0);
/** Meaningful = crop/tree/animal/factory/pond/region, staff tier, or a system (project stage, tender tier, league division). */
function meaningful(l) {
  const u = unlocksBetween(DATA, l - 1, l);
  const sys = u.systems.filter((id) => !id.startsWith('legacy:'));
  return u.crops.length + u.animals.length + u.factories.length + u.ponds.length + u.regions.length
    + u.mandors.length + u.dispatchers.length + u.factoryManagers.length + sys.length > 0;
}

test('curve: 100 levels, Lv 1–50 unchanged, gaps grow smoothly (no level more than 1.12× the previous gap)', () => {
  assert.equal(MAX, 100);
  assert.deepEqual(LEVELS.slice(0, 50), OLD50);
  for (let i = 1; i < MAX; i++) assert.ok(LEVELS[i] > LEVELS[i - 1], `Lv ${i + 1}`);
  for (let l = 51; l <= MAX; l++) {
    const gap = LEVELS[l - 1] - LEVELS[l - 2], prev = LEVELS[l - 2] - LEVELS[l - 3];
    assert.ok(gap >= prev * 0.97 && gap <= prev * 1.12, `gap Lv ${l}: ${prev} → ${gap}`);
  }
});

test('every level 2–100 unlocks something; a meaningful unlock in every 3-level window from 50 to 100', () => {
  for (let l = 2; l <= MAX; l++) assert.ok(count(unlocksBetween(DATA, l - 1, l)) > 0, `Lv ${l}`);
  for (let l = 50; l <= MAX - 2; l++) assert.ok([l, l + 1, l + 2].some(meaningful), `Lv ${l}–${l + 2}`);
  const u = unlocksBetween(DATA, 50, 100);
  assert.ok(u.regions.length >= 3 && u.fields.length >= 15 && u.cities.length >= 6, 'regions, fields, cities');
  assert.ok(u.crops.length >= 6 && u.animals.length >= 3 && u.factories.length >= 4 && u.ponds.length >= 1, 'content');
  assert.ok(u.research.length === 16 && u.dispatchers.length === 1 && u.factoryManagers.length === 1 && u.mandors.length === 1);
  assert.ok(['project:4', 'project:5', 'tender:raksasa', 'tender:benua', 'league:master'].every((id) => u.systems.includes(id)));
});

test('content is reachable and consistent up to Lv 100', () => {
  const P = new Set(DATA.PRODUCTS.map((p) => p.id));
  for (const x of [...DATA.CROPS, ...DATA.TREES]) assert.ok(P.has(x.id) && x.unlockLevel <= MAX, x.id);
  for (const a of DATA.ANIMALS) assert.ok(P.has(a.product) && a.unlockLevel <= MAX, a.id);
  for (const f of DATA.FACTORIES) for (const r of f.recipes) for (const id of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) assert.ok(P.has(id), `${f.id}/${id}`);
  for (const f of DATA.FIELDS) assert.ok(fieldUnlockLevel(DATA, f) <= MAX, f.id);
  // An implement never needs more hp than the best tractor unlocked by its level (upgrades aside).
  const tractors = DATA.MACHINES.filter((m) => m.type === 'tractor');
  for (const m of DATA.MACHINES.filter((x) => x.type === 'implement')) {
    const hp = Math.max(...tractors.filter((t) => t.unlockLevel <= m.unlockLevel).map((t) => t.hp));
    assert.ok(m.hpRequired <= hp, `${m.id} needs ${m.hpRequired} hp, best tractor ${hp}`);
  }
});

test('old saves: a Lv 50 save with banked XP levels up exactly once to 51; a Lv 44 save keeps level and XP', () => {
  const g = newGame(3);
  Object.assign(g.state, { level: 50, xp: OLD50[49] + 900e6 }); // kept earning at the old cap
  const b = loadGame(g.serialize(), { data: DATA });
  assert.equal(b.state.level, 50);
  assert.equal(b.state.xp, LEVELS[50]);
  const ups = [];
  b.on((e) => e.type === 'level_up' && ups.push(e));
  b.addXp(1);
  assert.equal(b.state.level, 51);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].researchPoints, 1);
  const mid = newGame(5);
  Object.assign(mid.state, { level: 44, xp: 60e6 });
  const m = loadGame(mid.serialize(), { data: DATA });
  assert.equal(m.state.level, 44);
  assert.equal(m.state.xp, 60e6);
  assert.equal(m.levelInfo().next, LEVELS[44]);
});

test('research: 99 points at Lv 100; tier 6–7 gated by minLevel; every perk ≤ PERK_MAX with the whole tree', () => {
  const g = newGame(8);
  g.addXp(LEVELS[99]);
  assert.equal(g.state.level, 100);
  assert.equal(g.researchPoints().earned - (g.state.research.bonus || 0), 99, 'level − 1 (achievement RP come on top)');
  const low = newGame(8);
  low.state.level = 57;
  const t6 = DATA.RESEARCH.find((n) => n.id === 'tani_panen5');
  assert.equal(low.researchView().branches.find((b) => b.id === 'tani').nodes.find((n) => n.id === t6.id).levelOk, false);
  const total = DATA.RESEARCH.reduce((s, n) => s + n.cost, 0);
  assert.ok(total > 99 && total <= 125, `tree ${total}`);
  const sums = {};
  for (const n of DATA.RESEARCH) for (const [k, v] of Object.entries(n.effects)) sums[k] = (sums[k] || 0) + v;
  for (const [k, v] of Object.entries(sums)) assert.ok(v <= PERK_MAX + 1e-9, `${k} ${v}`);
  g.state.research.unlocked.push(...DATA.RESEARCH.map((n) => n.id));
  const v = g.researchView();
  assert.ok(v.branches.every((b) => b.nodes.filter((n) => n.tier === 7).length === 2));
});

test('achievements level_60…level_100 and the late tiers exist and unlock', () => {
  for (const l of [60, 70, 80, 90, 100]) {
    const a = DATA.ACHIEVEMENTS.find((x) => x.id === `level_${l}`);
    assert.ok(a && a.condition.gte === l && a.rp >= 2, `level_${l}`);
  }
  for (const id of ['regions_16', 'fields_75', 'tons_2500000', 'earned_10b']) assert.ok(DATA.ACHIEVEMENTS.some((a) => a.id === id), id);
  assert.equal(new Set(DATA.ACHIEVEMENTS.map((a) => a.id)).size, DATA.ACHIEVEMENTS.length, 'unique ids');
  assert.equal(DATA.REGIONS.length, 16);
  const g = newGame(9);
  g.addXp(LEVELS[99]);
  for (const l of [60, 70, 80, 90, 100]) assert.ok(g.state.achievements.includes(`level_${l}`));
});

test('★4 staff, stage 4–5 projects, tender tiers, Master division and legacy perks follow the level', () => {
  const g = newGame(12);
  g.state.money = 1e12;
  g.state.level = 52;
  assert.match(g.hireDispatcher('global').reason, /level 53/);
  g.state.level = 53;
  assert.equal(g.hireDispatcher('global').ok, true);
  g.state.level = 64;
  assert.match(g.hireFactoryManager('ceo').reason, /level 65/);
  g.state.level = 76;
  assert.match(g.hireMandor('agronom').reason, /level 77/);
  // projects: stage 4 needs Lv 65
  g.state.projects.regions.jabar = { riset: { stage: 3, build: null } };
  g.state.level = 64;
  assert.match(g.startProject('jabar', 'riset').reason, /Tahap 4 butuh level 65/);
  g.state.level = 65;
  assert.equal(g.startProject('jabar', 'riset').ok, true);
  // tenders: best tier at the level
  assert.equal(g.tenderView().tierName, '🛳️ Tender Raksasa');
  g.state.level = 59;
  assert.equal(g.tenderView().tierName, '🚢 Tender Ekspor');
  assert.equal(g.tenderView().nextTier.level, 60);
  // league: Master needs Lv 70
  const lv = g.leagueView();
  assert.equal(lv.divisions.at(-1).id, 'master');
  assert.equal(lv.divisions.at(-1).locked, true);
  // legacy: the Lv 100 star term is softened; perks with minLevel need that level once
  assert.equal(starFormula({ level: 100 }, BALANCE.legacy.stars).parts.level, 48);
  assert.equal(starFormula({ level: 50 }, BALANCE.legacy.stars).parts.level, 23);
  assert.equal(starFormula({ level: 33 }, BALANCE.legacy.stars).parts.level, 6);
  g.legacy.stars = 100;
  g.legacy.perks.push('akar', 'lumbung');
  g.state.level = 59;
  assert.match(g.buyLegacyPerk('gudang_warisan').reason, /Lv 60/);
  g.state.level = 60;
  assert.equal(g.buyLegacyPerk('gudang_warisan').ok, true);
});

test('level-up event at 100 carries the final unlocks; Bab 5 chapter is gated by level', () => {
  const g = newGame(13);
  g.addXp(LEVELS[98]);
  const ups = [];
  g.on((e) => e.type === 'level_up' && ups.push(e));
  g.addXp(LEVELS[99] - g.state.xp);
  assert.equal(ups.length, 1);
  assert.ok(ups[0].unlocks.systems.includes('legacy:dinasti'));
  assert.equal(g.levelInfo().maxed, true);
  const bab5 = CHAPTERS.find((c) => c.id === 'bab5');
  assert.ok(bab5 && bab5.steps.every((s) => s.level >= 52));
});

test('growth brake: barn/pond expansion and the animal/fish market only change above Lv 50; owned herds untouched', () => {
  const g = newGame(21);
  g.state.money = 1e12;
  g.buildBarn('cows'); g.buyAnimal('cows', 20);
  const herd = JSON.stringify(g.state.animals.cows);
  const at = (lvl, fn) => { g.state.level = lvl; return fn(); };
  const old = (owned) => 12000 * (1 + 0.007 * owned);
  assert.equal(at(50, () => expansionCost(g, 'barn', 12000, 100)), Math.round(old(100) / 100) * 100);
  assert.ok(at(75, () => expansionCost(g, 'barn', 12000, 100)) > old(100) * 1.4);
  assert.ok(at(100, () => expansionCost(g, 'barn', 12000, 100)) > old(100) * 2.5);
  assert.equal(at(50, () => depthValue(g, 50, 'milk')), at(50, () => depthValue(g, 50, 'chocolate')));
  assert.ok(depthValue(g, 100, 'milk') < depthValue(g, 100, 'chocolate') / 3, 'animal market grows slower');
  assert.ok(depthValue(g, 100, 'ikan_kerapu') === depthValue(g, 100, 'milk'), 'fish too');
  assert.equal(JSON.stringify(g.state.animals.cows), herd, 'herd unchanged by level');
});
