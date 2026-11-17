import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { createGame, loadGame, loadFrom, loadLegacy } from '../js/engine.js';
import { starFormula, normalizeLegacy, startRegions } from '../js/engine/legacy.js';
import { SAVE_KEY, LEGACY_KEY } from '../js/engine/persist.js';
import { fieldRates } from '../js/engine/offline.js';
import { generateMissions } from '../js/engine/missions.js';

const L = DATA.BALANCE.legacy;
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};

/** A late farm: level `level`, `money` cash, `ach` achievements, `stages` Proyek Warisan stages (Pusat Riset per region). */
function lateGame({ level = 33, money = 1e9, ach = 30, stages = 12, seed = 11 } = {}) {
  const g = newGame(seed);
  g.state.level = level;
  g.state.xp = DATA.LEVELS[level - 1];
  g.state.money = money;
  g.state.achievements = DATA.ACHIEVEMENTS.slice(0, ach).map((a) => a.id);
  let left = stages;
  for (const r of DATA.REGIONS) {
    if (left <= 0) break;
    const stage = Math.min(3, left);
    g.state.projects.regions[r.id] = { ...(g.state.projects.regions[r.id] || {}), riset: { stage, build: null } };
    left -= stage;
  }
  return g;
}
const perkCost = (ids) => ids.reduce((a, id) => a + L.perks.find((p) => p.id === id).cost, 0);

test('star formula: monotonic in every input and sublinear (√) in net worth, achievements and project stages', () => {
  const base = { level: 33, netWorth: 1e9, achievements: 30, stages: 12 };
  const raw = (patch) => starFormula({ ...base, ...patch }, L.stars).raw;
  for (const [k, steps] of Object.entries({ level: [30, 31, 35, 40, 50], netWorth: [0, 1e6, 1e8, 1e9, 1e10, 1e11],
    achievements: [0, 1, 10, 30, 37], stages: [0, 1, 6, 12, 45] })) {
    for (let i = 1; i < steps.length; i++) assert.ok(raw({ [k]: steps[i] }) > raw({ [k]: steps[i - 1] }), `${k} ${steps[i]}`);
  }
  const part = (k, v) => starFormula({ ...base, [k]: v }, L.stars).parts;
  assert.ok(Math.abs(part('netWorth', 4e9).wealth - 2 * part('netWorth', 1e9).wealth) < 1e-9, '4× net worth → 2× stars');
  assert.ok(Math.abs(part('achievements', 36).achievements - 6) < 1e-9);
  assert.ok(raw({ netWorth: 2e10 }) < 2 * raw({ netWorth: 1e10 }), 'doubling everything never doubles the stars');
  // The documented example: Lv 33, $1 B, 30 achievements, 12 stages → 6 + 6,32 + 5,48 + 3,46 = 21,27 → 21 ⭐.
  const ex = starFormula(base, L.stars);
  assert.equal(Math.floor(ex.raw), 21);
  assert.deepEqual(Object.values(ex.parts).map((v) => Math.round(v * 100) / 100), [6, 6.32, 5.48, 3.46]);
  assert.ok(starFormula({ level: 30, netWorth: 0, achievements: 0, stages: 0 }, L.stars).raw >= 3, 'Lv 30 alone earns stars');
});

