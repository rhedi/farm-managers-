// 👷 Mandor Ladang (Garasi › Pekerja card, Ladang summary, paused-plan box in the field modal). Mirrors the Manajer
// Pabrik / Logistik cards (css disp-*). Engine: game.mandorView / hireMandor / replaceMandor / fireMandor / pinMandorField.
import { h, fmtMoney } from './dom.js';
import { confirmModal, toast, closeModal } from './modal.js';
import { app, act } from './app.js';
import { goTo, fold } from './subtabs.js';
import { stars } from './dispatcher.js';

let lastTier; // hired tier last rendered (a new one pops in once after Ganti / promosikan)

const reach = (t) => (t.fields == null ? 'semua ladang' : `≤ ${t.fields} ladang`);
/** "≤ 12 ladang berencana · tugas +5%" */
const tierLine = (t) => [`${reach(t)} berencana`, t.speed > 0 ? `tugas ladang +${Math.round(t.speed * 100)}% lebih cepat` : null].filter(Boolean).join(' · ');
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtMoney(Math.abs(v))}`;

/** Changes whenever the Ladang summary would render differently (no money: the farm pane keeps its animations). */
export function mandorPlanSig(game) {
  const d = game.state.mandor;
  if (!game.mandorView || !d) return '';
  const plans = Object.entries(game.state.fields).filter(([, f]) => f.plan).map(([id, f]) => `${id}${f.plan.paused ? 'P' : ''}`).join(',');
  return `M${d.hired?.tierId}|${d.pins.join(',')}|${plans}`;
}

/** Changes whenever the Mandor card (Garasi › Pekerja) would render differently. */
export const mandorSig = (game) => `${mandorPlanSig(game)}|${game.state.level}|${Math.floor(game.state.money / 500)}`;

/** Old save grandfathered with a free Mandor: one toast after load. */
export function announceMandorNotice(game) {
  if (game.takeMandorNotice?.()) setTimeout(() => toast('👷 Mandor otomatis dipekerjakan untuk save lama', 'success'), 900);
}

const hireMsg = (c) => `👷 ${c.name} mulai bekerja sebagai ${c.title}! Rencana jalan di ${reach(c)}.`;

function candidateItem(c) {
  return h(`div.list-item.disp-cand${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', `Gaji ${fmtMoney(c.wage)}/hari`, c.reason ? h('span.disp-why', ` · ${c.reason}`) : null)),
    h('button.btn.btn-small.btn-primary', { type: 'button', disabled: !!c.reason, 'aria-label': `Rekrut ${c.name} ${fmtMoney(c.price)}`,
      onclick: () => act(app.game.hireMandor(c.id), hireMsg(c)) },
    c.locked ? `🔒 Lv ${c.unlockLevel}` : 'Rekrut', h('span.disp-cost', fmtMoney(c.price)), // price: 🌳 Mandor Keluarga discount
    c.price < c.hireCost ? h('s.small.muted', fmtMoney(c.hireCost)) : null));
}

async function swapFlow(v, c) {
  const hd = v.hired, up = c.stars > hd.stars;
  const ok = await confirmModal({
    title: `${up ? 'Promosikan' : 'Ganti'} ke ${c.name}?`,
    message: [
      h('span.disp-swap-change', `${hd.emoji} ${hd.name} (${hd.title}) diganti ${c.emoji} ${c.name} (${c.title}).`),
      h('span.disp-swap-change', h('span.muted', 'Ladang berencana: '), `${reach(hd)} → `, h('b', reach(c))),
      h('span.disp-swap-change', h('span.muted', 'Gaji: '), `${fmtMoney(hd.wagePaid)}/hari → `, h('b', `${fmtMoney(hd.wagePaid + c.wageDiff)}/hari`)),
      h('span.disp-swap-change', h('span.muted', 'Bayar sekarang: '), h('b', c.price > 0 ? `${fmtMoney(c.price)} (${fmtMoney(c.hireCost)} − tukar ${fmtMoney(c.credit)})` : '$0 (gratis setelah tukar)')),
      c.fields != null && v.planned > c.fields ? h('span.disp-swap-change.neg', `⏸ ${v.planned - c.fields} rencana akan dijeda (tetap tersimpan).`) : null,
    ],
    confirmLabel: `${up ? 'Promosikan' : 'Ganti'} · ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`,
  });
  if (ok) act(app.game.replaceMandor(c.id), `👷 ${c.name} sekarang ${c.title}!`);
}

