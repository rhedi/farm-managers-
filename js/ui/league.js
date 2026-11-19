// 🏆 Liga Musiman (Prestasi › 🎯 Misi): division badge, season countdown, the season's metric with its explanation,
// live standings (promotion / relegation zones), rewards, trophy shelf, history, and the end-of-season modal with
// confetti (flushLeagueResults, polled by main.js). Engine: game.leagueView() / game.takeLeagueResults().
import { h, mount, fmtNum, progressBar } from './dom.js';
import { openModal, isModalOpen } from './modal.js';
import { confetti, vibrate } from './fx.js';
import { sfx } from './sfx.js';
import { fold } from './subtabs.js';
import { leaderboardCard } from './missions.js';

const CUP = { emas: '🏆', perak: '🥈', perunggu: '🥉' };
const CUP_NAME = { emas: 'Piala Emas', perak: 'Piala Perak', perunggu: 'Piala Perunggu' };
const ICON = { profitHa: '💰', yieldIdx: '🌾', contracts: '📋', fuelT: '⛽', animalIdx: '🐄' };

/** A metric value for display ('—' when the farm has no value yet). */
export function fmtMetric(id, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (id) {
    case 'profitHa': return `${v < 0 ? '−' : ''}$${fmtNum(Math.abs(v))}/ha/hari`;
    case 'yieldIdx': case 'animalIdx': return `${fmtNum(v * 100)}%`;
    case 'contracts': return `${fmtNum(v)} kontrak`;
    case 'fuelT': return `${fmtNum(v, 1)} L/t`;
    default: return fmtNum(v, 1);
  }
}

export function leagueSig(game) {
  const v = game.leagueView();
  return `${game.day}|${v.division.id}|${v.season.n}|${v.season.rated}|${v.unlocked}|${v.shelf.length}|`
    + `${v.standings.map((r) => `${r.id}${r.rank}`).join(',')}|${fmtMetric(v.season.metric?.id, v.player?.value)}`;
}

function standingRow(r, metricId, i) {
  return h(`li.lg-row${r.isPlayer ? '.me' : ''}${r.zone ? `.${r.zone}` : ''}`, { style: { '--i': i } },
    h('span.lg-rank', r.zone === 'up' ? `▲${r.rank}` : r.zone === 'down' ? `▼${r.rank}` : `${r.rank}`),
    h('span.lg-emoji', r.emoji),
    h('span.lg-name', h('span', r.name), r.isPlayer ? h('span.small.muted', r.detail || 'Kamu') : null),
    h('span.lg-val.num', fmtMetric(metricId, r.value)));
}

function shelfView(v) {
  if (!v.shelf.length) return h('div.empty.compact', '🏆 Rak masih kosong. Juara 1–3 sebuah musim mendapat piala.');
  return h('div.lg-shelf', { 'data-no-swipe': '' },
    v.shelf.slice(0, 24).map((c, i) => h(`span.lg-cup.cup-${c.cup}`, { style: { '--i': i }, title: `${CUP_NAME[c.cup]} · Musim ${c.season} · Gen ${c.gen}` },
      h('span.lg-cup-ico', CUP[c.cup]), h('span.lg-cup-cap', `M${c.season}`))));
}

function historyView(v) {
  if (!v.history.length) return h('div.empty.compact', 'Belum ada musim yang selesai.');
  return h('div.list', v.history.map((x) => h('div.list-item',
    h('span', x.cup ? CUP[x.cup] : ICON[x.metric] ?? '🏁'),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div.small', h('b', `Musim ${x.season}`), ` · ${v.divisions[x.division].emoji} ${v.divisions[x.division].name} · #${x.rank}`),
      h('div.small.muted', `${ICON[x.metric] ?? ''} ${fmtMetric(x.metric, x.value)}${x.promoted ? ' · ⬆️ naik' : x.relegated ? ' · ⬇️ turun' : ''}${x.rp ? ` · +${x.rp} 🔬` : ''}`)))));
}

