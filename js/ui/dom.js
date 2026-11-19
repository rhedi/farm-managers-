// DOM + formatting helpers. Pure functions (fmt*) are safe to import in Node.

/** Escape text for HTML. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Hyperscript: h('div.card.x', { onclick, dataset, style, disabled }, ...children)
 * Children may be strings, numbers, nodes, arrays, null/false (skipped).
 * `on*` handlers go through one shared listener that calls `el.__on[type]`, so patch() can give a kept node the
 * handlers of its freshly rendered twin (closures over the current data) without stacking listeners.
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
    if (k.startsWith('on') && typeof v === 'function') { const t = k.slice(2); (el.__on ??= {})[t] = v; el.addEventListener(t, onEvent); }
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

function onEvent(e) { return this.__on?.[e.type]?.call(this, e); }

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

/** Set an element's text, rewriting its one text node in place (no node swap) and only when it changed. */
export function setText(el, text) {
  if (!el) return;
  const t = el.firstChild;
  if (t && t === el.lastChild && t.nodeType === 3) {
    if (t.nodeValue !== text) t.nodeValue = text;
  } else if (el.textContent !== text) el.textContent = text;
}

// ---------- in-place patch ----------
// Periodic re-renders build a fresh tree and patch() merges it into the nodes already on screen: an equal node is
// kept and only its changed attributes, text and children are written, so running CSS animations, transitions,
// focus and scroll stay put. Only nodes that really appear or disappear are inserted or removed.

/** Attributes that identify a list item among its siblings (else: tag + first class, in order). */
const KEY_ATTRS = ['data-key', 'data-field-id', 'data-uid', 'data-pond', 'data-product-id', 'data-region', 'data-sub', 'data-chip', 'data-perk', 'data-tab'];
const twins = new WeakMap(); // freshly rendered node → the kept node it was merged into
const fxOn = new WeakMap(); // live node → one-shot effect classes still playing (playFx); patch() keeps them

/** The on-screen node for a node built by the last render (patch() may have kept an older equal node instead). */
export const liveNode = (n) => (n && twins.get(n)) || n;

function keyOf(n) {
  if (n.nodeType !== 1) return `#${n.nodeType}`;
  const cls = n.getAttribute('class');
  const k = cls ? `${n.nodeName}.${cls.trim().split(/\s/, 1)[0]}` : n.nodeName;
  for (const a of KEY_ATTRS) {
    const v = n.getAttribute(a);
    if (v !== null) return `${k}[${a}=${v}]`;
  }
  return k;
}

/** Play a one-shot CSS animation class (keyframes named like the class) on a live node: restarts it if it is already
 *  playing, removes it when it ends, and keeps it through in-place patches meanwhile. */
export function playFx(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // commit the removal so a repeat starts over
  el.classList.add(cls);
  let on = fxOn.get(el);
  if (!on) fxOn.set(el, on = new Set());
  on.add(cls);
  const end = (e) => {
    if (e.target !== el || e.animationName !== cls) return;
    el.removeEventListener('animationend', end);
    on.delete(cls);
    el.classList.remove(cls);
  };
  el.addEventListener('animationend', end);
}

/** Make el's children equal to `children` (same arguments as mount), keeping and updating equal nodes in place. */
export function patch(el, ...children) {
  const fresh = document.createDocumentFragment();
  appendAll(fresh, children);
  patchChildren(el, [...fresh.childNodes]);
  return el;
}

