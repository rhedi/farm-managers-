// Task dialog: pick crop / machines (or rent), see estimate, confirm.
import { h, mount, fmtMoney, fmtNum, fmtHours, fmtTons, fmtPct, TASK_ING, TASK_ICON } from './dom.js';
import { openModal, closeModal, toast } from './modal.js';
import { app, act } from './app.js';
import { cropPicker, bestCropId } from './cropPicker.js';

function choice(selected, disabled, onclick, ...children) {
  return h(`button.choice${selected ? '.selected' : ''}`, { type: 'button', disabled, onclick }, ...children);
}

const MATERIAL_LABEL = { seed: 'Benih', fertilize: 'Pupuk', irrigate: 'Air', lime: 'Kapur' };

/** Machine option; stats come from availableMachinesFor and already include upgrades (🔧 +N badge). */
function machineChoice(m, selected, onPick, extra = '') {
  const cond = typeof m.condition === 'number' && m.condition < 0.995 ? ` · kondisi ${fmtPct(m.condition)}` : '';
  return choice(selected, m.busy, onPick,
    h('span.card-icon', m.type === 'harvester' ? '🌾' : m.type === 'tractor' ? '🚜' : '🔧'),
    h('div', h('div.card-title', m.paint ? h('span.upg-dot', { style: { background: m.paint }, 'aria-hidden': 'true' }) : null, m.name, m.upgradeLevel ? h('span.badge.upg-badge', `🔧 +${m.upgradeLevel}`) : null),
      h('div.card-sub', m.busy ? 'Sedang dipakai' : `${extra}${cond}`)));
}

/** Who does the job and how worn the chosen machines are (F9/F10). */
function opsNotes(game, est) {
  const rows = [], warns = [];
  if (est.workerName) {
    const w = game.workersView?.().find((x) => x.id === est.workerId);
    rows.push(['Pekerja', w ? `${est.workerName} (${fmtPct(w.speedup)} lebih cepat)` : est.workerName]);
  } else if (est.rentCost) rows.push(['Pekerja', 'Sopir sewaan']);
  const ms = game.machinesView().filter((m) => est.machineUids?.includes(m.uid) && typeof m.condition === 'number');
  for (const m of ms) {
    if (m.condition < 0.2) warns.push(`🔧 ${m.name} sangat aus (${fmtPct(m.condition)}): lebih lambat dan bisa mogok. Perbaiki di Garasi.`);
    else if (m.condition < 0.5) warns.push(`🐢 ${m.name} aus (${fmtPct(m.condition)}): tugas 20% lebih lambat.`);
  }
  return { rows, warns };
}

function rigPicker(game, task, sel, rerender) {
  const av = game.availableMachinesFor(task);
  if (task === 'harvest') {
    const auto = !sel.rent && !sel.harvesterId;
    return h('div.field-group', h('label', 'Mesin pemanen'),
      h('div.choice-list',
        av.harvesters.map((m) => machineChoice(m, !sel.rent && sel.harvesterId === m.uid,
          () => { sel.rent = false; sel.harvesterId = m.uid; rerender(); }, `${fmtNum(m.haPerHour, 1)} ha/jam`)),
        av.harvesters.length ? choice(auto, false, () => { sel.rent = false; sel.harvesterId = null; rerender(); },
          h('span.card-icon', '✨'), h('div', h('div.card-title', 'Otomatis'), h('div.card-sub', 'Pemanen tercepat yang bebas'))) : null,
        choice(sel.rent, false, () => { sel.rent = true; sel.harvesterId = null; rerender(); },
          h('span.card-icon', '🤝'), h('div', h('div.card-title', 'Sewa pemanen'),
            h('div.card-sub', `${fmtMoney(av.rentPerHa)}/ha · ${fmtNum(av.rentHaPerHour, 1)} ha/jam · tanpa BBM`)))));
  }
  const group = (label, list, key, extra) => h('div.field-group', h('label', label),
    list.length ? h('div.choice-list',
      choice(!sel[key], false, () => { sel[key] = null; rerender(); },
        h('span.card-icon', '✨'), h('div', h('div.card-title', 'Otomatis'), h('div.card-sub', 'Pilih yang tercepat dan bebas'))),
      list.map((m) => machineChoice(m, sel[key] === m.uid, () => { sel[key] = m.uid; rerender(); }, extra(m))))
      : h('div.muted.small', 'Tidak ada — beli di Garasi.'));
  return [
    group('Traktor', av.tractors, 'tractorId', (m) => `${m.hp} HP · kecepatan ×${fmtNum(m.speed, 2)} · BBM ${fmtNum(m.fuelPerHour, 1)} L/jam`),
    group('Alat', av.implements, 'implementId', (m) => `${fmtNum(m.haPerHour, 1)} ha/jam · butuh ${m.hpRequired} HP`),
  ];
}

