// Kebun buah (perennial orchards). A TREES crop is planted once with the `seed` task (manual: worker + saplings,
// no seeder). The field then stays 'orchard' (trees growing / fruit developing) ⇄ 'ready' (fruit ripe) across
// harvests, until the `clear` task (tebang) returns it to 'idle'. fields[id].orchard = { plantedAt /* game hour */,
// harvests, pruned /* this cycle */, matureNotified }. Fruit grows (growHours) only on mature trees, inside the
// tree's fruiting window (`seasons`) and at ≥ minTemp; harvestEveryDays × 24 such hours ripen a crop.
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { cropSeasonFit, cropGrowthMult, seasonIdAt, climateTemp, yearDays, isTropical, SEASONS, TEMPERATE, TROPICAL } from './seasons.js';
import { eventGrowthMult } from './events.js';
import { expectedYield } from './fields.js';

const DEFAULTS = { plantHaPerHour: 1.5, pruneHaPerHour: 3, pruneCostPerHa: 70, pruneBonus: 0.15, clearHaPerHour: 2,
  clearCostPerHa: 150, pickerRentPerHa: 160, pickerHaPerHour: 0.75, oldAgeDecline: 1.4, minAgeFactor: 0.3 };
export const orchardCfg = (game) => ({ ...DEFAULTS, ...(game.data.BALANCE.orchard || {}) });

export const isTree = (crop) => !!crop?.perennial;
export const treeOf = (game, f) => (f?.orchard ? game.idx.crops.get(f.cropId) ?? null : null);
export const ageDays = (game, f) => (f?.orchard ? Math.max(0, (game.state.time - f.orchard.plantedAt) / 24) : 0);
export function isMature(game, f) {
  const tree = treeOf(game, f);
  return !!tree && ageDays(game, f) >= tree.maturityDays;
}
const regionOfField = (game, fieldId) => game.idx.fields.get(fieldId)?.regionId;

/** Yield multiplier from tree age: 1 up to lifespanDays, then −oldAgeDecline × overage / lifespan (floor minAgeFactor). */
export function ageFactor(game, tree, age) {
  const C = orchardCfg(game);
  if (age <= tree.lifespanDays) return 1;
  return Math.max(C.minAgeFactor, 1 - C.oldAgeDecline * (age - tree.lifespanDays) / tree.lifespanDays);
}

/** Fruiting window by season only (hourly growth also needs today's temp ≥ minTemp). */
export const windowOpen = (game, regionId, tree, day = game.day) =>
  cropSeasonFit(tree, seasonIdAt(game, regionId, day)) !== 'off';
/** A day expected to grow fruit: window open and the climate mean temperature ≥ minTemp (forecast-free). */
const fruitDay = (game, regionId, tree, day) => windowOpen(game, regionId, tree, day)
  && (tree.minTemp == null || climateTemp(game, regionId, day) >= tree.minTemp);

/** Fruit growth speed now: 0 outside the window or below minTemp, else the season × 🌈 event multiplier. */
export function fruitMult(game, fieldId, tree) {
  const regionId = regionOfField(game, fieldId);
  if (!windowOpen(game, regionId, tree)) return 0;
  return cropGrowthMult(game, regionId, tree) * eventGrowthMult(game, regionId);
}

/** Expected fruiting days per year in a region (climate temperature, no weather noise). */
export function windowDaysPerYear(game, regionId, tree) {
  let n = 0;
  for (let d = 1; d <= yearDays(game); d++) if (fruitDay(game, regionId, tree, d)) n++;
  return n;
}

/** Seasons of the region's calendar in which the tree fruits: [{id, name, emoji}]. */
export function windowSeasons(game, regionId, tree) {
  const fam = isTropical(game.idx.regions.get(regionId)) ? TROPICAL : TEMPERATE;
  return fam.filter((s) => cropSeasonFit(tree, s) !== 'off').map((s) => ({ id: s, name: SEASONS[s].name, emoji: SEASONS[s].emoji }));
}

/** Game hours until the fruit is ripe, counting expected fruiting days after maturity; null if never within 3 years. */
export function hoursToRipe(game, fieldId, f, tree) {
  if (f.state === 'ready') return 0;
  const regionId = regionOfField(game, fieldId);
  let need = tree.harvestEveryDays * 24 - (f.growHours || 0);
  const matureAt = f.orchard.plantedAt + tree.maturityDays * 24;
  let t = game.state.time;
  for (let guard = 0; need > 1e-9 && guard < 3 * yearDays(game) + tree.maturityDays + 2; guard++) {
    const day = Math.floor(t / 24) + 1, end = day * 24, start = Math.max(t, matureAt);
    if (start < end && fruitDay(game, regionId, tree, day)) {
      const h = Math.min(end - start, need);
      need -= h;
      t = start + h;
    } else t = end;
  }
  return need > 1e-9 ? null : round2(t - game.state.time);
}

