// Top bar: money (tap → Laporan Keuangan), level/XP (tap → 🔬 Riset), clock, season + weather (tap → forecast). Cheap: textContent / style only.
import { fmtMoney, fmtClock, weatherEmoji, fmtNum } from './dom.js';
import { openForecastModal } from './forecast.js';
import { openFinanceReport } from './finance.js';
import { openResearchModal } from './research.js';

let els = null;
let curGame = null; // listeners are bound once; a new game replaces this
const last = {};

function setText(el, key, text) {
  if (last[key] !== text) { last[key] = text; el.textContent = text; }
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
    els.rsDot = levelStat.appendChild(Object.assign(document.createElement('span'), { className: 'rs-dot', hidden: true }));
  }
  els.rsDot ??= levelStat?.querySelector('.rs-dot');
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
  const w = `${Math.round((li.maxed ? 1 : li.progress) * 100)}%`;
  if (last.xp !== w) { last.xp = w; els.xpbar.style.width = w; }
  const xpTitle = li.maxed ? `XP ${fmtNum(li.xp)} (maks)` : `XP ${fmtNum(li.xp)} / ${fmtNum(li.next)}`;
  const pts = game.researchPoints?.().available ?? 0;
  const lvlTitle = `${xpTitle}\n${pts > 0 ? `🔬 ${pts} poin riset tersedia — ` : ''}Ketuk untuk riset.`;
  if (last.xpTitle !== lvlTitle) { last.xpTitle = lvlTitle; els.level.parentElement.parentElement.title = lvlTitle; }
  if (els.rsDot && last.rsDot !== pts) { last.rsDot = pts; els.rsDot.hidden = pts <= 0; els.rsDot.textContent = `🔬${pts}`; }
  if (els.xptext) setText(els.xptext, 'xpText', li.maxed ? 'MAKS' : `${fmtNum(li.xp)}/${fmtNum(li.next)}`);
  const c = game.clock();
  setText(els.clock, 'clock', fmtClock(c.day, c.hour));
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
      setText(els.season, 'season', (w0.season?.name ?? '').replace(/^Musim\s+/i, ''));
      els.season.hidden = !w0.season;
    }
    const title = wv.map((r) => `${r.name}: ${r.season ? `${r.season.name}, ` : ''}${weatherEmoji(r)} ${Math.round(r.temp)}°C${r.rain ? ' hujan' : ''}`)
      .join('\n') + '\nKetuk untuk prakiraan 3 hari.';
    if (last.wTitle !== title) { last.wTitle = title; els.weather.title = title; }
  }
}
