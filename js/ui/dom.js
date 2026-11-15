// DOM + formatting helpers. Pure functions (fmt*) are safe to import in Node.

/** Escape text for HTML. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Hyperscript: h('div.card.x', { onclick, dataset, style, disabled }, ...children)
 * Children may be strings, numbers, nodes, arrays, null/false (skipped).
 */
export function h(tag, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null && attrs !== false) children.unshift(attrs);
    attrs = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) appendAll(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

/** Replace all children of el. */
export function mount(el, ...children) {
  el.replaceChildren();
  appendAll(el, children);
  return el;
}

// ---------- formatting (id-ID) ----------
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export const fmtNum = (v, digits = 0) => (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(Number(v) || 0);
/** Short count for tight spots: 950 · 74,5 rb · 1,2 jt. */
export function fmtCompact(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a < 10000) return nf0.format(n);
  if (a < 1e6) return `${nf1.format(n / 1000)} rb`;
  return `${nf1.format(n / 1e6)} jt`;
}
export const fmtMoney = (v) => `${(Number(v) || 0) < 0 ? '-' : ''}$${nf0.format(Math.abs(Math.round(Number(v) || 0)))}`;
/** Unit price: keeps decimals for cheap goods (eggs, milk). */
export const fmtPrice = (v) => `$${(Math.abs(v) < 10 ? nf2 : nf0).format(Number(v) || 0)}`;
export const fmtTons = (v) => `${nf1.format(Number(v) || 0)} t`;
export const fmtQty = (v, unit) => `${(unit === 't' ? nf1 : nf0).format(Number(v) || 0)} ${unit}`;
export const fmtPct = (v, digits = 0) => `${(digits ? nf1 : nf0).format((Number(v) || 0) * 100)}%`;
export const fmtPh = (v) => nf2.format(Number(v) || 0);

export function fmtSignedPct(pct) {
  const n = Number(pct) || 0;
  return `${n > 0 ? '+' : ''}${nf1.format(n)}%`;
}

/** Game hours → "3 jam 20 mnt" / "4 hari 20 jam". */
export function fmtHours(hours) {
  const h = Math.max(0, Number(hours) || 0);
  if (h >= 24) {
    let d = Math.floor(h / 24);
    let r = Math.round(h - d * 24);
    if (r === 24) { d++; r = 0; }
    return r ? `${d} hari ${r} jam` : `${d} hari`;
  }
  let whole = Math.floor(h);
  let m = Math.round((h - whole) * 60);
  if (m === 60) { whole++; m = 0; }
  if (whole === 24) return '1 hari';
  if (!whole) return `${m} mnt`;
  return m ? `${whole} jam ${m} mnt` : `${whole} jam`;
}

export const fmtClock = (day, hour) => `Hari ${day}, ${String(hour).padStart(2, '0')}:00`;

export const STATE_LABEL = {
  unowned: 'Dijual', idle: 'Kosong', plowed: 'Dibajak', growing: 'Tumbuh', ready: 'Siap panen', busy: 'Dikerjakan', orchard: 'Kebun buah',
};
export const STATE_EMOJI = { unowned: '🏷️', idle: '🟫', plowed: '〰️', growing: '🌱', ready: '✅', busy: '🚜', orchard: '🌳' };
export const TASK_LABEL = { plow: 'Bajak', fertilize: 'Pupuk', seed: 'Tanam', irrigate: 'Airi', harvest: 'Panen', lime: 'Kapur', prune: 'Pangkas', clear: 'Tebang' };
export const TASK_ICON = { plow: '🪓', fertilize: '🧪', seed: '🌱', irrigate: '💧', harvest: '🌾', lime: '🪨', prune: '✂️', clear: '🪓' };
export const TASK_ING = { plow: 'Membajak', fertilize: 'Memupuk', seed: 'Menanam', irrigate: 'Mengairi', harvest: 'Memanen', lime: 'Mengapur', prune: 'Memangkas', clear: 'Menebang kebun' };
export const SOIL_LABEL = { loam: 'Lempung', clay: 'Liat', sand: 'Pasir', silt: 'Debu' };
export const CONTAM_LABEL = { none: 'Tidak ada', low: 'Rendah', medium: 'Sedang' };
export const WATER_LABEL = { low: 'Rendah', med: 'Sedang', high: 'Tinggi' };
export const MACHINE_TYPE_LABEL = { tractor: 'Traktor', harvester: 'Pemanen', implement: 'Alat', truck: 'Truk' };

export function weatherEmoji(w) {
  if (!w) return '❔';
  if (w.rain) return w.temp < 2 ? '🌨️' : '🌧️';
  return w.temp >= 24 ? '☀️' : w.temp >= 12 ? '⛅' : '🌥️';
}
export const fmtWeather = (w) => (w ? `${weatherEmoji(w)} ${nf0.format(w.temp)}°C${w.rain ? ' hujan' : ''}` : '—');

/** Progress bar element. */
export function progressBar(frac, color = '') {
  const bar = h('div.bar', { style: { width: `${Math.round(Math.min(1, Math.max(0, frac || 0)) * 100)}%` } });
  return h(`div.progress${color ? '.' + color : ''}`, bar);
}
