// Field plan (F2): "🔁 Rencana" editor for the field modal and the card chip.
import { h, TASK_ICON, TASK_LABEL } from './dom.js';
import { act } from './app.js';
import { fold } from './subtabs.js';
import { bestCropId, cropOutlook, phFits } from './cropPicker.js';
import { pausedPlanBox } from './mandor.js';

export const plansSupported = (game) => typeof game.setFieldPlan === 'function';

const stepLabel = (s) => (s && TASK_LABEL[s] ? `${TASK_ICON[s]} ${TASK_LABEL[s]}` : s ? String(s) : null);

/** "Langkah berikut: 🌱 Tanam" or null. */
export function nextStepText(f) {
  const s = stepLabel(f.nextStep);
  return s ? `Langkah berikut: ${s}` : null;
}

export function planSig(f) {
  const p = f.plan;
  return p ? `${p.cropId}:${p.rotateCropId ?? ''}:${!!p.fertilize}:${!!p.irrigate}:${!!p.rent}:${!!p.repeat}:${!!p.lime}:${!!p.sell}:${p.blocked ?? ''}:${f.nextStep ?? ''}` : `-:${f.nextStep ?? ''}`;
}

const NO_WORKER = 'Tidak ada pekerja bebas.';
/** Blocked reason, with a pointer to the Garasi when the plan waits for a worker (F9). */
const blockedText = (reason) => (reason === NO_WORKER ? `${reason} Rekrut pekerja di Garasi.` : reason);

/** Card chip row: "🔁 Gandum" plus the blocked reason or the next step; null without a plan. */
export function planChip(game, f) {
  if (!f.plan) return null;
  const step = stepLabel(f.nextStep);
  const crop = allCrops(game).find((c) => c.id === f.plan.cropId);
  const rot = f.plan.rotateCropId && !crop?.perennial ? game.data.CROPS.find((c) => c.id === f.plan.rotateCropId) : null;
  return h('div.plan-chip-row',
    h(`span.plan-chip${f.plan.blocked ? '.blocked' : ''}`, `🔁 ${crop ? `${crop.emoji} ${crop.name}` : 'Rencana'}${rot ? ` ⇄ ${rot.emoji}` : ''}`),
    f.plan.paused ? pausedPlanBox(game, f, { compact: true })
      : f.plan.blocked ? h('span.plan-blocked.small', `⏸ ${blockedText(f.plan.blocked)}`)
        : step && f.state !== 'busy' ? h('span.small.muted', `➡️ ${step}`) : null);
}

const picked = new WeakSet(); // drafts whose crop the player chose in the select
const pickedRot = new WeakSet(); // drafts whose rotation crop the player chose

/** Most profitable open crop other than `exclude` (rotation partner), or null. */
function bestOtherCropId(game, f, exclude) {
  let best = null, bestProfit = -Infinity;
  for (const c of game.data.CROPS) {
    if (c.unlockLevel > game.state.level || c.id === exclude) continue;
    const p = cropOutlook(game, [f], c).profit ?? -Infinity;
    if (best == null || p > bestProfit) { best = c.id; bestProfit = p; }
  }
  return best;
}

/**
 * Draft plan for the editor, kept across re-renders via `prev`. Without a plan, the crop follows
 * bestCropId (as the seed picker ranks it, assuming the draft's fertilize step) until the player picks one;
 * the rotation crop defaults to the best different crop.
 */
export function planDraft(game, f, prev = null) {
  if (!prev && f.plan) {
    const p = f.plan;
    return { cropId: p.cropId, rotateCropId: p.rotateCropId ?? null, fertilize: !!p.fertilize, irrigate: !!p.irrigate,
      rent: !!p.rent, repeat: !!p.repeat, lime: !!p.lime, sell: !!p.sell };
  }
  const draft = prev ?? { cropId: null, rotateCropId: null, fertilize: true, irrigate: false, rent: true, repeat: true, lime: false, sell: true };
  if (!f.plan && !picked.has(draft)) draft.cropId = bestCropId(game, [{ ...f, fertilized: f.fertilized || draft.fertilize }]);
  const clash = !!draft.rotateCropId && draft.rotateCropId === draft.cropId;
  if ((!f.plan && !pickedRot.has(draft)) || clash) draft.rotateCropId = bestOtherCropId(game, f, draft.cropId);
  return draft;
}

function toggle(draft, key, label) {
  return h('label.plan-toggle',
    h('input', { type: 'checkbox', checked: !!draft[key], onchange: (e) => { draft[key] = e.target.checked; } }),
    ` ${label}`);
}

/** Annual crops plus trees (kebun buah); trees can be planned but never rotated. */
const allCrops = (game) => [...game.data.CROPS, ...(game.data.TREES || [])];

