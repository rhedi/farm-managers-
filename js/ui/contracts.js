// Pasar → 📋 Kontrak (F3): active contracts with progress + deliver, offers with accept, recent results.
import { h, fmtMoney, fmtPrice, fmtNum, progressBar } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';
import { iconOf } from './fishArt.js';

const MAX_ACTIVE = () => app.game.data.BALANCE?.contracts?.maxActive ?? 3;

function dueText(c) {
  if (c.status === 'offer') return c.daysLeft > 0 ? `tawaran berlaku ${c.daysLeft} hari` : 'tawaran berakhir hari ini';
  if (c.daysLeft <= 0) return 'batas hari ini!';
  return `sisa ${c.daysLeft} hari`;
}

function terms(c) {
  const pr = c.premiumBase ?? c.premium;
  const prem = pr ? ` (${pr > 0 ? '+' : ''}${fmtNum(pr * 100)}% harga dasar)` : '';
  return `${fmtPrice(c.price)}/${c.unit}${prem} · nilai ${fmtMoney(c.value)} · +${c.xp} XP · denda ${fmtMoney(c.penalty)}`;
}

function head(c, badge) {
  return h('div.card-head',
    h('div.card-icon', iconOf({ id: c.productId, name: c.name, emoji: c.emoji })),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div.card-title', `${fmtAmt(c.qty, c.unit)} ${c.name}`, c.special ? h('span.special-chip', '⭐ Premium non-tani') : null),
      h('div.card-sub', terms(c))),
    badge);
}

function activeCard(c) {
  const game = app.game;
  const urgent = c.daysLeft <= 1;
  const sendQty = Math.min(c.remaining, c.available);
  return h(`div.card.eco-contract${urgent ? '.eco-urgent' : ''}`,
    head(c, h(`span.badge${urgent ? '.badge-red' : '.badge-blue'}`, dueText(c))),
    h('div.small', `Terkirim ${fmtAmt(c.delivered, c.unit)} / ${fmtAmt(c.qty, c.unit)} · di gudang ${fmtAmt(c.available, c.unit)}`
      + (c.stock > c.available ? ` (+${fmtAmt(c.stock - c.available, c.unit)} dicadangkan)` : '')),
    progressBar(c.progress, 'blue'),
    h('div.card-actions',
      h('span.small.muted', c.available >= c.remaining ? 'Stok cukup untuk menyelesaikan.' : `Kurang ${fmtAmt(c.remaining - c.available, c.unit)}.`),
      h('span.spacer'),
      h('button.btn.btn-small.btn-primary', {
        disabled: !c.canDeliver, title: c.canDeliver ? null : 'Stok gudang kosong',
        onclick: () => {
          const r = game.deliverContract?.(c.id);
          act(r, r?.ok && !r.done ? `Terkirim ${fmtAmt(r.delivered, c.unit)} ${c.name}.` : null); // contract_done is toasted by the engine event
        },
      }, sendQty > 0 ? `Kirim ${fmtAmt(sendQty, c.unit)}` : 'Kirim')));
}

function offerCard(c, full) {
  return h('div.card.eco-offer',
    head(c, h('span.badge', `${c.days} hari`)),
    h('div.card-actions',
      h('span.small.muted', `${dueText(c)} · stok ${fmtAmt(c.available, c.unit)}`),
      h('span.spacer'),
      h('button.btn.btn-small.btn-secondary', {
        disabled: !c.canAccept, title: full ? `Maksimal ${MAX_ACTIVE()} kontrak aktif` : null,
        onclick: () => act(app.game.acceptContract?.(c.id), `Kontrak ${c.name} diterima. Kirim dalam ${c.days} hari.`),
      }, 'Terima')));
}

function closedLine(c) {
  const done = c.status === 'done';
  return h(`div.small.${done ? 'pos' : 'neg'}`,
    `${done ? '✅' : '❌'} ${c.emoji} ${fmtAmt(c.qty, c.unit)} ${c.name} — ${done ? `dibayar ${fmtMoney(c.value)}` : `gagal, denda ${fmtMoney(c.penalty)}`}`);
}

export function contractsPanel() {
  const all = app.game.contractsView?.();
  if (!Array.isArray(all)) return null;
  const active = all.filter((c) => c.status === 'active');
  const offers = all.filter((c) => c.status === 'offer');
  const closed = all.filter((c) => c.status === 'done' || c.status === 'failed');
  const full = active.length >= MAX_ACTIVE();
  return h('div.eco-contracts',
    h('section.section',
      h('div.section-title', '📋 Kontrak berjalan', h('span.small.muted', `${active.length}/${MAX_ACTIVE()}`)),
      active.length ? h('div.cards', active.map(activeCard)) : h('div.empty.compact', 'Belum ada kontrak. Terima tawaran di bawah.')),
    h('section.section',
      h('div.section-title', '📨 Tawaran', h('span.small.muted', String(offers.length))),
      h('p.hint', 'Harga di atas pasar, dibayar saat pengiriman lengkap. Terlambat = denda.'),
      offers.length ? h('div.cards', offers.map((c) => offerCard(c, full)))
        : h('div.empty.compact', 'Belum ada tawaran. Tawaran baru datang setiap pagi.')),
    closed.length ? fold('contracts-closed', '🗂️ Riwayat', { meta: String(closed.length) }, h('div.eco-closed', closed.map(closedLine))) : null);
}

/** Active contracts that can receive stock right now (bottom-nav and sub-tab badge). */
export function deliverableCount(game) {
  return (game.contractsView?.() ?? []).filter((c) => c.status === 'active' && c.canDeliver).length;
}

/** Render signature for the contracts panel. */
export function contractsSig(game) {
  const all = game.contractsView?.() || [];
  return all.map((c) => `${c.id}:${c.status}:${c.delivered}:${c.available}:${c.daysLeft}:${c.canAccept}`).join(',');
}