test('preview == grant: inheritFarm restarts at Lv 1, adds exactly the previewed stars, archives the generation', () => {
  const g = lateGame();
  const before = g.serialize().replace(/"savedAt":\d+/, '');
  const pv = g.legacyPreview();
  assert.ok(pv.canInherit);
  assert.equal(pv.total, Math.floor(pv.raw + 1e-9));
  assert.equal(pv.total, 21);
  const r = g.inheritFarm({ seed: 99 });
  assert.ok(r.ok, r.reason);
  assert.equal(r.stars, pv.total);
  assert.equal(g.serialize().replace(/"savedAt":\d+/, ''), before, 'the old run is untouched');
  const n = r.game;
  assert.equal(n.state.level, 1);
  assert.equal(n.state.xp, 0);
  assert.equal(n.day, 1);
  assert.equal(n.state.money, DATA.STARTING.money);
  assert.deepEqual(Object.keys(n.state.fields), DATA.STARTING.fieldIds);
  assert.equal(n.state.achievements.length, 0);
  assert.equal(n.legacy.stars, pv.total);
  assert.equal(n.legacy.earned, pv.total);
  assert.equal(n.legacy.generation, 2);
  assert.equal(n.state.generation.n, 2);
  const m = n.legacy.museum[0];
  assert.equal(m.gen, 1);
  assert.equal(m.level, 33);
  assert.equal(m.stars, pv.total);
  assert.ok(m.netWorth >= 1e9);
  assert.match(m.name, /^Generasi I · /);
  assert.equal(n.legacyView().museum.length, 1);
  // Collections stay with the family: encyclopedia cosmetics, tender trophies/done.
  const col = lateGame({ seed: 12 });
  col.state.tenders.done = 2;
  col.state.encyclopedia.cosmetics = ['banner_test'];
  const kid = col.inheritFarm({ seed: 13 }).game;
  assert.equal(kid.state.tenders.done, 2);
  assert.equal(kid.state.tenders.active, null);
  assert.ok(Array.isArray(kid.state.encyclopedia.cosmetics));
  // Below the unlock level: refused, nothing changes.
  const low = newGame(3);
  const r2 = low.inheritFarm();
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /level 30/);
});

test('perks bought in the inheritance plan apply on the new run (money, research, silo, region, missions, XP, Mandor, paint)', () => {
  const g = lateGame({ money: 4e10, ach: 37, stages: 45, level: 50 });
  const buy = ['akar', 'celengan', 'lumbung', 'tanah', 'catatan', 'pustaka', 'pengalaman', 'misi', 'mandor', 'lambang', 'cat'];
  const pv = g.legacyPreview();
  assert.ok(pv.total >= perkCost(buy), `${pv.total} ⭐`);
  const iowa = startRegions(DATA).find((r) => r.id === 'iowa');
  const r = g.inheritFarm({ buy, regionId: 'iowa', emblem: { icon: '🚜', color: 'emas' }, seed: 5 });
  assert.ok(r.ok, r.reason);
  const n = r.game, s = n.state;
  assert.equal(n.legacy.stars, pv.total - perkCost(buy));
  assert.equal(s.money, DATA.STARTING.money + 15000 + 50000);
  assert.equal(n.researchPoints().available, 2);
  assert.equal(s.storageUpgrades.silo, 1);
  assert.deepEqual(Object.keys(s.fields), [iowa.fieldId]);
  s.silo.wheat = 200; // enough candidate types (sell) for a 4th mission on day 1
  assert.equal(generateMissions(n, n.day).length, 4);
  assert.deepEqual(n.legacy.emblem, { icon: '🚜', color: 'emas' });
  const tractor = s.machines.find((m) => DATA.MACHINES.find((d) => d.id === m.defId).type === 'tractor');
  assert.equal(tractor.paint, L.paints[0]);
  assert.ok(n.machineUpgradeInfo(tractor.uid).paints.includes(L.paints[1]));
  const xp0 = s.xp;
  n.addXp(1000);
  assert.equal(s.xp - xp0, 1050);
  s.level = 4; s.money = 1e6;
  const tier = DATA.BALANCE.mandor.tiers[0];
  assert.equal(n.mandorView().candidates[0].price, tier.hireCost / 2);
  const hired = n.hireMandor(tier.id);
  assert.equal(hired.cost, tier.hireCost / 2);
  n.fireMandor();
  assert.equal(n.hireMandor(tier.id).cost, tier.hireCost, 'only the first Mandor of a generation is cheaper');
  // A plain new game (no legacy) is the unchanged baseline.
  const plain = newGame(5);
  assert.equal(plain.state.money, DATA.STARTING.money);
  plain.state.silo.wheat = 200;
  assert.equal(generateMissions(plain, plain.day).length, 3);
});

