// Net-worth chart (F4) for the Prestasi tab: SVG polylines from state.history.
import { h, fmtMoney } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 300, H = 120, PAD = 4;

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function line(points, key, min, span, color) {
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = PAD + (n > 1 ? i / (n - 1) : 0) * (W - 2 * PAD);
    const y = H - PAD - ((p[key] - min) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return svgEl('polyline', { points: coords.join(' '), fill: 'none', stroke: color, 'stroke-width': '2',
    'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' });
}

export function netWorthCard(game) {
  const hist = Array.isArray(game.state.history) ? game.state.history.filter((p) => Number.isFinite(p?.netWorth)) : [];
  const now = game.netWorth?.();
  const head = h('div.kv',
    h('span', 'Kekayaan bersih'), h('span.num', now == null ? '—' : fmtMoney(now)),
    h('span', 'Uang tunai'), h('span.num', fmtMoney(game.state.money)));
  if (hist.length < 2) {
    return h('div.card', head, h('p.small.muted', 'Grafik muncul setelah beberapa hari permainan.'));
  }
  const vals = hist.flatMap((p) => [p.netWorth, p.money ?? p.netWorth]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'networth-chart',
    role: 'img', 'aria-label': 'Grafik kekayaan bersih' });
  if (min < 0 && max > 0) {
    const y = (H - PAD - ((0 - min) / span) * (H - 2 * PAD)).toFixed(1);
    svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: y, y2: y, stroke: '#c0442f', 'stroke-dasharray': '4 4',
      'vector-effect': 'non-scaling-stroke' }));
  }
  if (hist.some((p) => p.money != null)) svg.appendChild(line(hist.map((p) => ({ v: p.money ?? p.netWorth })), 'v', min, span, '#e2b743'));
  svg.appendChild(line(hist, 'netWorth', min, span, '#3f7d2a'));
  const first = hist[0], lastP = hist[hist.length - 1];
  return h('div.card', head, svg,
    h('div.chart-legend.small.muted',
      h('span', `Hari ${first.day}`),
      h('span', h('span.legend-dot.nw'), ' Kekayaan  ', h('span.legend-dot.cash'), ' Uang'),
      h('span', `Hari ${lastP.day}`)),
    h('div.small.muted', `Tertinggi ${fmtMoney(max)} · terendah ${fmtMoney(min)}`));
}
