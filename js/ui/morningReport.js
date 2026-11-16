// "☀️ Laporan Pagi": shown when the player comes back after ≥ MIN_AWAY_S real seconds. Built by the engine from
// before/after snapshots (game.catchUpReport → js/engine/report.js). Numbers count up; the Kalender Panen reward
// can be claimed right here. Waits until any other modal (e.g. level-up) is closed.
import { h, fmtMoney, fmtNum, fmtHours } from './dom.js';
import { openModal, isModalOpen } from './modal.js';
import { app } from './app.js';
import { calendarCard, calendarNow } from './calendar.js';
import { sfx } from './sfx.js';

export const MIN_AWAY_S = 10 * 60;
const COUNT_MS = 1100;

/** Rows worth showing: [icon, label, value, kind ('money' | 'num' | 'text'), tone]. */
function rows(r) {
  const out = [];
  const add = (cond, ...row) => { if (cond) out.push(row); };
  add(r.harvestTons > 0, '🌾', `Panen (${fmtNum(r.harvests)}×)`, r.harvestTons, 't', '');
  add(r.sales > 0, '💰', 'Penjualan', r.sales, 'money', 'pos');
  add(r.animalOutput > 0, '🐄', 'Produk ternak & ikan', r.animalOutput, 'money', 'pos');
  add(r.contractsDone > 0, '📋', 'Kontrak selesai', r.contractsDone, 'num', 'pos');
  add(r.contractsFailed > 0, '❌', 'Kontrak gagal', r.contractsFailed, 'num', 'neg');
  add(r.overflowLost > 0, '🏚️', 'Rugi gudang penuh', r.overflowLost, 'money', 'neg');
  add(r.wages > 0, '👷', 'Gaji', r.wages, 'money', 'neg');
  add(r.feed > 0, '🛒', 'Pakan otomatis', r.feed, 'money', 'neg');
  add(r.levelTo > r.levelFrom, '⭐', 'Naik level', `Lv ${r.levelFrom} → ${r.levelTo}`, 'text', 'pos');
  return out;
}

const fmt = (v, kind) => (kind === 'money' ? fmtMoney(v) : kind === 't' ? `${fmtNum(v, 1)} t` : kind === 'num' ? fmtNum(v) : v);

/** Count every [data-to] number from 0 to its value (ease-out). */
function countUp(root) {
  const els = [...root.querySelectorAll('[data-to]')];
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / COUNT_MS), e = 1 - (1 - k) ** 3;
    for (const el of els) {
      const to = Number(el.dataset.to);
      el.textContent = (el.dataset.sign === '1' && to > 0 ? '+' : '') + fmt(to * e, el.dataset.kind);
    }
    if (k < 1 && root.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function body(r) {
  const list = rows(r);
  const net = r.netWorthChange;
  return [
    h('p.mr-intro', `Kamu pergi ${fmtHours(r.hours)} waktu game (hari ${r.fromDay} → ${r.toDay}).`
      + (r.coarseDays > 0 ? ` ${fmtHours(r.exactHours)} pertama dihitung penuh, ${r.coarseDays} hari berikutnya dalam 🌙 mode hemat (50%).` : '')),
    h(`div.mr-hero.${net >= 0 ? 'pos' : 'neg'}`, h('span.small', 'Kekayaan bersih'),
      h('b.mr-hero-num', { dataset: { to: String(net), kind: 'money', sign: '1' } }, '$0')),
    list.length ? h('div.mr-list', list.map(([icon, label, v, kind, tone], i) => h(`div.mr-row.${tone}`, { style: { animationDelay: `${120 + i * 70}ms` } },
      h('span.mr-icon', icon), h('span.mr-label', label),
      kind === 'text' ? h('b.mr-val', v) : h('b.mr-val', { dataset: { to: String(v), kind } }, fmt(0, kind)))))
      : h('p.small.muted', 'Tidak banyak yang terjadi. Pasang 🔁 rencana ladang dan manajer agar pertanian tetap jalan saat kamu pergi.'),
    calendarNow().canClaim ? calendarCard(app.game, { compact: true }) : null,
  ];
}

/** Open the report (after other modals close). */
export function showMorningReport(r) {
  if (!r || !(r.hours > 0)) return;
  if (isModalOpen()) { setTimeout(() => showMorningReport(r), 600); return; }
  openModal({
    title: '☀️ Laporan Pagi',
    render: (el) => { el.classList.add('morning-report'); el.replaceChildren(...body(r).flat().filter(Boolean)); countUp(el); },
    actions: (m) => [h('button.btn.btn-primary.btn-block.mr-start', { type: 'button', onclick: () => m.close() }, '🌅 Mulai hari ini')],
  });
  sfx('coin');
}