test('buying a perk mid-run: needs stars and prerequisites; start effects are given once at once', () => {
  const g = newGame(8);
  assert.match(g.buyLegacyPerk('akar').reason, /1 ⭐/);
  g.legacy.stars = 6;
  assert.match(g.buyLegacyPerk('celengan').reason, /Akar Keluarga/);
  const m0 = g.state.money;
  const r = g.buyLegacyPerk('akar');
  assert.ok(r.ok);
  assert.equal(g.state.money, m0 + 15000);
  assert.equal(g.legacy.stars, 5);
  assert.ok(g.buyLegacyPerk('catatan').ok);
  assert.equal(g.researchPoints().available, 1);
  assert.match(g.buyLegacyPerk('akar').reason, /Sudah/);
  assert.match(g.setEmblem({ icon: '🌾' }).reason, /Lambang Keluarga/);
  const v = g.legacyView();
  assert.equal(v.perks.find((p) => p.id === 'akar').status, 'owned');
  assert.equal(v.perks.find((p) => p.id === 'pustaka').status, 'open');
  assert.equal(v.perks.find((p) => p.id === 'bijak').status, 'locked');
});

test('legacy block lives outside the run state, survives save/load and ⚙️ Reset (mirrored key)', () => {
  const g = lateGame();
  const n = g.inheritFarm({ seed: 3 }).game;
  assert.equal(n.state.legacy, undefined, 'not part of game.state');
  const json = JSON.parse(n.serialize());
  assert.equal(json.legacy.stars, n.legacy.stars);
  const st = memStorage();
  n.save(st);
  assert.deepEqual(JSON.parse(st.getItem(LEGACY_KEY)), n.legacy);
  const back = loadFrom(st);
  assert.deepEqual(back.legacy, n.legacy);
  assert.equal(back.state.legacy, undefined);
  assert.deepEqual(back.state.generation, n.state.generation);
  // ⚙️ Reset game: the save is deleted, a new run starts with the mirrored legacy (stars, museum, perks kept).
  st.removeItem(SAVE_KEY);
  assert.equal(loadFrom(st), null);
  const fresh = createGame({ seed: 4, legacy: loadLegacy(st) });
  assert.equal(fresh.legacy.stars, n.legacy.stars);
  assert.equal(fresh.legacy.museum.length, 1);
  assert.equal(fresh.legacy.generation, 2);
  assert.equal(fresh.state.generation.challenge, null);
  // A save without its own block (older build) picks up the mirrored one; the save's own block wins otherwise.
  const old = JSON.parse(newGame(6).serialize());
  delete old.legacy;
  assert.equal(loadGame(JSON.stringify(old), { legacy: n.legacy }).legacy.stars, n.legacy.stars);
  assert.equal(loadGame(n.serialize(), { legacy: { stars: 999 } }).legacy.stars, n.legacy.stars);
});

