// Ternak tab, two sub-tabs: 🐄 Hewan (own herds: production, feed, quality first; "Kelola" and breeding folded; herds to
// start; locked herds; feed reserves) and 🐟 Ikan (js/ui/fish.js). Both show the Gudang Dingin card on top.
import { h, mount, fmtMoney, fmtNum, fmtPct, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { fmtAmt } from './ecoFmt.js';
import { econRow, reservePanel, reserveSig } from './animalEcon.js';
import { breedingPanel, breedingSig, starRating, fmtGene } from './breeding.js';
import { fold, goTo, subTabBar, getSub } from './subtabs.js';
import { stockByCategory, groupValue } from './stock.js';
import { fishPane, fishSig, fishLiveSig, fishAlerts, patchFish } from './fish.js';

const qty = new Map(); // animalId → typed count (survives re-render)
const manageOpen = new Set(); // herds whose "Kelola kawanan" panel is open
let sig = '';
let liveSig = ''; // Ikan sub-tab: numbers patched in place

function productOf(a) {
  return app.game.data.PRODUCTS.find((p) => p.id === a.product);
}

function cropNames(ids) {
  const crops = app.game.data.CROPS;
  return ids.map((id) => crops.find((c) => c.id === id)?.name ?? id).join(', ');
}

function feedText(a) {
  if (!a.count) return '—';
  if (a.feedDaysLeft == null) return '—';
  return `${fmtAmt(a.feedStock)} (${a.feedDaysLeft} hari)`;
}

function feedButton(a, days, label, primary) {
  const game = app.game;
  const q = game.feedQuote(a.id, days);
  if (!q) return null;
  return h(`button.btn.btn-small.${primary ? 'btn-primary' : 'btn-secondary'}`, {
    disabled: !q.affordable, title: q.affordable ? `${fmtNum(q.qty, 2)} t ${q.name}` : 'Uang tidak cukup',
    onclick: () => act(game.buyFeed(a.id, days), (r) => `Pakan ${a.name} dibeli: ${fmtNum(r.qty, 2)} t ${q.name} (${fmtMoney(r.cost)}).`),
  }, `${label} (${fmtMoney(q.cost)})`);
}

function meter(label, v, color) {
  return h('div.herd-meter', h('div.small', h('span.muted', label), ' ', h('b', fmtPct(v))), progressBar(v, `thin.${color}`));
}

/** "Isi penuh" (as many as fit and are affordable) and "Jual semua" with confirm (U10). */
function herdButtons(a, free) {
  const game = app.game;
  const fill = Math.max(0, Math.min(free, Math.floor(game.state.money / a.price)));
  return h('div.card-actions.eco-herd',
    h('button.btn.btn-small.btn-secondary', {
      disabled: fill <= 0, title: free <= 0 ? 'Kandang penuh' : fill <= 0 ? 'Uang tidak cukup' : null,
      onclick: () => act(game.buyAnimal(a.id, fill), `${fill} ${a.name} dibeli (${fmtMoney(fill * a.price)}).`),
    }, fill > 0 ? `Isi penuh +${fill} (${fmtMoney(fill * a.price)})` : 'Isi penuh'),
    h('span.spacer'),
    h('button.btn.btn-small.btn-danger', { disabled: a.count <= 0, onclick: async () => {
      const ok = await confirmModal({ title: `Jual semua ${a.name}?`,
        message: `${a.count} ekor dijual ≈ ${fmtMoney(a.count * a.sellPrice * (0.5 + 0.5 * a.quality) * (a.breedQuality ?? 1))}.`,
        confirmLabel: 'Jual semua', danger: true });
      if (ok) act(game.sellAnimal(a.id, a.count), (r) => `${a.count} ${a.name} terjual (${fmtMoney(r.earned)}).`);
    } }, 'Jual semua'));
}

/** Buy/sell by count, details, economics, fill/sell all, barn. */
function managePanel(a, free) {
  const game = app.game;
  const n = () => Math.floor(Number(qty.get(a.id) ?? 1));
  return h('details.herd-manage', { open: manageOpen.has(a.id) || a.count === 0,
    ontoggle: (e) => (e.target.open ? manageOpen.add(a.id) : manageOpen.delete(a.id)) },
  h('summary', '⚙️ Kelola kawanan'),
  h('div.kv',
    h('span', 'Kandang'), h('span', `${a.barns} (kapasitas ${a.capacity})`),
    h('span', 'Harga beli'), h('span', `${fmtMoney(a.price)}/ekor`),
    h('span', 'Pakan/hari'), h('span', `${fmtNum(a.feedNeedPerDay * 1000)} kg`),
    h('span', 'Jenis pakan'), h('span.small', cropNames(a.feedCrops))),
  econRow(a),
  h('div.card-actions',
    h('input', { type: 'number', min: '1', step: '1', value: String(qty.get(a.id) ?? 1), style: { width: '5em' },
      'aria-label': `Jumlah ${a.name}`, oninput: (e) => qty.set(a.id, e.target.value) }),
    h('button.btn.btn-small.btn-primary', { disabled: free <= 0, title: free <= 0 ? 'Kandang penuh' : null, onclick: () => {
      const k = n();
      if (!(k > 0)) return act({ ok: false, reason: 'Isi jumlah ternak.' });
      act(game.buyAnimal(a.id, k), `${k} ${a.name} dibeli (${fmtMoney(k * a.price)}).`);
    } }, 'Beli'),
    h('button.btn.btn-small.btn-danger', { disabled: a.count <= 0, onclick: () => {
      const k = Math.min(n(), a.count);
      if (!(k > 0)) return act({ ok: false, reason: 'Isi jumlah ternak.' });
      act(game.sellAnimal(a.id, k), (r) => `${k} ${a.name} terjual (${fmtMoney(r.earned)}).`);
    } }, 'Jual')),
  herdButtons(a, free),
  h('div.card-actions', h('button.btn.btn-small.btn-secondary', {
    disabled: game.state.money < a.barnCost, title: game.state.money < a.barnCost ? 'Uang tidak cukup' : null,
    onclick: () => act(game.buildBarn(a.id), (r) => `Kandang ${a.name} dibangun (kapasitas ${r.capacity}).`),
  }, `🏗️ Perluas kandang +${a.barnCapacity} (${fmtMoney(a.barnCost)})`)));
}

/** Herd with a barn: daily essentials on top (production, feed + buy, quality, happiness). */
function herdCard(a) {
  const prod = productOf(a);
  const free = Math.max(0, a.capacity - a.count);
  const lowFeed = a.count > 0 && (a.feedDaysLeft ?? 99) < 3;
  const perDay = a.productionPerDay ?? a.count * a.productPerDay * a.quality;
  const q = a.count > 0 ? app.game.feedQuote(a.id, 3) : null;
  return h(`div.card.herd-card${lowFeed ? '.herd-hungry' : ''}`,
    h('div.card-head',
      h('div.card-icon', a.emoji),
      h('div.card-main',
        h('div.card-title', a.name),
        h('div.card-sub', `${prod ? prod.emoji + ' ' : ''}${fmtNum(perDay, 1)} ${prod?.unit ?? ''}/hari · `, starRating(a.stars ?? 3), ` ${fmtGene(a.breedQuality ?? 1)}`)),
      h('span.badge.badge-green', `${a.count}/${a.capacity}`)),
    a.count > 0
      ? [h(`div.herd-feedline${lowFeed ? '.neg' : ''}`, `${lowFeed ? '⚠️' : '🌾'} Stok pakan ${feedText(a)}`,
        q ? h('span.small.muted', ` · beli ${q.name} (termurah)`) : null),
      h('div.herd-meters', meter('Kualitas', a.quality, 'gold'), meter('Kebahagiaan', a.happiness, 'blue')),
      h('div.card-actions.herd-feed', feedButton(a, 3, '🌾 Pakan 3 hari', lowFeed), feedButton(a, 7, '7 hari', false))]
      : h('p.small.muted', 'Kandang masih kosong — beli ternak di "Kelola kawanan".'),
    managePanel(a, free),
    breedingPanel(a));
}

/** Unlocked herd without a barn: one compact row with the barn button. */
function startRow(a) {
  const game = app.game;
  const prod = productOf(a);
  const poor = game.state.money < a.barnCost;
  return h('div.list-item.herd-start',
    h('div.card-icon', a.emoji),
    h('div.card-main',
      h('div.card-title', a.name),
      h('div.card-sub', `${prod ? prod.emoji + ' ' + prod.name : a.product} · ${fmtMoney(a.price)}/ekor · pakan: ${cropNames(a.feedCrops)}`),
      econRow(a),
      h('div.card-actions', h('button.btn.btn-small.btn-primary', { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => act(game.buildBarn(a.id), (r) => `Kandang ${a.name} dibangun (kapasitas ${r.capacity}).`) },
      `🏗️ Bangun kandang ${fmtMoney(a.barnCost)} (+${a.barnCapacity} ekor)`))));
}

/** Gudang Dingin fill bar + stock summary, linking to Gudang › Peternakan (upgrades live there). */
function storageLink(game) {
  const items = stockByCategory(game).animal;
  const info = game.storageInfo('cold');
  const frac = info.capacity > 0 ? info.used / info.capacity : 1;
  const text = items.length ? items.slice(0, 3).map((it) => `${it.emoji} ${fmtAmt(it.qty, it.unit)}`).join(' · ') + (items.length > 3 ? ' …' : '')
    : 'Belum ada produk ternak.';
  return h('button.link-card', { type: 'button', onclick: () => goTo('silo', 'animal') },
    h('span.link-card-icon', '❄️'),
    h('span.link-card-main', h('b', `Gudang dingin Lv ${info.level}`),
      h('div.small', `${fmtNum(info.used, 1)} / ${fmtNum(info.capacity)} t · sisa ${fmtNum(info.free, 1)} t`),
      progressBar(frac, frac >= 0.9 ? 'ops-red' : frac >= 0.7 ? 'gold' : ''),
      frac >= 0.9 ? h('div.small.ops-bad', '⚠️ Hampir penuh — perbesar agar produksi tidak dijual paksa.') : null,
      h('div.small.muted', text)),
    h('span.link-card-go', items.length ? `${fmtMoney(groupValue(items))} ›` : '›'));
}

const SUBS = ['animals', 'fish'];

function computeSig(game) {
  const sub = getSub('animals', SUBS);
  const head = `${sub}|${game.state.level}|`;
  if (sub === 'fish') return head + fishSig(game); // daily numbers + badge are patched in place (fishLiveSig)
  const cold = game.storageInfo('cold');
  return `${head}${fishAlerts(game)}|${game.day}|${Math.floor(game.state.money / 500)}|${reserveSig(game)}|${cold.used}:${cold.capacity}|`
    + game.animalsView().map((a) => `${a.count}:${a.barns}:${a.feedStock}:${a.quality}:${breedingSig(a)}:`
      + [3, 7].map((d) => game.feedQuote(a.id, d)?.affordable).join(':')).join(',');
}

function animalsPane(game) {
  const views = game.animalsView();
  const herds = views.filter((a) => a.unlocked && a.barns > 0);
  const start = views.filter((a) => a.unlocked && !a.barns);
  const locked = views.filter((a) => !a.unlocked);
  return [
    h('section.section',
      h('div.section-title', '🐄 Kandangku', h('span.small.muted', `${herds.length} kawanan`)),
      herds.length ? h('div.cards', herds.map(herdCard))
        : h('div.empty.compact', 'Belum punya kandang. Bangun kandang pertama di bawah.'),
      h('p.hint', 'Ternak makan pakan termurah dari gudang setiap hari. Jaga stok pakan agar kualitas tetap tinggi.')),
    start.length ? h('section.section',
      h('div.section-title', '🏗️ Mulai beternak', h('span.small.muted', String(start.length))),
      h('div.list', start.map(startRow))) : null,
    locked.length ? fold('animals-locked', '🔒 Ternak terkunci', { meta: `${locked.length} · Lv ${Math.min(...locked.map((a) => a.unlockLevel))}+` },
      h('div.list', locked.map((a) => h('div.list-item.locked',
        h('div.card-icon', a.emoji),
        h('div.card-main', h('div.card-title', a.name), h('div.card-sub', `${productOf(a)?.emoji ?? ''} ${productOf(a)?.name ?? a.product} · ${fmtMoney(a.price)}/ekor`)),
        h('span.badge', `🔒 Lv ${a.unlockLevel}`))))) : null,
    reservePanel(views),
  ];
}

/** Ikan pane already on screen with the same structure: patch numbers in place (pond animations keep running). */
function patchFishPane(root) {
  root.querySelector(':scope > .link-card')?.replaceWith(storageLink(app.game));
  patchFish(root);
  const btn = root.querySelector('.subtab[data-sub="fish"]');
  const n = fishAlerts(app.game);
  let badge = btn?.querySelector('.subtab-badge');
  if (btn && n && !badge) btn.appendChild(badge = h('span.subtab-badge.warn'));
  if (badge) { if (n) badge.textContent = String(n); else badge.remove(); }
  liveSig = fishLiveSig(app.game);
}

export function renderAnimals(root) {
  const game = app.game;
  const next = computeSig(game);
  const sub = getSub('animals', SUBS);
  if (sub === 'fish' && next === sig && root.querySelector(':scope > .fish-section')) return patchFishPane(root);
  sig = next;
  const alerts = fishAlerts(game);
  mount(root,
    subTabBar('animals', [
      { id: 'animals', icon: '🐄', label: 'Hewan' },
      { id: 'fish', icon: '🐟', label: 'Ikan', badge: alerts || null, warn: true },
    ], sub),
    storageLink(game),
    sub === 'fish' ? fishPane() : animalsPane(game));
  liveSig = sub === 'fish' ? fishLiveSig(game) : '';
}

export function updateAnimals(root) {
  const game = app.game;
  if (computeSig(game) !== sig) renderAnimals(root);
  else if (getSub('animals', SUBS) === 'fish' && fishLiveSig(game) !== liveSig) patchFishPane(root);
}
