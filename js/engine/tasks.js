// Field tasks: validation, estimates, start and completion.
import { round2 } from './rng.js';
import { TASKS, TASK_NAMES } from './defs.js';
import { rollYield, witherFactor } from './fields.js';
import { phOf, LIME_TARGET_PH } from './soil.js';
import { freeWorker, skillFactor, NO_WORKER } from './workers.js';
import { wearFactor, rollBreakdown, conditionOf, BREAKDOWN_BELOW } from './wear.js';
import { effectiveStats, upgradesOf } from './upgrades.js';
import { orchardAllows, orchardTaskSpec } from './orchard.js';
import { perk } from './research.js';

export const RENT_HA_PER_HOUR = 1.0;
// Orchard tasks (orchard.js): prune on growing trees, clear (tebang) on any orchard; orchardAllows refines them.
const REQUIRED_STATE = { plow: ['idle'], fertilize: ['plowed'], seed: ['plowed'], irrigate: ['growing'], harvest: ['ready'],
  lime: ['idle', 'plowed'], prune: ['orchard'], clear: ['orchard', 'ready'] };
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

const defOf = (game, m) => game.idx.machines.get(m.defId);
/** Def stats with the instance's upgrades (hp, speed, haPerHour, fuelPerHour). */
const effOf = (game, m) => effectiveStats(game, m);
const upgradeLevel = (m) => Object.values(upgradesOf(m)).reduce((s, l) => s + l, 0);

/** Task allowed by the field's state (a fully withered crop may be plowed under; orchards use orchardAllows). */
function stateAllows(game, f, task) {
  const o = orchardAllows(game, f, task);
  if (o != null) return o;
  if (REQUIRED_STATE[task]?.includes(f.state)) return true;
  return task === 'plow' && f.state === 'ready' && witherFactor(f) <= 0;
}

/** Liming does nothing once pH is at the target, or twice in one cycle. */
const limeDone = (game, fieldId, f) => !!f.limed || Math.abs(phOf(game, fieldId) - LIME_TARGET_PH) < 0.01;

/** Does the player own the machines a task needs (ignoring busy/HP)? Harvest can always be rented; orchard work is manual. */
export function ownsRigFor(game, task) {
  if (task === 'harvest' || task === 'prune' || task === 'clear') return true;
  const types = game.state.machines.map((m) => defOf(game, m)).filter(Boolean);
  return types.some((d) => d.type === 'tractor') && types.some((d) => d.type === 'implement' && d.task === task);
}

/** Saplings are planted by hand: `seed` is offered without a seeder when a tree is unlocked. */
const canPlantTree = (game) => (game.data.TREES || []).some((t) => t.unlockLevel <= game.state.level);

export function availableActions(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!f || f.busy) return [];
  const acts = TASKS.filter((t) => stateAllows(game, f, t) && (ownsRigFor(game, t) || (t === 'seed' && canPlantTree(game)))
    && !(t === 'fertilize' && f.fertilized) && !(t === 'irrigate' && f.irrigated) && !(t === 'lime' && limeDone(game, fieldId, f)));
  if (f.state === 'idle' && Object.keys(game.state.fields).length > 1) acts.push('sell');
  return acts;
}

/** Owned machine instances usable for a task (with busy flag), for UI pickers. */
export function availableMachinesFor(game, task) {
  const view = (m) => ({ ...effOf(game, m), uid: m.uid, busy: !!m.busy, condition: conditionOf(m),
    upgrades: upgradesOf(m), upgradeLevel: upgradeLevel(m), paint: m.paint ?? null });
  const all = game.state.machines.filter((m) => defOf(game, m));
  if (task === 'harvest') {
    return { harvesters: all.filter((m) => defOf(game, m).type === 'harvester').map(view), canRent: true,
      rentPerHa: game.data.STARTING.harvesterRentPerHa, rentHaPerHour: RENT_HA_PER_HOUR };
  }
  return {
    tractors: all.filter((m) => defOf(game, m).type === 'tractor').map(view),
    implements: all.filter((m) => { const d = defOf(game, m); return d.type === 'implement' && d.task === task; }).map(view),
  };
}

