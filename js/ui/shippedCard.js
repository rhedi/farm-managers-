// "🚚 Dikirim Manajer Logistik" (Gudang sub-tabs and Pasar › Jual, per product group): what the manager loaded in the
// last 48 game hours, to which city and for how much. Animal goods leave the hour they are produced (midnight), so
// without this card the stock looked like it vanished. One tap keeps new stock in the Gudang (setDispatcherSettings
// `exclude`) or lets the manager ship it again. Engine: game.autoShippedView().
import { h, fmtMoney, fmtClock } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { goTo } from './subtabs.js';
import { iconOf } from './fishArt.js';
import { chip } from './dispatcher.js';

/** Signature part for the Gudang / Pasar re-render checks. */
export function shippedSig(game) {
  return (game.autoShippedView?.() ?? []).map((x) => `${x.id}:${x.qty}:${x.day}:${x.kept ? 1 : 0}`).join(',');
}

function setKept(x, keep) {
  const ex = app.game.dispatcherView().settings.exclude;
  act(app.game.setDispatcherSettings({ exclude: keep ? [...ex, x.id] : ex.filter((id) => id !== x.id) }),
    keep ? `📦 ${x.name} tidak dikirim lagi: produksi baru disimpan di Gudang.` : `🚚 ${x.name} boleh dikirim Manajer Logistik lagi.`);
}

function row(x) {
  const action = !x.groupOn ? h('span.small.muted.shipped-off', 'Kelompok ini tidak dikirim')
    : chip(x.kept ? '🚚 Kirim lagi' : '📦 Simpan di gudang', false, () => setKept(x, !x.kept),
      { 'aria-label': x.kept ? `${x.name}: izinkan dikirim lagi` : `${x.name}: simpan di gudang, jangan dikirim otomatis` });
  return h(`div.shipped-row${x.kept ? '.kept' : ''}`, { dataset: { productId: x.id } },
    h('span.stock-emoji', iconOf(x)),
    h('div.shipped-main',
      h('div.shipped-name', x.name),
      h('div.small', `${fmtAmt(x.qty, x.unit)} → ${x.cityEmoji} ${x.cityName}`, x.value > 0 ? ` · ≈ ${fmtMoney(x.value)}` : null),
      h(`div.small${x.kept ? '.shipped-kept' : '.muted'}`, x.kept ? '📦 Produksi baru tetap di gudang' : `${fmtClock(x.day, x.hour)}${x.on ? '' : ' · manajer dijeda'}`)),
    action);
}

/** Card for product group `cat` ('crop' | 'animal' | 'processed'), or null when the manager shipped none of it lately. */
export function shippedCard(game, cat) {
  const list = (game.autoShippedView?.() ?? []).filter((x) => x.category === cat);
  if (!list.length) return null;
  return h('div.card.shipped-card', { dataset: { cat } },
    h('div.shipped-head', h('span.shipped-truck', '🚚'),
      h('div', h('strong', 'Dikirim Manajer Logistik'),
        h('div.small.muted', '48 jam terakhir · dijual di kota, uangnya masuk saat truk tiba'))),
    h('div.shipped-list', list.map(row)),
    h('button.btn.btn-small.btn-secondary.btn-block', { type: 'button', onclick: () => goTo('market', 'ship') }, '⚙️ Atur Manajer Logistik'));
}
