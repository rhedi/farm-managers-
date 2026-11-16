// Prestasi tab: 📖 Bab Petani chapter card, game-day missions card and rival leaderboard card (stream C).
import { h, fmtMoney, fmtNum, fmtHours, progressBar } from './dom.js';
import { app, act } from './app.js';
import { sfx } from './sfx.js';
import { confetti } from './fx.js';

const PERSONALITY_LABEL = { steady: 'Stabil', aggressive: 'Agresif', volatile: 'Fluktuatif' };

/** "⏳ Misi baru dalam 5 jam game (≈ 13 dtk)": one game day is only ~60 real seconds at 1×. */
function resetText(v) {
  const speed = app.game?.state.speed ?? 1;
  const real = speed > 0 ? Math.max(1, Math.round((v.resetsInHours * v.realSecondsPerDay) / 24 / speed)) : null;
  return `⏳ Misi baru dalam ${fmtHours(v.resetsInHours)} game${real != null ? ` (≈ ${real} dtk)` : ' (jeda)'}`;
}

const rewardText = (x) => `+${fmtMoney(x.reward ?? x.money)} · +${fmtNum(x.xp)} XP${x.rp ? ` · +${x.rp} 🔬` : ''}`;

/** Confetti from where the tapped button was (read before the re-render detaches it). */
function burstAt(rect) { if (rect?.width) confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 36); }

function claim(id, e) {
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const r = act(app.game.claimMission(id), (x) => `🎯 Hadiah misi: ${rewardText(x)}`);
  if (r?.ok) { sfx('coin'); burstAt(rect); }
}

function missionRow(m) {
  const amount = m.type === 'sell' ? `${fmtMoney(m.progress)} / ${fmtMoney(m.target)}`
    : `${fmtNum(m.progress, m.type === 'harvest' || m.type === 'feed' ? 1 : 0)} / ${fmtNum(m.target, 1)}`;
  const action = m.claimed ? h('span.badge.badge-green', '✔ Diambil')
    : m.done ? h('button.btn.btn-small.ms-claim', { onclick: (e) => claim(m.id, e) }, 'Ambil')
      : null;
  return h(`div.ms-row${m.done ? '.done' : ''}${m.claimed ? '.claimed' : ''}`,
    h('div.ms-icon', m.emoji),
    h('div.ms-body',
      h('div.ms-label', m.label),
      progressBar(m.frac, m.done ? '' : 'gold'),
      h('div.ms-meta.small.muted', h('span', amount), h('span.ms-reward', rewardText(m))),
      m.hint && !m.done ? h('div.ms-hint.small.muted', `🤖 ${m.hint}`) : null),
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
  return `${v.day}|${v.streak}|${v.list.map((m) => `${m.progress}${m.done}${m.claimed}`).join(',')}|${lb}|${chapterSig(game)}`;
}

// ---- 📖 Bab Petani (chapter chain, js/engine/chapters.js) ----

/** What the chapter card / Ladang pill show (re-render check). */
export function chapterSig(game) {
  const v = game.chaptersView?.();
  return v ? `${v.started}|${v.current?.id}|${v.current?.status}|${v.current?.progress}|${v.current?.locked}` : '';
}

function claimStep(id, e) {
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const r = act(app.game.claimChapterStep(id), (x) => `📖 Langkah selesai: ${rewardText(x)}`);
  if (r?.ok) { sfx('coin'); burstAt(rect); }
}

const STEP_MARK = { claimed: '✅', ready: '🎁', active: '👉', todo: '⬜' };

/** Chapter card on top of Prestasi › Misi: steps of the current chapter, the current one with goal, progress,
 *  reward, "Tunjukkan" (navigates to the right tab/sub-tab) and "Ambil hadiah" once met. */
export function chapterCard(game, goTo) {
  const v = game.chaptersView?.();
  if (!v?.started) return null;
  if (v.allDone) return h('div.card.ch-card.ch-done', h('div.ch-title', '📖 Bab Petani tamat — semua bab selesai! 🏆'));
  const c = v.chapter, cur = v.current;
  const amount = `${fmtNum(cur.progress)} / ${fmtNum(cur.target)}`;
  return h(`div.card.ch-card${v.ready ? '.ch-ready' : ''}`,
    h('div.ch-head',
      h('span.ch-emoji', c.emoji),
      h('div.ch-main', h('div.ch-title', c.name), h('div.small.muted', `Bab ${c.index}/${c.total} · ${c.done}/${c.steps.length} langkah`))),
    h('ol.ch-steps', c.steps.map((st) => h(`li.ch-step.${st.status}${st.locked ? '.locked' : ''}`,
      h('span.ch-mark', st.locked && st.status !== 'claimed' ? '🔒' : STEP_MARK[st.status]),
      h('span.ch-goal', `${st.icon} ${st.goal}`),
      st.locked && st.status !== 'claimed' ? h('span.small.muted', `Lv ${st.level}`) : null))),
    h('div.ch-current',
      h('div.ch-goal-big', `${cur.icon} ${cur.goal}`),
      progressBar(cur.frac, v.ready ? '' : 'gold'),
      h('div.ms-meta.small.muted', h('span', cur.locked ? `🔒 Terbuka di Lv ${cur.level}` : amount),
        h('span.ms-reward', rewardText(cur.reward))),
      h('div.card-actions.ch-actions',
        h('button.btn.btn-small.btn-secondary', { onclick: () => goTo(cur.go.tab, cur.go.sub) }, '🧭 Tunjukkan'),
        v.ready ? h('button.btn.btn-small.ms-claim', { onclick: (e) => claimStep(cur.id, e) }, '🎁 Ambil hadiah') : null)));
}

/** Small pill on Ladang when a chapter step's reward is ready. */
export function chapterPill(game, goTo) {
  const v = game.chaptersView?.();
  if (!v?.started || !v.ready) return null;
  return h('button.ch-pill', { type: 'button', onclick: () => goTo('achievements', 'missions') },
    h('span.ch-pill-ico', '📖'), `Bab: ${v.current.goal} — hadiah siap!`, h('span.ch-pill-go', '›'));
}
