// 📊 Laporan Keuangan: income vs operating cost per period (game.financeReport), opened from the topbar money,
// Prestasi tab and Pasar › Keuangan. Full-height modal; re-renders only when the numbers change.
import { h, mount, fmtMoney, fmtPct } from './dom.js';
import { openModal } from './modal.js';
import { app } from './app.js';
import { financeChart } from './financeChart.js';

const PERIODS = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7d', '7 hari'], ['30d', '30 hari'], ['all', 'Semua']];
let period = '7d';

const TIPS = {
  gaji: 'Gaji paling besar: pecat pekerja yang sering menganggur, atau tambah ladang supaya semua pekerja sibuk.',
  sewa_pemanen: 'Sewa pemanen mahal: beli pemanen sendiri di Garasi, biasanya balik modal setelah beberapa panen.',
  bunga_pinjaman: 'Bunga pinjaman menggerus laba: lunasi pinjaman di Pasar › Keuangan.',
  bbm: 'BBM tinggi: upgrade efisiensi mesin atau pakai traktor/alat yang lebih besar supaya tugas cepat selesai.',
  benih: 'Benih mahal: tanam yang harga jualnya tinggi dan cocok dengan musim wilayahnya.',
  pupuk_kapur_irigasi: 'Pupuk, kapur dan irigasi: pakai hanya saat menaikkan hasil (lihat rincian hasil di ladang).',
  pakan: 'Beli pakan di pasar mahal (+20%): tanam pakan sendiri dan pasang cadangan pakan di Gudang.',
  perbaikan: 'Perbaikan sering: ganti mesin yang sudah aus atau kurangi pemakaian mesin tua.',
  semprot_hama: 'Hama: semprot segera; ladang yang dirawat (pupuk, kapur) lebih tahan.',
  penalti_kontrak: 'Denda kontrak: terima kontrak hanya jika stok bisa terpenuhi sebelum tenggat.',
  pembelian_produk: 'Beli produk di pasar (+20%) lalu menjualnya lagi hampir selalu rugi.',
};

/** Plain-language verdict + tip for the biggest operating cost. */
function verdict(r) {
  const top = r.opex.byCat[0];
  if (!r.income.total && !r.opex.total) return { cls: 'flat', text: 'ℹ️ Belum ada pemasukan atau biaya operasional pada periode ini.' };
  if (r.operatingProfit >= 0) {
    return { cls: 'good', text: `✅ Untung: laba operasional ${fmtMoney(r.operatingProfit)}`
      + (r.margin != null ? ` (margin ${fmtPct(r.margin)})` : '') + '.', top };
  }
  return { cls: 'bad', text: `⚠️ Biaya operasional lebih besar dari pemasukan (rugi ${fmtMoney(-r.operatingProfit)})`
    + (top ? ` — terbesar: ${top.name} (${Math.round(top.pct)}%)` : '') + '.', top };
}

function tile(label, value, sub, cls = '') {
  return h(`div.fin-tile${cls ? '.' + cls : ''}`, h('div.fin-tile-label', label), h('div.fin-tile-value.num', value),
    sub ? h('div.fin-tile-sub', sub) : null);
}

function groupList(title, g, cls, empty) {
  return h('section.fin-group',
    h('div.fin-group-head', h('span', title), h('span.num', fmtMoney(g.total))),
    g.byCat.length ? h('div.fin-rows', g.byCat.map((c) => h('div.fin-row',
      h('span.fin-row-name', `${c.emoji} ${c.name}`),
      h('span.fin-row-amt.num', fmtMoney(c.amount)),
      h('span.fin-row-pct.num', `${Math.round(c.pct)}%`),
      h(`div.fin-bar.${cls}`, h('div', { style: { width: `${Math.max(1, c.pct)}%` } })))))
      : h('p.small.muted', empty));
}

function spanText(r, game) {
  const first = r.daily[0]?.day ?? game.day, last = r.daily[r.daily.length - 1]?.day ?? game.day;
  if (r.period === 'all') return `Sejak hari ${first} · ${r.days} hari`;
  if (r.period === 'today') return `Hari ${game.day} (masih berjalan)`;
  if (r.period === 'yesterday') return game.day > 1 ? `Hari ${game.day - 1}` : 'Belum ada hari kemarin';
  return `Hari ${first}–${last} · ${r.days} hari (termasuk hari ini)`;
}

