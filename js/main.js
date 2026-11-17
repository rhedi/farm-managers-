// Bootstrap: load/create game, game loop, autosave, tabs, event toasts.
import { createGame, loadFrom, loadLegacy } from './engine.js';
import { SAVE_KEY } from './engine/persist.js';
import { app } from './ui/app.js';
import { fmtHours } from './ui/dom.js';
import { toast, isModalOpen, refreshModal, closeModal } from './ui/modal.js';
import { initTopbar, updateTopbar } from './ui/topbar.js';
import { renderFarm, updateFarm } from './ui/farm.js';
import { renderGarage, updateGarage } from './ui/garage.js';
import { renderMarket, updateMarket } from './ui/market.js';
import { renderAnimals, updateAnimals } from './ui/animals.js';
import { renderSilo, updateSilo } from './ui/silo.js';
import { renderAchievements, updateAchievements } from './ui/achievements.js';
import { updateBadges } from './ui/badges.js';
import { flushLevelUps } from './ui/levelUp.js';
import { initOnboarding, updateOnboarding, resetOnboarding } from './ui/onboarding.js';
import { notifyEvent, announceChapterNotice } from './ui/notify.js';
import { announceMandorNotice } from './ui/mandor.js';
import { backupSave, loadTab, saveTab, trackTopbarHeight } from './ui/shell.js';
import { feedbackEvent, initClickSounds } from './ui/feedback.js';
import { tickMoneyFx, resetMoneyFx } from './ui/fx.js';
import { openSettings } from './ui/settings.js';
import { initPwa } from './ui/pwa.js';
import { initTheme } from './ui/theme.js';
import { initSubtabSwipe } from './ui/subtabs.js';
import { showMorningReport, MIN_AWAY_S } from './ui/morningReport.js';
import { maybeShowDisaster } from './ui/kabar.js';
import { flushLeagueResults } from './ui/league.js';

const VIEWS = {
  farm: { render: renderFarm, update: updateFarm },
  garage: { render: renderGarage, update: updateGarage },
  market: { render: renderMarket, update: updateMarket },
  animals: { render: renderAnimals, update: updateAnimals },
  silo: { render: renderSilo, update: updateSilo },
  achievements: { render: renderAchievements, update: updateAchievements },
};
const VIEW_INTERVAL_MS = 500;
const AUTOSAVE_MS = 10000;

const viewEl = document.getElementById('view');
let currentTab = 'farm';
let unsubscribe = null;
let lastViewUpdate = 0;
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }

function save(manual = false) {
  if (!storage || !app.game) return;
  try {
    app.game.save(storage);
    if (manual) toast('Permainan disimpan.', 'success');
  } catch (e) {
    if (manual) toast(`Gagal menyimpan: ${e.message}`, 'error');
  }
}

function inputFocusedInView() {
  const a = document.activeElement;
  return !!a && viewEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
}

// A re-render between pointerdown and pointerup can replace the pressed button (when its card changes shape), so the
// browser fires no click (a held press on the silo "+200 t" button at 5× was lost). Hold view re-renders until
// release; event-driven renders wait for the next loop update.
let pressedInView = false;
let renderPending = false;
viewEl.addEventListener('pointerdown', () => { pressedInView = true; });
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, () => { pressedInView = false; });

/** Render the active tab. Loop and action renders patch the view in place (dom.js patch: running animations, scroll
 *  and focus stay); `fresh` (tab / sub-tab switch, new game) builds it anew so the content plays its entrance. */
function renderView(fresh = false) {
  if (fresh) viewEl.replaceChildren();
  VIEWS[currentTab].render(viewEl);
  lastViewUpdate = performance.now();
}

function updateView(now) {
  lastViewUpdate = now;
  if (inputFocusedInView() || pressedInView) return;
  if (renderPending) {
    renderPending = false;
    renderView();
    return;
  }
  VIEWS[currentTab].update(viewEl);
}

function onGameEvent(ev) {
  if (notifyEvent(ev)) {
    if (pressedInView) renderPending = true;
    else app.requestRender();
  }
  feedbackEvent(ev);
}

