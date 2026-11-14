// Garasi: per-machine upgrade modal — Mesin / Transmisi / Efisiensi (levels 0–3) and a free paint colour.
import { h, mount, fmtMoney, fmtNum } from './dom.js';
import { openModal } from './modal.js';
import { app, act } from './app.js';

const TRACK_ICON = { engine: '⚙️', transmission: '🔩', efficiency: '⛽' };
const TRACK_EFFECT = {
  tractor: { engine: '+15% tenaga (HP) per level — bisa menarik alat lebih besar', transmission: '+10% kecepatan kerja per level',
    efficiency: '−10% BBM per level' },
  harvester: { engine: '+10% ha/jam per level', transmission: '+10% ha/jam per level', efficiency: '−10% BBM per level' },
  implement: { transmission: '+10% ha/jam per level' },
};

const fmtStat = (t, v) => (t.stat === 'speed' ? `×${fmtNum(v, 2)}` : t.stat === 'hp' ? `${fmtNum(v)} HP`
  : t.stat === 'fuelPerHour' ? `${fmtNum(v, 1)} L/jam` : `${fmtNum(v, 2)} ha/jam`);

function pips(level, max) {
  return h('span.upg-pips', { 'aria-label': `Level ${level} dari ${max}` },
    Array.from({ length: max }, (_, i) => h(`span.upg-pip${i < level ? '.on' : ''}`)));
}

function trackRow(info, t) {
  const effect = TRACK_EFFECT[info.type]?.[t.id];
  if (!t.applies) {
    return h('div.upg-track.upg-na',
      h('div.upg-track-head', h('span.upg-name', `${TRACK_ICON[t.id]} ${t.name}`), pips(0, t.max)),
      h('div.small.muted', 'Tidak berlaku untuk alat ini.'));
  }
  const max = t.level >= t.max;
  return h(`div.upg-track${max ? '.upg-max' : ''}`,
    h('div.upg-track-head', h('span.upg-name', `${TRACK_ICON[t.id]} ${t.name}`), pips(t.level, t.max),
      h('span.small.muted', `Lv ${t.level}/${t.max}`)),
    effect ? h('div.small.muted', effect) : null,
    h('div.upg-stat', max ? h('b', fmtStat(t, t.current))
      : [h('span', fmtStat(t, t.current)), h('span.upg-arrow', ' → '), h('b.pos', fmtStat(t, t.next))]),
    max ? h('div.small.upg-done', '✅ Level maksimal')
      : h('div.upg-buy',
        h('button.btn.btn-small.btn-primary.upg-btn', { disabled: !!t.reason, dataset: { track: t.id },
          onclick: () => act(app.game.upgradeMachine(info.uid, t.id), (r) => `🔧 ${info.name}: ${t.name} level ${r.level} (${fmtMoney(r.cost)}).`),
        }, `Upgrade ${fmtMoney(t.cost)}`),
        t.reason ? null : h('span.small.muted', `syarat level ${t.reqLevel} ✓`)),
    !max && t.reason ? h('div.small.upg-reason', `⚠️ ${t.reason}`) : null);
}

function paintRow(info) {
  if (!info.paints?.length) return null;
  const pick = (c) => act(app.game.paintMachine(info.uid, c), c ? '🎨 Warna diganti.' : '🎨 Warna pabrik.');
  return h('div.upg-paint',
    h('div.small', '🎨 Cat (gratis)'),
    h('div.upg-swatches',
      h(`button.upg-swatch.upg-swatch-none${info.paint ? '' : '.selected'}`, { type: 'button', 'aria-label': 'Warna pabrik',
        onclick: () => pick(null) }, '✕'),
      info.paints.map((c) => h(`button.upg-swatch${info.paint === c ? '.selected' : ''}`,
        { type: 'button', 'aria-label': `Warna ${c}`, style: { background: c }, onclick: () => pick(c) }))));
}

function render(body, uid) {
  const info = app.game.machineUpgradeInfo(uid);
  if (!info) return mount(body, h('p', 'Mesin tidak ditemukan.'));
  mount(body,
    info.busy ? h('div.small.upg-reason', '⏳ Mesin sedang dipakai — upgrade setelah tugas selesai.') : null,
    h('div.upg-tracks', info.tracks.map((t) => trackRow(info, t))),
    h('div.upg-summary.small',
      h('div', `Total biaya upgrade: ${fmtMoney(info.spent)}`),
      h('div', `Nilai jual sekarang: ${fmtMoney(info.resaleValue)} (termasuk 50% biaya upgrade × kondisi)`)),
    paintRow(info));
}

export function openUpgradeModal(uid) {
  const name = app.game.machineUpgradeInfo(uid)?.name ?? 'Mesin';
  let last = '';
  const sig = () => { const i = app.game.machineUpgradeInfo(uid); return i ? `${i.busy}|${i.tracks.map((t) => t.reason).join()}` : ''; };
  openModal({
    title: `🔧 Upgrade — ${name}`,
    render: (body) => { last = sig(); render(body, uid); },
    refresh: (m) => { if (sig() !== last) m.rerender(); },
  });
}