/** One game hour for an orchard field (called from fields.stepFieldsHour). */
export function stepOrchardHour(game, fieldId, f) {
  const tree = treeOf(game, f);
  if (!tree || f.state !== 'orchard' || ageDays(game, f) < tree.maturityDays) return;
  const name = game.idx.fields.get(fieldId)?.name ?? fieldId;
  if (!f.orchard.matureNotified) {
    f.orchard.matureNotified = true;
    Object.assign(f, { dryDays: 0, wetDays: 0 }); // juvenile weather doesn't count against the first crop
    game.emit('orchard_mature', `🌳 Kebun ${tree.name} di ${name} sudah dewasa dan mulai berbuah.`, { fieldId, cropId: tree.id });
  }
  const m = fruitMult(game, fieldId, tree);
  if (m <= 0) return;
  f.growHours = Math.round(((f.growHours || 0) + m) * 1e6) / 1e6;
  if (f.growHours >= tree.harvestEveryDays * 24) {
    f.state = 'ready';
    f.readyHours = 0;
    game.emit('crop_ready', `${tree.emoji} ${tree.name} di ${name} siap dipetik!`, { fieldId });
  }
}

/** Extra yield factors for trees ({} for annual crops): season 1 (it only sets the window), no rotation penalty, age, prune. */
export function orchardFactors(game, f, crop) {
  if (!isTree(crop)) return {};
  const own = !!f?.orchard && f.cropId === crop.id;
  return { season: 1, rotation: 1, age: own ? ageFactor(game, crop, ageDays(game, f)) : 1,
    prune: 1 + (own && f.orchard.pruned ? orchardCfg(game).pruneBonus : 0) };
}

/** Task rules on orchard fields: true/false, or null when no orchard is involved (generic rules apply). */
export function orchardAllows(game, f, task) {
  if (task === 'prune' || task === 'clear') {
    if (!f.orchard) return false;
    if (task === 'clear') return f.state === 'orchard' || f.state === 'ready';
    return f.state === 'orchard' && !f.orchard.pruned && isMature(game, f);
  }
  if (!f.orchard) return null;
  if (task === 'harvest') return f.state === 'ready';
  if (task === 'fertilize' || task === 'irrigate') return f.state === 'orchard' && isMature(game, f);
  return false; // plow / seed / lime: clear the orchard first
}

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const manual = (rate) => ({ ok: true, uids: [], rate, fuelPerHour: 0, manual: true });

/**
 * Orchard task cost + rig, or null for ordinary tasks: { materialCost, category, rig } | { ok:false, reason }.
 * Planting/pruning/clearing are manual (worker only). Fruit harvest: own tractor + shaker (implement task 'pick'),
 * or `opts.rent` pickers (pickerRentPerHa, no worker, no fuel). `pickRig(game, task, opts)` comes from tasks.js.
 */
export function orchardTaskSpec(game, def, f, task, opts, pickRig) {
  const C = orchardCfg(game);
  if (task === 'seed') {
    const tree = game.idx.trees.get(opts.cropId);
    if (!tree) return null;
    if (f.greenhouse) return fail('Pohon tidak bisa ditanam di rumah kaca.');
    return { materialCost: def.sizeHa * tree.plantCostPerHa, category: 'bibit_pohon', rig: manual(C.plantHaPerHour) };
  }
  if (task === 'prune') return { materialCost: def.sizeHa * C.pruneCostPerHa, category: 'perawatan_kebun', rig: manual(C.pruneHaPerHour) };
  if (task === 'clear') return { materialCost: def.sizeHa * C.clearCostPerHa, category: 'perawatan_kebun', rig: manual(C.clearHaPerHour) };
  if (task !== 'harvest' || !f.orchard) return null;
  if (opts.rent) {
    return { materialCost: 0, rig: { ok: true, uids: [], rate: C.pickerHaPerHour, fuelPerHour: 0, rented: true,
      rentPerHa: C.pickerRentPerHa, rentCategory: 'sewa_pemetik' } };
  }
  const rig = pickRig(game, 'pick', opts);
  return rig.ok ? { materialCost: 0, rig } : { ...rig, canRent: true, reason: `${rig.reason} Sewa pemetik?` };
}

/** Does the player own a tractor + tree shaker (for plans: rent pickers only when they don't)? */
export const ownsShaker = (game) => {
  const defs = game.state.machines.map((m) => game.idx.machines.get(m.defId)).filter(Boolean);
  return defs.some((d) => d.type === 'tractor') && defs.some((d) => d.type === 'implement' && d.task === 'pick');
};

