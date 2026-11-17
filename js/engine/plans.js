// Field plans (F2): a per-field recipe that auto-starts the next step of the crop cycle.
import { startTask, ownsRigFor } from './tasks.js';
import { witherFactor, WITHER_AFTER_HOURS } from './fields.js';
import { phOf, LIME_TARGET_PH } from './soil.js';
import { NO_WORKER } from './workers.js';
import { orchardAllows, ownsShaker } from './orchard.js';
import { coveredFields, pausedLabel, trackActive } from './mandor.js';

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
  // Trees stay planted across harvests, so an orchard plan never rotates.
  const rotId = !crop.perennial && plan.rotateCropId !== crop.id ? plan.rotateCropId : null;
  const rot = rotId ? game.idx.crops.get(rotId) : null;
  if (rotId && !rot) return fail('Tanaman rotasi tidak ditemukan.');
  if (rot?.perennial) return fail('Pohon tidak bisa dipakai untuk rotasi.');
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
  return ok({ plan: { ...f.plan }, paused: !!f.plan?.paused });
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
    case 'orchard': // kebun buah: feed / water mature trees once per fruit cycle; no replanting
      if ((p ? p.fertilize : true) && !f.fertilized && ownsRigFor(game, 'fertilize') && orchardAllows(game, f, 'fertilize')) return 'fertilize';
      return (p ? p.irrigate : true) && !f.irrigated && ownsRigFor(game, 'irrigate') && orchardAllows(game, f, 'irrigate') ? 'irrigate' : null;
    case 'ready': return f.orchard ? 'harvest' : witherFactor(f) <= 0 ? 'plow' : 'harvest';
    default: return null;
  }
}

function startHarvest(game, fieldId, f) {
  // Orchards: own tractor + tree shaker, else rented pickers; field crops: own harvester, else rented harvester.
  const own = f.orchard ? ownsShaker(game) : game.state.machines.some((m) => game.idx.machines.get(m.defId)?.type === 'harvester');
  const r = startTask(game, fieldId, 'harvest', { rent: false, avoidWorn: true });
  if (r.ok) return r;
  if (f.plan.rent || !own || f.readyHours >= rentFallbackHours()) return startTask(game, fieldId, 'harvest', { rent: true });
  return fail(r.reason === NO_WORKER ? NO_WORKER : 'Menunggu pemanen bebas.');
}

/**
 * Start the next step on every planned, idle-machine field. Records `plan.blocked` reasons. Plans past the Mandor
 * cap (mandor.js) stay configured but paused: `plan.paused` true, `plan.blocked` = "Butuh Mandor (2/2 ladang gratis)".
 */
export function runPlans(game) {
  const covered = coveredFields(game);
  trackActive(game, covered);
  let label = null;
  for (const def of game.data.FIELDS) {
    const f = game.state.fields[def.id];
    if (!f?.plan) continue;
    if (!covered.has(def.id)) { f.plan.paused = true; f.plan.blocked = label ??= pausedLabel(game); continue; }
    if (f.plan.paused) { f.plan.paused = false; f.plan.blocked = null; }
    if (f.busy) continue;
    const step = nextStepFor(game, def.id);
    if (!step) { f.plan.blocked = null; continue; }
    let r;
    if (step === 'harvest') r = startHarvest(game, def.id, f);
    else r = startTask(game, def.id, step, step === 'seed' ? { cropId: plannedCrop(f), avoidWorn: true } : { avoidWorn: true });
    if (!f.plan) continue; // a non-repeating plan may have finished
    f.plan.blocked = r.ok ? null : r.reason;
  }
}
