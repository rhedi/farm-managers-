// v18 📖 Ensiklopedia Tani (Prestasi › 📖 Ensiklopedia): stamp book per category with 3 tiers, cosmetics (banner on
// the map, barn style, tractor paints), the 🚢 tender trophy shelf and the 📒 Buku Rekor.
import { h, progressBar } from './dom.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';
import { recordsBook } from './quality.js';
import { sfx } from './sfx.js';
import { confetti } from './fx.js';

const TIER_NAME = ['Belum', 'Perunggu', 'Perak', 'Emas'];

function stamp(it) {
  const stars = [1, 2, 3].map((n) => h(`i.st-star${n <= it.tier ? '.on' : ''}`, '★'));
  return h(`div.stamp.t${it.tier}${it.locked ? '.locked' : ''}${it.fresh ? '.fresh' : ''}`, {
    title: `${it.name} — ${TIER_NAME[it.tier]}${it.next ? ` · berikutnya: ${it.next}` : ' · lengkap!'}`,
  },
  h('span.stamp-ico', it.locked ? '🔒' : it.emoji),
  h('span.stamp-name', it.name),
  h('span.stamp-stars', { 'aria-label': `${it.tier} dari 3 bintang` }, stars),
  h('span.stamp-next', it.locked ? `Lv ${it.unlockLevel}` : it.next ?? '✔ Lengkap'));
}

function catSection(c, rewards) {
  const gift = rewards.filter((r) => r.from?.cat === c.id);
  return fold(`enc-${c.id}`, `${c.emoji} ${c.name}`, { open: c.id === 'crop', meta: `${c.done}/${c.total} · ★ ${c.stars}/${c.total * 3}` },
    h('div.enc-tiers.small.muted', c.tiers.map((t, i) => h('span', `${'★'.repeat(i + 1)} ${t}`))),
    gift.length ? h('div.enc-gifts', gift.map((r) => h(`span.enc-gift${r.unlocked ? '.got' : ''}`,
      `${r.unlocked ? '✅' : '🎁'} ${r.emoji} ${r.name} · baris ${'★'.repeat(r.from.tier)}`))) : null,
    h('div.stamp-grid', c.items.map(stamp)));
}

function choose(kind, id, e) {
  const rect = e?.currentTarget?.getBoundingClientRect?.();
  const r = act(app.game.setCosmetic(kind, id), id ? '🎁 Kosmetik dipasang.' : 'Kosmetik dilepas.');
  if (r?.ok && id) { sfx('pop'); if (rect?.width) confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 20); }
}

function cosmeticsCard(v) {
  const group = (kind) => v.cosmetics.filter((c) => c.kind === kind);
  const picker = (kind, label, active) => h('div.cos-group',
    h('div.cos-label', label),
    h('div.cos-chips',
      h(`button.chip${active ? '' : '.active'}`, { type: 'button', onclick: (e) => choose(kind, null, e) }, 'Tanpa'),
      group(kind).map((c) => h(`button.chip.cos-chip${active === c.id ? '.active' : ''}${c.unlocked ? '' : '.locked'}`, {
        type: 'button', disabled: !c.unlocked, title: c.unlocked ? c.name : `🔒 ${c.how}`,
        onclick: (e) => choose(kind, c.id, e),
      }, c.unlocked ? `${c.emoji} ${c.name}` : `🔒 ${c.emoji}`))));
  const paints = group('paint');
  return h('div.card.cos-card',
    picker('banner', '🚩 Panji di peta (wilayahmu)', v.banner),
    picker('barn', '🏠 Gaya kandang (Ternak)', v.barn),
    h('div.cos-group',
      h('div.cos-label', '🎨 Cat traktor', h('span.small.muted', ' · pakai di Garasi › 🔧 Upgrade')),
      h('div.cos-paints', paints.map((c) => h(`span.cos-paint${c.unlocked ? '' : '.locked'}`, { title: c.unlocked ? c.name : `🔒 ${c.how}` },
        h('i.cos-swatch', { style: { background: c.unlocked ? c.color : null } }), h('span.small', c.unlocked ? c.name : '🔒'))))),
    h('details.cos-how.small.muted', h('summary', 'Cara membuka'),
      h('ul', v.cosmetics.filter((c) => !c.unlocked).map((c) => h('li', `${c.emoji} ${c.name}: ${c.how}`)))));
}

function trophyShelf(game) {
  const t = game.tenderView?.();
  if (!t) return null;
  const won = t.trophies.filter((x) => x.count > 0);
  return h('section.section',
    h('div.section-title', '🏆 Lemari Piala Ekspor', h('span.small.muted', `${won.length}/${t.trophies.length}`)),
    h('div.trophy-shelf', t.trophies.map((x) => h(`div.trophy${x.count ? '.won' : ''}`, { title: x.count ? `${x.trophy} ×${x.count}` : `🔒 Tender ke ${x.name}` },
      h('span.trophy-ico', x.count ? x.emoji : '❔'),
      h('span.trophy-name', x.count ? x.name : '???'),
      x.count > 1 ? h('span.trophy-n', `×${x.count}`) : null))),
    t.unlocked ? null : h('p.small.muted', `🚢 Tender Ekspor terbuka di level ${t.unlockLevel}.`));
}

/** The whole sub-tab. */
export function encyclopediaPane(game) {
  const v = game.encyclopediaView?.();
  if (!v) return h('div.empty', 'Ensiklopedia belum tersedia.');
  return [
    h('section.section',
      h('div.card.enc-head',
        h('div.enc-head-row', h('span.enc-book', '📖'),
          h('div.enc-head-main', h('b', 'Ensiklopedia Tani'),
            h('span.small.muted', `${v.stamped}/${v.total} prangko · ★ ${v.stars}/${v.maxStars}`))),
        progressBar(v.maxStars ? v.stars / v.maxStars : 0, 'gold'),
        h('p.small.muted', 'Setiap tanaman, pohon, ternak, ikan, produk olahan, wilayah dan kota punya prangko 3 tingkat. Lengkapi satu baris untuk membuka kosmetik.'))),
    v.cats.map((c) => catSection(c, v.cosmetics)),
    fold('enc-records', '📒 Buku Rekor', { open: true, meta: `${(game.recordsView?.() ?? []).filter((r) => r.harvested).length} tanaman` }, recordsBook(game)),
    h('section.section', h('div.section-title', '🎁 Kosmetik'), cosmeticsCard(v)),
    trophyShelf(game),
  ];
}

/** Re-render signature. */
export function encyclopediaSig(game) {
  const e = game.state.encyclopedia;
  if (!e) return '';
  const rec = game.state.quality?.records || {};
  return `${Object.values(e.stamps).reduce((a, t) => a + t, 0)}:${e.cosmetics.length}:${e.banner}:${e.barn}:`
    + `${Object.values(rec).reduce((a, r) => a + (r.harvests || 0), 0)}:${game.state.tenders?.done ?? 0}`;
}

/** 🚩 Farm banner in front of a region label on the Peta (owned regions only, when a banner cosmetic is chosen). */
export function mapBanner(game, r) {
  const b = game.activeCosmetic?.('banner');
  if (!b || !Object.keys(game.state.fields).some((id) => game.idx.fields.get(id)?.regionId === r.id)) return null;
  return h(`span.map-banner.${b.id}`, { 'aria-hidden': 'true', title: b.name }, h('i.mb-pole'), h('span.mb-flag', b.emoji));
}
