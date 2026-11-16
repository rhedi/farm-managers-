// Peternakan ikan visuals: animated pond (waves, ripples, swimming fish, aerator bubbles) and the harvest splash.
// Motion is CSS (css/fish.css); reduced-motion users get static ponds via the global rule in style.css.
// Scenes are patched in place (updateScene) so the swim/wave animations never restart on a data change.
import { h } from './dom.js';
import { iconOf } from './fishArt.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const WATER = ['pond-clear', 'pond-green', 'pond-murky'];
const MAX_FISH = 6;

/** Water tint from kualitas air: clear blue → green → murky brown. */
const waterClass = (w) => (w < 40 ? 'pond-murky' : w < 60 ? 'pond-green' : 'pond-clear');

function fishSprite(i, def) {
  return h('span.pond-fish', { style: { top: `${14 + ((i * 37) % 62)}%`, animationDelay: `${-i * 1.7}s` } },
    h('span.pond-fish-in', iconOf(def)));
}

/**
 * Bring a scene up to date without re-creating it: water tint / ready / empty classes, 1–6 fish sprites by fill
 * (existing sprites keep swimming; only extra ones are added or removed), sprite size by growth, swim speed by
 * water, aerator bubbles. Speed changes go through `animation-duration`, which keeps the current progress.
 */
export function updateScene(el, p) {
  const water = waterClass(p.water);
  for (const c of WATER) el.classList.toggle(c, c === water);
  el.classList.toggle('pond-ready', !!p.ready);
  el.classList.toggle('pond-empty', !p.count);
  const want = p.count > 0 ? Math.max(1, Math.round((p.count / p.def.capacity) * MAX_FISH)) : 0;
  const fish = [...el.querySelectorAll(':scope > .pond-fish')];
  for (let i = fish.length; i < want; i++) el.appendChild(fishSprite(i, p.def));
  for (let i = want; i < fish.length; i++) fish[i].remove();
  const size = `${(1.2 * (0.55 + 0.45 * (p.growth ?? 0))).toFixed(2)}rem`;
  const slow = p.water < 40 ? 2.2 : p.water < 60 ? 1.4 : 1;
  el.querySelectorAll(':scope > .pond-fish').forEach((f, i) => {
    if (f.style.fontSize !== size) f.style.fontSize = size;
    const dur = `${((7 + (i % 3) * 2.5) * slow).toFixed(1)}s`;
    if (f.style.animationDuration !== dur) f.style.animationDuration = dur;
  });
  const bubbles = el.querySelectorAll(':scope > .pond-bubble');
  if (p.aerator && !bubbles.length) {
    for (let i = 0; i < 5; i++) el.appendChild(h('span.pond-bubble', { style: { left: `${12 + i * 18}%`, animationDelay: `${i * 0.45}s` } }));
  } else if (!p.aerator) bubbles.forEach((b) => b.remove());
  const label = el.querySelector(':scope > .pond-empty-label');
  if (!p.count && !label) el.appendChild(h('span.pond-empty-label', 'Kolam kosong'));
  else if (p.count && label) label.remove();
  return el;
}

/** New pond scene (keyed by `data-uid`). */
export function pondScene(p) {
  const el = h('div.pond-scene', { 'aria-hidden': 'true', dataset: { uid: p.uid } },
    h('span.pond-wave'), h('span.pond-ripple'), h('span.pond-ripple.r2'));
  return updateScene(el, p);
}

/** Splash of droplets + the pond's fish (species art) jumping over `el` (viewport-fixed, outside the view). */
export function harvestSplash(el, def) {
  const r = el?.getBoundingClientRect?.();
  if (!r || !r.width || reduced()) return;
  const drops = Array.from({ length: 10 }, (_, i) => {
    const d = h('span.fish-drop');
    d.style.setProperty('--a', `${(i / 10) * 360}deg`);
    d.style.setProperty('--d', `${28 + (i % 3) * 14}px`);
    return d;
  });
  const box = h('div.fish-splash', { style: { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` } },
    h('span.fish-ring'), h('span.fish-jump', def ? iconOf(def) : '🐟'), drops);
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1300);
}

/** Fresh-water wash over a pond after "Ganti air". */
export function waterWash(el) {
  if (!el || reduced()) return;
  el.classList.remove('pond-wash');
  void el.offsetWidth;
  el.classList.add('pond-wash');
  el.addEventListener('animationend', (e) => { if (e.animationName === 'pond-wash') el.classList.remove('pond-wash'); });
}

export const sceneOf = (uid) => document.querySelector(`.pond-scene[data-uid="${uid}"]`);
