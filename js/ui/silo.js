// Gudang tab: 🌾 Pertanian (silo capacity + crop/fruit stock) | 🐄 Peternakan (animal products, no silo space)
// | 🏭 Olahan (factory goods + 🏭 Pabrik). Groups follow PRODUCTS[].category; feed reserves are never sold.
import { h, mount, fmtMoney, fmtNum, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { factoriesSection, factoriesSig } from './factories.js';
import { subTabBar, getSub, goTo } from './subtabs.js';
import { CATEGORIES, stockByCategory, groupValue, sellGroup, stockRow } from './stock.js';

const SUBS = CATEGORIES.map((c) => c.sub);
let sig = '';

function computeSig(game) {
  const info = game.siloInfo?.();
  return `${getSub('silo', SUBS)}|` + game.siloView().items.map((i) => `${i.id}:${i.qty}:${i.price}:${i.reserve ?? 0}:${i.isFeed ? 1 : 0}`).join(',')
    + (info ? `|${info.capacity}:${info.nextUpgradeCost <= game.state.money ? 1 : 0}` : '') + `|${factoriesSig(game)}`;
}

async function upgradeFlow(info) {
  const ok = await confirmModal({
    title: 'Perbesar silo?',
    message: `Kapasitas naik ${fmtNum(info.step)} t menjadi ${fmtNum(info.capacity + info.step)} t, biaya ${fmtMoney(info.nextUpgradeCost)}.`,
    confirmLabel: 'Perbesar',
  });
  if (ok) act(app.game.upgradeSilo(), (r) => `Silo kini ${fmtNum(r.capacity)} t.`);
}

// "Not enough money" line under the upgrade button: a disabled button's title tooltip is invisible on phones.
let needEl = null;
const needText = (cost, money) => `💰 Butuh ${fmtMoney(cost)} (uangmu ${fmtMoney(Math.floor(money))})`;

const tonsOf = (items) => items.filter((it) => it.unit === 't').reduce((s, it) => s + it.qty, 0);

/** Silo capacity (F8): crops and processed goods in t share it; overflow at harvest is sold at 70% of market. */
function capacityCard(game, groups) {
  needEl = null;
  const info = game.siloInfo?.();
  if (!info) return null;
  const frac = info.capacity > 0 ? info.used / info.capacity : 1;
  const color = frac >= 0.9 ? 'ops-red' : frac >= 0.7 ? 'gold' : '';
  const poor = info.nextUpgradeCost > game.state.money;
  const olahan = tonsOf(groups.processed);
  if (poor) needEl = h('div.small.ops-bad.silo-need', needText(info.nextUpgradeCost, game.state.money));
  return h('div.card.ops-silo',
    h('div.ops-silo-head', h('span', '🏚️ Silo '), h('strong', `${fmtNum(info.used, 1)} / ${fmtNum(info.capacity)} t`),
      h('span.small.muted', `· sisa ${fmtNum(info.free, 1)} t`)),
    progressBar(frac, color),
    h('div.small.muted', olahan > 0
      ? `Pertanian ${fmtNum(tonsOf(groups.crop), 1)} t + olahan ${fmtNum(olahan, 1)} t. Produk ternak tidak memakai silo.`
      : 'Hanya hasil panen dan olahan bersatuan ton yang memakai silo.'),
    frac >= 1 ? h('div.small.ops-bad', '⛔ Silo penuh — hasil panen berikutnya dijual paksa 70% harga pasar.')
      : frac >= 0.9 ? h('div.small.ops-bad', '⚠️ Silo hampir penuh — kelebihan panen dijual paksa 70% harga pasar.') : null,
    h('div.card-actions',
      h('span.spacer'),
      h(`button.btn.btn-small.${frac >= 0.9 ? 'btn-primary' : 'btn-secondary'}`, { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => upgradeFlow(info) }, `🏗️ Perbesar +${fmtNum(info.step)} t · ${fmtMoney(info.nextUpgradeCost)}`)),
    needEl);
}

/** Storage note for groups that don't use the silo (or only partly). */
function storeNote(cat, items) {
  if (cat.id === 'animal') return h('div.store-note.card', h('span', '❄️'), h('span', 'Gudang ternak: susu, telur, wol, daging dan madu tidak memakai kapasitas silo.'));
  const t = tonsOf(items);
  return h('div.store-note.card', h('span', '🏚️'), h('span', t > 0
    ? `Produk olahan bersatuan ton (${fmtNum(t, 1)} t) memakai ruang silo; produk kg tidak.`
    : 'Produk olahan bersatuan ton memakai ruang silo; produk kg tidak.'));
}

function stockGroup(cat, items) {
  const value = groupValue(items);
  if (!items.length) {
    const tip = cat.id === 'crop' ? 'Panen ladangmu dulu!' : cat.id === 'animal' ? 'Produk ternak masuk ke sini setiap hari.' : 'Hasil pabrik masuk ke sini.';
    return h('div.empty.compact', h('span.big', cat.icon), `Belum ada ${cat.long.toLowerCase()}. ${tip}`);
  }
  return h('section.section',
    h('div.stock-summary',
      h('div.stock-summary-main', h('div.small.muted', `${cat.long} · ${items.length} produk`), h('div.stock-summary-value', fmtMoney(value))),
      h('button.btn.btn-secondary', { type: 'button', onclick: () => sellGroup(items, cat.long) }, 'Jual semua…')),
    h('div.stock-list', items.map((it) => stockRow(it))));
}

export function renderSilo(root) {
  const game = app.game;
  sig = computeSig(game);
  const groups = stockByCategory(game);
  const sub = getSub('silo', SUBS);
  const cat = CATEGORIES.find((c) => c.sub === sub);
  const info = game.siloInfo?.();
  const full = info && info.capacity > 0 && info.used / info.capacity >= 0.9;
  const blocked = (game.factoriesView?.() ?? []).filter((f) => f.owned && f.blocked).length;
  mount(root,
    subTabBar('silo', CATEGORIES.map((c) => ({
      id: c.sub, icon: c.icon, label: c.label,
      badge: c.id === 'crop' && full ? '!' : c.id === 'processed' && blocked ? blocked : null,
      warn: true,
    })), sub),
    cat.id === 'crop' ? capacityCard(game, groups) : storeNote(cat, groups[cat.id]),
    stockGroup(cat, groups[cat.id]),
    cat.id === 'animal' ? h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => goTo('animals') }, '🐄 Kelola ternak & pakan') : null,
    cat.id === 'processed' ? factoriesSection(game) : null);
}

export function updateSilo(root) {
  if (computeSig(app.game) !== sig) return renderSilo(root);
  // Money changes every tick; only affordability is in the sig, so refresh the shortfall text in place.
  if (needEl) needEl.textContent = needText(app.game.siloInfo().nextUpgradeCost, app.game.state.money);
}
