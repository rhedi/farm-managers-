// Market tab: 📋 contracts, 🚚 deliveries, 🏦 finance, then prices (stock first, the rest collapsed) with sell/buy rows.
import { h, mount, fmtMoney, fmtPrice, fmtSignedPct, fmtNum } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { contractsPanel, contractsSig } from './contracts.js';
import { loansPanel, loansSig } from './loans.js';
import { shippingPanel, shippingSig } from './shipping.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const qtyInput = new Map(); // productId → typed qty (survives re-render)
const buyInput = new Map(); // productId → typed buy qty
let othersOpen = false;
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
      stroke: '#8a7a5c', 'stroke-width': '1', 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' }));
  }
  const coords = pts.map((p, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${y(p)}`);
  svg.appendChild(svgEl('polyline', { points: coords.join(' '), fill: 'none',
    stroke: pts[pts.length - 1] >= pts[0] ? '#3f7d2a' : '#b23a2e', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' }));
  return svg;
}

function numberInput(value, onInput, attrs = {}) {
  return h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value, style: { width: '7em' },
    oninput: (e) => onInput(e.target.value), ...attrs });
}

function sellRow(p) {
  if (!(p.stock > 0)) return null;
  const reserve = p.reserve || 0;
  const sellable = Math.max(0, p.stock - reserve);
  const doSell = (qty) => act(app.game.sellProduct(p.id, qty),
    (r) => `Terjual ${p.emoji} ${p.name} senilai ${fmtMoney(r.earned)}.`);
  return h('div.card-actions',
    h('span.small', `Stok ${fmtAmt(p.stock, p.unit)} ≈ ${fmtMoney(p.stock * p.price)}`,
      reserve > 0 ? h('span.eco-reserve', ` 🔒 ${fmtAmt(reserve, p.unit)} dicadangkan`) : null),
    h('span.spacer'),
    numberInput(qtyInput.get(p.id) ?? '', (v) => qtyInput.set(p.id, v), { placeholder: p.unit, 'aria-label': `Jumlah ${p.name}` }),
    h('button.btn.btn-small.btn-secondary', { onclick: () => {
      const q = Number(qtyInput.get(p.id));
      if (!(q > 0)) return act({ ok: false, reason: 'Isi jumlah yang akan dijual.' });
      qtyInput.delete(p.id);
      doSell(Math.min(q, sellable));
    } }, 'Jual'),
    h('button.btn.btn-small.btn-primary', { disabled: sellable <= 0, onclick: () => { qtyInput.delete(p.id); doSell(); } },
      reserve > 0 ? `Jual ${fmtAmt(sellable, p.unit)}` : 'Jual semua'));
}

function buyRow(p) {
  if (!p.buyable) return null;
  return h('div.card-actions',
    h('span.small', `Harga beli ${fmtPrice(p.buyPrice)}/${p.unit}`),
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

function productCard(p) {
  const cls = p.change > 0 ? 'price-up' : p.change < 0 ? 'price-down' : 'muted';
  const arrow = p.change > 0 ? '▲' : p.change < 0 ? '▼' : '•';
  return h('div.card',
    h('div.card-head',
      h('div.card-icon', p.emoji),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.card-title', p.name, ' ', eventBadge(p)),
        h('div.card-sub', `Dasar ${fmtPrice(p.basePrice)}/${p.unit} · `, ratioText(p))),
      h('div', { style: { textAlign: 'right' } },
        h('div.card-title.num', `${fmtPrice(p.price)}/${p.unit}`),
        h(`div.small.${cls}`, `${arrow} ${fmtSignedPct(p.change)}`))),
    sparkline(p.history, 120, 36, p.basePrice),
    sellRow(p),
    buyRow(p));
}

/** Compact row for products without stock (inside the collapsed list). */
function compactRow(p) {
  return h('details.eco-prow',
    h('summary',
      h('span.mkt-pname', h('span.mkt-pname-text', `${p.emoji} ${p.name}`), eventBadge(p, true)),
      h('span.mkt-pprice', h('span.num', `${fmtPrice(p.price)}/${p.unit}`), ratioText(p))),
    productCard(p));
}

function computeSig(game) {
  return `${game.day}|${loansSig(game)}|${contractsSig(game)}|${shippingSig(game)}|`
    + game.marketView().map((p) => `${p.price}:${p.stock}:${p.reserve ?? 0}`).join(',');
}

export function renderMarket(root) {
  const game = app.game;
  sig = computeSig(game);
  const items = game.marketView();
  const withStock = items.filter((p) => p.stock > 0);
  const rest = items.filter((p) => !(p.stock > 0));
  const others = h('details.eco-others', { open: othersOpen, ontoggle: (e) => { othersOpen = e.target.open; } },
    h('summary.section-title', `📊 Harga lainnya (${fmtNum(rest.length)})`),
    h('div.eco-plist', rest.map(compactRow)));
  mount(root,
    contractsPanel(),
    shippingPanel(),
    loansPanel(),
    h('section.section',
      h('div.section-title', '📈 Stok & harga', h('span.spacer'), h('span.small.muted', `Hari ${game.day}`)),
      withStock.length ? h('div.cards', withStock.map(productCard))
        : h('p.small.muted', 'Gudang kosong. Panen dulu, lalu jual di sini.'),
      rest.length ? others : null));
}

export function updateMarket(root) {
  if (computeSig(app.game) !== sig) renderMarket(root);
}
