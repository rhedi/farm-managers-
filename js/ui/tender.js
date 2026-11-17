// v18 🚢 Tender Ekspor card (top of Pasar › 📋 Kontrak): offer with accept/decline, the running tender with delivered
// + on-the-road progress, auto-send toggle, "kirim truk sekarang", port bonus and history. A ship sails over the waves.
import { h, fmtMoney, fmtNum, fmtPrice } from './dom.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';
import { sfx } from './sfx.js';
import { confetti, truckDepart } from './fx.js';

const sea = (dest) => h('div.td-sea', { 'aria-hidden': 'true' },
  h('span.td-wave.w1'), h('span.td-wave.w2'), h('span.td-ship', '🚢'), h('span.td-dest', dest));

function kv(rows) {
  return h('div.kv.td-kv', rows.filter(Boolean).flatMap(([k, v]) => [h('span', k), h('span.num', v)]));
}

function offerCard(o) {
  return h('div.card.tender-card.offer',
    sea(o.destEmoji),
    h('div.td-title', `🚢 Tender Ekspor ke ${o.destName}`),
    h('div.td-sub', `${o.emoji} ${fmtNum(o.qty)} t ${o.name} · ${o.days} hari · lewat ${o.cityEmoji} ${o.cityName} (${fmtNum(o.km)} km)`),
    kv([
      ['Harga / t (dibayar saat tiba)', fmtPrice(o.price)],
      ['Nilai kiriman', fmtMoney(o.value)],
      ['Bonus selesai', `+${fmtMoney(o.bonus)} · +${o.rp} 🔬`],
      ['Piala', `${o.destEmoji} ${o.trophy}${o.won ? ` (punya ×${o.won})` : ' — baru!'}`],
      ['Perlu / hari', `${fmtNum(o.perDayNeeded)} t · armada ${fmtNum(o.fleetPerDay)} t/hari (${o.trucks} truk)`],
      o.portStage ? ['⚓ Pelabuhan Ekspor', `memuat ${fmtNum(o.portLoadPerDay)} t/malam`] : null,
      ['Denda bila gagal', `${Math.round(app.game.data.BALANCE.tenders?.penaltyRate * 100)}% sisa (±${fmtMoney(o.penalty)})`],
    ]),
    h('div.card-actions',
      h('span.small.muted', `tawaran berlaku ${o.daysLeft > 0 ? `${o.daysLeft} hari` : 'sampai malam ini'}`),
      h('span.spacer'),
      h('button.btn.btn-small.btn-secondary', { type: 'button', onclick: () => act(app.game.declineTender(), 'Tawaran tender ditolak.') }, 'Tolak'),
      h('button.btn.btn-small.btn-primary', {
        type: 'button',
        onclick: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const r = act(app.game.acceptTender(), `🚢 Tender diterima! Kirim ${fmtNum(o.qty)} t dalam ${o.days} hari.`);
          if (r?.ok) { sfx('achievement'); confetti(rect.left + rect.width / 2, rect.top, 30); }
        },
      }, 'Terima tender')));
}