function swapItem(v, c) {
  const up = c.stars > v.hired.stars;
  return h(`div.list-item.disp-cand.disp-swap-item${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', h('span.nowrap', `Gaji ${fmtMoney(c.wage)}/hari`), ' ', h('b.nowrap', `(${signed(c.wageDiff)}/hari)`))),
    h(`button.btn.btn-small.${up ? 'btn-primary' : 'btn-secondary'}`, { type: 'button', disabled: !!c.reason,
      'aria-label': `${up ? 'Promosikan' : 'Ganti'} ke ${c.name} ${fmtMoney(c.price)}`, onclick: () => swapFlow(v, c) },
    c.locked ? `🔒 Terbuka di Lv ${c.unlockLevel}` : up ? '⬆️ Promosikan' : '🔄 Ganti',
    c.locked ? null : h('span.disp-cost', `· ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`)));
}

function swapFold(v) {
  const others = v.candidates.filter((c) => !c.current);
  if (!others.length) return null;
  const next = others.find((c) => c.stars > v.hired.stars && !c.locked);
  const sum = next ? `Naik ke ${next.title}: ${fmtMoney(next.price)} setelah tukar` : `${others.length} tingkat lain · potongan tukar ${Math.round(v.tradeIn * 100)}%`;
  return fold('mandor-swap', [h('span.disp-fold-name', '🔄 Ganti / promosikan mandor'), h('span.disp-fold-sum', sum)], { cls: 'boxed disp-swap' },
    h('p.small.muted.disp-note', `Harga = biaya rekrut tingkat baru − ${Math.round(v.tradeIn * 100)}% biaya rekrut ${v.hired.name} (tidak pernah di bawah $0). Turun tingkat gratis.`),
    h('div.list.disp-cands', others.map((c) => swapItem(v, c))));
}

async function fireFlow(v) {
  const ok = await confirmModal({
    title: `Berhentikan ${v.hired.name}?`,
    message: `Gaji ${fmtMoney(v.hired.wagePaid)}/hari berhenti. Rencana hanya jalan di ${v.freeFields} ladang gratis; ${Math.max(0, v.planned - v.freeFields)} rencana lain dijeda (tetap tersimpan). Merekrut lagi membayar biaya rekrut penuh.`,
    confirmLabel: 'Berhentikan', danger: true,
  });
  if (ok) act(app.game.fireMandor(), 'Mandor diberhentikan.');
}

const pin = (f) => act(app.game.pinMandorField(f.id, !f.pinned), f.pinned ? `📌 Prioritas ${f.name} dilepas.` : `📌 ${f.name} diutamakan.`);

/** Planned fields: ▶ running / ⏸ paused, 📌 pin to choose which ones the Mandor covers. */
function fieldRows(v) {
  if (!v.fields.length) return h('p.small.muted', 'Belum ada ladang dengan 🔁 Rencana. Atur rencana di detail ladang.');
  const capTxt = v.cap == null ? 'semua' : String(v.cap);
  return fold('mandor-fields', [h('span.disp-fold-name', '📋 Ladang berencana'), h('span.disp-fold-sum', `${v.running}/${v.planned} jalan · batas ${capTxt}`)],
    { cls: 'boxed', open: v.paused > 0 },
    h('p.small.muted.disp-note', '📌 Ladang yang diutamakan didahulukan, lalu rencana yang sudah jalan (urutan aktif), lalu ladang terluas.'),
    h('div.mandor-fields', v.fields.map((f) => h(`div.mandor-field${f.running ? '' : '.paused'}`,
      h('div.mandor-field-main', h('b', f.name), h('span.small.muted', ` ${f.sizeHa} ha`),
        h('div.small', f.running ? '▶ Jalan' : `⏸ ${v.pausedLabel}`)),
      h(`button.chip.disp-chip${f.pinned ? '.active' : ''}`, { type: 'button', 'aria-pressed': f.pinned ? 'true' : 'false',
        'aria-label': `${f.name}: ${f.pinned ? 'diutamakan, ketuk untuk melepas' : 'ketuk untuk mengutamakan'}`, onclick: () => pin(f) },
      f.pinned ? '📌 Utama' : '📌 Utamakan')))));
}

/** Garasi › Pekerja: the full Mandor card. */
export function mandorCard(game) {
  if (!game.mandorView) return null;
  const v = game.mandorView(), hd = v.hired;
  const swapped = !!hd && lastTier != null && lastTier !== hd.id;
  lastTier = hd?.id ?? null;
  const status = hd ? h('span.badge.badge-green', `${v.running}/${v.cap ?? v.planned} ladang`)
    : h(`span.badge${v.paused ? '.badge-gold' : ''}`, v.paused ? `⏸ ${v.paused} dijeda` : `${v.running}/${v.freeFields} gratis`);
  return h(`div.card.disp-card.mandor-card${hd ? '.working' : ''}${swapped ? '.swapped' : ''}`,
    h('div.card-head',
      h('div.card-icon.disp-avatar', hd?.emoji ?? '👷'),
      h('div.card-main',
        h('div.card-title', '👷 Mandor Ladang'),
        h('div.card-sub', hd ? `${hd.name} · ${hd.title} ${stars(hd.stars)}` : `🔁 Rencana gratis di ${v.freeFields} ladang · lebih banyak butuh mandor`)),
      status),
    hd ? [
      h('div.disp-stats',
        h('div.disp-stat', h('span.small.muted', 'Rencana jalan'), h('b', `${v.running}/${v.planned}`)),
        h('div.disp-stat', h('span.small.muted', 'Batas'), h('b', v.cap == null ? 'Semua' : `${v.cap} ladang`)),
        h('div.disp-stat', h('span.small.muted', 'Gaji'), h('b', `${fmtMoney(hd.wagePaid)}/hari`))),
      h('div.small.muted', tierLine(hd), hd.granted ? ' · 🎁 dipekerjakan otomatis untuk save lama' : ''),
      v.paused ? h('div.disp-wait', `⏸ ${v.paused} rencana dijeda: ${v.pausedLabel}`) : null,
      fieldRows(v),
      swapFold(v),
      h('div.card-actions', h('span.small.muted', `Sejak hari ${hd.hiredDay}`), h('span.spacer'),
        h('button.btn.btn-small.btn-danger', { type: 'button', onclick: () => fireFlow(v) }, 'Berhentikan')),
    ] : [
      h('p.small.muted', `Tanpa mandor, 🔁 Rencana hanya jalan di ${v.freeFields} ladang (yang lebih dulu aktif, atau yang kamu 📌 utamakan). Rencana baru di luar batas menunggu; "⚡ Kerjakan sekaligus" tetap bisa dipakai. Gaji dibayar tiap pergantian hari.`),
      v.paused ? h('div.disp-wait', `⏸ ${v.paused} rencana dijeda: ${v.pausedLabel}`) : null,
      v.fields.length ? fieldRows(v) : null,
      h('div.list.disp-cands', v.candidates.map(candidateItem)),
    ]);
}

/** Ladang › Ladangku: one line about plan coverage (only when something is planned). */
export function mandorSummary(game) {
  if (!game.mandorView) return null;
  const v = game.mandorView(), hd = v.hired;
  if (!v.planned) return null;
  const text = hd ? `${hd.emoji} ${hd.name} (${hd.title}) · rencana jalan ${v.running}/${v.planned}`
    : `👷 Rencana jalan ${v.running}/${v.planned} · ${v.freeFields} ladang gratis`;
  return h(`div.mandor-sum${v.paused ? '.paused' : ''}`,
    h('div.mandor-sum-text', h('b', text), v.paused ? h('div.small', `⏸ ${v.paused} dijeda: ${v.pausedLabel}`) : null),
    h(`button.btn.btn-small.${v.paused ? 'btn-primary' : 'btn-secondary'}`, { type: 'button', onclick: () => goTo('garage', 'workers') },
      v.paused ? (hd ? '⬆️ Promosikan' : '👷 Rekrut Mandor') : 'Atur'));
}

/** Field modal / card: the paused-plan box with "Rekrut Mandor" and "📌 Jalankan di ladang ini". */
export function pausedPlanBox(game, f, { compact = false } = {}) {
  if (!f.plan?.paused) return null;
  const hired = !!game.state.mandor?.hired;
  const go = (e) => { e.stopPropagation(); closeModal(); goTo('garage', 'workers'); };
  const run = (e) => { e.stopPropagation(); act(game.pinMandorField(f.id, true), `📌 Rencana ${f.name} dijalankan.`); };
  return h(`div.mandor-paused${compact ? '.compact' : ''}`,
    h('span.mandor-paused-label', `⏸ ${f.plan.blocked}`),
    h('div.mandor-paused-actions',
      h('button.btn.btn-small.btn-primary', { type: 'button', onclick: go }, hired ? '⬆️ Promosikan Mandor' : '👷 Rekrut Mandor'),
      compact ? null : h('button.btn.btn-small.btn-secondary', { type: 'button', onclick: run }, '📌 Jalankan di sini')));
}
