// "⚡ Kerjakan sekaligus" (batch) bar (U3/F1): one tap starts a task on every field that can take it.
import { h, mount, fmtMoney, TASK_ICON, TASK_LABEL, TASK_ING } from './dom.js';
import { openModal, closeModal, toast } from './modal.js';
import { app } from './app.js';
import { cropPicker, bestCropId } from './cropPicker.js';

const ORDER = ['harvest', 'plow', 'lime', 'fertilize', 'seed', 'irrigate', 'prune'];

export const batchSupported = (game) => typeof game.startTaskAll === 'function';

function summarize(game, task, r) {
  if (!r) return toast('Aksi gagal.', 'error');
  const started = r.started || [];
  const skipped = r.skipped || [];
  if (!started.length) {
    const why = skipped[0]?.reason || r.reason || 'Tidak ada ladang yang bisa dikerjakan.';
    return toast(`${TASK_ICON[task]} ${TASK_LABEL[task]} semua gagal: ${why}`, 'error');
  }
  const cost = started.reduce((s, x) => s + (Number(x.cost) || 0), 0);
  let msg = `${TASK_ICON[task]} ${TASK_ING[task]} dimulai di ${started.length} ladang${cost > 0 ? ` (${fmtMoney(cost)})` : ''}.`;
  if (skipped.length) {
    const reasons = [...new Set(skipped.map((s) => s.reason?.replace(/\.+$/, '')).filter(Boolean))].slice(0, 2).join('; ');
    msg += ` ${skipped.length} dilewati${reasons ? `: ${reasons}` : ''}.`;
  }
  toast(msg, skipped.length ? '' : 'success');
}

function run(task, opts) {
  const game = app.game;
  let r;
  try { r = game.startTaskAll(task, opts); } catch (e) { r = { ok: false, reason: e?.message }; }
  summarize(game, task, r);
  app.requestRender();
  return r;
}

function openSeedAll(fields) {
  const game = app.game;
  const sel = { cropId: bestCropId(game, fields) };
  openModal({
    title: `${TASK_ICON.seed} Tanam semua (${fields.length} ladang)`,
    render: (body, m) => {
      mount(body,
        h('p.small.muted', fields.map((f) => f.name).join(' · ')),
        cropPicker(game, sel, fields, () => m.rerender(), `Tanaman untuk ${fields.length} ladang`));
    },
    actions: (m) => [
      h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Batal'),
      h('button.btn.btn-primary', { disabled: !sel.cropId, onclick: () => {
        const r = run('seed', { cropId: sel.cropId });
        if (r?.started?.length) closeModal(m);
      } }, 'Tanam semua'),
    ],
  });
}

/** Bar node for the owned field views, or null when no task applies to 2+ fields. */
export function batchBar(owned) {
  const game = app.game;
  if (!batchSupported(game)) return null;
  const by = Object.fromEntries(ORDER.map((t) => [t, owned.filter((f) => (f.actions || []).includes(t))]));
  // F9: every task except rented harvest needs a free worker.
  const ws = game.workersView?.() ?? null;
  const free = ws ? ws.filter((w) => !w.busy).length : Infinity;
  const buttons = ORDER.filter((t) => by[t].length >= 2).map((t) => {
    const n = by[t].length;
    // Orchards in a harvest batch are picked by own tree shakers, else rented pickers (sewa_pemetik).
    const trees = t === 'harvest' ? by[t].filter((f) => f.orchard).length : 0;
    const label = `${TASK_ICON[t]} ${TASK_LABEL[t]} ×${n}${trees ? ` (🌳 ${trees})` : ''}${t === 'seed' ? '…' : ''}`;
    const noWorker = t !== 'harvest' && free === 0;
    const onclick = t === 'seed' ? () => openSeedAll(by.seed)
      : () => run(t, t === 'harvest' ? { rent: true } : {});
    return h(`button.btn.btn-small.${t === 'harvest' ? 'btn-primary' : 'btn-secondary'}`,
      { type: 'button', onclick, disabled: noWorker, title: noWorker ? 'Tidak ada pekerja bebas.' : `${TASK_LABEL[t]} semua (${n} ladang)` }, label);
  });
  if (!buttons.length) return null;
  return h('div.batch-bar',
    h('div.batch-head', h('span.batch-title', '⚡ Kerjakan sekaligus'), ws ? h('span.small.muted', `👷 ${free}/${ws.length} pekerja bebas`) : null),
    h('div.batch-buttons', buttons));
}