function start(game) {
  unsubscribe?.();
  app.game = game;
  unsubscribe = game.on(onGameEvent);
  resetMoneyFx();
  announceChapterNotice(game); // old save: one summary toast for chapter steps it had already met
  announceMandorNotice(game); // old save with > 2 planned fields: "👷 Mandor otomatis dipekerjakan untuk save lama"
  setTimeout(() => maybeShowDisaster(game), 1200); // ⚠️ a Bencana Besar forecast (e.g. from offline catch-up) not seen yet
  updateTopbar(game);
  renderView(true);
}

function loadOrCreate() {
  let game = null;
  try {
    game = storage ? loadFrom(storage) : null;
  } catch (e) {
    console.warn('Save rusak:', e);
    const bak = backupSave(storage);
    setTimeout(() => toast(`Data simpanan rusak — memulai permainan baru.${bak ? ` Cadangan disimpan sebagai "${bak}".` : ''}`, 'error'), 0);
    game = null;
  }
  if (!game) return createGame({ seed: Date.now(), legacy: loadLegacy(storage) }); // 🌳 stars/museum survive a corrupt save
  const away = (Date.now() - (game.state.savedAt ?? Date.now())) / 1000;
  if (away > 0) welcomeBack(game, away);
  return game;
}

/** Offline catch-up (exact 48 h + coarse "mode hemat", engine catchUpReport); ☀️ Laporan Pagi after ≥ 10 real min. */
function welcomeBack(game, away) {
  const { hours, report } = game.catchUpReport(away);
  if (away >= MIN_AWAY_S && hours > 0) setTimeout(() => showMorningReport(report), 0);
  else if (hours >= 0.5) setTimeout(() => toast(`Selama kamu pergi, ${fmtHours(hours)} waktu permainan berlalu.`), 0);
}

function setTab(tab) {
  if (!VIEWS[tab]) return;
  currentTab = tab;
  viewEl.dataset.tab = tab;
  saveTab(storage, tab);
  for (const b of document.querySelectorAll('#tabs .tab')) b.classList.toggle('active', b.dataset.tab === tab);
  renderView(true);
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  app.game.tick(dt);
  updateTopbar(app.game);
  tickMoneyFx(app.game, now);
  if (now - lastViewUpdate >= VIEW_INTERVAL_MS) {
    updateView(now);
    if (isModalOpen()) refreshModal();
    updateBadges(app.game);
    updateOnboarding(app.game, currentTab);
    flushLevelUps(app.game);
    flushLeagueResults(app.game); // 🏆 end-of-season modal (after level-ups)
  }
  requestAnimationFrame(frame);
}

// ---- wiring ----
app.requestRender = ({ fresh = false } = {}) => {
  updateTopbar(app.game);
  renderView(fresh);
};
app.saveNow = save;
app.setTab = setTab;
app.startGame = (game) => { // 🌳 Generasi Baru: the inherited run replaces this one
  closeModal();
  start(game);
  save();
};
app.resetGame = () => {
  closeModal();
  try { storage?.removeItem(SAVE_KEY); } catch { /* ignore */ }
  start(createGame({ seed: Date.now(), legacy: app.game?.legacy ?? loadLegacy(storage) })); // 🌳 the legacy block survives a reset
  resetOnboarding();
  save();
  toast('Permainan baru dimulai. Selamat bertani!', 'success');
};

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab[data-tab]');
  if (b) setTab(b.dataset.tab);
});
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); save(); return; }
  if (hiddenAt == null || !app.game) return;
  const away = (Date.now() - hiddenAt) / 1000;
  hiddenAt = null;
  lastFrame = performance.now();
  welcomeBack(app.game, away);
  app.requestRender();
});
initTheme();
initSubtabSwipe(viewEl);
trackTopbarHeight();
initClickSounds();
initPwa();
document.getElementById('settings-btn')?.addEventListener('click', openSettings);
window.addEventListener('pagehide', () => save());
setInterval(() => save(), AUTOSAVE_MS);
Object.defineProperty(window, '__game', { get: () => app.game, configurable: true });

const initial = loadOrCreate();
app.game = initial;
initTopbar(initial, (s) => {
  const r = app.game.setSpeed(s);
  if (!r.ok) toast(r.reason, 'error');
  updateTopbar(app.game);
});
initOnboarding(storage, initial);
start(initial);
const savedTab = loadTab(storage);
setTab(VIEWS[savedTab] ? savedTab : 'farm');
requestAnimationFrame(frame);
