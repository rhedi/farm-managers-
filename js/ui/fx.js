// Visual feedback: floating "+$1.234" texts, confetti bursts, money counter tween.
// All motion is CSS-driven; elements remove themselves when their animation ends.
import { fmtMoney, fmtNum } from './dom.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let layer = null;

function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

/** Floating text rising from the centre of `anchor` (element) or a {x,y} viewport point. */
export function floatText(anchor, text, kind = '') {
  const r = anchor?.getBoundingClientRect?.();
  let p = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : anchor;
  // Topbar pills: below the topbar (and below any visible toasts), clamped inside the viewport.
  if (kind.includes('top') && p) p = { x: Math.min(Math.max(p.x, 48), window.innerWidth - 48), y: belowChrome() };
  if (!p || (r && !r.width)) return;
  const L = fxLayer();
  if (L.childElementCount > 24) return; // offline catch-up bursts: don't flood
  const el = document.createElement('div');
  el.className = `fx-float${kind ? ` ${kind}` : ''}`;
  el.textContent = text;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener('animationend', () => el.remove());
  L.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

/** Lowest edge of the top chrome (top bar, sticky sub-tab bar, visible toasts) so floats never cover their buttons. */
function belowChrome() {
  let y = document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0;
  const sub = document.querySelector('#view .subtabs')?.getBoundingClientRect();
  if (sub?.height && sub.top <= y + 1) y = Math.max(y, sub.bottom);
  for (const t of document.querySelectorAll('#toast-root .toast:not(.leaving)')) y = Math.max(y, t.getBoundingClientRect().bottom);
  return y + 6;
}

const COLORS = ['#e2b743', '#4f8a2e', '#c0442f', '#4b8fc4', '#f2f0df', '#b57f45', '#9b5fc0'];

/** ≤1s confetti burst from a viewport point (default: upper middle). */
export function confetti(x = window.innerWidth / 2, y = window.innerHeight * 0.3, n = 44) {
  if (reduced()) return;
  const L = fxLayer();
  const box = document.createElement('div');
  box.className = 'fx-confetti';
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const a = Math.random() * Math.PI * 2;
    const v = 70 + Math.random() * 150;
    s.style.setProperty('--dx', `${Math.cos(a) * v}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * v - 60}px`);
    s.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    s.style.setProperty('--d', `${(0.75 + Math.random() * 0.25).toFixed(2)}s`);
    s.style.background = COLORS[i % COLORS.length];
    if (i % 3 === 0) s.style.borderRadius = '50%';
    box.appendChild(s);
  }
  L.appendChild(box);
  setTimeout(() => box.remove(), 1100);
}

export function vibrate(pattern = 25) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// ---- money / XP deltas (run every frame after updateTopbar) ----
const tween = { from: 0, to: 0, t0: 0, dur: 600, active: false };
let lastMoney = null;
let lastXp = null;
let pendingMoney = 0;
let pendingXp = 0;
let flushAt = 0;

/** Animate #money toward the real value and float merged money/XP deltas near the top bar. */
export function tickMoneyFx(game, now = performance.now()) {
  const money = game.state.money;
  const xp = game.state.xp;
  const moneyEl = document.getElementById('money');
  if (lastMoney === null || lastXp === null) { lastMoney = money; lastXp = xp; return; }
  if (money !== lastMoney) {
    const shown = tween.active ? currentTween(now) : lastMoney;
    Object.assign(tween, { from: shown, to: money, t0: now, active: !reduced() });
    pendingMoney += money - lastMoney;
    lastMoney = money;
    flushAt = flushAt || now + 250;
  }
  if (xp !== lastXp) { pendingXp += xp - lastXp; lastXp = xp; flushAt = flushAt || now + 250; }
  if (tween.active && moneyEl) {
    const done = now - tween.t0 >= tween.dur;
    moneyEl.textContent = fmtMoney(done ? tween.to : currentTween(now));
    if (done) tween.active = false;
  }
  if (flushAt && now >= flushAt) {
    flushAt = 0;
    if (Math.abs(pendingMoney) >= 1 && moneyEl) {
      floatText(moneyEl, `${pendingMoney > 0 ? '+' : '−'}${fmtMoney(Math.abs(pendingMoney))}`, pendingMoney > 0 ? 'gain top' : 'loss top');
      moneyEl.parentElement?.classList.remove('fx-bump');
      void moneyEl.offsetWidth;
      if (pendingMoney > 0) moneyEl.parentElement?.classList.add('fx-bump');
    }
    if (pendingXp >= 1) floatText(document.getElementById('xpbar') ?? moneyEl, `+${fmtNum(pendingXp)} XP`, 'xp top');
    pendingMoney = 0;
    pendingXp = 0;
  }
}

function currentTween(now) {
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = 1 - (1 - k) ** 3;
  return tween.from + (tween.to - tween.from) * e;
}

/** Forget the baseline (new / reset game) so the swap doesn't float a giant delta. */
export function resetMoneyFx() { lastMoney = null; lastXp = null; tween.active = false; pendingMoney = 0; pendingXp = 0; flushAt = 0; }
