// Progressing running tasks and applying their results.
import { round2 } from './rng.js';
import { TASK_NAMES, fmtMoney, fmtNum } from './defs.js';
import { resetCropCycle } from './fields.js';
import { sellProduct } from './economy.js';
import { applyLime, onFertilize, onHarvest } from './soil.js';
import { storeHarvest } from './stockKeep.js';
import { onTaskDone } from './workers.js';
import { wearMachines, conditionOf, repairCost, repairMachine } from './wear.js';
import { isTree, plantOrchard, afterOrchardHarvest, clearOrchard } from './orchard.js';

/** Advance all running tasks by dt game hours. Returns the number of tasks completed. */
export function stepTasks(game, dt) {
  let done = 0;
  for (const [fid, f] of Object.entries(game.state.fields)) {
    if (!f.busy) continue;
    const before = f.busy.done;
    f.busy.done = round2(Math.min(f.busy.hours, f.busy.done + dt));
    wearMachines(game, f.busy.machineUids, f.busy.done - before);
    if (f.busy.done >= f.busy.hours - 1e-9) { completeTask(game, fid); done++; }
  }
  return done;
}

/** XP for produce worth `value` at base price. */
export const xpForValue = (game, value) => (game.data.BALANCE.xpPerHarvestValue ?? 0.01) * value;

/**
 * Pay a deferred harvest cost. If money is short, sell just enough of the crop
 * at market price; anything still missing is added to the loan. Returns a note or ''.
 */
function payHarvest(game, cropId, cost, split = 'bbm') {
  const { state } = game;
  if (!(cost > 0)) return '';
  if (game.spend(cost, split)) return '';
  let note = '';
  const price = state.market[cropId] ?? 0;
  const stock = state.silo[cropId] || 0;
  if (price > 0 && stock > 0) {
    const qty = Math.min(stock, Math.ceil(((cost - state.money) / price) * 100) / 100);
    const r = sellProduct(game, cropId, qty, { ignoreReserve: true, quiet: true });
    if (r.ok) note = ` ${fmtNum(qty)} t dijual otomatis (${fmtMoney(r.earned)}) untuk biaya panen.`;
  }
  const short = game.payOrBorrow(cost, split);
  if (!(short > 0)) return note;
  return `${note} Kekurangan ${fmtMoney(short)} ditambahkan ke pinjaman.`;
}

export function completeTask(game, fieldId) {
  const { state, data, idx } = game;
  const B = data.BALANCE;
  const f = state.fields[fieldId];
  const job = f.busy;
  f.busy = null;
  for (const m of state.machines) if (m.busy === fieldId) m.busy = false;
  const worker = state.workers.find((w) => w.busy === fieldId);
  if (worker) { worker.busy = false; onTaskDone(game, worker); }
  const fname = idx.fields.get(fieldId)?.name ?? fieldId;
  let msg = `${TASK_NAMES[job.task]} di ${fname} selesai.`;
  const extra = { fieldId, task: job.task };
  switch (job.task) {
    case 'plow':
      Object.assign(f, { state: 'plowed', cropId: null, fertilized: false, irrigated: false, limed: false,
        growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0 });
      break;
    case 'fertilize':
      f.fertilized = true;
      onFertilize(game, fieldId);
      break;
    case 'lime':
      f.limed = true;
      msg = `Pengapuran di ${fname} selesai: pH tanah kini ${fmtNum(applyLime(game, fieldId))}.`;
      break;
    case 'seed': {
      const crop = idx.crops.get(job.cropId);
      if (isTree(crop)) {
        plantOrchard(game, f, crop);
        resetCropCycle(f);
        msg = `🌱 Bibit ${crop.emoji} ${crop.name} ditanam di ${fname}. Berbuah setelah ${crop.maturityDays} hari.`;
        break;
      }
      Object.assign(f, { state: 'growing', cropId: job.cropId, growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0 });
      resetCropCycle(f);
      msg = `${crop.emoji} ${crop.name} ditanam di ${fname}.`;
      break;
    }
    case 'prune':
      if (f.orchard) f.orchard.pruned = true;
      break;
    case 'clear':
      clearOrchard(f);
      msg = `🪓 Kebun di ${fname} ditebang; ladang kosong lagi.`;
      break;
    case 'irrigate':
      f.irrigated = true;
      break;
    case 'harvest': {
      const crop = idx.crops.get(f.cropId);
      const tons = job.yieldTons > 0 ? job.yieldTons : 0;
      let stored = 0, sold = 0, soldValue = 0;
      extra.cropId = f.cropId;
      extra.tons = tons;
      if (tons > 0) {
        // Plan option `sell`: sold at market before storing; keeps feed, contract and Manajer Pabrik stock (stockKeep.js).
        ({ stored, sold, soldValue } = storeHarvest(game, f.cropId, tons, { sell: !!f.plan?.sell }));
        state.stats.harvests++;
        state.stats.tonsHarvested = round2(state.stats.tonsHarvested + tons);
        const base = idx.products.get(f.cropId)?.basePrice ?? 0;
        game.addXp(Math.round(xpForValue(game, tons * base)));
        msg = `Panen ${crop.emoji} ${crop.name} di ${fname}: ${fmtNum(stored)} t masuk silo.`;
      } else msg = `Panen di ${fname} gagal: tanaman sudah layu habis.`;
      onHarvest(game, fieldId, f.cropId);
      msg += payHarvest(game, f.cropId, job.cost ?? 0, job.costSplit);
      if (sold > 0) msg += ` ${fmtNum(sold)} t dijual otomatis (${fmtMoney(soldValue)}).`;
      if (f.plan && !f.plan.repeat) f.plan = null;
      if (f.orchard) { afterOrchardHarvest(f); break; } // trees stay: next fruit cycle
      Object.assign(f, { state: 'idle', cropId: null, fertilized: false, irrigated: false, limed: false,
        growHours: 0, readyHours: 0, dryDays: 0, wetDays: 0 });
      break;
    }
  }
  game.addXp(B.xpPerTask);
  game.emit('task_done', msg, extra);
  if (state.autoRepair) autoRepair(game, job.machineUids);
}

/** Global setting `state.autoRepair`: repair machines that finish a task below AUTO_REPAIR_BELOW, if affordable. */
export const AUTO_REPAIR_BELOW = 0.3;
function autoRepair(game, uids) {
  for (const uid of uids || []) {
    const m = game.state.machines.find((x) => x.uid === uid);
    if (m && !m.busy && conditionOf(m) < AUTO_REPAIR_BELOW && repairCost(game, m) <= game.state.money) repairMachine(game, uid);
  }
}
