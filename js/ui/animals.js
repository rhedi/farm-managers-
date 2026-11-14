// Animals tab: barns, buy/sell animals, feed stock, quality/happiness.
import { h, mount, fmtMoney, fmtNum, fmtPct, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { fmtAmt } from './ecoFmt.js';
import { econRow, reservePanel, reserveSig } from './animalEcon.js';
import { breedingPanel, breedingSig, starRating, fmtGene } from './breeding.js';

const qty = new Map(); // animalId → typed count (survives re-render)
let sig = '';

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

function feedRow(a, lowFeed) {
  if (!(a.count > 0)) return null;
  const q = app.game.feedQuote(a.id, 3);
  return h('div',
    h('div.small', `Pakan: beli ${q ? q.name : '—'} (termurah di pasar)`),
    h('div.card-actions',
      feedButton(a, 3, '🌾 Beli pakan 3 hari', lowFeed),
      feedButton(a, 7, '7 hari', lowFeed)));
}

function animalCard(a) {
  const game = app.game;
  const prod = productOf(a);
  const free = Math.max(0, a.capacity - a.count);
  const n = () => Math.floor(Number(qty.get(a.id) ?? 1));
  const head = h('div.card-head',
    h('div.card-icon', a.emoji),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div.card-title', a.name),
      h('div.card-sub', `${prod ? prod.emoji + ' ' + prod.name : a.product} · ${fmtMoney(a.price)}/ekor`)),
    a.unlocked ? h('span.badge.badge-green', `${a.count}/${a.capacity}`) : h('span.badge', `🔒 Lv ${a.unlockLevel}`));
  if (!a.unlocked) {
    return h('div.card.locked', head, h('p.small.muted', `Terbuka di level ${a.unlockLevel}.`));
  }
  const barnBtn = h('button.btn.btn-small.btn-secondary', {
    disabled: game.state.money < a.barnCost, title: game.state.money < a.barnCost ? 'Uang tidak cukup' : null,
    onclick: () => act(game.buildBarn(a.id), (r) => `Kandang ${a.name} dibangun (kapasitas ${r.capacity}).`),
  }, `🏗️ ${a.barns ? 'Perluas' : 'Bangun'} kandang ${fmtMoney(a.barnCost)}`);
  if (!a.barns) {
    return h('div.card', head, econRow(a),
      h('p.small.muted', `Butuh kandang (+${a.barnCapacity} ekor). Pakan: ${cropNames(a.feedCrops)}.`),
      h('div.card-actions', barnBtn));
  }
  const lowFeed = a.count > 0 && (a.feedDaysLeft ?? 99) < 3;
  return h('div.card', head,
    h('div.kv',
      h('span', 'Kandang'), h('span', `${a.barns} (kapasitas ${a.capacity})`),
      h('span', 'Produksi'), h('span', `${fmtNum(a.productionPerDay ?? a.count * a.productPerDay * a.quality, 1)} ${prod?.unit ?? ''}/hari`),
      h('span', 'Genetika'), h('span', starRating(a.stars ?? 3), ` ${fmtGene(a.breedQuality ?? 1)}`),
      h('span', 'Pakan/hari'), h('span', `${fmtNum(a.feedNeedPerDay * 1000)} kg`),
      h('span', 'Stok pakan'), h(`span${lowFeed ? '.neg' : ''}`, feedText(a)),
      h('span', 'Jenis pakan'), h('span.small', cropNames(a.feedCrops))),
    econRow(a),
    h('div.small', `Kualitas ${fmtPct(a.quality)}`), progressBar(a.quality, 'gold'),
    h('div.small', `Kebahagiaan ${fmtPct(a.happiness)}`), progressBar(a.happiness, 'blue'),
    feedRow(a, lowFeed),
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
      } }, 'Jual'),
      h('span.spacer'),
      barnBtn),
    herdButtons(a, free),
    breedingPanel(a));
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

function computeSig(game) {
  return `${game.day}|${game.state.level}|${Math.floor(game.state.money / 500)}|${reserveSig(game)}|`
    + game.animalsView().map((a) => `${a.count}:${a.barns}:${a.feedStock}:${a.quality}:${breedingSig(a)}:`
      + [3, 7].map((d) => game.feedQuote(a.id, d)?.affordable).join(':')).join(',');
}

export function renderAnimals(root) {
  const game = app.game;
  sig = computeSig(game);
  const views = game.animalsView();
  mount(root,
    h('section.section',
      h('div.section-title', '🐄 Peternakan'),
      h('p.small.muted', 'Ternak makan tanaman pakan termurah dari gudang setiap hari. Pakan bisa dari hasil panen sendiri atau dibeli di pasar. Jaga stok pakan agar kualitas tetap tinggi.'),
      h('div.cards', views.map(animalCard))),
    reservePanel(views));
}

export function updateAnimals(root) {
  if (computeSig(app.game) !== sig) renderAnimals(root);
}
