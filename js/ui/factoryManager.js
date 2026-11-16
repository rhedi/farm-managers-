// 🏭 Manajer Pabrik (Gudang › 🏭 Olahan, above the factory cards; summary in Garasi › Pekerja): hire a tier, aktif/jeda,
// which factories it runs, last pass + next pass, recent batches, 🔄 ganti / promosikan, settings. Mirrors the
// Manajer Logistik card (js/ui/dispatcher.js). Engine: game.factoryManagerView / hire / replace / fire / setOn / setSettings.
import { h, fmtMoney, fmtNum, fmtHours, fmtClock } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { goTo } from './subtabs.js';
import { stars } from './dispatcher.js';
import { tierLine, candidateItem, swapFold, factoryRows, settingsFold } from './factoryManagerParts.js';
import { factoryBlockBox } from './factoryBlock.js';

let lastRecent; // newest run already shown (the newest row slides in once)
let lastTier; // hired tier last rendered (a new one pops in once after Ganti / promosikan)

/** Changes whenever the card would render differently. */
export function factoryManagerSig(game) {
  if (!game.factoryManagerView) return '';
  const d = game.state.factoryManager;
  return `FM${d.hired?.tierId}|${d.on}|${d.note}|${d.stats.runs}|${d.lastPass}|${JSON.stringify(d.settings)}|${JSON.stringify(d.waits)}|`
    + `${game.state.level}|${Math.floor(game.state.money / 500)}|${Math.floor(game.state.time)}`;
}

async function fireFlow(v) {
  const ok = await confirmModal({
    title: `Berhentikan ${v.hired.name}?`,
    message: `Gaji ${fmtMoney(v.hired.wage)}/hari berhenti. Batch yang sedang diproses tetap selesai; pabrik kembali kamu atur sendiri. Merekrut lagi membayar biaya rekrut penuh; untuk naik tingkat lebih murah pakai 🔄 Ganti / promosikan.`,
    confirmLabel: 'Berhentikan', danger: true,
  });
  if (ok) act(app.game.fireFactoryManager(), 'Manajer pabrik diberhentikan.');
}

function recentRow(r, fresh) {
  return h(`div.disp-recent-row${fresh ? '.fresh' : ''}`,
    h('span.fm-recent-gear', '⚙️'),
    h('div.disp-recent-main',
      h('div.disp-recent-title', `${r.batches}× ${r.recipeEmoji} ${r.recipeName}`),
      h('div.small.muted', `${r.factoryEmoji} ${r.factoryName} · ${fmtClock(r.day, r.hour)}${r.buyCost > 0 ? ` · beli bahan ${fmtMoney(r.buyCost)}` : ''}`)),
    h(`span.num.${r.estProfit >= 0 ? 'pos' : 'neg'}`, `≈ +${fmtMoney(r.estProfit)}`));
}

/** Last pass summary ("Terakhir: 2× Tepung, 1× Roti") + countdown to the next one. */
function passLine(v) {
  const last = v.lastRun;
  return h('div.fm-pass',
    h('div.fm-pass-cell', h('span.small.muted', 'Terakhir'),
      h('b', last ? last.text : 'Belum ada batch'),
      last ? h('span.small.muted', last.hoursAgo < 1 ? 'baru saja' : `${fmtHours(last.hoursAgo)} lalu`) : null),
    h('div.fm-pass-cell', h('span.small.muted', 'Rencana berikutnya'),
      h('b', v.on ? (v.nextPassHours > 0 ? `${fmtHours(v.nextPassHours)} lagi` : 'sekarang') : 'dijeda'),
      h('span.small.muted', `tiap ${fmtHours(v.hired.intervalHours)}`)));
}

