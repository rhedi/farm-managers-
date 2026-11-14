// Silo tab: stock, value at market price, sell with confirmation; feed reserves are never sold.
import { h, mount, fmtMoney, fmtPrice, fmtNum, progressBar } from './dom.js';
import { confirmModal } from './modal.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { factoriesSection, factoriesSig } from './factories.js';

let sig = '';

const sellable = (it) => it.sellable ?? it.qty;

async function sellOne(item) {
  const qty = sellable(item);
  const value = qty * item.price;
  const ok = await confirmModal({
    title: `Jual ${item.name}?`,
    message: `${fmtAmt(qty, item.unit)} ${item.emoji} ${item.name} dijual ≈ ${fmtMoney(value)}.`
      + (item.reserve > 0 ? ` ${fmtAmt(item.reserve, item.unit)} tetap dicadangkan untuk pakan.` : '')
      + (item.isFeed && !(item.reserve > 0) ? ' ⚠️ Ini pakan ternakmu — atur cadangan di tab Ternak.' : ''),
    confirmLabel: 'Jual', danger: item.isFeed,
  });
  if (!ok) return;
  act(app.game.sellProduct(item.id), (r) => `Terjual ${item.emoji} ${item.name} senilai ${fmtMoney(r.earned)}.`);
}

async function sellAll(view) {
  const items = view.items.filter((it) => sellable(it) > 0);
  const total = items.reduce((s, it) => s + sellable(it) * it.price, 0);
  const feedRisk = items.some((it) => it.isFeed && !(it.reserve > 0));
  const ok = await confirmModal({
    title: 'Jual semua isi gudang?',
    message: `Semua produk dijual dengan harga pasar saat ini, total ≈ ${fmtMoney(total)}.`
      + (feedRisk ? ' Ternak tidak akan punya pakan!' : ' Cadangan pakan tetap disimpan.'),
    confirmLabel: 'Jual semua', danger: true,
  });
  if (!ok) return;
  let earned = 0;
  for (const it of items) {
    const r = app.game.sellProduct(it.id);
    if (!r.ok) return act(r);
    earned += r.earned;
  }
  act({ ok: true }, `Gudang dijual senilai ${fmtMoney(earned)}.`);
}

function computeSig(game) {
  const info = game.siloInfo?.();
  return game.siloView().items.map((i) => `${i.id}:${i.qty}:${i.price}:${i.reserve ?? 0}:${i.isFeed ? 1 : 0}`).join(',')
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

/** Capacity bar (F8): only crops (t) take space; overflow at harvest is sold at 70% of market. */
function capacityCard(game) {
  needEl = null;
  const info = game.siloInfo?.();
  if (!info) return null;
  const frac = info.capacity > 0 ? info.used / info.capacity : 1;
  const color = frac >= 0.9 ? 'ops-red' : frac >= 0.7 ? 'gold' : '';
  const poor = info.nextUpgradeCost > game.state.money;
  if (poor) needEl = h('div.small.ops-bad.silo-need', needText(info.nextUpgradeCost, game.state.money));
  return h('div.card.ops-silo',
    h('div.ops-silo-head', h('strong', `${fmtNum(info.used, 1)} / ${fmtNum(info.capacity)} t`),
      h('span.small.muted', ` · sisa ${fmtNum(info.free, 1)} t`)),
    progressBar(frac, color),
    frac >= 1 ? h('div.small.ops-bad', '⛔ Silo penuh — hasil panen berikutnya dijual paksa 70% harga pasar.')
      : frac >= 0.9 ? h('div.small.ops-bad', '⚠️ Silo hampir penuh — kelebihan panen dijual paksa 70% harga pasar.') : null,
    h('div.card-actions',
      h('span.small.muted', 'Hanya hasil panen (t) yang memakai ruang silo.'),
      h('span.spacer'),
      h('button.btn.btn-small.btn-primary', { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => upgradeFlow(info) }, `+${fmtNum(info.step)} t · ${fmtMoney(info.nextUpgradeCost)}`)),
    needEl);
}

/** Compact stock row: name over amount · price (+ reserve) on the left; value and the sell button on the right. */
function row(it) {
  return h('div.ops-stock',
    h('div.ops-stock-main',
      h('div.ops-stock-name', h('span', `${it.emoji} ${it.name}`), it.isFeed ? h('span.small.muted', ' · pakan') : null),
      h('div.small.muted.ops-nowrap',
        `${fmtAmt(it.qty, it.unit)} · ${fmtPrice(it.price)}/${it.unit}`,
        it.reserve > 0 ? h('span.eco-reserve', ` · 🔒 ${fmtAmt(it.reserve, it.unit)}`) : null)),
    h('div.ops-stock-side',
      h('strong.ops-nowrap', fmtMoney(it.value)),
      h('button.btn.btn-small.btn-primary', { disabled: !(sellable(it) > 0),
        title: sellable(it) > 0 ? null : 'Semua stok dicadangkan untuk pakan', onclick: () => sellOne(it) }, 'Jual')));
}

export function renderSilo(root) {
  const game = app.game;
  sig = computeSig(game);
  const view = game.siloView();
  if (!view.items.length) {
    mount(root, h('section.section', h('div.section-title', '🏚️ Gudang'), capacityCard(game),
      h('div.empty', h('div.big', '🏚️'), 'Gudang masih kosong. Panen ladangmu dulu!')), factoriesSection(game));
    return;
  }
  mount(root,
    h('section.section',
      h('div.section-title', '🏚️ Gudang', h('span.spacer'), h('span.small.muted', `Nilai ${fmtMoney(view.totalValue)}`)),
      capacityCard(game),
      h('div.card',
        h('div.ops-stock-list', view.items.map(row)),
        h('div.card-actions',
          h('span.small.muted', 'Jual sebagian atau penuhi kontrak di tab Pasar.'),
          h('span.spacer'),
          h('button.btn.btn-small.btn-danger', { onclick: () => sellAll(view) }, 'Jual semua')))),
    factoriesSection(game));
}

export function updateSilo(root) {
  if (computeSig(app.game) !== sig) return renderSilo(root);
  // Money changes every tick; only affordability is in the sig, so refresh the shortfall text in place.
  if (needEl) needEl.textContent = needText(app.game.siloInfo().nextUpgradeCost, app.game.state.money);
}
