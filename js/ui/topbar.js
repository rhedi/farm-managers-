// Top bar: money (tap → Laporan Keuangan), level/XP (tap → 🔬 Riset), clock, season + weather (tap → forecast).
// Research points are announced by the Prestasi tab badge. Cheap: text node / style only, written when changed.
import { fmtMoney, fmtClock, weatherEmoji, fmtNum, fmtCompact, setText as writeText } from './dom.js';
import { openForecastModal } from './forecast.js';
import { openFinanceReport } from './finance.js';
import { openResearchModal } from './research.js';

let els = null;
let curGame = null; // listeners are bound once; a new game replaces this
const last = {};
let xpObserver = null;

/** XP text: "98/115jt" (shared unit once) when it fits, else only "85%"; "MAX" at max level. Width is measured only
 *  when the full text changes or the level stat resizes (ResizeObserver: money growth, fonts, rotation); not cached
 *  before layout. A big balance can squeeze the text to 0 px: that still counts as laid out (else the full text was
 *  rewritten and measured on every frame). */
function updateXpText(el, li) {
  const a = fmtCompact(li.xp).replace(/ /g, ''), b = fmtCompact(li.next).replace(/ /g, '');
  const unit = /[a-zA-Z]+$/.exec(b)?.[0]; // rb · jt · M (miliar)
  const full = li.maxed ? 'MAX' : `${unit && a.endsWith(unit) ? a.slice(0, -unit.length) : a}/${b}`;
  if (last.xpFull !== full) {
    writeText(el, full); last.xpText = full;
    last.xpFits = el.scrollWidth <= el.clientWidth;
    if (el.getClientRects().length) last.xpFull = full;
  }
  // At max level the bar itself carries "MAX" (css .lv-max) when the text has no room, never a "100%".
  setText(el, 'xpText', last.xpFits ? full : li.maxed ? '' : `${Math.floor(Math.min(1, Math.max(0, li.progress)) * 100)}%`);
}

function setText(el, key, text) {
  if (last[key] !== text) { last[key] = text; writeText(el, text); }
}

export function initTopbar(game, onSpeed) {
  curGame = game;
  els = {
    money: document.getElementById('money'),
    level: document.getElementById('level'),
    xpbar: document.getElementById('xpbar'),
    xptext: document.getElementById('xptext'),
    clock: document.getElementById('clock'),
    weather: document.getElementById('weather'),
    weatherNow: document.getElementById('weather-now'),
    season: document.getElementById('season-chip'),
    speeds: [...document.querySelectorAll('.speed-btn[data-speed]')],
  };
  for (const b of els.speeds) {
    b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
  }
  if (els.weather && !els.weather.dataset.fcBound) {
    els.weather.dataset.fcBound = '1';
    Object.assign(els.weather, { tabIndex: 0 });
    els.weather.setAttribute('role', 'button');
    els.weather.classList.add('weather-tap');
    els.weather.addEventListener('click', () => openForecastModal(curGame));
    els.weather.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openForecastModal(curGame); } });
  }
  const moneyStat = els.money.parentElement;
  if (!moneyStat.dataset.finBound) {
    moneyStat.dataset.finBound = '1';
    moneyStat.tabIndex = 0;
    moneyStat.setAttribute('role', 'button');
    moneyStat.setAttribute('aria-label', 'Uang — buka laporan keuangan');
    moneyStat.classList.add('money-tap');
    moneyStat.addEventListener('click', () => openFinanceReport());
    moneyStat.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFinanceReport(); } });
  }
  const levelStat = els.level.closest('.stat-level');
  if (levelStat && !levelStat.dataset.rsBound) {
    levelStat.dataset.rsBound = '1';
    levelStat.tabIndex = 0;
    levelStat.setAttribute('role', 'button');
    levelStat.classList.add('level-tap');
    levelStat.addEventListener('click', () => openResearchModal());
    levelStat.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openResearchModal(); } });
  }
  // Level stat width changes with money digits, fonts and rotation: re-measure the XP text then.
  if (levelStat && !xpObserver && typeof ResizeObserver === 'function') {
    let lastW = 0;
    xpObserver = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w === lastW) return;
      lastW = w; delete last.xpFull;
      if (curGame) updateTopbar(curGame);
    });
    xpObserver.observe(levelStat);
  }
  for (const k of Object.keys(last)) delete last[k];
  updateTopbar(game);
}

export function updateTopbar(game) {
  if (!els) return;
  curGame = game;
  const s = game.state;
  setText(els.money, 'money', fmtMoney(s.money));
  els.money.parentElement.classList.toggle('neg', s.money < 0);
  const li = game.levelInfo();
  setText(els.level, 'level', String(li.level));
  const w = `${Math.round((li.maxed ? 1 : Math.min(1, Math.max(0, li.progress))) * 100)}%`;
  if (last.xp !== w) { last.xp = w; els.xpbar.style.width = w; }
  if (last.maxed !== li.maxed) { last.maxed = li.maxed; els.level.closest('.stat-level')?.classList.toggle('lv-max', li.maxed); } // v20: gold shimmer at Lv 100
  const xpTitle = li.maxed ? `XP ${fmtNum(li.xp)} (maks)` : `XP ${fmtNum(li.xp)} / ${fmtNum(li.next)}`;
  const pts = game.researchPoints?.().available ?? 0;
  const lvlTitle = `${xpTitle}\n${pts > 0 ? `🔬 ${pts} poin riset tersedia — ` : ''}Ketuk untuk riset.`;
  if (last.xpTitle !== lvlTitle) { last.xpTitle = lvlTitle; els.level.closest('.stat-level').title = lvlTitle; }
  if (els.xptext) updateXpText(els.xptext, li);
  const c = game.clock();
  // Compact "H1069 · 14:00" so 4-digit days stay readable next to the speed buttons at 360 px; full text as label.
  const clockText = `H${c.day} · ${String(c.hour).padStart(2, '0')}:00`;
  if (last.clock !== clockText) {
    setText(els.clock, 'clock', clockText);
    const full = fmtClock(c.day, c.hour);
    els.clock.title = full;
    els.clock.setAttribute('aria-label', full);
  }
  if (last.speed !== c.speed) {
    last.speed = c.speed;
    for (const b of els.speeds) b.classList.toggle('active', Number(b.dataset.speed) === c.speed);
  }
  // Weather: first owned field's region, else the first region.
  const ownedId = Object.keys(s.fields)[0];
  const regionId = ownedId ? game.data.FIELDS.find((f) => f.id === ownedId)?.regionId : null;
  const wv = game.weatherView();
  const w0 = wv.find((r) => r.regionId === regionId) || wv[0];
  if (w0) {
    // Weather emoji + temp; season as a short text chip so the two emojis never contradict.
    setText(els.weatherNow ?? els.weather, 'weather', `${weatherEmoji(w0)} ${Math.round(w0.temp)}°C`);
    if (els.season) {
      // Line 2: the season as words ("Musim hujan"), so a sunny icon on line 1 never reads as "☀️ HUJAN".
      const sn = w0.season?.name ?? '';
      setText(els.season, 'season', sn ? `Musim ${sn.replace(/^Musim\s+/i, '').toLowerCase()}` : '');
      els.season.hidden = !w0.season;
    }
    const title = wv.map((r) => `${r.name}: ${r.season ? `${r.season.name}, ` : ''}${weatherEmoji(r)} ${Math.round(r.temp)}°C${r.rain ? ' hujan' : ''}`)
      .join('\n') + '\nKetuk untuk prakiraan 3 hari.';
    if (last.wTitle !== title) { last.wTitle = title; els.weather.title = title; }
  }
}
