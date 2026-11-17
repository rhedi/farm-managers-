import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { entries, tierNow, syncStamps } from '../js/engine/encyclopedia.js';

const T = DATA.BALANCE.encyclopedia.tiers;
const stamps = (g) => g.state.encyclopedia.stamps;

test('book covers every crop, tree, animal, pond species, factory product, region and city', () => {
  const g = newGame(21);
  const e = entries(DATA, g.idx);
  assert.equal(e.crop.length, DATA.CROPS.length);
  assert.equal(e.tree.length, DATA.TREES.length);
  assert.equal(e.animal.length, DATA.ANIMALS.length);
  assert.equal(e.fish.length, DATA.PONDS.length);
  assert.equal(e.region.length, DATA.REGIONS.length);
  assert.equal(e.city.length, DATA.CITIES.length);
  const outputs = new Set(DATA.FACTORIES.flatMap((f) => f.recipes.flatMap((r) => Object.keys(r.outputs))));
  assert.equal(e.product.length, outputs.size);
  const v = g.encyclopediaView();
  assert.equal(v.cats.length, 7);
  assert.equal(v.total, Object.values(e).reduce((a, l) => a + l.length, 0));
  assert.deepEqual(g.state.encyclopedia.stamps, {}, 'a new game starts with an empty book');
  assert.equal(v.stamped, 1, 'the view already shows the home region (live tier)');
  for (const c of v.cats) assert.equal(c.tiers.length, 3);
});

test('stamp tiers: crops by harvested tons then A★; cities by deliveries; events emit stamp_new once per tier', () => {
  const g = newGame(22);
  const evs = [];
  g.on((e) => e.type === 'stamp_new' && evs.push(e));
  g.emit('task_done', 'panen', { fieldId: 'f1', task: 'harvest', cropId: 'wheat', tons: 30 });
  assert.equal(stamps(g)['crop:wheat'], 1);
  g.emit('task_done', 'panen', { fieldId: 'f1', task: 'harvest', cropId: 'wheat', tons: T.crop[1] - 30 });
  assert.equal(stamps(g)['crop:wheat'], 2);
  assert.equal(tierNow(g, 'crop', 'wheat'), 2, 'no A★ yet');
  g.state.quality.records.wheat = { tph: 7, fieldId: 'f1', day: 1, grade: 'S', gradeFieldId: 'f1', gradeDay: 1, harvests: 2, tons: 100 };
  syncStamps(g);
  assert.equal(stamps(g)['crop:wheat'], 3);
  assert.deepEqual(evs.filter((e) => e.key === 'crop:wheat').map((e) => e.tier), [1, 2, 3]);
  // A★ alone does not skip tier 2
  g.state.quality.records.corn = { tph: 9, fieldId: 'f1', day: 1, grade: 'S', gradeFieldId: 'f1', gradeDay: 1, harvests: 1, tons: 5 };
  g.emit('task_done', 'panen', { fieldId: 'f1', task: 'harvest', cropId: 'corn', tons: 5 });
  assert.equal(stamps(g)['crop:corn'], 1);
  // Cities
  for (let i = 0; i < T.city[1]; i++) g.emit('delivery_done', 'kirim', { cityId: 'bandung', value: 1, gain: 0 });
  assert.equal(stamps(g)['city:bandung'], 2);
  // Factory batches and pond harvests
  g.emit('factory_done', 'tepung', { factoryId: 'mill', productId: 'flour', qty: 7.5 });
  assert.equal(stamps(g)['product:flour'], 1);
  g.emit('fish_harvest', 'lele', { pondId: 'lele', productId: 'ikan_lele', kg: 800, fish: 4000 });
  assert.equal(stamps(g)['fish:lele'], 1);
  const v = g.encyclopediaView();
  assert.ok(v.cats.find((c) => c.id === 'crop').items.find((i) => i.id === 'wheat').fresh);
});

test('animals and regions are stamped from live state at the rollover; stamps never go down', () => {
  const g = newGame(23);
  g.state.level = 20; g.state.money = 1e7;
  assert.ok(g.buildBarn('chickens').ok);
  assert.ok(g.buyAnimal('chickens', 150).ok);
  g.state.animals.chickens.breedQuality = T.animal[2];
  assert.equal(g.encyclopediaView().cats.find((c) => c.id === 'animal').items.find((i) => i.id === 'chickens').tier, 3, 'view shows the live tier');
  g.advance(24);
  assert.equal(stamps(g)['animal:chickens'], 3);
  assert.equal(stamps(g)['region:jabar'], 1);
  g.state.projects.regions.jabar = { pelabuhan: { stage: 3, build: null } };
  g.advance(24);
  assert.equal(stamps(g)['region:jabar'], 3);
  g.sellAnimal('chickens', 150);
  g.state.projects.regions.jabar = {};
  g.advance(24);
  assert.equal(stamps(g)['animal:chickens'], 3);
  assert.equal(stamps(g)['region:jabar'], 3);
});