function hiredBody(v) {
  const hd = v.hired, managed = v.factories.filter((f) => f.managed).length;
  const newest = v.recent[0] ? `${v.recent[0].day}:${v.recent[0].hour}:${v.recent[0].factoryId}:${v.stats.runs}` : null;
  const fresh = newest && lastRecent !== undefined && newest !== lastRecent;
  lastRecent = newest;
  return [
    h('div.disp-toggle-row',
      h('button.btn.disp-toggle' + (v.on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': v.on ? 'true' : 'false',
        onclick: () => act(app.game.setFactoryManagerOn(!v.on), v.on ? '⏸ Manajer pabrik dijeda.' : '▶ Manajer pabrik aktif.') },
      h('span.disp-switch', h('span.disp-knob')), v.on ? 'Aktif' : 'Jeda'),
      h('span.small.muted.disp-toggle-hint', v.on ? `Mengelola ${managed} dari ${v.owned} pabrik` : 'Pabrik kamu atur sendiri')),
    h('div.disp-stats',
      h('div.disp-stat', h('span.small.muted', 'Hari ini'), h('b', `${v.today.batches} batch`)),
      h('div.disp-stat', h('span.small.muted', 'Total'), h('b', `${fmtNum(v.stats.batches)} batch`)),
      h('div.disp-stat', h('span.small.muted', 'Perkiraan untung'), h('b.pos', `+${fmtMoney(v.stats.estProfit)}`))),
    h('div.small.muted', `Gaji ${fmtMoney(hd.wagePaid)}/hari · ${tierLine(hd)}`),
    passLine(v),
    v.on && v.note ? h('div.disp-wait', `💤 ${v.note}`) : null,
    factoryBlockBox(v.blocked),
    v.factories.length ? [h('div.disp-set-title', 'Pabrik'), factoryRows(v)]
      : h('div.disp-wait', '🏭 Belum punya pabrik. Beli di bawah, manajer langsung mulai bekerja.'),
    swapFold(v),
    v.recent.length ? h('div.disp-recent', h('div.disp-set-title', 'Batch terakhir'), v.recent.slice(0, 4).map((r, i) => recentRow(r, fresh && i === 0)))
      : h('p.small.muted', 'Belum ada batch otomatis. Untung = hasil × harga pasar − bahan − bagian gaji.'),
    settingsFold(v),
    h('div.card-actions', h('span.small.muted', `Sejak hari ${hd.hiredDay}`), h('span.spacer'),
      h('button.btn.btn-small.btn-danger', { type: 'button', onclick: () => fireFlow(v) }, 'Berhentikan')),
  ];
}

/** Gudang › 🏭 Olahan, above the factory cards. */
export function factoryManagerCard(game) {
  if (!game.factoryManagerView) return null;
  const v = game.factoryManagerView(), hd = v.hired;
  const swapped = !!hd && lastTier != null && lastTier !== hd.id;
  lastTier = hd?.id ?? null;
  const status = hd ? (v.on ? h('span.badge.badge-green', 'Aktif') : h('span.badge', 'Jeda')) : h('span.badge', v.level < v.unlockLevel ? `🔒 Lv ${v.unlockLevel}` : 'Belum ada');
  return h(`div.card.disp-card.fm-card${hd && v.on ? '.working' : ''}${swapped ? '.swapped' : ''}`,
    h('div.card-head',
      h('div.card-icon.disp-avatar', hd?.emoji ?? '🏭'),
      h('div.card-main',
        h('div.card-title', '🏭 Manajer Pabrik'),
        h('div.card-sub', hd ? `${hd.name} · ${hd.title} ${stars(hd.stars)}` : 'Menjalankan pabrik otomatis dengan resep paling untung')),
      status),
    hd ? hiredBody(v) : [
      h('p.small.muted', 'Manajer memakai bahan baku di gudang untuk menjalankan resep paling untung, tidak memproduksi ke gudang yang penuh, dan menahan bahannya agar tidak dikirim Manajer Logistik. Gaji dibayar tiap pergantian hari.'),
      h('div.list.disp-cands', v.candidates.map(candidateItem)),
    ]);
}

/** Garasi › Pekerja: the manager next to the field workers. */
export function factoryManagerItem(game) {
  if (!game.factoryManagerView) return null;
  const v = game.factoryManagerView(), hd = v.hired;
  return h('div.list-item.ops-machine.disp-mgr',
    h('div.card-icon', hd?.emoji ?? '🏭'),
    h('div.ops-body',
      h('div.card-title', hd ? `${hd.name} ` : 'Manajer Pabrik ', hd ? h('span.ops-stars', stars(hd.stars)) : null),
      h('div.card-sub', hd ? `${hd.title} · ${fmtMoney(hd.wagePaid)}/hari · ${fmtNum(v.stats.batches)} batch otomatis` : v.level < v.unlockLevel
        ? `Terbuka di level ${v.unlockLevel} · menjalankan pabrik otomatis` : 'Belum direkrut · menjalankan pabrik otomatis'),
      h('div.ops-actions',
        hd ? h(v.on ? 'span.badge.badge-green' : 'span.badge', v.on ? (v.busy ? `Aktif · ${v.busy} pabrik jalan` : 'Aktif') : 'Jeda') : null,
        h('button.btn.btn-small.btn-secondary', { type: 'button', onclick: () => goTo('silo', 'processed') }, hd ? 'Atur di Gudang › Olahan' : 'Lihat calon'))));
}
