// PWA: service worker registration (http/https only), automatic update reload, update check, install button.
import { h } from './dom.js';
import { app } from './app.js';
import { toast } from './modal.js';

let installEvent = null; // deferred beforeinstallprompt
const listeners = new Set();
const changed = () => { for (const fn of listeners) fn(); };

const standaloneQuery = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)') : null;
const isInstalled = () => !!standaloneQuery?.matches || navigator.standalone === true;

const RELOAD_DELAY_MS = 600;
const CACHE_PREFIX = 'farm-manager-'; // sw.js PREFIX
const UPDATE_WAIT_MS = 30000;
const CHECK_LABEL = '🔄 Periksa pembaruan';

/** This build: index.html's VERSION (same value as in sw.js), put on <html data-version> by its inline script. */
export const appVersion = () => document.documentElement.dataset.version || '?';

let reloading = false;
function reloadOnce(message) {
  if (reloading) return;
  reloading = true;
  app.saveNow?.();
  toast(message, 'success');
  setTimeout(() => location.reload(), RELOAD_DELAY_MS);
}

async function registerServiceWorker() {
  const sw = navigator.serviceWorker;
  // A new sw.js skips waiting and claims this page. The first install (no previous controller) needs
  // nothing; an update means the page still runs old files: save and reload once onto the new cache
  // (sw.js also navigates open pages; whichever comes first wins, the page is gone after that).
  let controlled = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    reloadOnce('Memperbarui ke versi baru…');
  });
  const reg = await sw.register('./sw.js');
  reg.update().catch(() => {});
  // Phones keep the app alive for days: look for a new version whenever the game comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}

/** Resolves once `worker` is activated or redundant, or after `ms`. */
const finished = (worker, ms) => new Promise((resolve) => {
  const check = () => { if (worker.state === 'activated' || worker.state === 'redundant') resolve(); };
  worker.addEventListener('statechange', check);
  setTimeout(resolve, ms);
  check();
});

/** Unregisters every service worker and deletes the app caches; localStorage (the save) stays untouched. */
async function dropServiceWorkers() {
  const sw = navigator.serviceWorker;
  if (sw) for (const reg of await sw.getRegistrations()) await reg.unregister();
  if (window.caches) for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
}

// ⚙️ 🔄 Periksa pembaruan. A new sw.js installs and takes over, then the page reloads onto it. With nothing
// new the cached files may still be wrong (the cache is only refilled for a new VERSION), so the service
// workers and app caches are dropped and the page reloads from the network, like the escape hatch in
// index.html. When the check itself fails (offline) nothing is dropped.
async function checkForUpdate(btn) {
  btn.disabled = true;
  btn.textContent = '⏳ Memeriksa pembaruan…';
  app.saveNow?.();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const fresh = reg.installing || reg.waiting;
      if (fresh) {
        toast('Versi baru ditemukan, sedang dipasang…', 'success');
        await finished(fresh, UPDATE_WAIT_MS);
        if (fresh.state === 'redundant') throw new Error('install failed');
        if (fresh.state === 'activated') { reloadOnce('Memperbarui ke versi baru…'); return; }
      }
    }
  } catch {
    toast('Pembaruan tidak bisa diperiksa. Periksa koneksi internet lalu coba lagi.', 'error');
    btn.disabled = false;
    btn.textContent = CHECK_LABEL;
    return;
  }
  if (reloading) return;
  await dropServiceWorkers().catch(() => {});
  reloadOnce('Memuat ulang versi terbaru…');
}

/** Settings control: look for a new version, or reload the current one fresh from the network. */
export function updateControl() {
  const btn = h('button.btn.btn-secondary.btn-block', { type: 'button' }, CHECK_LABEL);
  btn.addEventListener('click', () => checkForUpdate(btn));
  return btn;
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    changed();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; changed(); });
  standaloneQuery?.addEventListener?.('change', changed);
  if (!/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator)) return;
  registerServiceWorker().catch((e) => console.warn('Service worker gagal didaftarkan:', e));
}

/** Settings control: install button when the browser offers it, a manual tip otherwise, nothing once installed. */
export function installControl() {
  const el = h('div.pwa-install');
  const render = () => {
    el.replaceChildren();
    if (isInstalled()) return;
    if (installEvent) {
      el.append(h('button.btn.btn-small', { type: 'button', onclick: install }, '📲 Pasang aplikasi'));
    } else {
      el.append(h('p.small.muted', '📲 Pasang aplikasi: Buka menu browser → Tambahkan ke layar utama.'));
    }
  };
  const off = () => listeners.delete(update);
  const update = () => { if (el.isConnected) render(); else off(); };
  listeners.add(update);
  render();
  return el;
}

async function install() {
  const e = installEvent;
  if (!e) return;
  installEvent = null;
  await e.prompt();
  await e.userChoice.catch(() => null);
  changed();
}
