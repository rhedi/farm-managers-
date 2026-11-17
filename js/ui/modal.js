// Modal dialogs and toasts. Modals live in #modal-root, independent of #view re-renders.
import { h, mount, patch, setText } from './dom.js';

const MAX_TOASTS = 2;
const TOAST_GAP = 6;
let current = null; // { el, body, refresh, onClose }

/** Stack the toasts with `translate` from the anchored edge (newest nearest the tabs; downward from the top while a
 *  modal is open), so arriving/leaving toasts slide the others instead of shifting layout. */
function layoutToasts(instant = false) {
  const root = document.getElementById('toast-root');
  if (!root?.children.length) return;
  const down = document.body.classList.contains('modal-open');
  const list = down ? [...root.children] : [...root.children].reverse();
  let y = 0;
  for (const t of list) {
    if (instant) t.style.transition = 'none';
    t.style.translate = `0 ${down ? y : -y}px`;
    y += t.offsetHeight + TOAST_GAP;
  }
  if (!instant) return;
  void root.offsetWidth; // commit the jump before transitions come back
  for (const t of list) t.style.transition = '';
}

function dismissToast(el) {
  if (el.classList.contains('leaving')) return;
  clearTimeout(el._timer);
  el.classList.add('leaving');
  setTimeout(() => { el.remove(); layoutToasts(); }, 300);
}

/**
 * Non-blocking toast at the top. Toasts with the same `key` (default: the message)
 * merge into one; `merged(n)` gives the text for n repeats (default "msg (×n)").
 * A merged toast stays where it is (only its text changes): moving it would replay its slide-in and make the stack
 * jump on every repeat (several per second at 5×). Over MAX_TOASTS, the least recently updated ones leave.
 */
export function toast(msg, kind = '', { key = msg, merged } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const ms = kind === 'error' ? 4000 : 2500;
  const same = [...root.children].find((t) => t._key === key && !t.classList.contains('leaving'));
  if (same) {
    same._count++;
    same._at = performance.now();
    setText(same._msg, merged ? merged(same._count) : `${msg} (×${same._count})`);
    layoutToasts(); // a longer count can wrap to a second line
    clearTimeout(same._timer);
    same._timer = setTimeout(() => dismissToast(same), ms);
    return;
  }
  const text = h('span.toast-msg', msg);
  const el = h(`div.toast${kind ? '.' + kind : ''}`, { role: 'status' }, text,
    h('button.toast-close', { 'aria-label': 'Tutup notifikasi', onclick: () => dismissToast(el) }, '✕'));
  Object.assign(el, { _key: key, _count: 1, _msg: text, _at: performance.now() });
  root.appendChild(el);
  const live = [...root.children].filter((t) => !t.classList.contains('leaving')).sort((a, b) => a._at - b._at);
  for (const t of live.slice(0, Math.max(0, live.length - MAX_TOASTS))) dismissToast(t);
  layoutToasts();
  el._timer = setTimeout(() => dismissToast(el), ms);
}

export const isModalOpen = () => !!current;

/**
 * Open a modal. `render(body, modal)` builds the body; it is called again by
 * `modal.rerender()` (full rebuild, e.g. after an action) and `modal.update()` (the same render patched into the
 * nodes on screen, for loop refreshes: animations keep running). `refresh()` (optional)
 * updates dynamic parts in place and is called by the game loop while open.
 */
export function openModal({ title, render, refresh, onClose, actions }) {
  closeModal();
  const root = document.getElementById('modal-root');
  const body = h('div.modal-body');
  const titleEl = h('h2', title);
  const footer = h('div.modal-actions');
  const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
    h('div.modal-header', titleEl, h('button.modal-close', { 'aria-label': 'Tutup', onclick: () => closeModal() }, '✕')),
    body, footer);
  const backdrop = h('div.modal-backdrop', {
    onclick: (e) => { if (e.target === backdrop) closeModal(); },
  }, box);
  const modal = {
    el: backdrop, body, footer,
    setTitle: (t) => setText(titleEl, t),
    rerender: () => {
      mount(body);
      mount(footer);
      render(body, modal);
      if (actions) mount(footer, actions(modal));
      footer.hidden = !footer.children.length;
    },
    update: () => {
      const fresh = { body: h('div.modal-body'), footer: h('div.modal-actions') };
      Object.assign(modal, fresh); // render() may write to modal.footer
      try {
        render(fresh.body, modal);
        if (actions) mount(fresh.footer, actions(modal));
      } finally {
        Object.assign(modal, { body, footer });
      }
      patch(body, [...fresh.body.childNodes]);
      patch(footer, [...fresh.footer.childNodes]);
      footer.hidden = !footer.children.length;
    },
    refresh: () => refresh?.(modal),
    close: () => closeModal(modal),
    onClose,
  };
  current = modal;
  document.body.classList.add('modal-open');
  layoutToasts(true);
  modal.rerender();
  root.appendChild(backdrop);
  return modal;
}

export function closeModal(which) {
  if (!current || (which && which !== current)) return;
  const m = current;
  current = null;
  document.body.classList.remove('modal-open');
  layoutToasts(true);
  m.el.remove();
  m.onClose?.();
}

/** Called by the main loop. */
export function refreshModal() { current?.refresh(); }
export function rerenderModal() { current?.rerender(); }

/** Confirmation dialog → Promise<boolean>. */
export function confirmModal({ title, message, confirmLabel = 'Ya', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v, m) => { answered = true; m.close(); resolve(v); };
    openModal({
      title,
      render: (body) => mount(body, h('p', message)),
      actions: (m) => [
        h('button.btn.btn-secondary', { onclick: () => done(false, m) }, 'Batal'),
        h(`button.btn.${danger ? 'btn-danger' : 'btn-primary'}`, { onclick: () => done(true, m) }, confirmLabel),
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current) closeModal();
});
