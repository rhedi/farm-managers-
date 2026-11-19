// 🧑‍💼 Manajer Logistik (Pasar › Kirim, top; summary in Garasi › Pekerja): hire a tier, aktif/jeda, recent automatic
// dispatches, 🔄 ganti / promosikan (another tier with a trade-in), and the planner settings. Engine:
// game.dispatcherView / hireDispatcher / replaceDispatcher / fireDispatcher / setDispatcherOn / setDispatcherSettings.
import { h, fmtMoney, fmtNum, fmtClock } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { fold, goTo } from './subtabs.js';
import { CATEGORIES } from './stock.js';

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n)); // v20: 4 staff tiers (★4 from Lv 53/65/77)
const pct = (v) => `${fmtNum(v * 100)}%`;
let lastRecent = null; // newest dispatch already shown (the newest row slides in once)
let lastTier; // hired tier last rendered (a new one pops in once after Ganti / promosikan)

/** Changes whenever the card would render differently. */
export function dispatcherSig(game) {
  if (!game.dispatcherView) return '';
  const d = game.state.dispatcher;
  return `D${d.hired?.tierId}|${d.on}|${d.note}|${d.stats.trips}|${JSON.stringify(d.settings)}|${game.state.level}|`
    + `${Math.floor(game.state.money / 500)}|${Object.keys(game.state.silo).length}|${game.trucksView?.().length}`;
}

const tierLine = (t) => `Mengatur ${t.trucks} truk · radius ${fmtNum(t.radiusKm)} km · negosiasi +${pct(t.bonus)}`;