function patchChildren(parent, next) {
  const pool = new Map();
  for (const o of parent.childNodes) {
    if (isSpacer(o)) continue;
    const k = keyOf(o);
    if (pool.has(k)) pool.get(k).push(o); else pool.set(k, [o]);
  }
  const kept = next.map((n) => pool.get(keyOf(n))?.shift() ?? null);
  // Drop leftovers first, so kept nodes never have to be moved past them (a move restarts their animations). A held
  // element (holdHeights) that just disappears leaves a blank spacer of its height until the next releaseHeights, so
  // nothing below moves; when new nodes come in at the same level they take that room instead (no spacers there).
  const incoming = kept.includes(null);
  if (incoming) for (const o of [...parent.childNodes]) if (isSpacer(o)) o.remove();
  for (const list of pool.values()) for (const o of list) if (incoming) o.remove(); else dropNode(o);
  let at = parent.firstChild;
  next.forEach((n, i) => {
    while (isSpacer(at)) at = at.nextSibling;
    const o = kept[i];
    if (o) syncNode(o, n);
    const node = o ?? n;
    if (node === at) at = at.nextSibling;
    else parent.insertBefore(node, at);
  });
}

const isSpacer = (n) => !!n?.classList?.contains('hold-spacer');
function dropNode(o) {
  const hgt = held.get(o);
  if (!hgt) { o.remove(); return; }
  const sp = document.createElement('div');
  sp.className = 'hold-spacer';
  sp.setAttribute('aria-hidden', 'true');
  sp.style.minHeight = `${hgt}px`;
  o.replaceWith(sp);
}

function syncNode(o, n) {
  twins.set(n, o);
  if (o.nodeType !== 1) {
    if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    return;
  }
  for (const { name, value } of n.attributes) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  for (const name of o.getAttributeNames()) if (!n.hasAttribute(name)) o.removeAttribute(name);
  const fx = fxOn.get(o);
  if (fx) for (const c of fx) o.classList.add(c);
  const hold = held.get(o);
  if (hold) o.style.minHeight = `${hold}px`;
  if (n.__on) for (const t in n.__on) if (!o.__on?.[t]) o.addEventListener(t, onEvent);
  o.__on = n.__on;
  patchChildren(o, [...n.childNodes]);
  // Form state lives in properties, not attributes; never overwrite what the player is typing.
  if (o.tagName === 'OPTION') {
    if (o.selected !== n.selected) o.selected = n.selected;
  } else if (/^(INPUT|SELECT|TEXTAREA)$/.test(o.tagName) && o !== document.activeElement) {
    if (o.value !== n.value) o.value = n.value;
    if (o.checked !== n.checked) o.checked = n.checked;
  }
}

const held = new WeakMap(); // live node → held height (px), re-applied by patch() as min-height

/** Grow-only heights: each element keeps the tallest height it had since it was rendered, so a number that wraps to
 *  a second line and back (or a list that loses a row at 5×) never pulls the content below up and down. Fresh renders
 *  (tab / sub-tab switch) start over. Reads all heights first (one layout), then writes. */
export function holdHeights(els) {
  const hs = els.map((el) => Math.ceil(el.getBoundingClientRect().height));
  els.forEach((el, i) => {
    if (!hs[i] || hs[i] <= (held.get(el) ?? 0)) return;
    held.set(el, hs[i]);
    el.style.minHeight = `${hs[i]}px`;
  });
}

/** Drop the held heights inside `root` (the player changed something: the page may shrink now). */
export function releaseHeights(root) {
  for (const el of root.querySelectorAll('[style*="min-height"]')) {
    if (!held.delete(el)) continue;
    el.style.minHeight = '';
  }
  for (const sp of root.querySelectorAll('.hold-spacer')) sp.remove();
}

// ---------- formatting (id-ID) ----------
const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export const fmtNum = (v, digits = 0) => (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(Number(v) || 0);
/** Short count for tight spots: 950 · 74,5 rb · 1,2 jt · 115 jt · 4,15 M (no decimal from 100 jt; miliar for Lv 76–100 XP). */
export function fmtCompact(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a < 10000) return nf0.format(n);
  if (a < 1e6) return `${nf1.format(n / 1000)} rb`;
  if (a < 1e9) return `${(a < 1e8 ? nf1 : nf0).format(n / 1e6)} jt`;
  return `${(a < 1e10 ? nf2 : a < 1e11 ? nf1 : nf0).format(n / 1e9)} M`;
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
