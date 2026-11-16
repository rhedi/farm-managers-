// Stock grouped by product category (data PRODUCTS[].category): 🌾 Pertanian (crops/fruit), 🐄 Peternakan
// (animal products), 🏭 Olahan (factory goods). Shared by Gudang, Pasar › Jual and the Ternak storage link.
import { h, fmtMoney, fmtPrice, fmtSignedPct } from './dom.js';
import { confirmModal } from './modal.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { iconOf } from './fishArt.js';

export const CATEGORIES = [
  { id: 'crop', sub: 'crop', icon: '🌾', label: 'Pertanian', long: 'Hasil pertanian' },
  { id: 'animal', sub: 'animal', icon: '🐄', label: 'Peternakan', long: 'Produk ternak' },
  { id: 'processed', sub: 'processed', icon: '🏭', label: 'Olahan', long: 'Produk olahan' },
];

export const sellableQty = (it) => Math.max(0, it.sellable ?? (it.qty - (it.reserve || 0)));

/** Silo items with stock, grouped by category: { crop: [...], animal: [...], processed: [...] }. */
export function stockByCategory(game) {
  const out = { crop: [], animal: [], processed: [] };
  for (const it of game.siloView().items) (out[it.category] ?? out.crop).push(it);
  return out;
}

export const groupValue = (items) => items.reduce((s, it) => s + it.value, 0);

/** Sell one product's sellable stock; asks first only when it is feed the herds may need (no reserve set). */
export async function sellItem(it) {
  const qty = sellableQty(it);
  if (it.isFeed && !(it.reserve > 0)) {
    const ok = await confirmModal({
      title: `Jual ${it.name}?`,
      message: `${fmtAmt(qty, it.unit)} ${it.emoji} ${it.name} ≈ ${fmtMoney(qty * it.price)}. ⚠️ Ini pakan ternakmu — atur cadangan di tab Ternak agar tidak ikut terjual.`,
      confirmLabel: 'Jual', danger: true,
    });
    if (!ok) return;
  }
  act(app.game.sellProduct(it.id), (r) => `Terjual ${it.emoji} ${it.name} senilai ${fmtMoney(r.earned)}.`);
}

/** Sell every sellable item of a group (feed reserves stay), after a confirmation. */
export async function sellGroup(items, label) {
  const list = items.filter((it) => sellableQty(it) > 0);
  if (!list.length) return;
  const total = list.reduce((s, it) => s + sellableQty(it) * it.price, 0);
  const feedRisk = list.some((it) => it.isFeed && !(it.reserve > 0));
  const ok = await confirmModal({
    title: `Jual semua ${label.toLowerCase()}?`,
    message: `${list.length} produk dijual dengan harga pasar saat ini, total ≈ ${fmtMoney(total)}.`
      + (feedRisk ? ' ⚠️ Termasuk pakan ternak tanpa cadangan!' : list.some((it) => it.reserve > 0) ? ' Cadangan pakan tetap disimpan.' : ''),
    confirmLabel: 'Jual semua', danger: feedRisk,
  });
  if (!ok) return;
  let earned = 0;
  for (const it of list) {
    const r = app.game.sellProduct(it.id);
    if (!r.ok) return act(r);
    earned += r.earned;
  }
  act({ ok: true }, `${label} terjual senilai ${fmtMoney(earned)}.`);
}

/** Price trend chip "▲ 1,2%" from marketView().change. */
export function trendChip(change) {
  const cls = change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'muted';
  return h(`span.trend.${cls}`, `${change > 0 ? '▲' : change < 0 ? '▼' : '•'} ${fmtSignedPct(change)}`);
}

/**
 * One stock row: emoji · name (+ feed/reserve tags) · amount × price · [Jual $value].
 * `extra` (optional) is appended to the meta line (e.g. a trend chip).
 */
export function stockRow(it, extra = null) {
  const sellable = sellableQty(it);
  return h('div.stock-row', { dataset: { productId: it.id } },
    h('span.stock-emoji', iconOf(it)),
    h('div.stock-main',
      h('div.stock-name', it.name, it.isFeed ? h('span.stock-tag', 'pakan') : null),
      h('div.stock-meta',
        h('span', fmtAmt(it.qty, it.unit)), ' · ', h('span', `${fmtPrice(it.price)}/${it.unit}`),
        it.reserve > 0 ? [' · ', h('span.eco-reserve', `🔒 ${fmtAmt(it.reserve, it.unit)}`)] : null,
        extra ? [' ', extra] : null)),
    h('button.btn.btn-small.btn-primary.stock-sell', {
      type: 'button', disabled: !(sellable > 0),
      title: sellable > 0 ? `Jual ${fmtAmt(sellable, it.unit)}` : 'Semua stok dicadangkan untuk pakan',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); sellItem(it); },
    }, `Jual ${fmtMoney(sellable * it.price)}`));
}
