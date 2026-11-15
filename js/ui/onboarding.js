// Onboarding coach-mark (U9): Bajak → Pupuk → Tanam → 5× → Panen → Jual.
// Progress lives in localStorage (TUTORIAL_KEY), not in engine state.
import { h, mount } from './dom.js';

export const TUTORIAL_KEY = 'farm-manager-tutorial';
const STEPS = [
  { id: 'plow', label: 'Bajak', text: 'Ketuk tombol 🪓 Bajak pada ladangmu untuk menyiapkan tanah.' },
  { id: 'fertilize', label: 'Pupuk', text: 'Beri 🧪 Pupuk agar hasil panen lebih banyak (opsional, tapi menguntungkan).' },
  { id: 'seed', label: 'Tanam', text: 'Pilih 🌱 Tanam lalu pilih tanaman yang cocok dengan pH ladang.' },
  { id: 'speed', label: '5×', text: 'Tanaman butuh beberapa hari. Tekan 5× di atas untuk mempercepat waktu.' },
  { id: 'harvest', label: 'Panen', text: 'Tanaman siap! Ketuk 🌾 Panen (sewa pemanen jika belum punya).' },
  { id: 'sell', label: 'Jual', text: 'Hasil panen masuk gudang. Jual di tab 🏚️ Gudang atau 📈 Pasar.' },
];
const TASK_STEP = { plow: 0, fertilize: 1, seed: 2, harvest: 4 };

let storage = null;
let el = null;
let tut = { step: 0, dismissed: false };
let shownSig = '';

function persist() { try { storage?.setItem(TUTORIAL_KEY, JSON.stringify(tut)); } catch { /* ignore */ } }

export function initOnboarding(store, game) {
  storage = store;
  el = document.getElementById('coach');
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(TUTORIAL_KEY) ?? 'null'); } catch { saved = null; }
  // Existing players who already harvested skip the tutorial.
  tut = saved ?? { step: game.state.stats.harvests > 0 ? STEPS.length : 0, dismissed: false };
  persist();
}

export function resetOnboarding() { tut = { step: 0, dismissed: false }; persist(); }

function advanceTo(step) {
  if (step <= tut.step) return;
  tut.step = Math.min(step, STEPS.length);
  persist();
}

/** Game event hook. */
export function onboardingEvent(ev) {
  if (tut.dismissed || tut.step >= STEPS.length) return;
  if (ev.type === 'task_done' && ev.task in TASK_STEP) advanceTo(TASK_STEP[ev.task] + 1);
  else if (ev.type === 'sale' && tut.step >= 4) advanceTo(STEPS.length);
}

function dismiss() { tut.dismissed = true; persist(); render('farm', true); }

/** Mark buttons in the view whose label matches the current step ('tab:<id>' marks a bottom-nav tab). */
function markTargets(label) {
  for (const b of document.querySelectorAll('.coach-target')) b.classList.remove('coach-target');
  if (!label) return;
  if (label.startsWith('tab:')) { document.querySelector(`#tabs .tab[data-tab="${label.slice(4)}"]`)?.classList.add('coach-target'); return; }
  for (const b of document.querySelectorAll('#view button, #topbar .speed-btn')) {
    const t = b.textContent.trim();
    if (label === '5×' ? b.dataset.speed === '5' : t.includes(label) && t.length < 40) b.classList.add('coach-target');
  }
}

function render(tab, force = false) {
  if (!el) return;
  const done = tut.step >= STEPS.length;
  const visible = !tut.dismissed && !done && (tab === 'farm' || (tut.step === 5 && (tab === 'silo' || tab === 'market')));
  const sig = `${visible}|${tut.step}`;
  if (sig === shownSig && !force) return;
  shownSig = sig;
  el.hidden = !visible;
  if (!visible) { mount(el); return; }
  const s = STEPS[tut.step];
  mount(el, h('div.coach',
    h('div.coach-steps', STEPS.map((x, i) => h(`span.coach-step${i < tut.step ? '.done' : i === tut.step ? '.current' : ''}`, x.label))),
    h('div.coach-row',
      h('div.coach-text', h('b', `Langkah ${tut.step + 1}/${STEPS.length}: `), s.text),
      h('button.coach-close', { 'aria-label': 'Tutup panduan', title: 'Tutup panduan', onclick: dismiss }, '✕'))));
}

/** Main-loop hook: speed step, banner visibility, button highlights. */
export function updateOnboarding(game, tab) {
  if (!tut.dismissed && tut.step === 3 && game.state.speed === 5) advanceTo(4);
  // Withered or skipped steps: jump straight to harvest when a field is ready.
  if (!tut.dismissed && tut.step < 4 && tut.step >= 2 && game.fieldsView().some((f) => f.owned && f.state === 'ready')) advanceTo(4);
  render(tab);
  let target = null;
  if (!tut.dismissed && tut.step < STEPS.length) {
    if (tut.step === 3) target = '5×';
    else if (tut.step === 5) target = tab === 'silo' || tab === 'market' ? 'Jual' : 'tab:silo';
    else if (tab === 'farm') target = STEPS[tut.step].label;
  }
  markTargets(target);
}
