// Prestasi tab: 🎯 Misi (daily missions + leaderboard) | 🔬 Riset | 🏆 Prestasi (achievements, stats, log)
// | 💰 Keuangan (report summary, loans, net worth). Settings live in the top-bar ⚙️ dialog.
import { h, mount, fmtMoney, fmtNum, progressBar } from './dom.js';
import { app } from './app.js';
import { netWorthCard } from './netWorthChart.js';
import { financeCard } from './finance.js';
import { loansPanel, loansSig } from './loans.js';
import { missionsCard, leaderboardCard, missionsSig, updateMissionsCountdown, chapterCard } from './missions.js';
import { researchSection, researchSig } from './research.js';
import { subTabBar, getSub, fold, goTo } from './subtabs.js';
import { calendarCard, calendarSig } from './calendar.js';
import { kabarHistory, kabarHistorySig } from './kabar.js';

const SUBS = ['missions', 'research', 'trophies', 'finance'];
const NEXT_SHOWN = 5; // closest achievements shown; the rest are folded
const LOG_ICON = {
  task_done: '✅', crop_ready: '🌾', wither: '🥀', achievement: '🏆', level_up: '⭐', weather: '🌦️',
  low_feed: '⚠️', sale: '💰', purchase: '🛒', field_bought: '📍', machine_bought: '🚜', barn: '🏗️',
  contract_offer: '📋', contract_done: '🤝', contract_failed: '❌',
  season_change: '🍂', event_start: '📣', event_end: '🏁', pest: '🐛', silo_overflow: '🏚️', cold_overflow: '❄️', silo_upgraded: '🏗️', cold_upgraded: '🏗️',
  machine_breakdown: '🔧', wages_unpaid: '💸', worker_hired: '👷',
  mission_done: '🎯', missions_new: '🎯', mission_streak: '🔥', rank_up: '🏅',
  delivery_start: '🚚', delivery_done: '🚚', truck_returned: '🚚', research_unlocked: '🔬', research_reset: '🔬',
  auto_dispatch: '🧑‍💼', dispatcher_hired: '🧑‍💼', dispatcher_replaced: '🧑‍💼', dispatcher_fired: '🧑‍💼',
  factory_manager_run: '🏭', factory_manager_hired: '🏭', factory_manager_replaced: '🏭', factory_manager_fired: '🏭',
  dilemma_new: '📰', dilemma_resolved: '📰', disaster_forecast: '⚠️', disaster_prepared: '🛡️', disaster_start: '⚠️', disaster_end: '🏁',
  contract_bonus: '🤝', project_started: '🏗️', project_done: '🏛️',
};
let sig = '';

function achievementCard(a) {
  const target = a.condition.gte;
  const frac = Math.min(1, (a.value || 0) / target);
  return h(`div.card.achievement${a.unlocked ? '.done' : ''}`,
    h('div.card-head',
      h('div.card-icon', a.unlocked ? '🏆' : '🎖️'),
      h('div.card-main',
        h('div.card-title', a.name),
        h('div.card-sub', a.desc)),
      h(`span.badge${a.unlocked ? '.badge-gold' : ''}`, `+${fmtMoney(a.payout?.money ?? a.reward)}${a.payout?.rp ? ` +${a.payout.rp} 🔬` : ''}`)),
    a.unlocked ? null : h('div', progressBar(frac, 'gold'),
      h('div.small.muted', `${fmtNum(Math.min(a.value || 0, target))} / ${fmtNum(target)}`)));
}

function logList(log) {
  if (!log.length) return h('div.empty', 'Belum ada kejadian.');
  return h('div.list', [...log].reverse().map((e) => h('div.list-item',
    h('span', LOG_ICON[e.type] ?? '•'),
    h('div', { style: { flex: '1', minWidth: '0' } }, h('div.small', e.msg)),
    h('span.small.muted', { style: { whiteSpace: 'nowrap' } }, `H${e.day} ${String(e.hour).padStart(2, '0')}:00`))));
}

