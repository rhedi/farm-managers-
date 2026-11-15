// Animals tab: breeding panel per herd — genetics stars, births, intensive toggle, breeding stock (studs).
import { h, fmtMoney, fmtNum, progressBar } from './dom.js';
import { app, act } from './app.js';

const opened = new Set(); // herds whose breeding panel the player expanded (folded by default)

const x2 = (v) => (Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Genetics multiplier with 2 fixed decimals: ×1,10. */
export const fmtGene = (v) => `×${x2(v)}`;

/** 0–5 stars with a fractional gold fill clipped over ☆☆☆☆☆. */
export function starRating(stars) {
  const pct = Math.max(0, Math.min(5, stars)) / 5 * 100;
  return h('span.breed-stars', { 'aria-label': `${fmtNum(stars, 1)} bintang` },
    '☆☆☆☆☆', h('span.breed-stars-fill', { style: { width: `${pct.toFixed(1)}%` } }, '★★★★★'));
}

function geneticsRow(a) {
  const frac = (a.breedQuality - 0.5) / 1;
  const target = a.studTier > 0 && a.studTarget > a.breedQuality + 0.004
    ? h('span.small.muted', ` → ${fmtGene(a.studTarget)}`) : null;
  return h('div.breed-genes',
    h('div.breed-genes-head',
      h('span', '🧬 Genetika '),
      starRating(a.stars), h('b', ` ${fmtGene(a.breedQuality)}`), target),
    progressBar(frac, 'breed-bar'),
    h('div.small.muted', `Produksi & harga jual ${fmtGene(a.breedQuality)}. Ternak yang dibeli bergenetika ×1,00.`));
}

function birthsRow(a) {
  const last = a.lastBirthDay != null
    ? (a.bornToday ? `hari ini +${a.bornToday}` : `+${a.bornLast} (hari ${a.lastBirthDay})`) : 'belum ada';
  const next = a.breedPaused
    ? h('span.breed-paused', `⏸️ ${a.breedPaused}`)
    : h('span', `berikutnya ±${a.nextBirthIn} hari (≈ ${fmtNum(Math.floor(a.expectedBirths))} ekor)`);
  return h('div.breed-births',
    h('div.kv',
      h('span', '🐣 Kelahiran'), h('span', last),
      h('span', 'Total lahir'), h('b.breed-born', `${a.bornTotal} ekor`),
      h('span', 'Siklus'), h('span', a.cycleDays ? `${a.cycleDays} hari` : '—')),
    h('div.small', next),
    a.cycleDays
      ? h('div.small.muted', 'Lahir saat ternak kenyang, bahagia (>70%), minimal 2 ekor, dan kandang masih ada tempat.') : null);
}

function intensiveToggle(a) {
  const game = app.game;
  const m = a.intensive;
  return h('div.breed-toggle',
    h('label.breed-toggle-row',
      h('input', { type: 'checkbox', checked: !!a.breeding,
        onchange: (e) => act(game.setBreeding(a.id, e.target.checked),
          e.target.checked ? `💞 Pembiakan intensif ${a.name} aktif.` : `Pembiakan intensif ${a.name} mati.`) }),
      h('span', '💞 Pembiakan intensif'),
      a.breeding ? h(`span.badge${a.breedingActive ? '.badge-green' : ''}`, a.breedingActive ? 'Aktif' : 'Dijeda') : null),
    h('div.small.muted', `Kelahiran ×${fmtNum(m.births)}, pakan ×${fmtNum(m.feed, 1)}, produksi ×${fmtNum(m.production, 2)}`
      + ' — hanya berjalan (dan memakan biaya) selama kandang belum penuh. Cocok untuk mengisi kandang, bukan untuk dijual.'));
}

function studRow(a) {
  const game = app.game;
  const s = a.nextStud;
  const tier = `Tingkat ${a.studTier}/${a.studMaxTier}`;
  if (!s) return h('div.breed-stud', h('div.small', `🐂 Indukan unggul: ${tier} (maksimal).`));
  return h('div.breed-stud',
    h('div.small', `🐂 Indukan unggul: ${tier}`),
    h('div.small.muted', `Tingkat ${s.tier}: genetika naik bertahap ke ×${fmtNum(s.target, 2)} (+0,01/hari saat kenyang)`
      + ` untuk ${s.capacity} ekor (kapasitas kandang sekarang).`),
    h('div.card-actions',
      h('button.btn.btn-small.btn-primary.breed-stud-btn', { disabled: !!s.reason,
        onclick: () => act(game.buyBreedingStock(a.id), (r) => `🐂 Indukan ${a.name} tingkat ${r.tier} dibeli (${fmtMoney(r.cost)}).`),
      }, `🐂 Beli indukan Tk ${s.tier} — ${fmtMoney(s.cost)}`)),
    s.reason ? h('div.small.breed-reason', `⚠️ ${s.reason}`) : null);
}

/** Breeding section for a herd that has a barn. */
export function breedingPanel(a) {
  return h('details.breed-panel', { open: opened.has(a.id),
    ontoggle: (e) => (e.target.open ? opened.add(a.id) : opened.delete(a.id)) },
    h('summary', '🧬 Pembiakan', a.bornToday ? h('span.badge.badge-green', `+${a.bornToday} lahir`) : null),
    geneticsRow(a), birthsRow(a), intensiveToggle(a), studRow(a));
}

/** Signature part for re-rendering when breeding state changes. */
export const breedingSig = (a) => `${a.breedQuality}:${a.bornTotal}:${a.breeding ? 1 : 0}:${a.breedingActive ? 1 : 0}:`
  + `${a.studTier}:${a.breedDays}:${a.breedPaused ?? ''}:${a.nextStud?.reason ?? ''}`;
