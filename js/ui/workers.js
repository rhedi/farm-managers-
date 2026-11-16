// Workers section (F9), rendered inside the Garasi tab: staff (busy/free, skill, wage, fire) + weekly candidates.
import { h, fmtMoney, fmtPct, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { managerItem, dispatcherSig } from './dispatcher.js';
import { factoryManagerItem, factoryManagerSig } from './factoryManager.js';

const stars = (skill) => { const n = Math.max(1, Math.round(skill * 5)); return '★'.repeat(n) + '☆'.repeat(5 - n); };
const fieldName = (id) => app.game.data.FIELDS.find((f) => f.id === id)?.name ?? id;

/** Changes whenever the workers section would render differently. */
export function workersSig(game) {
  if (!game.workersView) return '';
  return `|W${game.workersView().map((w) => `${w.id}:${w.busy}:${w.skill}`).join(',')}`
    + `|C${game.workerCandidates().map((c) => c.id).join(',')}|${dispatcherSig(game)}|${factoryManagerSig(game)}`;
}

async function fireFlow(w) {
  const ok = await confirmModal({
    title: `Berhentikan ${w.name}?`,
    message: `${w.name} (${stars(w.skill)}) tidak lagi digaji ${fmtMoney(w.wage)}/hari. Pengalamannya hilang.`,
    confirmLabel: 'Berhentikan', danger: true,
  });
  if (ok) act(app.game.fireWorker(w.id), `${w.name} diberhentikan.`);
}

function workerItem(w, onlyOne) {
  return h('div.list-item.ops-machine',
    h('div.card-icon', w.busy ? '👷' : '🧑‍🌾'),
    h('div.ops-body',
      h('div.card-title', w.name, ' ', h('span.ops-stars', stars(w.skill))),
      h('div.card-sub', `Keahlian ${fmtPct(w.skill)} · tugas ${fmtPct(0.2 * w.skill)} lebih cepat · ${fmtMoney(w.wage)}/hari`),
      h('div.ops-cond', progressBar(w.skill, 'thin.gold')),
      h('div.ops-actions',
        w.busy
          ? h('span.badge.badge-blue', { title: fieldName(w.busy) }, `Bekerja: ${fieldName(w.busy)}`)
          : [h('span.badge.badge-green', 'Bebas'),
            h('button.btn.btn-small.btn-danger', { disabled: onlyOne, title: onlyOne ? 'Pekerja terakhir' : null,
              onclick: () => fireFlow(w) }, 'Berhentikan')])));
}

function candidateItem(c) {
  return h('div.list-item.ops-candidate',
    h('div.card-icon', '🙋'),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div.card-title', c.name, ' ', h('span.ops-stars', stars(c.skill))),
      h('div.card-sub', `Keahlian ${fmtPct(c.skill)} · gaji ${fmtMoney(c.wage)}/hari`)),
    h('button.btn.btn-small.btn-primary', {
      onclick: () => act(app.game.hireWorker(c.id), `${c.name} direkrut!`),
    }, 'Rekrut'));
}

export function workersSection(game) {
  if (!game.workersView) return null;
  const ws = game.workersView();
  const cs = game.workerCandidates();
  const mgr = game.dispatcherView?.().hired, fm = game.factoryManagerView?.().hired;
  const wages = ws.reduce((s, w) => s + w.wage, 0) + (mgr?.wage ?? 0) + (fm?.wage ?? 0);
  const free = ws.filter((w) => !w.busy).length;
  return h('section.section',
    h('div.section-title', '👷 Pekerja', h('span.spacer'),
      h('span.small.muted', `${free}/${ws.length} bebas · gaji ${fmtMoney(wages)}/hari`)),
    h('div.small.muted.ops-hint', 'Setiap tugas ladang butuh satu pekerja bebas (pemanen sewaan sudah termasuk sopir). Gaji dibayar tiap pergantian hari.'),
    h('div.list', ws.map((w) => workerItem(w, ws.length <= 1))),
    h('div.section-title.ops-sub', '🧑‍💼 Manajer Logistik'),
    h('div.list', managerItem(game)),
    h('div.section-title.ops-sub', '🏭 Manajer Pabrik'),
    h('div.list', factoryManagerItem(game)),
    h('div.section-title.ops-sub', '📋 Calon pekerja'),
    h('div.small.muted.ops-hint', 'Calon berganti tiap minggu. Merekrut gratis.'),
    cs.length ? h('div.list', cs.map(candidateItem)) : h('div.empty', 'Tidak ada calon minggu ini.'));
}
