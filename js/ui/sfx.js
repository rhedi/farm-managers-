// Tiny WebAudio synth for UI sounds (no audio files). Mute flag persisted in
// localStorage 'farm-manager-sfx' ('0' = muted). Audio starts only after a user gesture.
const KEY = 'farm-manager-sfx';
let enabled = true;
let ctx = null;
let master = null;
const lastPlayed = {};
const listeners = new Set();

try { enabled = localStorage.getItem(KEY) !== '0'; } catch { /* storage blocked */ }

function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}
for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, unlock, { capture: true, passive: true });

export const sfxEnabled = () => enabled;

export function setSfxEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  for (const fn of listeners) fn(enabled);
}

/** Subscribe to mute changes (keeps topbar button and settings toggle in sync). */
export function onSfxChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** One enveloped oscillator note. */
function note(freq, start, dur, { type = 'sine', vol = 0.5, slide = 0 } = {}) {
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Short filtered noise burst (rustle / swoosh). */
function noise(start, dur, { vol = 0.3, freq = 1800 } = {}) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(ctx.currentTime + start);
}

const SOUNDS = {
  click: () => note(660, 0, 0.05, { type: 'triangle', vol: 0.18 }),
  coin: () => { note(988, 0, 0.08, { type: 'square', vol: 0.12 }); note(1319, 0.07, 0.22, { type: 'square', vol: 0.12 }); },
  harvest: () => { noise(0, 0.25, { vol: 0.35, freq: 2400 }); note(523, 0.05, 0.12, { type: 'triangle', vol: 0.25 }); note(784, 0.15, 0.2, { type: 'triangle', vol: 0.25 }); },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.11, i === 3 ? 0.5 : 0.14, { type: 'triangle', vol: 0.3 })),
  achievement: () => { note(784, 0, 0.12, { type: 'triangle', vol: 0.3 }); note(1175, 0.1, 0.35, { type: 'triangle', vol: 0.3 }); },
  warning: () => { note(440, 0, 0.14, { type: 'sawtooth', vol: 0.12 }); note(330, 0.15, 0.2, { type: 'sawtooth', vol: 0.12 }); },
  pop: () => note(420, 0, 0.09, { type: 'sine', vol: 0.3, slide: 500 }),
};

/** Play a named sound; silently no-ops when muted, before a gesture, or when spammed. */
export function sfx(name) {
  if (!enabled || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? 0) < 120) return;
  lastPlayed[name] = now;
  try { SOUNDS[name](); } catch { /* audio graph failure is non-fatal */ }
}