function candidateItem(c) {
  return h(`div.list-item.disp-cand${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', `Gaji ${fmtMoney(c.wage)}/hari`, c.reason ? h('span.disp-why', ` · ${c.reason}`) : null)),
    h('button.btn.btn-small.btn-primary', { type: 'button', disabled: !!c.reason, 'aria-label': `Rekrut ${c.name} ${fmtMoney(c.hireCost)}`,
      onclick: () => act(app.game.hireDispatcher(c.id), `🧑‍💼 ${c.name} mulai bekerja sebagai Manajer Logistik!`) },
    'Rekrut', h('span.disp-cost', fmtMoney(c.hireCost))));
}

async function fireFlow(v) {
  const ok = await confirmModal({
    title: `Berhentikan ${v.hired.name}?`,
    message: `Gaji ${fmtMoney(v.hired.wage)}/hari berhenti. Truk yang sedang jalan tetap pulang; pengaturan tetap disimpan. Merekrut lagi membayar biaya rekrut penuh; untuk naik tingkat lebih murah pakai 🔄 Ganti / promosikan.`,
    confirmLabel: 'Berhentikan', danger: true,
  });
  if (ok) act(app.game.fireDispatcher(), 'Manajer logistik diberhentikan.');
}

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtMoney(Math.abs(v))}`;
const change = (label, from, to) => h('span.disp-swap-change', h('span.muted', `${label} `), from == null || from === to ? h('b', to) : [`${from} → `, h('b', to)]);

async function swapFlow(v, c) {
  const hd = v.hired, up = c.stars > hd.stars;
  const ok = await confirmModal({
    title: `${up ? 'Promosikan' : 'Ganti'} ke ${c.name}?`,
    message: [
      h('span.disp-swap-change', `${hd.emoji} ${hd.name} (${hd.title}) diganti ${c.emoji} ${c.name} (${c.title}).`),
      change('Truk sekaligus:', `${hd.trucks}`, `${c.trucks}`),
      change('Radius:', `${fmtNum(hd.radiusKm)} km`, `${fmtNum(c.radiusKm)} km`),
      change('Negosiasi:', `+${pct(hd.bonus)}`, `+${pct(c.bonus)}`),
      change('Gaji:', `${fmtMoney(hd.wagePaid)}/hari`, `${fmtMoney(hd.wagePaid + c.wageDiff)}/hari`),
      change('Bayar sekarang:', null, c.price > 0 ? `${fmtMoney(c.price)} (${fmtMoney(c.hireCost)} − tukar ${fmtMoney(c.credit)})` : '$0 (gratis setelah tukar)'),
      h('span.disp-swap-change.muted', 'Pengaturan, statistik, dan truk yang sedang jalan tetap.'),
    ],
    confirmLabel: `${up ? 'Promosikan' : 'Ganti'} · ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`,
  });
  if (ok) act(app.game.replaceDispatcher(c.id), `🧑‍💼 ${c.name} sekarang ${c.title}!`);
}

function swapItem(v, c) {
  const up = c.stars > v.hired.stars, nw = (t) => h('span.nowrap', t);
  return h(`div.list-item.disp-cand.disp-swap-item${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', nw(`Gaji ${fmtMoney(c.wage)}/hari`), ' ', h('b.nowrap', `(${signed(c.wageDiff)}/hari)`)),
      h('div.card-sub', c.price > 0 ? [h('b.nowrap', `${fmtMoney(c.price)} setelah tukar`), ' ', nw(`(${fmtMoney(c.hireCost)} − ${fmtMoney(c.credit)})`)]
          : [h('b.nowrap', 'Gratis setelah tukar'), ' ', nw(`(potongan ${fmtMoney(c.credit)} ≥ ${fmtMoney(c.hireCost)})`)],
      !c.locked && c.reason ? h('span.disp-why', ` · ${c.reason}`) : null),
      c.locked ? h('div.card-sub.disp-why', `🔒 Terbuka di Lv ${c.unlockLevel}`) : null),
    h(`button.btn.btn-small.${up ? 'btn-primary' : 'btn-secondary'}`, { type: 'button', disabled: !!c.reason,
      'aria-label': `${up ? 'Promosikan' : 'Ganti'} ke ${c.name} ${fmtMoney(c.price)}`, onclick: () => swapFlow(v, c) },
    c.locked ? `🔒 Terbuka di Lv ${c.unlockLevel}` : up ? '⬆️ Promosikan' : '🔄 Ganti',
    c.locked ? null : h('span.disp-cost', `· ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`)));
}

function swapFold(v) {
  const others = v.candidates.filter((c) => !c.current);
  if (!others.length) return null;
  const next = others.find((c) => c.stars > v.hired.stars && !c.locked);
  const sum = next ? `Naik ke ${next.title}: ${fmtMoney(next.price)} setelah tukar` : `${others.length} tingkat lain · potongan tukar ${pct(v.tradeIn)}`;
  return fold('disp-swap', [h('span.disp-fold-name', '🔄 Ganti / promosikan manajer'), h('span.disp-fold-sum', sum)], { cls: 'boxed disp-swap' },
    h('p.small.disp-swap-why', 'Satu manajer mengatur semua truk; ganti ke tingkat lebih tinggi untuk truk & jangkauan lebih banyak.'),
    h('p.small.muted.disp-note', `Harga = biaya rekrut tingkat baru − ${pct(v.tradeIn)} biaya rekrut ${v.hired.name} (tidak pernah di bawah $0). Pengaturan, statistik, dan truk di jalan tetap.`),
    h('div.list.disp-cands', others.map((c) => swapItem(v, c))));
}

const set = (patch) => act(app.game.setDispatcherSettings(patch), null, { rerenderModal: false });

/** − value + stepper with 44px buttons; `values` = allowed steps (ascending). Shared with the Manajer Pabrik card. */
export function stepper(label, value, values, fmt, onChange, hint) {
  const lower = [...values].reverse().find((x) => x < value) ?? values[0];
  const higher = values.find((x) => x > value) ?? values[values.length - 1];
  return h('div.disp-step',
    h('div.disp-step-label', h('span', label), hint ? h('span.small.muted', hint) : null),
    h('div.stepper', { role: 'group', 'aria-label': label },
      h('button.btn.stepper-btn', { type: 'button', 'aria-label': `Kurangi ${label}`, disabled: value <= values[0], onclick: () => onChange(lower) }, '−'),
      h('output.stepper-val', fmt(value)),
      h('button.btn.stepper-btn', { type: 'button', 'aria-label': `Tambah ${label}`, disabled: value >= values[values.length - 1], onclick: () => onChange(higher) }, '+')));
}

export function chip(label, on, onclick, extra = {}) {
  return h(`button.chip.disp-chip${on ? '.active' : ''}`, { type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick, ...extra }, label);
}

function productRow(p, s, steps) {
  return h(`div.disp-prod${p.excluded || !p.groupOn ? '.off' : ''}`,
    h('div.disp-prod-name', `${p.emoji} ${p.name}`,
      h('span.small.muted', ` ${fmtAmt(p.qty, p.unit)}${p.held > 0 ? ` · ${fmtAmt(p.held, p.unit)} disisakan` : ''}`)),
    chip(p.excluded ? '🚫 Tidak' : '✓ Kirim', !p.excluded,
      () => set({ exclude: p.excluded ? s.exclude.filter((x) => x !== p.id) : [...s.exclude, p.id] }),
      { 'aria-label': `${p.name}: ${p.excluded ? 'tidak dikirim' : 'boleh dikirim'}` }),
    stepper('Sisakan', p.keepPct, steps.keepPct, (v) => `${v}%`, (v) => set({ keepPct: { ...s.keepPct, [p.id]: v } })));
}

function settingsFold(v) {
  const s = v.settings, steps = v.steps;
  const maxTrucks = Math.max(1, Math.min(v.hired.trucks, v.trucks));
  const summary = `Min. ${fmtMoney(s.minProfit)}/trip · ${s.minMargin}% · ${v.cities.filter((c) => c.allowed && c.inRange).length} kota`;
  const prods = v.products;
  return fold('disp-settings', [h('span.disp-fold-name', '⚙️ Pengaturan manajer'), h('span.disp-fold-sum', summary)], { cls: 'boxed disp-settings' },
    h('div.disp-set-title', 'Kelompok produk yang boleh dikirim'),
    h('div.disp-chips', CATEGORIES.map((c) => chip(`${c.icon} ${c.label}`, s.groups[c.id], () => set({ groups: { [c.id]: !s.groups[c.id] } })))),
    h('div.disp-set-title', 'Kota tujuan'),
    v.cities.length ? h('div.disp-chips', v.cities.map((c) => chip(`${c.emoji} ${c.name} · ${fmtNum(c.km)} km${c.inRange ? '' : ' (jauh)'}`,
      c.allowed && c.inRange, () => set({ blockedCities: c.allowed ? [...s.blockedCities, c.id] : s.blockedCities.filter((x) => x !== c.id) }),
      { disabled: !c.inRange, title: c.inRange ? null : `Di luar radius ${fmtNum(v.hired.radiusKm)} km manajer ini` })))
      : h('p.small.muted', 'Belum ada kota yang bisa dituju dari wilayah ladangmu.'),
    stepper('Untung minimum per trip', s.minProfit, steps.minProfit, fmtMoney, (x) => set({ minProfit: x }), 'setelah BBM, sopir & aus truk'),
    stepper('Minimal di atas jual lokal', s.minMargin, steps.minMargin, (x) => `${x}%`, (x) => set({ minMargin: x })),
    stepper('Sisakan pekerja bebas', s.reserveWorkers, [0, 1, 2, 3, 4, 5], (x) => `${x} orang`, (x) => set({ reserveWorkers: x }), 'agar ladang tidak kekurangan pekerja'),
    stepper('Maks. truk dipakai', s.maxTrucks || maxTrucks, Array.from({ length: maxTrucks }, (_, i) => i + 1),
      (x) => (x >= maxTrucks ? `Semua (${maxTrucks})` : `${x} truk`), (x) => set({ maxTrucks: x >= maxTrucks ? 0 : x })),
    h('div.disp-set-title', `Produk (${prods.length})`),
    prods.length ? h('div.disp-prods', prods.map((p) => productRow(p, s, steps)))
      : h('p.small.muted', 'Gudang kosong. Produk muncul di sini saat ada stok.'),
    h('p.small.muted.disp-note', '🔒 Cadangan pakan dan stok untuk kontrak aktif selalu disisakan. "Sisakan %" berlaku untuk setiap stok baru yang masuk.'));
}

function recentRow(r, fresh) {
  return h(`div.disp-recent-row${fresh ? '.fresh' : ''}`,
    h('span.disp-recent-truck', '🚚'),
    h('div.disp-recent-main',
      h('div.disp-recent-title', `${r.cityEmoji} ${r.cityName} · ${r.cargoText}`),
      h('div.small.muted', `${r.truckName} · ${fmtClock(r.day, r.hour)}`)),
    h(`span.num.${r.estProfit >= 0 ? 'pos' : 'neg'}`, `≈ +${fmtMoney(r.estProfit)}`));
}

/** Moving trucks first (positive state); the waiting reason only when nothing is on the road. Always one element with a
 *  reserved height (css .disp-status), so the card never grows or shrinks when the state flips at 5×. */
function statusLine(v) {
  if (v.onRoad) return h('div.disp-status.disp-moving', `🚚 ${v.onRoad} truk di jalan · berikutnya diperiksa tiap jam`);
  return v.note ? h('div.disp-status.disp-wait', `💤 ${v.note}`) : h('div.disp-status');
}

/** The 4 recent-dispatch rows as fixed slots (blank until filled), so a new dispatch never grows the card. */
const RECENT_SLOTS = 4;
const blankRecent = () => h('div.disp-recent-row.blank', { 'aria-hidden': 'true' },
  h('span.disp-recent-truck', '🚚'), h('div.disp-recent-main', h('div.disp-recent-title', '·'), h('div.small', '·')));

function hiredBody(v) {
  const hd = v.hired;
  const newest = v.recent[0]?.shipmentId ?? null;
  const fresh = newest && lastRecent !== null && newest !== lastRecent;
  lastRecent = newest;
  return [
    h('div.disp-toggle-row',
      h('button.btn.disp-toggle' + (v.on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': v.on ? 'true' : 'false',
        onclick: () => act(app.game.setDispatcherOn(!v.on), v.on ? '⏸ Manajer logistik dijeda.' : '▶ Manajer logistik aktif.') },
      h('span.disp-switch', h('span.disp-knob')), v.on ? 'Aktif' : 'Jeda'),
      h('span.small.muted.disp-toggle-hint', v.on ? 'Memeriksa truk & stok tiap jam' : 'Tidak mengirim apa pun')),
    h('div.disp-stats',
      h('div.disp-stat', h('span.small.muted', 'Hari ini'), h('b', `${v.today.trips} trip`)),
      h('div.disp-stat', h('span.small.muted', 'Total'), h('b', `${fmtNum(v.stats.trips)} trip`)),
      h('div.disp-stat', h('span.small.muted', 'Untung ekstra'), h('b.pos', `+${fmtMoney(v.stats.extraProfit)}`))),
    h('div.small.muted', `Gaji ${fmtMoney(hd.wagePaid)}/hari · ${tierLine(hd)} · ${v.onRoad} truk di jalan`),
    v.on ? statusLine(v) : null,
    swapFold(v),
    v.sellPlans ? h('div.disp-warn', `⚠️ ${v.sellPlans} rencana ladang menjual otomatis saat panen, jadi hasilnya tidak sempat dikirim. Matikan 💰 Jual otomatis di rencana ladang.`) : null,
    v.recent.length ? h('div.disp-recent', h('div.disp-set-title', 'Kiriman terakhir'), v.recent.slice(0, RECENT_SLOTS).map((r, i) => recentRow(r, fresh && i === 0)),
      Array.from({ length: Math.max(0, RECENT_SLOTS - v.recent.length) }, blankRecent))
      : h('p.small.muted', 'Belum ada kiriman otomatis. Untung = harga kota − jual lokal − BBM − sopir − aus truk.'),
    settingsFold(v),
    h('div.card-actions', h('span.small.muted', `Sejak hari ${hd.hiredDay}`), h('span.spacer'),
      h('button.btn.btn-small.btn-danger', { type: 'button', onclick: () => fireFlow(v) }, 'Berhentikan')),
  ];
}

/** Pasar › Kirim, above manual shipping. */
export function dispatcherCard(game) {
  if (!game.dispatcherView) return null;
  const v = game.dispatcherView();
  const hd = v.hired;
  const swapped = !!hd && lastTier !== undefined && lastTier !== null && lastTier !== hd.id;
  lastTier = hd?.id ?? null;
  const status = hd ? (v.on ? h('span.badge.badge-green', 'Aktif') : h('span.badge', 'Jeda')) : h('span.badge', v.level < v.unlockLevel ? `🔒 Lv ${v.unlockLevel}` : 'Belum ada');
  return h('section.section.disp',
    h(`div.card.disp-card${hd && v.on ? '.working' : ''}${swapped ? '.swapped' : ''}`,
      h('div.card-head',
        h('div.card-icon.disp-avatar', hd?.emoji ?? '🧑‍💼'),
        h('div.card-main',
          h('div.card-title', '🧑‍💼 Manajer Logistik'),
          h('div.card-sub', hd ? `${hd.name} · ${hd.title} ${stars(hd.stars)}` : 'Mengirim truk otomatis ke kota paling untung')),
        status),
      hd ? hiredBody(v) : [
        h('p.small.muted', 'Manajer memakai truk yang menganggur dan pekerja bebas untuk menjual stok gudang di kota yang membayar paling banyak di atas pasar lokal, setelah BBM, sopir, dan aus truk. Gaji dibayar tiap pergantian hari.'),
        trucksHint(v),
        h('div.list.disp-cands', v.candidates.map(candidateItem)),
      ]));
}

function trucksHint(v) {
  if (v.trucks) return null;
  return h('div.disp-wait', '🚚 Belum punya truk. ', h('button.btn.btn-small.btn-secondary', { type: 'button', onclick: () => goTo('garage', 'shop') }, 'Beli di Garasi'));
}

/** Garasi › Pekerja: the manager next to the field workers. */
export function managerItem(game) {
  if (!game.dispatcherView) return null;
  const v = game.dispatcherView();
  const hd = v.hired;
  return h('div.list-item.ops-machine.disp-mgr',
    h('div.card-icon', hd?.emoji ?? '🧑‍💼'),
    h('div.ops-body',
      h('div.card-title', hd ? `${hd.name} ` : 'Manajer Logistik ', hd ? h('span.ops-stars', stars(hd.stars)) : null),
      h('div.card-sub', hd ? `${hd.title} · ${fmtMoney(hd.wagePaid)}/hari · ${v.stats.trips} trip otomatis` : v.level < v.unlockLevel
        ? `Terbuka di level ${v.unlockLevel} · mengirim truk otomatis` : 'Belum direkrut · mengirim truk otomatis ke kota paling untung'),
      h('div.ops-actions',
        hd ? h(v.on ? 'span.badge.badge-green' : 'span.badge', v.on ? (v.onRoad ? `Aktif · ${v.onRoad} truk di jalan` : 'Aktif') : 'Jeda') : null,
        h('button.btn.btn-small.btn-secondary', { type: 'button', onclick: () => goTo('market', 'ship') }, hd ? 'Atur di Pasar › Kirim' : 'Lihat calon'))));
}