function statsCard(game) {
  const s = game.state.stats;
  const rows = [
    ['Total panen', `${fmtNum(s.harvests)} kali`],
    ['Total hasil', `${fmtNum(s.tonsHarvested, 1)} t`],
    ['Total pendapatan', fmtMoney(s.totalEarned)],
    ['Total pengeluaran', fmtMoney(s.totalSpent)],
    ['Ladang / mesin / ternak', `${s.fieldsOwned} / ${s.machinesOwned} / ${s.animalsOwned}`],
  ];
  return h('div.card', h('div.kv', rows.flatMap(([k, v]) => [h('span', k), h('span.num', v)])));
}

function missionsPane(game) {
  const ch = chapterCard(game, goTo);
  return [
    ch ? h('section.section', h('div.section-title', '📖 Bab Petani'), ch) : null,
    h('section.section', calendarCard(game)),
    h('section.section',
      h('div.section-title', '🎯 Misi hari ini (hari game)', h('span.small.muted', `Hari ${game.day}`)),
      missionsCard(game)),
    h('section.section', h('div.section-title', '🏅 Papan peringkat'), leaderboardCard(game)),
  ];
}

function trophiesPane(game) {
  const list = game.achievementsView();
  const done = list.filter((a) => a.unlocked);
  const todo = list.filter((a) => !a.unlocked)
    .sort((a, b) => (b.value || 0) / b.condition.gte - (a.value || 0) / a.condition.gte);
  return [
    h('section.section',
      h('div.section-title', '🎖️ Target berikutnya', h('span.small.muted', `${done.length}/${list.length} tercapai`)),
      todo.length ? h('div.cards', todo.slice(0, NEXT_SHOWN).map(achievementCard)) : h('div.empty.compact', '🏆 Semua prestasi tercapai!')),
    todo.length > NEXT_SHOWN ? fold('trophies-more', '🎖️ Target lainnya', { meta: String(todo.length - NEXT_SHOWN) },
      h('div.cards', todo.slice(NEXT_SHOWN).map(achievementCard))) : null,
    done.length ? fold('trophies-done', '🏆 Sudah tercapai', { meta: String(done.length) }, h('div.cards', done.map(achievementCard))) : null,
    fold('trophies-kabar', '📰 Kabar Desa · 10 keputusan terakhir', { open: true, meta: String(game.kabarView?.().history.length ?? 0) }, kabarHistory(game)),
    fold('trophies-stats', '📊 Statistik', { open: false }, statsCard(game)),
    fold('trophies-log', '📜 Catatan kejadian', { meta: String(game.state.log.length) }, logList(game.state.log)),
  ];
}

function financePane(game) {
  return [
    h('section.section', h('div.section-title', '📊 Laporan keuangan', h('span.small.muted', '7 hari terakhir')), financeCard(game)),
    loansPanel(),
    h('section.section', h('div.section-title', '📈 Kekayaan bersih'), netWorthCard(game)),
  ];
}

function computeSig(game) {
  const log = game.state.log;
  return `${getSub('achievements', SUBS)}|${game.state.achievements.length}|${log.length}|${log[log.length - 1]?.msg ?? ''}|${game.day}|`
    + `${game.state.history?.length ?? 0}|${missionsSig(game)}|${researchSig(game)}|${loansSig(game)}|${calendarSig(game)}|${kabarHistorySig(game)}`;
}

export function renderAchievements(root) {
  const game = app.game;
  sig = computeSig(game);
  const sub = getSub('achievements', SUBS);
  const claimable = (game.missionsView?.().claimable ?? 0) + (game.chaptersView?.().ready ? 1 : 0);
  const points = game.researchPoints?.().available ?? 0;
  mount(root,
    subTabBar('achievements', [
      { id: 'missions', icon: '🎯', label: 'Misi', badge: claimable || null },
      { id: 'research', icon: '🔬', label: 'Riset', badge: points || null },
      { id: 'trophies', icon: '🏆', label: 'Prestasi' },
      { id: 'finance', icon: '💰', label: 'Keuangan' },
    ], sub),
    sub === 'missions' ? missionsPane(game)
      : sub === 'research' ? researchSection(game)
        : sub === 'trophies' ? trophiesPane(game)
          : financePane(game));
}

export function updateAchievements(root) {
  if (computeSig(app.game) !== sig) renderAchievements(root);
  else updateMissionsCountdown(root, app.game);
}