function pickRig(game, task, opts) {
  const ms = game.state.machines;
  const get = (uid) => ms.find((m) => m.uid === uid);
  let tractors = ms.filter((m) => defOf(game, m)?.type === 'tractor');
  let imps = ms.filter((m) => defOf(game, m)?.type === 'implement' && defOf(game, m).task === task);
  if (opts.tractorId) {
    const t = get(opts.tractorId);
    if (!t || defOf(game, t)?.type !== 'tractor') return fail('Traktor tidak ditemukan.');
    tractors = [t];
  }
  if (opts.implementId) {
    const i = get(opts.implementId);
    if (!i || defOf(game, i)?.type !== 'implement' || defOf(game, i).task !== task) return fail('Alat tidak cocok untuk tugas ini.');
    imps = [i];
  }
  if (!tractors.length) return fail('Kamu tidak punya traktor.');
  if (!imps.length) return fail(`Kamu tidak punya alat untuk ${TASK_NAMES[task].toLowerCase()}.`);
  const freeT = tractors.filter((m) => !m.busy);
  const freeI = imps.filter((m) => !m.busy);
  if (!freeT.length || !freeI.length) return fail('Mesin sedang dipakai di ladang lain.');
  // opts.avoidWorn (plans): prefer any rig without a machine below the breakdown threshold.
  const worn = (m) => !!opts.avoidWorn && conditionOf(m) < BREAKDOWN_BELOW;
  let best = null;
  for (const t of freeT) for (const i of freeI) {
    const td = effOf(game, t), id = effOf(game, i);
    if (td.hp < id.hpRequired) continue;
    const rate = id.haPerHour * td.speed;
    const w = worn(t) || worn(i);
    if (!best || (best.w && !w) || (best.w === w && rate > best.rate)) best = { t, i, td, rate, w };
  }
  if (!best) {
    const need = Math.min(...freeI.map((i) => defOf(game, i).hpRequired));
    return fail(`Tenaga traktor tidak cukup (butuh ${need} HP).`);
  }
  return { ok: true, uids: [best.t.uid, best.i.uid], rate: best.rate, fuelPerHour: best.td.fuelPerHour };
}

function pickHarvester(game, opts) {
  const ms = game.state.machines;
  if (opts.rent) return { ok: true, uids: [], rate: RENT_HA_PER_HOUR, fuelPerHour: 0, rented: true };
  let hs = ms.filter((m) => defOf(game, m)?.type === 'harvester');
  if (opts.harvesterId) hs = hs.filter((m) => m.uid === opts.harvesterId);
  if (!hs.length) return fail(opts.harvesterId ? 'Pemanen tidak ditemukan.' : 'Kamu tidak punya pemanen. Sewa pemanen?', { canRent: true });
  const free = hs.filter((m) => !m.busy).sort((a, b) => (opts.avoidWorn
    ? (conditionOf(a) < BREAKDOWN_BELOW) - (conditionOf(b) < BREAKDOWN_BELOW) : 0)
    || effOf(game, b).haPerHour - effOf(game, a).haPerHour);
  if (!free.length) return fail('Pemanen sedang dipakai. Sewa pemanen?', { canRent: true });
  const d = effOf(game, free[0]);
  return { ok: true, uids: [free[0].uid], rate: d.haPerHour, fuelPerHour: d.fuelPerHour };
}

/** Ledger category of each task's material cost (fuel → 'bbm', rented harvester → 'sewa_pemanen'). */
const MATERIAL_CATEGORY = { seed: 'benih', fertilize: 'pupuk_kapur_irigasi', irrigate: 'pupuk_kapur_irigasi', lime: 'pupuk_kapur_irigasi' };

