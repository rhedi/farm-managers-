// Achievements tab: achievement list, stats, event log, settings (reset).
import { h, mount, fmtMoney, fmtNum, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app } from './app.js';
import { netWorthCard } from './netWorthChart.js';
import { financeCard } from './finance.js';
import { sfxEnabled, setSfxEnabled, onSfxChange, sfx } from './sfx.js';
import { missionsCard, leaderboardCard, missionsSig, updateMissionsCountdown } from './missions.js';

const LOG_ICON = {
  task_done: '✅', crop_ready: '🌾', wither: '🥀', achievement: '🏆', level_up: '⭐', weather: '🌦️',
  low_feed: '⚠️', sale: '💰', purchase: '🛒', field_bought: '📍', machine_bought: '🚜', barn: '🏗️',
  contract_offer: '📋', contract_done: '🤝', contract_failed: '❌',
  season_change: '🍂', event_start: '📣', event_end: '🏁', pest: '🐛', silo_overflow: '🏚️',
  machine_breakdown: '🔧', wages_unpaid: '💸', worker_hired: '👷',
  mission_done: '🎯', missions_new: '🎯', mission_streak: '🔥', rank_up: '🏅',
};
let sig = '';

function achievementCard(a) {
  const target = a.condition.gte;
  const frac = Math.min(1, (a.value || 0) / target);
  return h(`div.card.achievement${a.unlocked ? '.done' : ''}`,
    h('div.card-head',
      h('div.card-icon', a.unlocked ? '🏆' : '🔒'),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.card-title', a.name),
        h('div.card-sub', a.desc)),
      h(`span.badge${a.unlocked ? '.badge-gold' : ''}`, `+${fmtMoney(a.reward)}`)),
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

const sfxLabel = (on) => (on ? '🔊 Suara: aktif' : '🔇 Suara: mati');

function sfxToggle() {
  const btn = h('button.btn.btn-small', { 'aria-pressed': String(sfxEnabled()) }, sfxLabel(sfxEnabled()));
  btn.addEventListener('click', () => { setSfxEnabled(!sfxEnabled()); sfx('coin'); });
  const off = onSfxChange((on) => {
    if (!btn.isConnected) { off(); return; }
    btn.textContent = sfxLabel(on);
    btn.setAttribute('aria-pressed', String(on));
  });
  return btn;
}

async function resetFlow() {
  const ok = await confirmModal({
    title: 'Mulai ulang permainan?',
    message: 'Semua kemajuan (uang, ladang, mesin, ternak) akan dihapus permanen. Lanjutkan?',
    confirmLabel: 'Hapus & mulai baru', danger: true,
  });
  if (ok) app.resetGame();
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

function computeSig(game) {
  const log = game.state.log;
  return `${game.state.achievements.length}|${log.length}|${log[log.length - 1]?.msg ?? ''}|${game.day}|${game.state.history?.length ?? 0}|${missionsSig(game)}`;
}

export function renderAchievements(root) {
  const game = app.game;
  sig = computeSig(game);
  const list = game.achievementsView();
  const done = list.filter((a) => a.unlocked).length;
  mount(root,
    h('section.section',
      h('div.section-title', '🎯 Misi harian', h('span.spacer'), h('span.small.muted', `Hari ${game.day}`)),
      missionsCard(game)),
    h('section.section', h('div.section-title', '🏆 Papan peringkat'), leaderboardCard(game)),
    h('section.section', h('div.section-title', '📊 Laporan Keuangan', h('span.spacer'), h('span.small.muted', '7 hari terakhir')),
      financeCard(game)),
    h('section.section',
      h('div.section-title', '🏆 Prestasi', h('span.spacer'), h('span.small.muted', `${done}/${list.length}`)),
      h('div.cards', [...list].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map(achievementCard))),
    h('section.section', h('div.section-title', '📈 Kekayaan'), netWorthCard(game)),
    h('section.section', h('div.section-title', '📊 Statistik'), statsCard(game)),
    h('section.section', h('div.section-title', '📜 Catatan kejadian'), logList(game.state.log)),
    h('section.section',
      h('div.section-title', '⚙️ Pengaturan'),
      h('div.card',
        h('p.small.muted', 'Permainan tersimpan otomatis di peramban ini setiap 10 detik.'),
        h('div.card-actions',
          sfxToggle(),
          h('button.btn.btn-small.btn-secondary', { onclick: () => app.saveNow(true) }, '💾 Simpan sekarang'),
          h('span.spacer'),
          h('button.btn.btn-small.btn-danger', { onclick: resetFlow }, '🗑️ Reset game')))));
}

export function updateAchievements(root) {
  if (computeSig(app.game) !== sig) renderAchievements(root);
  else updateMissionsCountdown(root, app.game);
}
