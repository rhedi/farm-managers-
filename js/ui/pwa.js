// PWA: service worker registration (http/https only), automatic update reload, install button.
import { h } from './dom.js';
import { app } from './app.js';
import { toast } from './modal.js';

let installEvent = null; // deferred beforeinstallprompt
const listeners = new Set();
const changed = () => { for (const fn of listeners) fn(); };

const standaloneQuery = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)') : null;
const isInstalled = () => !!standaloneQuery?.matches || navigator.standalone === true;

const RELOAD_DELAY_MS = 600;

async function registerServiceWorker() {
  const sw = navigator.serviceWorker;
  // A new sw.js skips waiting and claims this page. The first install (no previous controller) needs
  // nothing; an update means the page still runs old files: save and reload once onto the new cache
  // (sw.js also navigates open pages; whichever comes first wins, the page is gone after that).
  let controlled = !!sw.controller;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    if (reloading) return;
    reloading = true;
    app.saveNow?.();
    toast('Memperbarui ke versi baru…', 'success');
    setTimeout(() => location.reload(), RELOAD_DELAY_MS);
  });
  const reg = await sw.register('./sw.js');
  reg.update().catch(() => {});
  // Phones keep the app alive for days: look for a new version whenever the game comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
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
