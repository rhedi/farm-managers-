// Field status text and change signature, shared by field cards and the field modal.
import { fmtHours, fmtPct, STATE_LABEL, TASK_ING } from './dom.js';
import { app } from './app.js';
import { planSig } from './planEditor.js';

function growHoursLeft(f) {
  const crop = app.game.data.CROPS.find((c) => c.id === f.crop.id);
  return crop ? (1 - f.growth) * crop.growDays * 24 : 0;
}

/** One-line status for a field view. */
export function fieldStatusText(f) {
  if (f.state === 'busy') return `${TASK_ING[f.task] ?? f.task} · sisa ${fmtHours(f.hoursLeft)}`;
  if (f.state === 'growing' && f.crop) {
    const left = f.growth < 1 ? growHoursLeft(f) : 0;
    return `${f.crop.name} ${fmtPct(f.growth)} · panen dalam ±${fmtHours(left)}`;
  }
  if (f.state === 'ready') {
    if (f.withering && f.witherFactor <= 0) return 'Layu total — bajak untuk membersihkan';
    return f.withering ? `Layu! hasil tinggal ${fmtPct(f.witherFactor)}` : 'Siap dipanen';
  }
  if (f.state === 'idle') return 'Kosong · siap dibajak';
  if (f.state === 'plowed') return f.fertilized ? 'Dipupuk · siap ditanam' : 'Dibajak · siap dipupuk atau ditanam';
  return STATE_LABEL[f.state] ?? f.state;
}

/** Changes whenever a card or the modal needs a full rebuild. */
export function fieldSignature(f) {
  return `${f.id}:${f.state}:${f.crop?.id ?? ''}:${f.fertilized}:${f.irrigated}:${f.withering}:${(f.actions || []).join(',')}`
    + `:${planSig(f)}`;
}