function cropSelect(game, f, draft, rerender) {
  const open = allCrops(game).filter((c) => c.unlockLevel <= game.state.level && !(c.perennial && f.greenhouse));
  if (!open.some((c) => c.id === draft.cropId)) draft.cropId = open[0]?.id ?? null;
  const opt = (c) => h('option', { value: c.id, selected: c.id === draft.cropId }, `${c.emoji} ${c.name} ${phFits(f, c) ? '✅' : '⚠️ pH'}`);
  const trees = open.filter((c) => c.perennial);
  return h('select', { 'aria-label': 'Tanaman rencana', onchange: (e) => { draft.cropId = e.target.value; picked.add(draft); rerender?.(); } },
    open.filter((c) => !c.perennial).map(opt),
    trees.length ? h('optgroup', { label: '🌳 Pohon (kebun buah)' }, trees.map(opt)) : null);
}

function rotateSelect(game, f, draft) {
  const open = game.data.CROPS.filter((c) => c.unlockLevel <= game.state.level && c.id !== draft.cropId);
  return h('select', { 'aria-label': 'Rotasi dengan', onchange: (e) => { draft.rotateCropId = e.target.value || null; pickedRot.add(draft); } },
    h('option', { value: '', selected: !draft.rotateCropId }, '— tanpa rotasi —'),
    open.map((c) => h('option', { value: c.id, selected: c.id === draft.rotateCropId },
      `${c.emoji} ${c.name} ${phFits(f, c) ? '✅' : '⚠️ pH'}`)));
}

/** Owns an implement for the lime task (F6), so the plan may lime before fertilizing. */
const ownsLime = (game) => (game.availableMachinesFor?.('lime')?.implements?.length ?? 0) > 0;

/** The "🔁 Rencana" section; null when the engine has no plan support. */
export function planSection(game, f, draft, rerender) {
  if (!plansSupported(game)) return null;
  const pausedIds = () => Object.entries(game.state.fields).filter(([, x]) => x.plan?.paused).map(([id]) => id);
  const save = () => {
    const before = new Set(pausedIds());
    const r = game.setFieldPlan(f.id, { ...draft });
    const fresh = r.ok ? pausedIds().filter((id) => !before.has(id) || id === f.id) : [];
    const names = fresh.map((id) => (id === f.id ? 'ladang ini' : game.data.FIELDS.find((x) => x.id === id)?.name ?? id));
    act(r, fresh.length ? `🔁 Rencana disimpan · ⏸ ${names.join(', ')} dijeda: ${game.state.fields[fresh[0]].plan.blocked}.` : '🔁 Rencana disimpan.');
  };
  const clear = () => act(game.setFieldPlan(f.id, null), 'Rencana dihapus.');
  const next = nextStepText(f);
  const tree = allCrops(game).find((c) => c.id === draft.cropId)?.perennial;
  return fold('fm-plan', '🔁 Rencana otomatis', { open: !!f.plan, meta: f.plan ? (f.plan.paused ? '⏸ Butuh Mandor' : f.plan.blocked ? '⏸ Tertahan' : '✅ Aktif') : 'Mati', cls: 'plan-section' },
    h('p.small.muted', tree
      ? 'Kebun buah dikerjakan otomatis: bajak → tanam bibit → pupuk/airi tiap siklus → petik, jika pekerja dan uang cukup.'
      : 'Ladang dikerjakan otomatis: bajak → pupuk → tanam → airi → panen, jika mesin, pekerja dan uang cukup.'),
    f.plan?.paused ? pausedPlanBox(game, f) : f.plan?.blocked ? h('p.small.plan-blocked', `⏸ ${blockedText(f.plan.blocked)}`) : null,
    next && f.plan ? h('p.small', next) : null,
    h('div.field-group', h('label', 'Tanaman'), cropSelect(game, f, draft, rerender)),
    tree ? h('p.small.muted', '🌳 Pohon tetap tumbuh setelah dipetik, jadi tidak ada rotasi.')
      : h('div.field-group', h('label', '🔄 Rotasi dengan'), rotateSelect(game, f, draft),
        h('div.small.muted', 'Bergantian tiap musim tanam agar terhindar dari penalti tanam berulang (−10%).')),
    h('div.plan-toggles',
      ownsLime(game) ? toggle(draft, 'lime', '🪨 Kapur') : null,
      toggle(draft, 'fertilize', '🧪 Pupuk'),
      toggle(draft, 'irrigate', '💧 Airi'),
      toggle(draft, 'rent', tree ? '🧺 Sewa pemetik' : '🤝 Sewa pemanen'),
      toggle(draft, 'sell', '💰 Jual otomatis saat panen'),
      toggle(draft, 'repeat', '🔁 Ulangi')),
    h('div.row.plan-buttons',
      f.plan ? h('button.btn.btn-secondary.btn-small', { type: 'button', onclick: clear }, 'Hapus rencana') : null,
      h('button.btn.btn-primary.btn-small', { type: 'button', onclick: save }, f.plan ? 'Simpan perubahan' : 'Aktifkan rencana')));
}
