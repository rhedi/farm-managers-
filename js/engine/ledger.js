// Income & expense ledger: every money movement is booked under a category.
// state.ledger = { since, cur: {day, cats}, days: [{day, cats}] (last LEDGER_DAYS closed days), total: {cat: amount} }.
import { round2 } from './rng.js';

export const LEDGER_DAYS = 60;

/** group: income | opex (operating cost) | capex (investment) | financing (loans, not profit). */
export const CATEGORIES = [
  { id: 'penjualan_panen', name: 'Penjualan panen', emoji: '🌾', group: 'income' },
  { id: 'penjualan_ternak_produk', name: 'Produk ternak', emoji: '🥛', group: 'income' },
  { id: 'penjualan_olahan', name: 'Produk olahan', emoji: '🧈', group: 'income' },
  { id: 'penjualan_ternak', name: 'Jual ternak', emoji: '🐄', group: 'income' },
  { id: 'kontrak', name: 'Kontrak', emoji: '📋', group: 'income' },
  { id: 'hadiah', name: 'Hadiah & subsidi', emoji: '🎁', group: 'income' },
  { id: 'penjualan_aset', name: 'Jual ladang/mesin', emoji: '🏷️', group: 'income' },
  { id: 'lainnya_masuk', name: 'Pemasukan lain', emoji: '💰', group: 'income' },
  { id: 'bbm', name: 'BBM', emoji: '⛽', group: 'opex' },
  { id: 'benih', name: 'Benih', emoji: '🌱', group: 'opex' },
  { id: 'pupuk_kapur_irigasi', name: 'Pupuk, kapur & irigasi', emoji: '🧪', group: 'opex' },
  { id: 'sewa_pemanen', name: 'Sewa pemanen', emoji: '🚜', group: 'opex' },
  { id: 'gaji', name: 'Gaji pekerja', emoji: '👷', group: 'opex' },
  { id: 'pakan', name: 'Pakan', emoji: '🌽', group: 'opex' },
  { id: 'perbaikan', name: 'Perbaikan mesin', emoji: '🔧', group: 'opex' },
  { id: 'semprot_hama', name: 'Semprot hama', emoji: '🐛', group: 'opex' },
  { id: 'bunga_pinjaman', name: 'Bunga pinjaman', emoji: '🏦', group: 'opex' },
  { id: 'penalti_kontrak', name: 'Denda kontrak', emoji: '⚠️', group: 'opex' },
  { id: 'pembelian_produk', name: 'Beli produk', emoji: '🛒', group: 'opex' },
  { id: 'transportasi', name: 'Transportasi (BBM truk)', emoji: '🚚', group: 'opex' },
  { id: 'riset', name: 'Reset riset', emoji: '🔬', group: 'opex' },
  { id: 'sewa_pemetik', name: 'Sewa pemetik buah', emoji: '🧺', group: 'opex' },
  { id: 'perawatan_kebun', name: 'Pangkas & tebang kebun', emoji: '✂️', group: 'opex' },
  { id: 'listrik_rumah_kaca', name: 'Listrik rumah kaca', emoji: '💡', group: 'opex' },
  { id: 'lainnya', name: 'Lain-lain', emoji: '📦', group: 'opex' },
  { id: 'beli_ladang', name: 'Beli ladang', emoji: '🗺️', group: 'capex' },
  { id: 'beli_mesin', name: 'Beli mesin', emoji: '🚜', group: 'capex' },
  { id: 'upgrade_mesin', name: 'Upgrade mesin', emoji: '⚙️', group: 'capex' },
  { id: 'kandang', name: 'Kandang', emoji: '🏠', group: 'capex' },
  { id: 'beli_ternak', name: 'Beli ternak', emoji: '🐑', group: 'capex' },
  { id: 'indukan', name: 'Indukan unggul', emoji: '🧬', group: 'capex' },
  { id: 'gudang', name: 'Gudang (silo & dingin)', emoji: '🏚️', group: 'capex' },
  { id: 'pabrik', name: 'Pabrik', emoji: '🏭', group: 'capex' },
  { id: 'bibit_pohon', name: 'Bibit pohon', emoji: '🌳', group: 'capex' },
  { id: 'rumah_kaca', name: 'Rumah kaca', emoji: '🏠', group: 'capex' },
  { id: 'pinjaman_masuk', name: 'Pinjaman diterima', emoji: '💳', group: 'financing' },
  { id: 'pelunasan_pinjaman', name: 'Pelunasan pinjaman', emoji: '💸', group: 'financing' },
];
export const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));
const GROUPS = ['income', 'opex', 'capex'];
export const PERIODS = ['today', 'yesterday', '7d', '30d', 'all'];

