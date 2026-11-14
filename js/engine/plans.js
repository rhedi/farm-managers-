// Field plans (F2): a per-field recipe that auto-starts the next step of the crop cycle.
import { startTask, ownsRigFor } from './tasks.js';
import { witherFactor, WITHER_AFTER_HOURS } from './fields.js';
import { phOf, LIME_TARGET_PH } from './soil.js';
import { NO_WORKER } from './workers.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
/** Ready this long without a free own harvester → rent anyway so the crop never withers. */
const rentFallbackHours = () => WITHER_AFTER_HOURS - 24; // lazy: fields.js ↔ plans.js import cycle

/**
 * Set or clear (null) a field plan:
 * { cropId, fertilize=true, irrigate=false, rent=true, repeat=true, lime=false }.
 */
export function setFieldPlan(game, fieldId, plan) {
  const f = game.state.fields[fieldId];
  if (!f) return fail('Kamu belum memiliki ladang ini.');
  if (plan == null) { f.plan = null; return ok({ plan: null }); }
  const crop = game.idx.crops.get(plan.cropId);
  if (!crop) return fail('Pilih tanaman untuk rencana.');
  if (crop.unlockLevel > game.state.level) return fail(`${crop.name} terbuka di level ${crop.unlockLevel}.`);
  const rot = plan.rotateCropId && plan.rotateCropId !== crop.id ? game.idx.crops.get(plan.rotateCropId) : null;
  if (plan.rotateCropId && plan.rotateCropId !== crop.id && !rot) return fail('Tanaman rotasi tidak ditemukan.');
  if (rot && rot.unlockLevel > game.state.level) return fail(`${rot.name} terbuka di level ${rot.unlockLevel}.`);
  f.plan = {
    cropId: crop.id,
    rotateCropId: rot?.id ?? null,
    fertilize: plan.fertilize ?? true,
    irrigate: !!plan.irrigate,
    rent: plan.rent ?? true,
    repeat: plan.repeat ?? true,
    lime: !!plan.lime,
    sell: plan.sell ?? true,
    blocked: null,
  };
  runPlans(game);
  return ok({ plan: { ...f.plan } });
}

/** Crop the plan seeds next: alternates cropId ↔ rotateCropId using the field's last harvested crop. */
export function plannedCrop(f) {
  const p = f?.plan;
  if (!p) return null;
  return p.rotateCropId && f.lastCropId === p.cropId ? p.rotateCropId : p.cropId;
}

/** Next task of the crop cycle for a field (plan-aware), or null if nothing to do / busy. */
export function nextStepFor(game, fieldId) {
  const f = game.state.fields[fieldId];
  if (!f || f.busy) return null;
  const p = f.plan;
  switch (f.state) {
    case 'idle': return 'plow';
    case 'plowed':
      if (p?.lime && !f.limed && ownsRigFor(game, 'lime') && Math.abs(phOf(game, fieldId) - LIME_TARGET_PH) >= 0.01) return 'lime';
      return (p ? p.fertilize : true) && !f.fertilized && ownsRigFor(game, 'fertilize') ? 'fertilize' : 'seed';
    case 'growing':
      return (p ? p.irrigate : true) && !f.irrigated && ownsRigFor(game, 'irrigate') ? 'irrigate' : null;
    case 'ready': return witherFactor(f) <= 0 ? 'plow' : 'harvest';
    default: return null;
  }
}

function startHarvest(game, fieldId, f) {
  const own = game.state.machines.some((m) => game.idx.machines.get(m.defId)?.type === 'harvester');
  const r = startTask(game, fieldId, 'harvest', { rent: false, avoidWorn: true });
  if (r.ok) return r;
  if (f.plan.rent || !own || f.readyHours >= rentFallbackHours()) return startTask(game, fieldId, 'harvest', { rent: true });
  return fail(r.reason === NO_WORKER ? NO_WORKER : 'Menunggu pemanen bebas.');
}

/** Start the next step on every planned, idle-machine field. Records `plan.blocked` reasons. */
export function runPlans(game) {
  for (const def of game.data.FIELDS) {
    const f = game.state.fields[def.id];
    if (!f?.plan || f.busy) continue;
    const step = nextStepFor(game, def.id);
    if (!step) { f.plan.blocked = null; continue; }
    let r;
    if (step === 'harvest') r = startHarvest(game, def.id, f);
    else r = startTask(game, def.id, step, step === 'seed' ? { cropId: plannedCrop(f), avoidWorn: true } : { avoidWorn: true });
    if (!f.plan) continue; // a non-repeating plan may have finished
    f.plan.blocked = r.ok ? null : r.reason;
  }
}