function renderReport(body, game) {
  const r = game.financeReport(period);
  const v = verdict(r);
  const daily = r.daily.length >= 2 ? r.daily : game.financeReport('7d').daily;
  const tip = r.opex.total > 0 && v.top ? TIPS[v.top.id] : null;
  const tone = (x) => (v.cls === 'flat' ? '' : x >= 0 ? 'pos' : 'neg');
  mount(body,
    h('div.fin-tabs', { role: 'tablist' }, PERIODS.map(([id, name]) => h(`button.fin-tab${id === period ? '.active' : ''}`,
      { role: 'tab', 'aria-selected': String(id === period), onclick: () => { period = id; rerender(body); } }, name))),
    h('p.small.muted.fin-span', spanText(r, game)),
    h(`div.fin-verdict.${v.cls}`, v.text),
    h('div.fin-tiles',
      tile('Pemasukan', fmtMoney(r.income.total), null, 'in'),
      tile('Biaya operasional', fmtMoney(r.opex.total), null, 'out'),
      tile('Laba operasional', fmtMoney(r.operatingProfit), null, tone(r.operatingProfit)),
      tile('Margin', r.margin == null ? '—' : fmtPct(r.margin), 'laba ÷ pemasukan', tone(r.operatingProfit)),
      tile('Investasi', fmtMoney(r.capex.total), 'ladang, mesin, kandang…'),
      tile('Arus kas bersih', fmtMoney(r.netCashFlow), 'termasuk investasi & pinjaman', r.netCashFlow >= 0 ? 'pos' : 'neg')),
    tip ? h('p.fin-tip', '💡 ', tip) : null,
    h('section.fin-group', h('div.fin-group-head', h('span', '📈 Per hari')), financeChart(daily)),
    groupList('💰 Pemasukan', r.income, 'in', 'Belum ada pemasukan.'),
    groupList('🧾 Biaya operasional', r.opex, 'out', 'Belum ada biaya operasional.'),
    groupList('🏗️ Investasi', r.capex, 'cap', 'Tidak ada investasi.'),
    h('section.fin-group',
      h('div.fin-group-head', h('span', '🏦 Pinjaman (bukan laba/biaya)')),
      h('div.kv', h('span', '💳 Pinjaman diterima'), h('span.num', fmtMoney(r.financing.loanIn)),
        h('span', '💸 Pelunasan pinjaman'), h('span.num', fmtMoney(r.financing.repaid)),
        h('span', 'Sisa pinjaman sekarang'), h('span.num', fmtMoney(game.state.loan)))),
    h('p.small.muted', 'Laba operasional = pemasukan − biaya operasional. Investasi (ladang, mesin, kandang, pabrik) '
      + 'dan pinjaman tidak dihitung sebagai biaya, tapi memengaruhi arus kas.'));
}

const sigOf = (game) => {
  const L = game.state.ledger;
  return `${period}|${L?.cur.day}|${Object.values(L?.cur.cats ?? {}).reduce((s, v) => s + v, 0).toFixed(0)}|${game.state.loan}`;
};
let shownSig = '';

function rerender(body) {
  const scroller = body.closest('.modal');
  const top = scroller?.scrollTop ?? 0;
  renderReport(body, app.game);
  shownSig = sigOf(app.game);
  if (scroller) scroller.scrollTop = top;
}

export function openFinanceReport(initial) {
  if (initial) period = initial;
  openModal({
    title: '📊 Laporan Keuangan',
    render: (body, modal) => { modal.el.querySelector('.modal')?.classList.add('fin-modal'); renderReport(body, app.game); shownSig = sigOf(app.game); },
    refresh: (modal) => { if (sigOf(app.game) !== shownSig) rerender(modal.body); },
  });
}

/** Compact card for the Prestasi tab: last 7 days at a glance + open button. */
export function financeCard(game) {
  const r = game.financeReport('7d');
  const v = verdict(r);
  return h('div.card.clickable.fin-card', { onclick: () => openFinanceReport('7d') },
    h(`div.fin-verdict.${v.cls}`, v.text),
    h('div.kv', h('span', 'Pemasukan 7 hari'), h('span.num', fmtMoney(r.income.total)),
      h('span', 'Biaya operasional'), h('span.num', fmtMoney(r.opex.total)),
      h('span', 'Laba operasional'), h(`span.num.${r.operatingProfit >= 0 ? 'pos' : 'neg'}`, fmtMoney(r.operatingProfit))),
    h('div.card-actions', h('button.btn.btn-small.btn-primary', '📊 Buka laporan keuangan')));
}