function optsOf(sel) {
  const o = {};
  for (const k of ['cropId', 'tractorId', 'implementId', 'harvesterId']) if (sel[k]) o[k] = sel[k];
  if (sel.rent) o.rent = true;
  return o;
}

function estimatePanel(game, fieldId, task, sel) {
  const est = game.estimateTask(fieldId, task, optsOf(sel));
  const rows = [];
  if (est.hours > 0 && est.cost != null) {
    rows.push(['Durasi', fmtHours(est.hours)]);
    if (est.fuelCost) rows.push(['BBM', fmtMoney(est.fuelCost)]);
    if (est.materialCost) rows.push([MATERIAL_LABEL[task] ?? 'Bahan', fmtMoney(est.materialCost)]);
    if (est.rentCost) rows.push(['Sewa', fmtMoney(est.rentCost)]);
    rows.push([est.payOnCompletion ? 'Total biaya (dibayar saat selesai)' : 'Total biaya', fmtMoney(est.cost)]);
  }
  if (task === 'seed' && sel.cropId) {
    const crop = game.data.CROPS.find((c) => c.id === sel.cropId);
    if (crop) rows.push(['Masa tumbuh', `${crop.growDays} hari`]);
  }
  if (task === 'harvest') {
    const fv = game.getFieldView(fieldId);
    if (fv?.predictedYield) rows.push(['Perkiraan hasil', `±${fmtTons(fv.predictedYield)}`]);
  }
  const ops = opsNotes(game, est);
  rows.push(...ops.rows);
  return {
    est,
    node: h('div', h('div.section-title', 'Perkiraan'),
      rows.length ? h('div.kv', rows.flatMap(([k, v]) => [h('span', k), h('span.num', v)])) : null,
      ops.warns.map((w) => h('p.small.ops-bad', w)),
      !est.ok ? h('p.neg.small', `⚠️ ${est.reason}`) : null),
  };
}

export function openTaskModal(fieldId, task) {
  const game = app.game;
  const field = game.getFieldView(fieldId);
  if (!field) return;
  const sel = { cropId: null, tractorId: null, implementId: null, harvesterId: null, rent: false };
  if (task === 'seed') sel.cropId = bestCropId(game, [field]);
  if (task === 'harvest') sel.rent = !game.availableMachinesFor('harvest').harvesters.some((m) => !m.busy);
  let estBox = null;
  let confirmBtn = null;

  const updateEstimate = () => {
    if (!estBox) return;
    const { est, node } = estimatePanel(game, fieldId, task, sel);
    mount(estBox, node);
    if (confirmBtn) confirmBtn.disabled = !est.ok;
  };

  openModal({
    title: `${TASK_ICON[task]} ${TASK_ING[task]} — ${field.name}`,
    render: (body, m) => {
      const rerender = () => m.rerender();
      estBox = h('div');
      mount(body,
        h('p.muted.small', `${field.sizeHa} ha · ${field.region}`),
        task === 'seed' ? cropPicker(game, sel, field, rerender) : null,
        rigPicker(game, task, sel, rerender),
        estBox);
    },
    actions: (m) => {
      confirmBtn = h('button.btn.btn-primary', { onclick: () => {
        const r = game.startTask(fieldId, task, optsOf(sel));
        if (r.ok) { closeModal(m); act(r, `${TASK_ING[task]} dimulai (${fmtHours(r.hours)}${r.cost > 0 ? `, ${fmtMoney(r.cost)}` : ''}).`); }
        else toast(r.reason, 'error');
      } }, 'Mulai');
      queueMicrotask(updateEstimate);
      return [h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Batal'), confirmBtn];
    },
    refresh: updateEstimate,
  });
  updateEstimate();
}