test('challenges are enforced and multiply the stars once Lv 30 is reached under them', () => {
  const g = lateGame();
  const trop = g.inheritFarm({ challengeId: 'tropis', seed: 1 }).game;
  trop.state.money = 1e8; trop.state.level = 12;
  assert.match(trop.buyField('f5').reason, /wilayah tropis/);
  assert.ok(trop.buyField('f2').ok, 'Jawa Barat is tropical');
  const kal = DATA.FIELDS.find((f) => f.regionId === 'kalimantan' && !(f.unlockLevel > 12));
  assert.ok(trop.buyField(kal.id).ok);
  const heir = lateGame({ seed: 21 });
  heir.legacy.perks = ['akar', 'lumbung', 'tanah'];
  assert.match(heir.inheritFarm({ challengeId: 'tropis', regionId: 'iowa' }).reason, /wilayah tropis/);
  assert.match(lateGame({ seed: 22 }).inheritFarm({ regionId: 'iowa' }).reason, /Tanah Leluhur/);

  const noRent = g.inheritFarm({ challengeId: 'tanpaSewa', seed: 2 }).game;
  assert.ok(noRent.state.machines.some((m) => m.defId === 'mf_activa'), 'starter harvester');
  const fid = Object.keys(noRent.state.fields)[0];
  Object.assign(noRent.state.fields[fid], { state: 'ready', cropId: 'wheat', readyHours: 1 });
  assert.match(noRent.startTask(fid, 'harvest', { rent: true }).reason, /sewa/);
  assert.equal(noRent.availableMachinesFor('harvest').canRent, false);
  assert.ok(noRent.startTask(fid, 'harvest').ok, 'own harvester still works');
  noRent.state.fields[fid].plan = { cropId: 'wheat', rent: true, sell: true, repeat: true, fertilize: false, irrigate: false };
  noRent.state.machines = noRent.state.machines.filter((m) => m.defId !== 'mf_activa');
  assert.deepEqual(fieldRates(noRent), [], 'offline: no own harvester → no coarse harvests');

  const noMgr = g.inheritFarm({ challengeId: 'tanpaManajer', seed: 3 }).game;
  noMgr.state.level = 20; noMgr.state.money = 1e7;
  assert.match(noMgr.hireDispatcher('magang').reason, /manajer/);
  assert.match(noMgr.hireFactoryManager('supervisor').reason, /manajer/);
  assert.ok(noMgr.dispatcherView().candidates.every((c) => /Tantangan/.test(c.reason)));
  assert.ok(noMgr.hireMandor('mandor').ok, 'Mandor is allowed');
  assert.ok(noMgr.state.chapters.claimed.includes('dispatcher'), 'impossible chapter steps are waived');

  // Completion: Lv 30 under the rules → done (event) and ×mult on the stars; forfeiting turns the rules and bonus off.
  noMgr.state.level = 30;
  noMgr.state.xp = DATA.LEVELS[29];
  const raw = noMgr.legacyPreview().raw;
  noMgr.advance(24);
  assert.equal(noMgr.state.generation.challengeDone, true);
  assert.ok(noMgr.state.log.some((e) => e.type === 'challenge_done'));
  const pv = noMgr.legacyPreview();
  assert.equal(pv.mult, 1.3);
  assert.equal(pv.total, Math.floor(pv.raw * 1.3 + 1e-9));
  assert.ok(pv.raw >= raw);
  assert.match(noMgr.forfeitChallenge().reason, /selesai/);
  const quit = g.inheritFarm({ challengeId: 'tanpaManajer', seed: 4 }).game;
  quit.state.level = 20; quit.state.money = 1e7;
  assert.ok(quit.forfeitChallenge().ok);
  assert.ok(quit.hireDispatcher('magang').ok);
  quit.state.level = 30;
  assert.equal(quit.legacyPreview().mult, 1);
  assert.match(g.inheritFarm({ challengeId: 'nope' }).reason, /tidak dikenal/);
});

test('migration: old saves get generation 1 and an empty legacy; broken blocks are repaired', () => {
  const old = JSON.parse(newGame(9).serialize());
  delete old.legacy; delete old.generation; delete old.league;
  const g = loadGame(JSON.stringify(old));
  assert.deepEqual(g.state.generation, { n: 1, challenge: null, challengeDone: false, forfeited: false, mandorHired: false, startDay: 1 });
  assert.equal(g.legacy.generation, 1);
  assert.equal(g.legacy.stars, 0);
  assert.deepEqual(g.legacy.perks, []);
  const fixed = normalizeLegacy({ stars: -5, earned: 'x', perks: ['akar', 'nope', 'akar'], emblem: { icon: '💀', color: 'neon' },
    region: 'mars', museum: [null, { gen: 2, level: 40, netWorth: 5e9, name: 'G' }], shelf: [{ cup: 'emas', season: 3 }, { cup: 'kayu' }] }, DATA);
  assert.equal(fixed.stars, 0);
  assert.deepEqual(fixed.perks, ['akar']);
  assert.deepEqual(fixed.emblem, { icon: '🌱', color: 'hijau' });
  assert.equal(fixed.region, null);
  assert.equal(fixed.museum.length, 1);
  assert.equal(fixed.shelf.length, 1);
  // A save from a challenge run keeps its rules after a reload.
  const ch = lateGame().inheritFarm({ challengeId: 'tropis', seed: 8 }).game;
  const re = loadGame(ch.serialize());
  re.state.level = 5;
  assert.match(re.buyField('f5').reason, /tropis/);
});