/** Full validation + cost/duration calculation. Never throws. */
export function planTask(game, fieldId, task, opts = {}) {
  const { state, idx, data } = game;
  const B = data.BALANCE;
  const def = idx.fields.get(fieldId);
  const f = state.fields[fieldId];
  if (!TASKS.includes(task)) return fail('Tugas tidak dikenal.');
  if (!def) return fail('Ladang tidak ditemukan.');
  if (!f) return fail('Kamu belum memiliki ladang ini.');
  if (f.busy) return fail('Ladang sedang dikerjakan.');
  if (!stateAllows(game, f, task)) return fail(`Tidak bisa ${TASK_NAMES[task].toLowerCase()} ladang dalam kondisi ini.`);
  if (task === 'fertilize' && f.fertilized) return fail('Ladang sudah dipupuk.');
  if (task === 'irrigate' && f.irrigated) return fail('Ladang sudah diairi.');
  if (task === 'lime' && limeDone(game, fieldId, f)) return fail('pH tanah sudah ideal atau sudah dikapur.');
  let materialCost = 0, cropId = null;
  const orch = orchardTaskSpec(game, def, f, task, opts, pickRig); // trees: saplings, prune, tebang, fruit picking
  if (orch && orch.ok === false) return orch;
  if (task === 'seed') {
    cropId = opts.cropId;
    const crop = idx.crops.get(cropId);
    if (!crop) return fail('Pilih tanaman yang akan ditanam.');
    if (crop.unlockLevel > state.level) return fail(`${crop.name} terbuka di level ${crop.unlockLevel}.`);
    materialCost = orch ? orch.materialCost : def.sizeHa * crop.seedCostPerHa * (1 - perk(game, 'seedCost')); // research perks: seed/fertilizer cost
  } else if (orch) materialCost = orch.materialCost;
  else if (task === 'fertilize') materialCost = def.sizeHa * B.fertilizerCostPerHa * (1 - perk(game, 'fertCost'));
  else if (task === 'irrigate') materialCost = def.sizeHa * B.irrigateCostPerHa;
  else if (task === 'lime') materialCost = def.sizeHa * (B.limeCostPerHa ?? 90);
  const rig = orch?.rig ?? (task === 'harvest' ? pickHarvester(game, opts) : pickRig(game, task, opts));
  if (!rig.ok) return rig;
  // Rented harvesters come with their own driver and don't wear our machines.
  const worker = rig.rented ? null : freeWorker(game);
  // Research perks: 'taskSpeed' shortens own-rig tasks, 'fuel' lowers the fuel bill.
  const factor = rig.rented ? 1 : skillFactor(worker) * wearFactor(game, rig.uids) / (1 + perk(game, 'taskSpeed'));
  const hours = round2((def.sizeHa / rig.rate) * factor);
  const fuelCost = round2(hours * rig.fuelPerHour * B.fuelPrice * (1 - perk(game, 'fuel')));
  const rentCost = rig.rented ? def.sizeHa * (rig.rentPerHa ?? data.STARTING.harvesterRentPerHa) : 0;
  const cost = round2(fuelCost + materialCost + rentCost);
  // Harvest is paid on completion (from money, or by auto-selling part of the crop), so it never fails on money.
  const payOnCompletion = task === 'harvest';
  const costSplit = { bbm: fuelCost, [rig.rentCategory ?? 'sewa_pemanen']: rentCost }; // ledger categories (game.spend split)
  if (materialCost > 0) costSplit[orch?.category ?? MATERIAL_CATEGORY[task]] = materialCost;
  const plan = { ok: true, hours, cost, costSplit, fuelCost, materialCost, rentCost, machineUids: rig.uids, rented: !!rig.rented, cropId, payOnCompletion,
    workerId: worker?.id ?? null, workerName: worker?.name ?? null };
  if (!rig.rented && !worker) return { ...plan, ok: false, reason: NO_WORKER };
  if (!payOnCompletion && cost > state.money) return { ...plan, ok: false, reason: 'Uang tidak cukup.' };
  return plan;
}

export function startTask(game, fieldId, task, opts = {}) {
  const plan = planTask(game, fieldId, task, opts);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const { state } = game;
  if (!plan.payOnCompletion) game.spend(plan.cost, plan.costSplit);
  for (const uid of plan.machineUids) state.machines.find((m) => m.uid === uid).busy = fieldId;
  if (plan.workerId) state.workers.find((w) => w.id === plan.workerId).busy = fieldId;
  const hours = round2(Math.max(plan.hours, 0.01) * (plan.rented ? 1 : rollBreakdown(game, plan.machineUids, fieldId)));
  const f = state.fields[fieldId];
  f.busy = { task, hours, done: 0, machineUids: plan.machineUids, cropId: plan.cropId, rented: plan.rented,
    workerId: plan.workerId };
  if (task === 'harvest') {
    f.busy.yieldTons = rollYield(game, fieldId);
    f.busy.cost = plan.cost;
    f.busy.costSplit = plan.costSplit;
  }
  return { ok: true, hours, cost: plan.cost, payOnCompletion: plan.payOnCompletion, workerId: plan.workerId };
}

/**
 * Start `task` on every owned field that offers it (largest first).
 * Harvest: owned harvesters first; with `opts.rent` the rest are rented.
 */
export function startTaskAll(game, task, opts = {}) {
  if (!TASKS.includes(task)) return { ok: false, reason: 'Tugas tidak dikenal.', started: [], skipped: [] };
  const started = [], skipped = [];
  const ids = Object.keys(game.state.fields)
    .filter((id) => availableActions(game, id).includes(task))
    .sort((a, b) => (game.idx.fields.get(b)?.sizeHa ?? 0) - (game.idx.fields.get(a)?.sizeHa ?? 0));
  for (const fieldId of ids) {
    const base = { ...opts };
    let r;
    if (task === 'harvest') {
      r = startTask(game, fieldId, task, { ...base, rent: false });
      if (!r.ok && opts.rent) r = startTask(game, fieldId, task, { ...base, rent: true });
    } else r = startTask(game, fieldId, task, base);
    if (r.ok) started.push({ fieldId, hours: r.hours, cost: r.cost });
    else skipped.push({ fieldId, reason: r.reason });
  }
  return { ok: started.length > 0, started, skipped,
    ...(started.length ? {} : { reason: skipped[0]?.reason ?? 'Tidak ada ladang untuk tugas ini.' }) };
}
