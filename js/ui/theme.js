// Colour theme: 'auto' (follows the phone's prefers-color-scheme), 'light' or 'dark'. The preference lives in
// localStorage THEME_KEY, separate from the game save. <html data-theme> always holds the resolved theme; the
// inline script in index.html sets it before first paint with the same rule as resolveTheme().
export const THEME_KEY = 'farm-manager-theme';
export const THEMES = ['auto', 'light', 'dark'];

const media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
const listeners = new Set();
let pref = 'auto';
try { pref = localStorage.getItem(THEME_KEY) ?? 'auto'; } catch { /* storage blocked */ }
if (!THEMES.includes(pref)) pref = 'auto';

export const themePref = () => pref;

export function resolveTheme(p = pref) {
  if (p === 'auto') return media?.matches ? 'dark' : 'light';
  return p;
}

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme();
  // Status bar = top bar colour of the theme in use; this also overrides the media variants when the
  // player picked Terang/Gelap against the phone's mode.
  const color = getComputedStyle(root).getPropertyValue('--header').trim();
  if (color) for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', color);
  for (const fn of listeners) fn(pref);
}

export function setThemePref(p) {
  if (!THEMES.includes(p)) return;
  pref = p;
  try { localStorage.setItem(THEME_KEY, p); } catch { /* ignore */ }
  apply();
}

/** Subscribe to preference changes (settings control). Returns an unsubscribe function. */
export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initTheme() {
  media?.addEventListener?.('change', () => { if (pref === 'auto') apply(); });
  apply();
}
