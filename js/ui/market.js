// Pasar tab: 💰 Jual (stock by category, price trend, partial sell) | 📋 Kontrak | 🚚 Kirim (Manajer Logistik + manual) | 📊 Harga.
import { h, patch, fmtMoney, fmtPrice } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { contractsPanel, contractsSig, deliverableCount } from './contracts.js';
import { shippingPanel, shippingSig } from './shipping.js';
import { dispatcherCard, dispatcherSig } from './dispatcher.js';
import { subTabBar, getSub, fold } from './subtabs.js';
import { CATEGORIES, stockByCategory, groupValue, sellGroup, stockRow, trendChip, sellableQty } from './stock.js';
import { iconOf } from './fishArt.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SUBS = ['sell', 'contracts', 'ship', 'prices'];
const qtyInput = new Map(); // productId → typed qty (survives re-render)
const buyInput = new Map(); // productId → typed buy qty
const openRows = new Set(); // expanded rows in Jual
let sig = '';

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Price sparkline; pass `base` to draw a dashed base-price line (included in the y-range). */
export function sparkline(history, w = 120, hgt = 36, base = null) {
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none', class: 'sparkline' });
  const pts = history?.length ? history : [];
  if (pts.length < 2) return svg;
  const all = base > 0 ? [...pts, base] : pts;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const y = (p) => (hgt - 3 - (p - min) / span * (hgt - 6)).toFixed(1);
  if (base > 0) {
    svg.appendChild(svgEl('line', { x1: 0, x2: w, y1: y(base), y2: y(base), class: 'eco-baseline',
      'stroke-width': '1', 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' }));
  }
  const coords = pts.map((p, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${y(p)}`);
  svg.appendChild(svgEl('polyline', { points: coords.join(' '), fill: 'none',
    class: pts[pts.length - 1] >= pts[0] ? 'spark-up' : 'spark-down', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' }));
  return svg;
}

function numberInput(value, onInput, attrs = {}) {
  return h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value, style: { width: '7em' },
    oninput: (e) => onInput(e.target.value), ...attrs });
}

function ratioText(p) {
  const pct = Math.round((p.ratio ?? 1) * 100);
  const word = pct >= 110 ? 'mahal' : pct <= 90 ? 'murah' : 'normal';
  return h(`span.eco-ratio.eco-${word}`, `${pct}% dari dasar · ${word}`);
}

/** 📈/📉 badge for an active boom/crash on this product (F5 events), or null. */
function eventBadge(p, short = false) {
  const e = (app.game.activeEvents?.() || []).find((x) => (x.type === 'boom' || x.type === 'crash') && x.productId === p.id);
  if (!e || !Number.isFinite(e.mult)) return null;
  const pct = Math.round((e.mult - 1) * 100);
  const until = e.endsDay ? ` s/d hari ${e.endsDay}` : '';
  return h(`span.mkt-event.${e.type}`, { title: e.desc },
    `${e.emoji} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%${short ? '' : until}`);
}

/** Price detail: base price, ratio, sparkline over 30 days with the dashed base line. */
function priceDetail(p) {
  return [
    h('div.small.muted', `Dasar ${fmtPrice(p.basePrice)}/${p.unit} · `, ratioText(p), ' ', eventBadge(p)),
    sparkline(p.history, 120, 36, p.basePrice),
  ];
}

function partialSell(p, it) {
  const sellable = sellableQty(it);
  return h('div.card-actions',
    h('span.small.muted', 'Jual sebagian'),
    h('span.spacer'),
    numberInput(qtyInput.get(p.id) ?? '', (v) => qtyInput.set(p.id, v), { placeholder: p.unit, 'aria-label': `Jumlah ${p.name}` }),
    h('button.btn.btn-small.btn-secondary', { onclick: () => {
      const q = Number(qtyInput.get(p.id));
      if (!(q > 0)) return act({ ok: false, reason: 'Isi jumlah yang akan dijual.' });
      qtyInput.delete(p.id);
      act(app.game.sellProduct(p.id, Math.min(q, sellable)), (r) => `Terjual ${p.emoji} ${p.name} senilai ${fmtMoney(r.earned)}.`);
    } }, 'Jual'));
}

function buyRow(p) {
  if (!p.buyable) return null;
  return h('div.card-actions',
    h('span.small', `Beli ${fmtPrice(p.buyPrice)}/${p.unit}`),
    h('span.spacer'),
    numberInput(buyInput.get(p.id) ?? '', (v) => buyInput.set(p.id, v), { placeholder: p.unit, 'aria-label': `Jumlah beli ${p.name}` }),
    h('button.btn.btn-small.btn-secondary', { onclick: () => {
      const q = Number(buyInput.get(p.id));
      if (!(q > 0)) return act({ ok: false, reason: 'Isi jumlah yang akan dibeli.' });
      const r = app.game.buyProduct(p.id, q);
      if (r.ok) buyInput.delete(p.id);
      act(r, `Membeli ${fmtAmt(r.qty, p.unit)} ${p.name} seharga ${fmtMoney(r.cost)}.`);
    } }, 'Beli'));
}

/** Jual row: the stock row (one-tap "Jual $value"), tap elsewhere to expand trend + partial sell. */
function sellRow(it, p) {
  return h('details.stock-detail', { dataset: { key: it.id }, open: openRows.has(it.id),
    ontoggle: (e) => (e.target.open ? openRows.add(it.id) : openRows.delete(it.id)) },
    h('summary', stockRow(it, trendChip(p.change))),
    h('div.stock-detail-body', priceDetail(p), partialSell(p, it)));
}

function sellPane(game, byId) {
  const groups = stockByCategory(game);
  const all = Object.values(groups).flat();
  if (!all.length) return h('div.empty', h('span.big', '🧺'), 'Gudang kosong. Panen dulu, lalu jual di sini.');
  const total = groupValue(all);
  return [
    h('div.stock-summary',
      h('div.stock-summary-main', h('div.small.muted', `Nilai semua stok · hari ${game.day}`), h('div.stock-summary-value', fmtMoney(total))),
      h('button.btn.btn-secondary', { type: 'button', onclick: () => sellGroup(all, 'Semua stok') }, 'Jual semua…')),
    CATEGORIES.filter((c) => groups[c.id].length).map((c) => h('section.section',
      h('div.section-title', `${c.icon} ${c.label}`, h('span.small.muted', fmtMoney(groupValue(groups[c.id])))),
      h('div.stock-list', groups[c.id].map((it) => sellRow(it, byId.get(it.id)))))),
    h('p.hint', 'Ketuk baris untuk tren harga dan jual sebagian. Cadangan pakan (🔒) tidak ikut terjual.'),
  ];
}

/** Harga row: name + price; expands to the price detail, the stock line and (crops) buying. */
function priceRow(p) {
  return h('details.eco-prow', { dataset: { key: p.id } },
    h('summary',
      h('span.mkt-pname', h('span.mkt-pname-text', iconOf(p), ' ', p.name), eventBadge(p, true)),
      h('span.mkt-pprice', h('span.num', `${fmtPrice(p.price)}/${p.unit}`), trendChip(p.change))),
    h('div.eco-prow-body', priceDetail(p),
      p.stock > 0 ? h('div.small', `Stok ${fmtAmt(p.stock, p.unit)} ≈ ${fmtMoney(p.stock * p.price)}`) : null,
      buyRow(p)));
}

function pricesPane(items) {
  return [
    h('p.hint', 'Harga bergerak setiap hari. Tanaman bisa dibeli (+20%) untuk pakan atau kontrak.'),
    CATEGORIES.map((c) => {
      const list = items.filter((p) => (p.category ?? 'crop') === c.id);
      const up = list.filter((p) => p.change > 0).length;
      return fold(`prices-${c.id}`, `${c.icon} ${c.label}`, { open: c.id === 'crop', meta: `${list.length} · ▲${up}` },
        h('div.eco-plist', list.map(priceRow)));
    }),
  ];
}

function computeSig(game) {
  return `${getSub('market', SUBS)}|${game.day}|${contractsSig(game)}|${shippingSig(game)}|${dispatcherSig(game)}|`
    + game.marketView().map((p) => `${p.price}:${p.stock}:${p.reserve ?? 0}`).join(',');
}

export function renderMarket(root) {
  const game = app.game;
  sig = computeSig(game);
  const sub = getSub('market', SUBS);
  const items = game.marketView();
  const byId = new Map(items.map((p) => [p.id, p]));
  const deliver = deliverableCount(game);
  patch(root,
    subTabBar('market', [
      { id: 'sell', icon: '💰', label: 'Jual' },
      { id: 'contracts', icon: '📋', label: 'Kontrak', badge: deliver || null },
      { id: 'ship', icon: '🚚', label: 'Kirim' },
      { id: 'prices', icon: '📊', label: 'Harga' },
    ], sub),
    sub === 'sell' ? sellPane(game, byId)
      : sub === 'contracts' ? contractsPanel()
        : sub === 'ship' ? [dispatcherCard(game), shippingPanel()]
          : pricesPane(items));
}

export function updateMarket(root) {
  if (computeSig(app.game) !== sig) renderMarket(root);
}
