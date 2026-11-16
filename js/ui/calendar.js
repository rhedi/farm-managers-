// 📅 Kalender Panen (engine js/engine/calendar.js): 7-day real-calendar login rewards. Card in Prestasi › Misi and in
// the Laporan Pagi; "⚡ Booster aktif" chips. The UI supplies the local date and Date.now() (engine has no clock).
import { h, fmtHours } from './dom.js';
import { app, act } from './app.js';
import { confetti, vibrate } from './fx.js';
import { sfx } from './sfx.js';

/** Local calendar date 'YYYY-MM-DD'. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const calendarNow = (game = app.game) => game.calendarView(localDate(), Date.now());

/** Re-render key for the Prestasi tab. */
export function calendarSig(game) {
  const c = game.state.calendar || {};
  return `${localDate()}|${c.claims}|${c.streak}|${(game.state.boosters || []).map((b) => `${b.kind}:${b.until}`).join(',')}|${Math.floor(game.state.time / 24)}`;
}

function claim(btn) {
  const game = app.game, r = game.claimCalendar(localDate(), Date.now());
  act(r, (x) => `📅 ${x.reward.emoji} ${x.reward.name} diambil!`); // short: the card shows the details
  if (!r.ok) return;
  const box = btn?.getBoundingClientRect?.();
  confetti(box ? box.left + box.width / 2 : undefined, box ? box.top : undefined, r.day === 7 ? 90 : 44);
  sfx(r.day === 7 ? 'levelup' : 'achievement');
  vibrate([20, 40, 20]);
}

/** Active booster chips (or null). */
export function boosterRow(game) {
  const list = game.activeBoosters();
  if (!list.length) return null;
  return h('div.booster-row', h('span.small.muted', '⚡ Booster aktif'),
    list.map((b) => h('span.booster-chip', { title: b.name }, `${b.emoji} ${b.text} · ${fmtHours(b.hoursLeft)}`)));
}

/** The 7-day strip, streak and claim button. `compact`: the morning report version (no booster row). */
export function calendarCard(game, { compact = false } = {}) {
  const v = calendarNow(game);
  const today = v.days.find((d) => d.state === 'today');
  const btn = h('button.btn.btn-primary.btn-block.cal-claim', { type: 'button', disabled: !v.canClaim, onclick: (e) => claim(e.currentTarget) },
    v.canClaim ? `🎁 Ambil hadiah hari ${v.cycleDay}` : v.claimedToday ? '✅ Sudah diambil — kembali besok' : '⛔ Belum bisa diambil');
  return h(`div.card.cal-card${compact ? '.compact' : ''}`,
    h('div.cal-head', h('b', '📅 Kalender Panen'),
      h('span.small.muted', `🔥 ${v.canClaim ? v.streak - 1 : v.current} hari beruntun · terpanjang ${Math.max(v.best, v.current)}`)),
    v.broken ? h('div.small.cal-broken', '💔 Kemarin terlewat — kalender mulai lagi dari hari 1.') : null,
    h('div.cal-strip', v.days.map((d) => h(`div.cal-day.${d.state}${d.day === 7 ? '.big' : ''}`, { title: `${d.name}: ${d.text}` },
      h('span.cal-num', `H${d.day}`), h('span.cal-emoji', d.state === 'done' ? '✅' : d.emoji), h('span.cal-name', d.name)))),
    today ? h('div.small.cal-today', `${today.emoji} ${today.name}: ${today.text}`) : null,
    v.reason && !v.claimedToday ? h('div.small.ops-bad', v.reason) : null,
    btn,
    compact ? null : boosterRow(game),
    compact || !v.badges ? null : h('div.small.muted', `🏅 Lencana Petani Setia ×${v.badges}`));
}
