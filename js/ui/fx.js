// Visual feedback: floating "+$1.234" texts, confetti bursts, money counter tween.
// All motion is CSS-driven; elements remove themselves when their animation ends.
import { fmtMoney, fmtNum, fmtCompact } from './dom.js';

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
  // Top-bar pills (v16): the money delta rises over the money amount itself; the XP pill sits on the XP bar (right
  // of the level number, above the gap to the speed buttons). Neither covers the level number, the date or the speed
  // buttons, nor cards/toasts below.
  const bar = kind.includes('xp') ? document.querySelector('#topbar .progress-xp')?.getBoundingClientRect() : null;
  if (kind.includes('top') && r) p = bar?.width ? { x: bar.left + bar.width / 2, y: bar.top } : { x: p.x, y: r.top };
  if (!p || (r && !r.width)) return;
  const L = fxLayer();
  if (L.childElementCount > 24) return; // offline catch-up bursts: don't flood
  // Top-bar pills replace the previous one of the same kind instead of piling up on the same spot.
  if (kind.includes('top')) for (const old of L.querySelectorAll(`.fx-float.${kind.includes('xp') ? 'xp' : 'top:not(.xp)'}`)) old.remove();
  const el = document.createElement('div');
  el.className = `fx-float${kind ? ` ${kind}` : ''}`;
  el.textContent = text;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.addEventListener('animationend', () => el.remove());
  L.appendChild(el);
  if (kind.includes('top')) { // clamp: money pill inside the money stat, XP pill inside the level stat
    const w = el.offsetWidth, hgt = el.offsetHeight;
    const box = document.querySelector(kind.includes('xp') ? '#topbar .stat-level' : '#topbar .stat-money')?.getBoundingClientRect();
    if (box?.width) {
      const lo = box.left + w / 2, hi = box.right - w / 2;
      el.style.left = `${lo <= hi ? Math.min(Math.max(p.x, lo), hi) : (kind.includes('xp') ? hi : lo)}px`;
      if (!kind.includes('xp')) el.style.top = `${r.top + (r.height - hgt) / 2}px`; // centred on the money text
      else if (bar?.width) el.style.top = `${bar.top + bar.height / 2 - hgt / 2 + 1}px`; // centred on the XP bar
    }
  }
  setTimeout(() => el.remove(), 2000);
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

/**
 * Manajer Logistik departure: a little truck with dust puffs drives across the screen above the bottom tabs toward
 * the city emoji. One at a time (offline catch-up bursts and multi-truck dispatches don't stack).
 */
let truckBusyUntil = 0;
export function truckDepart(cityEmoji = '🏙️') {
  const now = Date.now();
  if (reduced() || now < truckBusyUntil || document.hidden) return;
  truckBusyUntil = now + 2000;
  const tabs = document.getElementById('tabs')?.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fx-truck';
  el.style.bottom = `${Math.max(8, window.innerHeight - (tabs?.top ?? window.innerHeight)) + 6}px`;
  const truck = document.createElement('span');
  truck.className = 'fx-truck-rig';
  truck.textContent = '🚚';
  const goal = document.createElement('span');
  goal.className = 'fx-truck-goal';
  goal.textContent = cityEmoji;
  el.append(truck, goal);
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 2000);
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
      floatText(moneyEl, `${pendingMoney > 0 ? '+' : '−'}$${fmtCompact(Math.abs(Math.round(pendingMoney)))}`, pendingMoney > 0 ? 'gain top' : 'loss top');
      moneyEl.parentElement?.classList.remove('fx-bump');
      void moneyEl.offsetWidth;
      if (pendingMoney > 0) moneyEl.parentElement?.classList.add('fx-bump');
    }
    if (pendingXp >= 1) floatText(moneyEl, `+${fmtCompact(Math.round(pendingXp))} XP`, 'xp top');
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
