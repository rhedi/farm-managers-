// Gudang tab: 🌾 Pertanian (silo + crop/fruit stock) | 🐄 Peternakan (❄️ Gudang Dingin + animal products)
// | 🏭 Olahan (factory goods + 🏭 Pabrik). Groups follow PRODUCTS[].category; feed reserves are never sold.
import { h, patch, liveNode, setText, fmtMoney, fmtNum, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { factoriesSection, factoriesSig } from './factories.js';
import { subTabBar, getSub, goTo } from './subtabs.js';
import { CATEGORIES, stockByCategory, groupValue, sellGroup, stockRow } from './stock.js';
import { iconOf } from './fishArt.js';
import { overflowCard, overflowSig } from './overflowCard.js';

const SUBS = CATEGORIES.map((c) => c.sub);
let sig = '';

// Store shown on a sub-tab: crops → silo, animal products → Gudang dingin (processed goods: note only).
const STORE = { crop: 'silo', animal: 'cold' };
const fill = (info) => (info.capacity > 0 ? info.used / info.capacity : 1);
/** Store at ≥ 90%: tab and sub-tab badges. */
export const nearlyFull = (info) => !!info && fill(info) >= 0.9;

function computeSig(game) {
  const info = (k) => { const i = game.storageInfo(k); return `${i.capacity}:${i.used}:${i.nextUpgradeCost <= game.state.money ? 1 : 0}`; };
  return `${getSub('silo', SUBS)}|` + game.siloView().items.map((i) => `${i.id}:${i.qty}:${i.price}:${i.reserve ?? 0}:${i.isFeed ? 1 : 0}`).join(',')
    + `|${info('silo')}|${info('cold')}|${factoriesSig(game)}|${overflowSig(game)}`;
}

const LABEL = { silo: { icon: '🏚️', title: 'Silo' }, cold: { icon: '❄️', title: 'Gudang Dingin' } };

async function upgradeFlow(info) {
  const ok = await confirmModal({
    title: `Perbesar ${info.name.toLowerCase()}?`,
    message: `${LABEL[info.kind].title} Lv ${info.level} → Lv ${info.level + 1}: kapasitas naik ${fmtNum(info.step)} t, dari ${fmtNum(info.capacity)} t menjadi ${fmtNum(info.nextCapacity)} t. Biaya ${fmtMoney(info.nextUpgradeCost)}.`,
    confirmLabel: 'Perbesar',
  });
  if (ok) act(app.game.upgradeStorage(info.kind), (r) => `${info.name} kini Lv ${r.level}: ${fmtNum(r.capacity)} t.`);
}

// "Not enough money" line under the upgrade button: a disabled button's title tooltip is invisible on phones.
let need = null; // { el, kind }
const needText = (cost, money) => `💰 Butuh ${fmtMoney(cost)} (uangmu ${fmtMoney(Math.floor(money))})`;

const tonsOf = (items) => items.reduce((s, it) => s + (it.storage === 'silo' ? it.tons : 0), 0);

/** What fills the store and what happens when it is full. */
function storeLines(info, groups) {
  const pct = `${Math.round(info.overflowRate * 100)}% harga pasar`;
  const frac = fill(info);
  const warn = frac >= 1 ? h('div.small.ops-bad', info.kind === 'silo'
    ? `⛔ Silo penuh — hasil panen berikutnya dijual paksa ${pct}.`
    : `⛔ Gudang dingin penuh — produksi ternak berikutnya dijual paksa ${pct}.`)
    : frac >= 0.9 ? h('div.small.ops-bad', info.kind === 'silo'
      ? `⚠️ Silo hampir penuh — kelebihan panen dijual paksa ${pct}.`
      : `⚠️ Gudang dingin hampir penuh — kelebihan produksi ternak dijual paksa ${pct}.`) : null;
  if (info.kind === 'silo') {
    const olahan = tonsOf(groups.processed);
    return [h('div.small.muted', olahan > 0
      ? `Pertanian ${fmtNum(tonsOf(groups.crop), 1)} t + olahan ${fmtNum(olahan, 1)} t. Produk ternak disimpan di Gudang Dingin.`
      : `Hasil panen dan olahan bersatuan ton memakai silo. Yang tidak muat dijual paksa ${pct}.`), warn];
  }
  const items = groups.animal.filter((it) => it.tons > 0);
  return [
    items.length ? h('div.small.muted.cold-mix', items.map((it) => h('span', iconOf(it), ` ${fmtNum(it.tons, it.tons < 10 ? 2 : 1)} t`))) : null,
    h('div.small.muted', `Dihitung menurut berat: 1.000 L susu atau 1.000 kg = 1 t; 1.000 telur ≈ 0,06 t. Yang tidak muat dijual paksa ${pct}.`),
    warn];
}

/** Capacity card of a store (silo or Gudang dingin): level, fill bar, contents, "+X t → Y t" upgrade. */
function capacityCard(game, kind, groups) {
  need = null;
  const info = game.storageInfo(kind);
  const frac = fill(info);
  const color = frac >= 0.9 ? 'ops-red' : frac >= 0.7 ? 'gold' : '';
  const poor = info.nextUpgradeCost > game.state.money;
  const L = LABEL[kind];
  if (poor) need = { kind, el: h('div.small.ops-bad.silo-need', needText(info.nextUpgradeCost, game.state.money)) };
  return h(`div.card.ops-silo.store-${kind}`,
    h('div.ops-silo-head', h('span', `${L.icon} ${L.title} `), h('span.stock-tag', `Lv ${info.level}`),
      h('strong', `${fmtNum(info.used, 1)} / ${fmtNum(info.capacity)} t`), h('span.small.muted', `· sisa ${fmtNum(info.free, 1)} t`)),
    progressBar(frac, color),
    ...storeLines(info, groups),
    h('div.card-actions',
      h(`button.btn.btn-small.btn-block.store-up.${frac >= 0.9 ? 'btn-primary' : 'btn-secondary'}`, { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => upgradeFlow(info) },
      h('span', `🏗️ Perbesar ke Lv ${info.level + 1}`),
      h('span.store-up-detail', `+${fmtNum(info.step)} t → ${fmtNum(info.nextCapacity)} t · ${fmtMoney(info.nextUpgradeCost)}`))),
    need?.el);
}

/** Processed goods: t goods share the silo, kg goods take no space. */
function storeNote(items) {
  const t = tonsOf(items);
  return h('div.store-note.card', h('span', '🏚️'), h('span', t > 0
    ? `Produk olahan bersatuan ton (${fmtNum(t, 1)} t) memakai ruang silo; produk kg tidak memakai gudang.`
    : 'Produk olahan bersatuan ton memakai ruang silo; produk kg tidak memakai gudang.'));
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
  const full = { crop: nearlyFull(game.storageInfo('silo')), animal: nearlyFull(game.storageInfo('cold')) };
  const blocked = (game.factoriesView?.() ?? []).filter((f) => f.owned && f.blocked).length;
  patch(root,
    subTabBar('silo', CATEGORIES.map((c) => ({
      id: c.sub, icon: c.icon, label: c.label,
      badge: full[c.id] ? '!' : c.id === 'processed' && blocked ? blocked : null,
      warn: true,
    })), sub),
    STORE[cat.id] ? overflowCard(game, STORE[cat.id], upgradeFlow) : null,
    STORE[cat.id] ? capacityCard(game, STORE[cat.id], groups) : storeNote(groups.processed),
    stockGroup(cat, groups[cat.id]),
    cat.id === 'animal' ? h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => goTo('animals') }, '🐄 Kelola ternak & pakan') : null,
    cat.id === 'processed' ? factoriesSection(game) : null);
  if (need) need.el = liveNode(need.el);
}

export function updateSilo(root) {
  if (computeSig(app.game) !== sig) return renderSilo(root);
  // Money changes every tick; only affordability is in the sig, so refresh the shortfall text in place.
  if (need) setText(need.el, needText(app.game.storageInfo(need.kind).nextUpgradeCost, app.game.state.money));
}