/** The league section for Prestasi › 🎯 Misi (replaces the old wealth leaderboard, which stays folded below). */
export function leagueCard(game) {
  const v = game.leagueView(), se = v.season, m = se.metric;
  const head = h('div.lg-head',
    h(`div.lg-div.div-${v.division.id}`, h('span.lg-div-ico', v.division.emoji), h('span.lg-div-name', `Divisi ${v.division.name}`)),
    h('div.lg-season',
      h('div.lg-season-t', `Musim ${se.n} · hari ${se.day}/${se.days}`),
      h('div.small.muted', se.daysLeft > 0 ? `⏳ ${se.daysLeft} hari game lagi` : '⏳ berakhir malam ini'),
      progressBar(se.progress, 'gold')));
  let body;
  if (!v.unlocked) {
    body = h('p.small.muted.lg-note', `🔒 Liga terbuka di Lv ${v.unlockLevel}. Musim pertama dimulai di awal tahun game berikutnya setelah itu.`);
  } else if (!se.rated) {
    body = [
      h('div.lg-warm', h('b', '🔥 Pemanasan'), ` · musim pertamamu dimulai dalam ${se.daysLeft} hari game. Tiap musim menilai satu keahlian; formmu sekarang:`),
      h('div.lg-form', v.metrics.map((x) => h('div.lg-form-row', h('span', `${x.emoji} ${x.name}`), h('b.num', fmtMetric(x.id, x.value))))),
    ];
  } else {
    body = [
      h('div.lg-metric', h('span.lg-metric-ico', m.emoji),
        h('div', h('div.lg-metric-name', m.name, h('span.small.muted', ` · ${m.better === 'low' ? 'makin kecil makin baik' : 'makin besar makin baik'}`)),
          h('div.small.muted', m.desc))),
      h('ol.lg-list', v.standings.map((r, i) => standingRow(r, m.id, i))),
      h('div.lg-zones.small.muted',
        v.division.index < v.divisions.length - 1
          ? (v.divisions[v.division.index + 1].locked
            ? h('span', `🔒 ${v.divisions[v.division.index + 1].emoji} ${v.divisions[v.division.index + 1].name} terbuka di Lv ${v.divisions[v.division.index + 1].minLevel}`)
            : h('span.zone-up', `▲ ${v.promote} teratas naik divisi`))
          : h('span', `${v.division.emoji} Divisi tertinggi`),
        v.division.index > 0 ? h('span.zone-down', `▼ ${v.relegate} terbawah turun`) : null),
      h('div.lg-rewards', v.rewards.map((rw) => h('div.lg-reward', h('span.lg-reward-cup', CUP[rw.cup]),
        h('span.small', `#${rw.rank}${rw.rp ? ` · +${rw.rp} 🔬` : ''}`), h('span.small.muted', rw.booster.text)))),
    ];
  }
  const total = v.cups.emas + v.cups.perak + v.cups.perunggu;
  return h('div.card.lg-card', head, body,
    fold('league-shelf', '🏆 Rak piala', { meta: total ? `${v.cups.emas}🏆 ${v.cups.perak}🥈 ${v.cups.perunggu}🥉` : '0' }, shelfView(v)),
    fold('league-history', '📜 Riwayat musim', { meta: String(v.history.length) }, historyView(v)),
    fold('league-wealth', '💰 Peringkat kekayaan (lama)', {}, leaderboardCard(game)),
    h('p.small.muted.lg-note', 'Lawan menyesuaikan diri dengan formmu tiap musim, jadi ukuran pertanian tidak menentukan juara. Hadiah: piala, poin riset, dan booster — bukan uang.'));
}

// ---------- end-of-season modal ----------

function resultBody(results, divisions) {
  const r = results[results.length - 1], from = divisions[r.division], to = divisions[r.newDivision];
  const cup = r.cup ? CUP[r.cup] : '🎖️';
  return [
    h(`div.lg-end-hero${r.cup ? `.cup-${r.cup}` : ''}`,
      h('div.lg-end-rays'),
      h('div.lg-end-cup', cup),
      h('div.lg-end-rank', `#${r.rank}`),
      h('div.lg-end-sub', `dari ${r.of} · Divisi ${from.emoji} ${from.name}`)),
    r.promoted ? h('div.lg-end-move.up', `⬆️ Naik ke Divisi ${to.emoji} ${to.name}!`)
      : r.relegated ? h('div.lg-end-move.down', `⬇️ Turun ke Divisi ${to.emoji} ${to.name}. Bangkit lagi musim depan!`)
        : h('div.lg-end-move', `Tetap di Divisi ${to.emoji} ${to.name}.`),
    h('div.lg-end-metric.small', `${ICON[r.metric] ?? ''} ${fmtMetric(r.metric, r.value)}`),
    r.cup || r.rp || r.booster ? h('div.lg-end-rewards',
      r.cup ? h('span.lg-chip', `${CUP[r.cup]} ${CUP_NAME[r.cup]}`) : null,
      r.rp ? h('span.lg-chip', `+${r.rp} 🔬 poin riset`) : null,
      r.booster ? h('span.lg-chip', `⚡ ${r.booster.text}`) : null) : null,
    h('ol.lg-list.lg-end-list', r.top.map((x, i) => standingRow({ ...x, zone: null }, r.metric, i))),
    results.length > 1 ? h('p.small.muted', `+ ${results.length - 1} musim lain selesai selama kamu pergi (lihat Riwayat musim).`) : null,
  ];
}

/** main.js loop: show finished seasons once (after level-ups and other modals). */
export function flushLeagueResults(game) {
  if (isModalOpen() || !game.state.league?.pending?.length) return;
  const divisions = game.leagueView().divisions;
  const results = game.takeLeagueResults();
  if (!results.length) return;
  const r = results[results.length - 1];
  openModal({
    title: `🏆 Liga Musim ${r.season} selesai!`,
    render: (body) => mount(body, h('div.lg-end', resultBody(results, divisions))),
    actions: (m) => [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, r.rank <= 3 ? '🎉 Mantap!' : 'Lanjut')],
  });
  if (r.rank <= 3 || r.promoted) {
    sfx('levelup');
    vibrate([30, 40, 30]);
    setTimeout(() => confetti(window.innerWidth / 2, window.innerHeight * 0.28, 60), 250);
  } else sfx('pop');
}