export const newLedger = (day) => ({ since: day, cur: { day, cats: {} }, days: [], total: {} });

/** Old saves: start tracking from the current day. */
export function normalizeLedger(s) {
  const day = Math.floor(s.time / 24) + 1;
  const L = s.ledger;
  if (!L || typeof L !== 'object' || !L.cur) { s.ledger = newLedger(day); return; }
  L.cur.cats ||= {}; L.days ||= []; L.total ||= {}; L.since ??= L.cur.day;
  if (L.days.length > LEDGER_DAYS) L.days.splice(0, L.days.length - LEDGER_DAYS);
}

/** Book `amount` (>0) under `category`; unknown ids fall back to 'lainnya' / 'lainnya_masuk'. */
export function record(state, category, amount, income) {
  if (!(amount > 0)) return;
  let id = category;
  const c = CATEGORY.get(id);
  if (!c || (c.group === 'income' || id === 'pinjaman_masuk') !== income) id = income ? 'lainnya_masuk' : 'lainnya';
  if (!state.ledger) normalizeLedger(state);
  const L = state.ledger;
  L.cur.cats[id] = round2((L.cur.cats[id] || 0) + amount);
  L.total[id] = round2((L.total[id] || 0) + amount);
}

/** Daily rollover: close the running day and open `nextDay`. */
export function closeDay(state, nextDay) {
  if (!state.ledger) normalizeLedger(state);
  const L = state.ledger;
  L.days.push(L.cur);
  if (L.days.length > LEDGER_DAYS) L.days.splice(0, L.days.length - LEDGER_DAYS);
  L.cur = { day: nextDay, cats: {} };
}

/** Category for selling a product: crop / animal product / factory good. */
export function saleCategory(game, productId) {
  if (game.idx.crops.has(productId)) return 'penjualan_panen';
  if ((game.data.ANIMALS || []).some((a) => a.product === productId)) return 'penjualan_ternak_produk';
  return 'penjualan_olahan';
}

function sumGroups(cats) {
  const g = { income: 0, opex: 0, capex: 0 };
  for (const [id, v] of Object.entries(cats)) { const grp = CATEGORY.get(id)?.group; if (grp in g) g[grp] += v; }
  return g;
}

function groupView(cats, group) {
  const list = CATEGORIES.filter((c) => c.group === group && cats[c.id] > 0)
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, amount: round2(cats[c.id]) }));
  const total = round2(list.reduce((s, x) => s + x.amount, 0));
  for (const x of list) x.pct = total > 0 ? Math.round((x.amount / total) * 1000) / 10 : 0;
  list.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  return { total, byCat: list };
}

/** Buckets for days [from..to] (missing days = empty). */
function bucketsBetween(L, from, to) {
  const byDay = new Map([...L.days, L.cur].map((b) => [b.day, b.cats]));
  const out = [];
  for (let d = Math.max(from, L.since); d <= to; d++) out.push({ day: d, cats: byDay.get(d) || {} });
  return out;
}

export function financeReport(state, period = '7d') {
  if (!state.ledger) normalizeLedger(state);
  if (!PERIODS.includes(period)) period = '7d';
  const L = state.ledger, today = L.cur.day;
  const span = { today: [today, today], yesterday: [today - 1, today - 1], '7d': [today - 6, today], '30d': [today - 29, today] };
  const buckets = period === 'all' ? bucketsBetween(L, L.since, today) : bucketsBetween(L, ...span[period]);
  let cats = {};
  if (period === 'all') cats = L.total;
  else for (const b of buckets) for (const [id, v] of Object.entries(b.cats)) cats[id] = (cats[id] || 0) + v;
  const [income, opex, capex] = GROUPS.map((g) => groupView(cats, g));
  const loanIn = round2(cats.pinjaman_masuk || 0), repaid = round2(cats.pelunasan_pinjaman || 0);
  const operatingProfit = round2(income.total - opex.total);
  const daily = (period === 'all' ? buckets.slice(-LEDGER_DAYS - 1) : buckets).map((b) => {
    const g = sumGroups(b.cats);
    return { day: b.day, income: round2(g.income), opex: round2(g.opex), capex: round2(g.capex), profit: round2(g.income - g.opex) };
  });
  return { period, days: Math.max(1, buckets.length), income, opex, capex, financing: { loanIn, repaid }, operatingProfit,
    netCashFlow: round2(income.total - opex.total - capex.total + loanIn - repaid),
    margin: income.total > 0 ? operatingProfit / income.total : null, daily };
}