function activeCard(a, auto) {
  const urgent = a.daysLeft <= 3 && a.progress < 0.9;
  const behind = a.perDayNeeded > a.fleetPerDay + a.portLoadPerDay;
  return h(`div.card.tender-card.active${urgent ? '.urgent' : ''}`,
    sea(a.destEmoji),
    h('div.td-title', `🚢 ${a.destName}: ${a.emoji} ${a.name}`, h(`span.badge${urgent ? '.badge-red' : '.badge-blue'}`, a.daysLeft >= 0 ? `sisa ${a.daysLeft} hari` : 'batas hari ini')),
    h('div.td-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(a.progress * 100)) },
      h('i.td-transit', { style: { width: `${a.transitFrac * 100}%` } }), h('i.td-done', { style: { width: `${a.progress * 100}%` } })),
    h('div.small.td-nums', h('b', `${fmtNum(a.delivered)} / ${fmtNum(a.qty)} t`), ` terkirim · 🚚 ${fmtNum(a.inTransit)} t di jalan (${a.onRoad} truk)`),
    kv([
      ['Stok di silo', `${fmtNum(a.stock)} t`],
      ['Perlu / hari', `${fmtNum(a.perDayNeeded)} t${behind ? ' ⚠️' : ''} · armada ${fmtNum(a.fleetPerDay)} t/hari`],
      a.portStage ? ['⚓ Pelabuhan Ekspor', `+${fmtNum(a.portLoadPerDay)} t tiap malam`] : null,
      ['Sudah dibayar', fmtMoney(a.paid)],
      ['Bonus selesai', `+${fmtMoney(a.bonus)} · +${a.rp} 🔬 · ${a.destEmoji}`],
    ]),
    behind ? h('p.small.yf-hint', '⚠️ Armada belum cukup cepat. Tambah truk, bangun ⚓ Pelabuhan Ekspor, atau tanam lebih banyak.') : null,
    h('div.card-actions',
      h('label.td-auto', h('input', { type: 'checkbox', checked: auto, onchange: (e) => act(app.game.setTenderAuto(e.target.checked), e.target.checked ? '🤖 Truk bebas dikirim otomatis.' : 'Kirim otomatis dimatikan.') }),
        h('span', 'Kirim otomatis')),
      h('span.spacer'),
      h('button.btn.btn-small.btn-primary', {
        type: 'button', disabled: !(a.idleTrucks > 0 && a.toSend > 0 && a.stock > 0),
        title: a.idleTrucks > 0 ? null : 'Semua truk sedang di jalan',
        onclick: () => { const r = act(app.game.shipTender(), (x) => `🚚 ${x.trips} truk berangkat (${fmtNum(x.tons)} t).`); if (r?.ok) truckDepart('🚢'); },
      }, `🚚 Kirim truk (${a.idleTrucks})`)));
}

function historyFold(v) {
  if (!v.history.length) return null;
  return fold('tender-history', '🗂️ Riwayat tender', { meta: `${v.done} ✅ · ${v.failed} ❌` },
    h('div.eco-closed', v.history.map((x) => h(`div.small.${x.status === 'done' ? 'pos' : 'neg'}`,
      `${x.status === 'done' ? '🏆' : '❌'} ${x.destEmoji} ${x.destName}: ${fmtNum(x.delivered)}/${fmtNum(x.qty)} t ${x.name} · hari ${x.day}`
      + (x.status === 'done' ? ` · ${fmtMoney(x.paid)}` : ` · denda ${fmtMoney(x.penalty)}`)))));
}

/** Section for the Kontrak sub-tab (null when the game lacks tenders). */
export function tenderSection(game) {
  const v = game.tenderView?.();
  if (!v) return null;
  let body;
  if (!v.unlocked && !v.active && !v.offer) {
    body = h('div.card.tender-card.locked', sea('🔒'), h('div.td-title', '🚢 Tender Ekspor'),
      h('p.small.muted', `Terbuka di level ${v.unlockLevel}: kirim ribuan ton ke pelabuhan dunia dalam 30 hari untuk piala, poin riset dan kosmetik.`));
  } else if (v.active) body = activeCard(v.active, v.auto);
  else if (v.offer) body = offerCard(v.offer);
  else {
    body = h('div.card.tender-card.idle', sea('⏳'), h('div.td-title', '🚢 Tender Ekspor'),
      h('p.small.muted', v.daysToNext != null ? `Tawaran berikutnya ±${v.daysToNext} hari lagi. Siapkan truk dan silo.` : 'Tawaran pertama segera datang.'));
  }
  return h('section.section.tender-section',
    h('div.section-title', '🚢 Tender Ekspor', h('span.small.muted', `🏆 ${v.trophies.filter((t) => t.count).length}/${v.trophies.length} piala`)),
    body, historyFold(v));
}

export function tenderSig(game) {
  const v = game.tenderView?.();
  if (!v) return '';
  const a = v.active;
  return `${v.unlocked}|${v.offer?.id ?? ''}|${a ? `${a.id}:${Math.round(a.delivered)}:${Math.round(a.inTransit)}:${a.idleTrucks}:${a.daysLeft}:${Math.round(a.stock)}` : ''}|${v.auto}|${v.done}|${v.failed}|${v.daysToNext}`;
}