/** `seed` task with a tree finished: the field becomes an orchard (a fertilize done before planting still counts). */
export function plantOrchard(game, f, tree) {
  Object.assign(f, { state: 'orchard', cropId: tree.id, irrigated: false, growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0 });
  f.orchard = { plantedAt: game.state.time, harvests: 0, pruned: false, matureNotified: false };
}

/** Harvest finished: trees stay, the next fruit cycle starts. */
export function afterOrchardHarvest(f) {
  Object.assign(f, { state: 'orchard', fertilized: false, irrigated: false, limed: false,
    growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0 });
  f.orchard.harvests = (f.orchard.harvests || 0) + 1;
  f.orchard.pruned = false;
}

/** `clear` (tebang) finished: back to idle; a plan for this tree is dropped so it doesn't replant at once. */
export function clearOrchard(f) {
  const treeId = f.cropId;
  if (f.plan?.cropId === treeId) f.plan = null;
  Object.assign(f, { state: 'idle', cropId: null, orchard: null, fertilized: false, irrigated: false, limed: false,
    growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0, lastCropId: treeId ?? f.lastCropId ?? null,
    pest: false, damage: 1, seasonSum: 0, seasonN: 0 });
}

/** Orchard block of the field view, or null. */
export function orchardView(game, fieldId, f) {
  const tree = treeOf(game, f);
  if (!tree) return null;
  const regionId = regionOfField(game, fieldId);
  const age = ageDays(game, f);
  const mature = age >= tree.maturityDays;
  const open = windowOpen(game, regionId, tree);
  let nextWindowDay = null;
  for (let d = game.day; d < game.day + yearDays(game) && nextWindowDay == null; d++) if (fruitDay(game, regionId, tree, d)) nextWindowDay = d;
  return {
    treeId: tree.id, ageDays: round2(age), maturityDays: tree.maturityDays, lifespanDays: tree.lifespanDays,
    harvestEveryDays: tree.harvestEveryDays, mature, maturity: round2(Math.min(1, age / tree.maturityDays)),
    stage: !mature ? 'young' : age > tree.lifespanDays ? 'old' : 'prime',
    vitality: round2(ageFactor(game, tree, age)),
    fruit: f.state === 'ready' ? 1 : mature ? round2(Math.min(1, (f.growHours || 0) / (tree.harvestEveryDays * 24))) : 0,
    fruitMult: f.state === 'orchard' && mature ? round2(fruitMult(game, fieldId, tree)) : null,
    windowOpen: open, nextWindowDay, windowSeasons: windowSeasons(game, regionId, tree),
    windowDays: windowDaysPerYear(game, regionId, tree),
    hoursToRipe: hoursToRipe(game, fieldId, f, tree), harvests: f.orchard.harvests || 0, pruned: !!f.orchard.pruned,
  };
}

/**
 * Crop-picker outlook for planting `treeId` on a field: per-harvest tons (fertilized, unpruned, mature), harvests
 * per year in that region, yearly revenue/cost/profit at today's price (fertilizer + rented pickers per harvest),
 * sapling cost and payback days (juvenile years + sapling cost / daily profit).
 */
export function orchardOutlook(game, fieldId, treeId) {
  const tree = game.idx.trees.get(treeId);
  const def = game.idx.fields.get(fieldId);
  if (!tree || !def) return null;
  const B = game.data.BALANCE, C = orchardCfg(game), Y = yearDays(game);
  const tons = expectedYield(game, fieldId, tree.id, { fertilized: true });
  const windowDays = windowDaysPerYear(game, def.regionId, tree);
  const harvestsPerYear = round2(windowDays / tree.harvestEveryDays);
  const price = game.state.market[tree.id] ?? game.idx.products.get(tree.id)?.basePrice ?? 0;
  const yearlyRevenue = round2(tons * price * harvestsPerYear);
  const yearlyCost = round2(def.sizeHa * (B.fertilizerCostPerHa + C.pickerRentPerHa) * harvestsPerYear);
  const yearlyProfit = round2(yearlyRevenue - yearlyCost);
  const plantCost = round2(def.sizeHa * tree.plantCostPerHa);
  return { treeId, tons, harvestsPerYear, windowDays, windowSeasons: windowSeasons(game, def.regionId, tree), price,
    yearlyRevenue, yearlyCost, yearlyProfit, plantCost, maturityDays: tree.maturityDays,
    harvestEveryDays: tree.harvestEveryDays, lifespanDays: tree.lifespanDays,
    paybackDays: yearlyProfit > 0 ? Math.round(tree.maturityDays + plantCost / (yearlyProfit / Y)) : null,
    cold: windowDays === 0, blocked: game.state.fields[fieldId]?.greenhouse ? 'Pohon tidak bisa ditanam di rumah kaca.' : null,
    note: `Bibit ${fmtMoney(plantCost)}` };
}
