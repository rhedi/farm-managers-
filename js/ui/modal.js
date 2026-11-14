// Modal dialogs and toasts. Modals live in #modal-root, independent of #view re-renders.
import { h, mount } from './dom.js';

const MAX_TOASTS = 2;
let current = null; // { el, body, refresh, onClose }

function dismissToast(el) {
  if (el.classList.contains('leaving')) return;
  clearTimeout(el._timer);
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 300);
}

/**
 * Non-blocking toast at the top. Toasts with the same `key` (default: the message)
 * merge into one; `merged(n)` gives the text for n repeats (default "msg (×n)").
 */
export function toast(msg, kind = '', { key = msg, merged } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const ms = kind === 'error' ? 4000 : 2500;
  const same = [...root.children].find((t) => t._key === key && !t.classList.contains('leaving'));
  if (same) {
    same._count++;
    same._msg.textContent = merged ? merged(same._count) : `${msg} (×${same._count})`;
    clearTimeout(same._timer);
    same._timer = setTimeout(() => dismissToast(same), ms);
    root.appendChild(same);
    return;
  }
  const text = h('span.toast-msg', msg);
  const el = h(`div.toast${kind ? '.' + kind : ''}`, { role: 'status' }, text,
    h('button.toast-close', { 'aria-label': 'Tutup notifikasi', onclick: () => dismissToast(el) }, '✕'));
  Object.assign(el, { _key: key, _count: 1, _msg: text });
  root.appendChild(el);
  const live = [...root.children].filter((t) => !t.classList.contains('leaving'));
  for (const t of live.slice(0, Math.max(0, live.length - MAX_TOASTS))) dismissToast(t);
  el._timer = setTimeout(() => dismissToast(el), ms);
}

export const isModalOpen = () => !!current;

/**
 * Open a modal. `render(body, modal)` builds the body; it is called again by
 * `modal.rerender()` (full rebuild, e.g. after an action). `refresh()` (optional)
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
    setTitle: (t) => { titleEl.textContent = t; },
    rerender: () => {
      mount(body);
      mount(footer);
      render(body, modal);
      if (actions) mount(footer, actions(modal));
      footer.hidden = !footer.children.length;
    },
    refresh: () => refresh?.(modal),
    close: () => closeModal(modal),
    onClose,
  };
  current = modal;
  document.body.classList.add('modal-open');
  modal.rerender();
  root.appendChild(backdrop);
  return modal;
}

export function closeModal(which) {
  if (!current || (which && which !== current)) return;
  const m = current;
  current = null;
  document.body.classList.remove('modal-open');
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
