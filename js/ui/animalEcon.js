// Animals tab helpers: per-head economics row (U10) and the feed reserve control (F7 UI).
import { h, fmtMoney, fmtPrice, fmtNum } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';

const reserveInput = new Map(); // cropId → typed tons
const RESERVE_DAYS = 7;

const priceOf = (id) => app.game.state.market?.[id] ?? app.game.idx?.products.get(id)?.basePrice ?? 0;

/** Economics per head at today's prices: product value, cheapest-feed cost, net, payback (incl. barn share). */
export function animalEconomics(a) {
  const product = a.productPerDay * priceOf(a.product);
  const feedPrice = a.feedCrops.length ? Math.min(...a.feedCrops.map(priceOf)) : 0;
  const feed = a.feedPerDay * feedPrice;
  const net = product - feed;
  const capex = a.price + a.barnCost / a.barnCapacity;
  return { product, feed, net, payback: net > 0 ? Math.ceil(capex / net) : null };
}

export function econRow(a) {
  const e = animalEconomics(a);
  const herd = a.count > 0 ? e.net * a.count * (a.quality ?? 1) : null;
  return h('div.eco-animal',
    h('div.small', `Per ekor/hari: produk ${fmtPrice(e.product)} − pakan ${fmtPrice(e.feed)} = `,
      h(`b.${e.net >= 0 ? 'pos' : 'neg'}`, fmtPrice(e.net))),
    h('div.small.muted', e.payback ? `Balik modal ±${e.payback} hari (termasuk kandang)` : 'Rugi di harga sekarang',
      herd != null ? ` · kawanan ≈ ${fmtMoney(herd)}/hari` : ''));
}

/** Daily need (t) per feed crop if the herds ate only that crop. */
function needByCrop(views) {
  const need = new Map();
  for (const a of views) {
    if (!(a.count > 0)) continue;
    for (const c of a.feedCrops) need.set(c, (need.get(c) || 0) + a.feedNeedPerDay);
  }
  return need;
}

function setReserve(cropId, tons, name) {
  reserveInput.delete(cropId);
  act(app.game.setFeedReserve?.(cropId, tons) ?? { ok: false, reason: 'Cadangan pakan belum tersedia.' },
    tons > 0 ? `Cadangan ${name}: ${fmtAmt(tons)}.` : `Cadangan ${name} dihapus.`);
}

function reserveRow(cropId, perDay) {
  const game = app.game;
  const crop = game.data.CROPS.find((c) => c.id === cropId);
  const name = crop?.name ?? cropId;
  const cur = game.state.feedReserve?.[cropId] || 0;
  const stock = game.state.silo[cropId] || 0;
  const suggest = Math.ceil(perDay * RESERVE_DAYS * 100) / 100;
  return h('div.eco-reserve-row',
    h('span', `${crop?.emoji ?? ''} ${name}`),
    h('span.small.muted', `stok ${fmtAmt(stock)} · 🔒 ${fmtAmt(cur)}`),
    h('span.spacer'),
    h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', style: { width: '5em' },
      value: reserveInput.get(cropId) ?? '', placeholder: 't', 'aria-label': `Cadangan ${name}`,
      oninput: (e) => reserveInput.set(cropId, e.target.value) }),
    h('button.btn.btn-small.btn-secondary', { onclick: () => {
      const t = Number(reserveInput.get(cropId));
      if (!(t >= 0) || reserveInput.get(cropId) == null || reserveInput.get(cropId) === '') {
        return act({ ok: false, reason: 'Isi jumlah cadangan (t).' });
      }
      setReserve(cropId, t, name);
    } }, 'Simpan'),
    h('button.btn.btn-small.btn-secondary', { title: `Kebutuhan ${RESERVE_DAYS} hari`, onclick: () => setReserve(cropId, suggest, name) },
      `${RESERVE_DAYS} hari (${fmtAmt(suggest)})`),
    cur > 0 ? h('button.btn.btn-small.btn-danger', { onclick: () => setReserve(cropId, 0, name) }, 'Hapus') : null);
}

/** Feed reserve section: keeps stock from being sold in Pasar/Gudang. Hidden before WP1's setFeedReserve exists. */
export function reservePanel(views) {
  if (typeof app.game.setFeedReserve !== 'function') return null;
  const need = needByCrop(views);
  if (!need.size) return null;
  return h('section.section.eco-reserves',
    h('div.section-title', '🔒 Cadangan pakan'),
    h('p.small.muted', 'Stok yang dicadangkan tidak ikut terjual di Pasar/Gudang. Ternak tetap boleh memakannya.'),
    h('div.card', [...need].map(([c, perDay]) => reserveRow(c, perDay))));
}

/** Signature part for re-rendering when reserves change. */
export const reserveSig = (game) => JSON.stringify(game.state.feedReserve || {});
