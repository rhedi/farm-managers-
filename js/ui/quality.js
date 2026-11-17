// v18 ⭐ Kualitas & Rekor (UI): grade badges, the field card's last-harvest row (🏅 Rekor baru! burst), the field
// dialog's "⭐ Kualitas panen" breakdown and the 📒 Buku Rekor list (Prestasi › 📖 Ensiklopedia).
import { h, fmtNum } from './dom.js';
import { fold } from './subtabs.js';
import { sfx } from './sfx.js';
import { confetti } from './fx.js';

let lastBurst = 0;
/** 🏅 Rekor baru / 🎁 kosmetik / 🏆 tender: a ribbon that pops in the middle of the screen + confetti (≤ 1 per 4 s). */
export function celebrateV18(ev) {
  const now = Date.now();
  if (now - lastBurst < 4000 || typeof document === 'undefined') return;
  lastBurst = now;
  const text = ev.type === 'quality_record' ? '🏅 Rekor baru!' : ev.type === 'tender_done' ? '🏆 Tender selesai!' : '🎁 Kosmetik baru!';
  sfx('achievement');
  confetti(window.innerWidth / 2, window.innerHeight * 0.32, 36);
  const el = h(`div.v18-burst.${ev.type}`, { 'aria-hidden': 'true' }, text);
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 3200);
}

const ID_OF = { 'A★': 'S', A: 'A', B: 'B', C: 'C' };

/** Grade pill: `id` S/A/B/C (or a label). */
export function gradeBadge(idOrLabel, { small = false, title = null } = {}) {
  const id = ID_OF[idOrLabel] ?? idOrLabel;
  const label = id === 'S' ? 'A★' : id;
  return h(`span.qgrade.q-${id}${small ? '.small' : ''}`, { title: title ?? `Kualitas ${label}`, 'aria-label': `Kualitas ${label}` }, label);
}

/** Field card row: last harvest grade + t/ha and the crop's record; a fresh record gets the animated ribbon. */
export function fieldQualityRow(f) {
  const q = f.quality;
  const last = q?.last, pv = q?.preview;
  if (!last && !pv) return null;
  const growing = pv && (f.baseState === 'growing' || f.baseState === 'ready');
  return h('div.fq-row',
    growing ? h('span.fq-prev', { title: 'Perkiraan kualitas bila dipanen tepat waktu' }, '⭐ perkiraan ', gradeBadge(pv.grade, { small: true })) : null,
    last ? h('span.fq-last', { title: `Panen terakhir hari ${last.day}` },
      'Panen lalu ', gradeBadge(last.grade, { small: true }), ` ${fmtNum(last.tph, 1)} t/ha`) : null,
    last && last.fresh ? h('span.fq-record', { role: 'status' }, h('span.fq-medal', '🏅'), 'Rekor baru!')
      : last ? h('span.fq-best', { title: 'Rekor pribadi tanaman ini (t/ha)' }, `🏅 rekor ${fmtNum(last.best, 1)}`) : null);
}

/** Field dialog fold: the grade this crop would get now and what costs points. */
export function qualitySection(f) {
  const pv = f.quality?.preview;
  if (!pv || !f.crop) return null;
  const rows = pv.parts.length ? pv.parts.map((p) => h(`div.yf-row.${p.pts > 0 ? 'yf-up' : p.pts <= -12 ? 'yf-bad' : 'yf-down'}`,
    h('span', p.label), h('span.num', `${p.pts > 0 ? '+' : ''}${p.pts}`)))
    : [h('div.yf-row.yf-up', h('span', 'Semua faktor ideal'), h('span.num', '100'))];
  const tips = [];
  if (pv.parts.some((p) => p.id === 'fert')) tips.push('🧪 Pupuk sebelum tanam: +12 poin.');
  if (pv.parts.some((p) => p.id === 'rotation')) tips.push('🔄 Gilir tanaman (Rencana › Rotasi dengan) untuk kualitas lebih tinggi.');
  if (pv.parts.some((p) => p.id === 'timing')) tips.push('⏰ Panen secepatnya setelah siap: lewat 12 jam poin mulai turun.');
  if (pv.parts.some((p) => p.id === 'ph')) tips.push('🪨 Kapur menggeser pH ke arah ideal (+4 poin di siklus itu).');
  return fold('fm-quality', '⭐ Kualitas panen', { meta: `${pv.label} · ${pv.score}/100` },
    h('div.q-preview', gradeBadge(pv.grade), h('div.q-meter', h('i', { style: { width: `${pv.score}%` } })), h('span.num', `${pv.score}`)),
    h('p.small.muted', 'Harga jual: A★ +15% · A +8% · B ±0 · C −10%. Kontrak ⭐ kualitas butuh stok ≥ A.'),
    h('div.yf-list', rows),
    tips.map((t) => h('p.small.yf-hint', t)));
}
export const qualitySig = (f) => `${f.quality?.preview?.score ?? ''}:${f.quality?.last?.day ?? ''}`;

/** 📒 Buku Rekor: harvested crops/trees with best t/ha, best grade, field and day; the rest as a muted list. */
export function recordsBook(game) {
  const list = game.recordsView?.() ?? [];
  const done = list.filter((r) => r.harvested);
  const todo = list.filter((r) => !r.harvested);
  const row = (r) => h('div.rec-row',
    h('span.rec-ico', r.emoji),
    h('div.rec-main',
      h('div.rec-name', r.name, r.tree ? h('span.rec-tag', 'pohon') : null),
      h('div.small.muted', `🏅 ${r.fieldName} · hari ${r.day} · ${fmtNum(r.harvests)}× panen`)),
    h('div.rec-side',
      h('span.rec-tph.num', `${fmtNum(r.tph, 2)} t/ha`),
      h('span.small.muted', 'terbaik ', gradeBadge(r.grade, { small: true, title: `Kualitas terbaik: ${r.gradeLabel} di ${r.gradeFieldName}, hari ${r.gradeDay}` }))));
  return h('div.records',
    done.length ? h('div.rec-list', done.map(row)) : h('div.empty.compact', '📒 Belum ada rekor. Panen pertama setiap tanaman langsung tercatat.'),
    todo.length ? h('div.rec-todo.small.muted',
      h('span', `Belum dipanen (${todo.length}): `),
      todo.map((r) => h(`span.rec-chip${r.locked ? '.locked' : ''}`, { title: r.locked ? `Terbuka di level ${r.unlockLevel}` : r.name }, r.locked ? '🔒' : r.emoji))) : null);
}