test('completing a row unlocks its cosmetics: paint joins the palette, banners/barns become selectable', () => {
  const g = newGame(24);
  const evs = [];
  g.on((e) => e.type === 'cosmetic_unlocked' && evs.push(e));
  const tractor = g.state.machines.find((m) => g.idx.machines.get(m.defId).type === 'tractor');
  assert.equal(g.paintMachine(tractor.uid, '#16a085').ok, false, 'locked paint');
  for (const p of DATA.PONDS) for (let i = 0; i < 1; i++) g.emit('fish_harvest', 'ikan', { pondId: p.id, productId: p.product, kg: 1, fish: 1 });
  assert.ok(g.state.encyclopedia.cosmetics.includes('paint_laut'));
  assert.ok(evs.some((e) => e.cosmeticId === 'paint_laut'));
  assert.ok(g.machineUpgradeInfo(tractor.uid).paints.includes('#16a085'));
  assert.equal(g.paintMachine(tractor.uid, '#16a085').ok, true);
  // Banners: locked until the tree row is complete
  assert.equal(g.setCosmetic('banner', 'banner_kebun').ok, false);
  for (const t of DATA.TREES) g.emit('task_done', 'panen', { fieldId: 'f1', task: 'harvest', cropId: t.id, tons: 1 });
  assert.ok(g.state.encyclopedia.cosmetics.includes('banner_kebun'));
  assert.equal(g.state.encyclopedia.banner, 'banner_kebun', 'the first banner is put up automatically');
  assert.equal(g.setCosmetic('banner', null).ok, true);
  assert.equal(g.activeCosmetic('banner'), null);
  assert.equal(g.setCosmetic('banner', 'banner_kebun').ok, true);
  assert.equal(g.activeCosmetic('banner').emoji, '🌳');
  assert.equal(g.setCosmetic('barn', 'banner_kebun').ok, false, 'wrong kind');
  const view = g.encyclopediaView();
  assert.ok(view.cosmetics.find((c) => c.id === 'banner_kebun').unlocked);
  assert.ok(view.cosmetics.find((c) => c.id === 'barn_kontainer').how.includes('Tender'));
});

test('old saves back-fill tier 1 from what the state proves, silently; save/load keeps the book', () => {
  const g = newGame(25);
  g.state.level = 20; g.state.money = 1e7;
  g.state.fields.f1.lastCropId = 'corn';
  g.buildBarn('cows'); g.buyAnimal('cows', 5);
  g.buildPond('lele');
  g.buyFactory('mill');
  g.state.silo.sugar = 3;
  g.state.dispatcher.recent = [{ cityId: 'jakarta' }];
  const old = JSON.parse(g.serialize());
  delete old.encyclopedia;
  const evs = [];
  const back = loadGame(JSON.stringify(old), { data: DATA });
  back.on((e) => e.type === 'stamp_new' && evs.push(e));
  const s = back.state.encyclopedia.stamps;
  for (const k of ['crop:corn', 'animal:cows', 'fish:lele', 'product:flour', 'product:sugar', 'region:jabar', 'city:jakarta']) assert.equal(s[k], 1, k);
  assert.equal(s['crop:wheat'], undefined);
  assert.equal(evs.length, 0);
  back.state.encyclopedia.cosmetics.push('paint_panen');
  const again = loadGame(back.serialize(), { data: DATA });
  assert.deepEqual(again.state.encyclopedia.stamps, back.state.encyclopedia.stamps);
  assert.ok(again.state.encyclopedia.cosmetics.includes('paint_panen'));
  // Corrupt pieces are dropped
  const bad = JSON.parse(back.serialize());
  bad.encyclopedia.stamps['crop:ghost'] = 2; bad.encyclopedia.stamps['crop:wheat'] = 9; bad.encyclopedia.cosmetics.push('nope'); bad.encyclopedia.banner = 'nope';
  const fixed = loadGame(JSON.stringify(bad), { data: DATA }).state.encyclopedia;
  assert.equal(fixed.stamps['crop:ghost'], undefined);
  assert.equal(fixed.stamps['crop:wheat'], undefined);
  assert.ok(!fixed.cosmetics.includes('nope'));
  assert.equal(fixed.banner, null);
});

test('offline coarse days count harvested tons and factory batches', () => {
  const g = newGame(26);
  g.state.level = 12; g.state.money = 5e6;
  for (const f of DATA.FIELDS.filter((x) => (x.unlockLevel ?? 1) <= 1).slice(0, 4)) g.buyField(f.id);
  Object.keys(g.state.fields).forEach((id) => g.setFieldPlan(id, { cropId: 'wheat', rotateCropId: 'barley', rent: true, sell: true }));
  g.buyFactory('mill'); g.setFactoryAuto('mill', true);
  g.state.silo.wheat = 200;
  const back = loadGame(g.serialize(), { data: DATA });
  const c0 = { ...back.state.encyclopedia.counts };
  back.catchUp(8 * 3600);
  const c = back.state.encyclopedia.counts;
  assert.ok((c['crop:wheat'] || 0) + (c['crop:barley'] || 0) > (c0['crop:wheat'] || 0) + (c0['crop:barley'] || 0));
  assert.ok((c['product:flour'] || 0) > (c0['product:flour'] || 0));
  assert.ok(back.state.encyclopedia.stamps['product:flour'] >= 1);
});
