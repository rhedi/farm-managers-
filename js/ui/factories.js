// Gudang tab: 🏭 Pabrik section (stream B). Buy, pick a recipe, run batches or auto mode, upgrade.
import { h, fmtMoney, fmtHours, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';

/** Re-render key: ownership, level, recipe, progress, blocked state and input availability. */
export function factoriesSig(game) {
  if (!game.factoriesView) return '';
  return game.factoriesView().map((f) => [f.id, f.unlocked ? 1 : 0, f.level, f.recipeId, f.running ? 1 : 0, f.queued,
    f.auto ? 1 : 0, f.progress, f.blocked ?? '', f.recipe?.canStart ? 1 : 0, f.price <= game.state.money ? 1 : 0,
    (f.upgradeCost ?? 0) <= game.state.money ? 1 : 0].join(':')).join('|');
}

async function buyFlow(f) {
  const ok = await confirmModal({ title: `Beli ${f.name}?`,
    message: `${f.emoji} ${f.name} seharga ${fmtMoney(f.price)}. Bahan diambil dari gudang (cadangan pakan tidak dipakai).`,
    confirmLabel: 'Beli' });
  if (ok) act(app.game.buyFactory(f.id), `${f.emoji} ${f.name} siap berproduksi!`);
}

async function upgradeFlow(f) {
  const ok = await confirmModal({ title: `Tingkatkan ${f.name}?`,
    message: `Level ${f.level} → ${f.level + 1}: proses 25% lebih cepat, biaya ${fmtMoney(f.upgradeCost)}.`,
    confirmLabel: 'Tingkatkan' });
  if (ok) act(app.game.upgradeFactory(f.id), (r) => `${f.name} kini level ${r.level}.`);
}

const amt = (it) => fmtAmt(it.qty, it.unit);
const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

function recipePicker(f) {
  if (f.recipes.length < 2) return null;
  return h('div.fac-recipes', f.recipes.map((r) => h(`button.fac-recipe${r.id === f.recipeId ? '.active' : ''}`, {
    type: 'button', disabled: f.running && r.id !== f.recipeId, title: f.running ? 'Pabrik sedang memproses' : null,
    onclick: () => r.id !== f.recipeId && act(app.game.setRecipe(f.id, r.id)),
  }, `${r.emoji} ${r.name}`)));
}

function recipeDetail(r) {
  return h('div.fac-flow',
    h('div.fac-io', r.inputs.map((it) => h(`span.fac-item${it.enough ? '' : '.short'}`,
      h('span.fac-amt', `${it.emoji} ${amt(it)}`), ' ', h('span.fac-stock', `(${fmtAmt(it.stock, it.unit)})`)))),
    h('div.fac-arrow', '→'),
    h('div.fac-io', r.outputs.map((it) => h('span.fac-item.out', h('span.fac-amt', `${it.emoji} ${amt(it)}`), ` ${it.name}`))),
    h('div.small.muted.fac-meta', `⏱ ${fmtHours(r.hours)} · ${fmtMoney(r.inValue)} → ${fmtMoney(r.outValue)} `,
      h('span.fac-gain', pct(r.valueAdd)), ' (harga dasar)'));
}

function statusLine(f) {
  if (f.running) {
    return h('div.fac-status', progressBar(f.progress, f.blocked ? 'ops-red' : ''),
      h('div.small.muted', `Memproses ${f.recipe.emoji} ${f.recipe.name} · sisa ${fmtHours(f.hoursLeft)}`,
        f.queued > 1 ? ` · antre ${f.queued - 1}` : '', f.auto ? ' · 🔁 otomatis' : ''),
      f.blocked ? h('div.small.ops-bad', `⛔ ${f.blocked}`) : null);
  }
  if (f.blocked) return h('div.small.ops-bad', `⛔ ${f.blocked}`);
  return h('div.small.muted', f.auto ? '🔁 Menunggu bahan…' : 'Menganggur.');
}

function ownedCard(f, money) {
  const r = f.recipe;
  const canRun = r && (f.running || r.canStart);
  return h('div.card.fac-card',
    h('div.card-head', h('span.card-icon', f.emoji), h('div', h('div.card-title', f.name),
      h('div.card-sub', `Level ${f.level}/${f.maxLevel}${f.level > 1 ? ` · ⚡×${f.speed.toLocaleString('id-ID')}` : ''}`)),
    f.running ? h('span.badge.badge-green', '⚙️ Jalan') : f.blocked ? h('span.badge.badge-red', 'Terhenti') : null),
    recipePicker(f),
    r ? recipeDetail(r) : null,
    statusLine(f),
    h('div.card-actions',
      h('label.fac-auto', h('input', { type: 'checkbox', checked: f.auto,
        onchange: (e) => act(app.game.setFactoryAuto(f.id, e.target.checked), e.target.checked ? '🔁 Produksi otomatis aktif.' : 'Produksi otomatis mati.') }),
      ' 🔁 Otomatis'),
      h('div.fac-btns', f.upgradeCost != null ? h('button.btn.btn-small.btn-secondary', { disabled: f.upgradeCost > money,
        title: f.upgradeCost > money ? 'Uang tidak cukup' : null, onclick: () => upgradeFlow(f) }, `⬆ ${fmtMoney(f.upgradeCost)}`) : h('span.badge', 'Maks'),
      h('button.btn.btn-small.btn-primary', { disabled: !canRun, title: canRun ? null : 'Bahan kurang',
        onclick: () => act(app.game.startBatch(f.id, 1), f.running ? 'Ditambahkan ke antrean.' : `▶ ${r.name} diproses.`) },
      f.running ? '+1 antre' : '▶ Proses'))));
}

function factoryCard(f, money) {
  if (f.owned) return ownedCard(f, money);
  const outs = [...new Set(f.recipes.flatMap((r) => r.outputs.map((o) => `${o.emoji} ${o.name}`)))].join(' · ');
  const head = h('div.card-head', h('span.card-icon', f.emoji), h('div', h('div.card-title', f.name), h('div.card-sub', outs)),
    f.unlocked ? h('span.badge.badge-brown', fmtMoney(f.price)) : h('span.badge', `🔒 Lv ${f.unlockLevel}`));
  if (!f.unlocked) return h('div.card.locked.fac-card', head, h('p.small.muted', `Terbuka di level ${f.unlockLevel} · ${fmtMoney(f.price)}.`));
  const poor = f.price > money;
  return h('div.card.fac-card', head,
    h('div.small.muted', f.recipes.map((r) => `${r.emoji} ${r.name} ${pct(r.valueAdd)}`).join(' · ')),
    h('div.card-actions', h('span.spacer'), h('button.btn.btn-small.btn-primary', { disabled: poor,
      title: poor ? 'Uang tidak cukup' : null, onclick: () => buyFlow(f) }, `Beli ${fmtMoney(f.price)}`)));
}

/** The 🏭 Pabrik section, or null when the engine has no factories. */
export function factoriesSection(game) {
  if (!game.factoriesView) return null;
  const list = game.factoriesView();
  if (!list.length) return null;
  const owned = list.filter((f) => f.owned).length;
  return h('section.section.fac-section',
    h('div.section-title', '🏭 Pabrik', h('span.spacer'), h('span.small.muted', `${owned}/${list.length} dimiliki`)),
    h('div.cards', list.map((f) => factoryCard(f, game.state.money))));
}
