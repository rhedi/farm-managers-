// Laporan Keuangan: daily income vs operating cost bars + operating-profit line (inline SVG, like netWorthChart.js).
import { h, fmtMoney } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 300, H = 130, PAD = 4;

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** `daily`: [{day, income, opex, profit}] (oldest first). */
export function financeChart(daily) {
  const n = daily.length;
  const max = Math.max(1, ...daily.flatMap((d) => [d.income, d.opex, d.profit]));
  const min = Math.min(0, ...daily.map((d) => d.profit));
  const span = max - min || 1;
  const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const slot = (W - 2 * PAD) / n;
  const bw = Math.max(1, slot * 0.38);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'fin-chart',
    role: 'img', 'aria-label': 'Grafik pemasukan dan biaya operasional per hari' });
  const y0 = y(0);
  daily.forEach((d, i) => {
    const x = PAD + i * slot + slot / 2;
    if (d.income > 0) svg.appendChild(svgEl('rect', { x: (x - bw).toFixed(1), y: y(d.income).toFixed(1), width: bw.toFixed(1),
      height: Math.max(0.5, y0 - y(d.income)).toFixed(1), class: 'fin-bar-in' }));
    if (d.opex > 0) svg.appendChild(svgEl('rect', { x: x.toFixed(1), y: y(d.opex).toFixed(1), width: bw.toFixed(1),
      height: Math.max(0.5, y0 - y(d.opex)).toFixed(1), class: 'fin-bar-out' }));
  });
  svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: y0.toFixed(1), y2: y0.toFixed(1), class: 'fin-zero',
    'vector-effect': 'non-scaling-stroke' }));
  if (n > 1) {
    const pts = daily.map((d, i) => `${(PAD + i * slot + slot / 2).toFixed(1)},${y(d.profit).toFixed(1)}`).join(' ');
    svg.appendChild(svgEl('polyline', { points: pts, class: 'fin-profit-line', fill: 'none',
      'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
  }
  const best = daily.reduce((b, d) => (d.profit > b.profit ? d : b), daily[0]);
  const worst = daily.reduce((b, d) => (d.profit < b.profit ? d : b), daily[0]);
  return h('div.fin-chart-wrap', svg,
    h('div.chart-legend.small.muted',
      h('span', `Hari ${daily[0].day}`),
      h('span.fin-legend',
        h('span.fin-key.in'), 'Pemasukan ', h('span.fin-key.out'), 'Biaya ', h('span.fin-key.line'), 'Laba'),
      h('span', `Hari ${daily[n - 1].day}`)),
    h('div.small.muted', `Laba harian terbaik ${fmtMoney(best.profit)} (hari ${best.day}) · terburuk ${fmtMoney(worst.profit)} (hari ${worst.day})`));
}
