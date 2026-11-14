// Prestasi tab: daily missions card and rival leaderboard card (stream C).
import { h, fmtMoney, fmtNum, fmtHours, progressBar } from './dom.js';
import { app, act } from './app.js';
import { sfx } from './sfx.js';

const PERSONALITY_LABEL = { steady: 'Stabil', aggressive: 'Agresif', volatile: 'Fluktuatif' };

const resetText = (v) => `⏳ Misi baru dalam ${fmtHours(v.resetsInHours)}`;

function claim(id) {
  const r = act(app.game.claimMission(id), (x) => `🎯 Hadiah misi: +${fmtMoney(x.reward)} · +${x.xp} XP`);
  if (r?.ok) sfx('coin');
}

function missionRow(m) {
  const amount = m.type === 'sell' ? `${fmtMoney(m.progress)} / ${fmtMoney(m.target)}`
    : `${fmtNum(m.progress, m.type === 'harvest' || m.type === 'feed' ? 1 : 0)} / ${fmtNum(m.target, 1)}`;
  const action = m.claimed ? h('span.badge.badge-green', '✔ Diambil')
    : m.done ? h('button.btn.btn-small.ms-claim', { onclick: () => claim(m.id) }, 'Ambil')
      : null;
  return h(`div.ms-row${m.done ? '.done' : ''}${m.claimed ? '.claimed' : ''}`,
    h('div.ms-icon', m.emoji),
    h('div.ms-body',
      h('div.ms-label', m.label),
      progressBar(m.frac, m.done ? '' : 'gold'),
      h('div.ms-meta.small.muted', h('span', amount), h('span.ms-reward', `+${fmtMoney(m.reward)} · +${fmtNum(m.xp)} XP`))),
    action);
}

/** '🎯 Misi harian' card. */
export function missionsCard(game) {
  const v = game.missionsView();
  const step = v.streak % v.streakGoal;
  const dots = Array.from({ length: v.streakGoal }, (_, i) => h(`span.ms-dot${i < step ? '.on' : ''}`));
  return h('div.card.ms-card',
    v.list.length ? v.list.map(missionRow) : h('div.empty', 'Belum ada misi hari ini.'),
    h('div.ms-streak',
      h('span', `🔥 Beruntun ${v.streak} hari`),
      h('span.ms-dots', { title: `Selesaikan semua misi ${v.streakGoal} hari berturut-turut` }, dots),
      h('span.small.muted', `Bonus ${fmtMoney(v.streakBonus.money)} + ${fmtNum(v.streakBonus.xp)} XP`)),
    h('div.small.muted.ms-reset', resetText(v)));
}

/** In-place countdown refresh (avoids re-rendering the tab every game hour). */
export function updateMissionsCountdown(root, game) {
  const el = root.querySelector('.ms-reset');
  if (el) el.textContent = resetText(game.missionsView());
}

/** '🏆 Papan peringkat' card. */
export function leaderboardCard(game) {
  const rows = game.leaderboard();
  return h('div.card.lb-card', h('ol.lb-list', rows.map((r) => {
    const ch = r.change > 0 ? h('span.lb-ch.up', `▲${r.change}`) : r.change < 0 ? h('span.lb-ch.down', `▼${-r.change}`) : h('span.lb-ch', '–');
    return h(`li.lb-row${r.isPlayer ? '.me' : ''}`,
      h('span.lb-rank', `#${r.rank}`),
      h('span.lb-emoji', r.emoji),
      h('span.lb-name', h('span', r.name),
        h('span.small.muted', r.isPlayer ? 'Kamu' : PERSONALITY_LABEL[r.personality] ?? '')),
      h('span.lb-nw.num', fmtMoney(r.netWorth)),
      ch);
  })), h('p.small.muted.lb-note', 'Kekayaan bersih pesaing diperbarui setiap pergantian hari.'));
}

/** Signature of what the two cards show (for the tab's re-render check). */
export function missionsSig(game) {
  const v = game.missionsView();
  const lb = game.leaderboard().map((r) => `${r.id}${r.change}`).join(',');
  return `${v.day}|${v.streak}|${v.list.map((m) => `${m.progress}${m.done}${m.claimed}`).join(',')}|${lb}`;
}
