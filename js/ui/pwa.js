// PWA: service worker registration (http/https only), "new version" toast, install button.
import { h } from './dom.js';

let installEvent = null; // deferred beforeinstallprompt
const listeners = new Set();
const changed = () => { for (const fn of listeners) fn(); };

const standaloneQuery = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)') : null;
const isInstalled = () => !!standaloneQuery?.matches || navigator.standalone === true;

let updateToast = null;
let updateAccepted = false;
function showUpdateToast(worker) {
  if (updateToast?.isConnected) return;
  const root = document.getElementById('toast-root');
  if (!root) return;
  const accept = () => {
    updateAccepted = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  updateToast = h('div.toast.success', { role: 'status' },
    h('span.toast-msg', 'Versi baru tersedia'),
    h('button.btn.btn-small', { type: 'button', onclick: accept }, 'Muat ulang'),
    h('button.toast-close', { type: 'button', 'aria-label': 'Tutup notifikasi', onclick: () => updateToast.remove() }, '✕'));
  root.appendChild(updateToast);
}

async function registerServiceWorker() {
  const sw = navigator.serviceWorker;
  // The first install claims the page too; only an update the player accepted reloads it.
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (!updateAccepted || reloading) return;
    reloading = true;
    location.reload();
  });
  const reg = await sw.register('./sw.js');
  const offerWaiting = () => { if (reg.waiting && sw.controller) showUpdateToast(reg.waiting); };
  offerWaiting();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') offerWaiting(); });
  });
  // Phones keep the tab alive for days: look for a new version whenever the game comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    reg.update().catch(() => {});
    offerWaiting();
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
