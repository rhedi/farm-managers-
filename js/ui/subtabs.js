// Sub-tab bar (sticky segmented control under the top bar, scrolls sideways when it doesn't fit, with a pill
// indicator that slides to the active sub-tab), swipe left/right on the content to change sub-tab, and
// collapsible sections. The chosen sub-tab per tab and each section's open state survive re-renders and
// reloads (localStorage 'farm-manager-ui', separate from the game save).
import { h, liveNode, playFx } from './dom.js';
import { app } from './app.js';
import { toast } from './modal.js';

const KEY = 'farm-manager-ui';
let ui = { sub: {}, fold: {} };
try { ui = { sub: {}, fold: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* storage blocked or corrupt */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch { /* ignore */ } };

/** Active sub-tab of `tab`: the remembered one if it is still offered, else the first. */
export function getSub(tab, ids) {
  const s = ui.sub[tab];
  return ids.includes(s) ? s : ids[0];
}

export function setSub(tab, id) {
  if (ui.sub[tab] === id) return;
  ui.sub[tab] = id;
  persist();
}

const touchUi = () => !!window.matchMedia?.('(pointer: coarse)').matches;

/** Switch sub-tab: render the new content fresh, back to the top, slide it in from the side it came from (dir ±1). */
function switchSub(tab, id, dir) {
  setSub(tab, id);
  app.requestRender({ fresh: true });
  window.scrollTo(0, 0);
  for (const el of document.querySelectorAll('#view > :not(.subtabs)')) playFx(el, dir > 0 ? 'sub-in-next' : 'sub-in-prev');
}

/** Last indicator position and bar scroll per tab, so a re-rendered bar slides on from where it was; a bar patched in
 *  place is rendered with that position so the indicator never blinks to 0 for a frame. */
const barPos = {};
const indStyle = (p) => ({ transform: `translateX(${p.x}px)`, width: `${p.w}px`, top: `${p.top}px`, height: `${p.h}px` });

function placeIndicator(nav, animate = true) {
  const btn = nav.querySelector('.subtab.active');
  const ind = nav.querySelector('.subtab-ind');
  if (!btn || !ind || !nav.isConnected || !nav.offsetParent) return;
  const tab = nav.dataset.tab;
  const prev = barPos[tab];
  if (prev) {
    nav.scrollLeft = prev.scroll;
    ind.style.transition = 'none';
    Object.assign(ind.style, { transform: `translateX(${prev.x}px)`, width: `${prev.w}px` });
    void ind.offsetWidth; // commit the old position before animating to the new one
    ind.style.transition = animate ? '' : 'none';
  }
  const x = btn.offsetLeft, w = btn.offsetWidth, top = btn.offsetTop, hgt = btn.offsetHeight;
  Object.assign(ind.style, indStyle({ x, w, top, h: hgt }));
  nav.classList.add('has-ind');
  // Keep the active sub-tab in view when the bar scrolls.
  const max = nav.scrollWidth - nav.clientWidth;
  const scroll = max > 0 ? Math.max(0, Math.min(max, x - (nav.clientWidth - w) / 2)) : 0;
  if (Math.abs(scroll - nav.scrollLeft) > 1) nav.scrollTo({ left: scroll, behavior: prev && animate ? 'smooth' : 'auto' });
  barPos[tab] = { x, w, scroll, top, h: hgt };
}

window.addEventListener('resize', () => {
  for (const nav of document.querySelectorAll('#view > .subtabs')) placeIndicator(nav, false);
});

/**
 * Segmented control. `items`: [{ id, icon, label, badge?, warn? }]. Picking one re-renders the view
 * and scrolls back to the top of the page.
 */
export function subTabBar(tab, items, active) {
  const at = items.findIndex((it) => it.id === active);
  const pos = barPos[tab];
  const nav = h(`nav.subtabs${pos ? '.has-ind' : ''}`, { role: 'tablist', 'aria-label': 'Bagian', dataset: { tab } },
    h('span.subtab-ind', { 'aria-hidden': 'true', style: pos ? indStyle(pos) : null }),
    items.map((it, i) => h(
      `button.subtab${it.id === active ? '.active' : ''}`,
      { type: 'button', role: 'tab', 'aria-selected': String(it.id === active), dataset: { sub: it.id },
        onclick: () => {
          if (it.id === active) return;
          switchSub(tab, it.id, i > at ? 1 : -1);
          if (!ui.swipeHint && touchUi()) {
            ui.swipeHint = true;
            persist();
            toast('← geser untuk pindah →', '', { key: 'swipe-hint' });
          }
        } },
      h('span.subtab-icon', { 'aria-hidden': 'true' }, it.icon),
      h('span.subtab-label', it.label),
      it.badge ? h(`span.subtab-badge${it.warn ? '.warn' : ''}`, String(it.badge)) : null)));
  requestAnimationFrame(() => placeIndicator(liveNode(nav)));
  return nav;
}

// ---------- Swipe between sub-tabs ----------
const SWIPE_MIN = 60; // px of horizontal travel
const SWIPE_RATIO = 1.5; // |dx| must exceed 1.5 × |dy|
const NO_SWIPE = '.map, input, select, textarea, [contenteditable], svg, canvas, [data-no-swipe]';

function inHScroller(el, stop) {
  for (let e = el; e && e !== stop; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
}

/**
 * Horizontal swipe on the view content switches to the next/previous sub-tab. Vertical scrolling stays with
 * the browser (#view has touch-action: pan-y); swipes that start in a sideways-scrolling strip, the map,
 * a chart or a form field are ignored. Past the first/last sub-tab the content only gives a small rubber band.
 */
export function initSubtabSwipe(view) {
  let s = null;
  const settle = (st) => {
    for (const p of st.panes) {
      p.style.transition = 'transform .22s ease-out';
      p.style.transform = '';
      p.addEventListener('transitionend', () => { p.style.transition = ''; }, { once: true });
    }
  };
  view.addEventListener('touchstart', (e) => {
    s = null;
    if (e.touches.length !== 1) return;
    const nav = view.querySelector(':scope > .subtabs');
    if (!nav || !nav.offsetParent) return; // no sub-tabs here, or both panes shown side by side
    const t = e.target;
    if (!(t instanceof Element) || t.closest(NO_SWIPE) || inHScroller(t, view)) return;
    const btns = [...nav.querySelectorAll('.subtab')];
    const i = btns.findIndex((b) => b.classList.contains('active'));
    if (i < 0) return;
    const { clientX: x, clientY: y } = e.touches[0];
    s = { x, y, dx: 0, dy: 0, horiz: null, tab: nav.dataset.tab, btns, i,
      panes: [...view.children].filter((c) => !c.classList.contains('subtabs')) };
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (!s) return;
    if (e.touches.length !== 1) { settle(s); s = null; return; }
    s.dx = e.touches[0].clientX - s.x;
    s.dy = e.touches[0].clientY - s.y;
    if (s.horiz === null && Math.max(Math.abs(s.dx), Math.abs(s.dy)) > 10) s.horiz = Math.abs(s.dx) > SWIPE_RATIO * Math.abs(s.dy);
    if (!s.horiz) return;
    const edge = s.dx > 0 ? s.i === 0 : s.i === s.btns.length - 1;
    const off = edge ? Math.sign(s.dx) * Math.min(28, Math.abs(s.dx) * 0.15) : s.dx * 0.35;
    for (const p of s.panes) { p.style.transition = 'none'; p.style.transform = `translateX(${off.toFixed(1)}px)`; }
  }, { passive: true });
  const end = () => {
    const st = s;
    s = null;
    if (!st) return;
    const dir = st.dx < 0 ? 1 : -1;
    const next = st.btns[st.i + dir];
    if (st.horiz && next && Math.abs(st.dx) > SWIPE_MIN && Math.abs(st.dx) > SWIPE_RATIO * Math.abs(st.dy)) {
      for (const p of st.panes) { p.style.transition = ''; p.style.transform = ''; }
      ui.swipeHint = true;
      switchSub(st.tab, next.dataset.sub, dir);
      return;
    }
    if (st.horiz) settle(st);
  };
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', () => { if (s?.horiz) settle(s); s = null; });
}

/** Filter chips inside a sub-tab (e.g. machine types in Garasi › Toko); remembered under `key` like sub-tabs. */
export function chipBar(key, items, active) {
  return h('div.chips', { role: 'tablist' }, items.map((it) => h(`button.chip${it.id === active ? '.active' : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(it.id === active), dataset: { chip: it.id },
    onclick: () => { if (it.id !== active) { setSub(key, it.id); app.requestRender(); } },
  }, it.label, it.count != null ? h('span.chip-count', String(it.count)) : null)));
}

/**
 * Collapsible section: `<details class="fold">` whose open state is remembered under `id`.
 * `meta` is shown on the right of the summary (count, value…).
 */
export function fold(id, title, { open = false, meta = null, cls = '' } = {}, ...children) {
  const isOpen = ui.fold[id] ?? open;
  return h(`details.fold${cls ? '.' + cls : ''}`, {
    open: isOpen,
    ontoggle: (e) => { if (ui.fold[id] !== e.target.open) { ui.fold[id] = e.target.open; persist(); } },
  },
  h('summary.fold-head', h('span.fold-title', title), meta != null ? h('span.fold-meta', meta) : null),
  h('div.fold-body', children));
}

/** Remembered open state for a hand-built `<details>` (same store as fold()). */
export const foldOpen = (id, dflt = false) => ui.fold[id] ?? dflt;
export function setFoldOpen(id, open) {
  if (ui.fold[id] === open) return;
  ui.fold[id] = open;
  persist();
}

/** Open another tab (and optionally one of its sub-tabs). main.js wires app.setTab. */
export function goTo(tab, sub) {
  if (sub) setSub(tab, sub);
  app.setTab(tab);
}
