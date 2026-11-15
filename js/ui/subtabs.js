// Sub-tab bar (sticky segmented control under the top bar) and collapsible sections.
// The chosen sub-tab per tab and each section's open state survive re-renders and reloads
// (localStorage 'farm-manager-ui', separate from the game save).
import { h } from './dom.js';
import { app } from './app.js';

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

/**
 * Segmented control. `items`: [{ id, icon, label, badge?, warn? }]. Picking one re-renders the view
 * and scrolls back to the top of the page.
 */
export function subTabBar(tab, items, active) {
  return h('nav.subtabs', { role: 'tablist', 'aria-label': 'Bagian' }, items.map((it) => h(
    `button.subtab${it.id === active ? '.active' : ''}`,
    { type: 'button', role: 'tab', 'aria-selected': String(it.id === active), dataset: { sub: it.id },
      onclick: () => {
        if (it.id === active) return;
        setSub(tab, it.id);
        app.requestRender();
        window.scrollTo(0, 0);
      } },
    h('span.subtab-icon', { 'aria-hidden': 'true' }, it.icon),
    h('span.subtab-label', it.label),
    it.badge ? h(`span.subtab-badge${it.warn ? '.warn' : ''}`, String(it.badge)) : null)));
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
