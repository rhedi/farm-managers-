// Contracts (F3): daily offers for unlocked products; accept (≤ maxActive), deliver from the silo,
// paid in full on complete delivery. Overdue contracts fail: delivered goods are paid at market price
// and a penalty (share of contract value) is charged. Uses state.contracts (engine initializes it).
import { random, randRange, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { BUY_MARKUP } from './purchase.js';
import { perk } from './research.js';

const DEFAULTS = { offers: 3, maxActive: 3, offerDays: 3, dueMin: 5, dueMax: 12, priceMin: 1.1, priceMax: 1.19,
  harvestsMin: 1, harvestsMax: 2, penaltyRate: 0.1, xpPerValue: 0.01 };
const KEEP_FINISHED_DAYS = 3;
const STATUS_ORDER = { active: 0, offer: 1, done: 2, failed: 3 };
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const r4 = (v) => Math.round(v * 10000) / 10000;
const EPS = 1e-9;

export const contractConfig = (game) => ({ ...DEFAULTS, ...(game.data.BALANCE?.contracts || {}) });
const list = (game) => (game.state.contracts ||= []);
const findContract = (game, id) => list(game).find((c) => c.id === id);
const activeCount = (game) => list(game).filter((c) => c.status === 'active').length;

function avgFieldHa(game) {
  const ids = Object.keys(game.state.fields);
  if (!ids.length) return 4;
  return ids.reduce((s, id) => s + (game.idx.fields.get(id)?.sizeHa || 0), 0) / ids.length;
}

/** Products the player can supply: unlocked crops (one harvest of the average field) and owned herds (3 days). */
function candidates(game) {
  const s = game.state, ha = avgFieldHa(game), out = [];
  for (const c of game.data.CROPS) if (c.unlockLevel <= s.level) out.push({ productId: c.id, perRound: ha * c.baseYield });
  for (const a of game.data.ANIMALS) {
    const n = s.animals?.[a.id]?.count || 0;
    if (n > 0) out.push({ productId: a.product, perRound: n * a.productPerDay * 3 });
  }
  return out.filter((c) => game.idx.products.has(c.productId) && c.perRound > 0);
}

function roundQty(q, unit) {
  return unit === 't' ? Math.max(0.5, Math.round(q * 2) / 2) : Math.max(1, Math.round(q));
}

function makeOffer(game, cfg, day) {
  const s = game.state;
  const taken = new Set(list(game).filter((c) => c.status === 'offer' || c.status === 'active').map((c) => c.productId));
  const pool = candidates(game).filter((c) => !taken.has(c.productId));
  if (!pool.length) return null;
  const pick = pool[Math.floor(random(s) * pool.length)];
  const p = game.idx.products.get(pick.productId);
  const qty = roundQty(pick.perRound * randRange(s, cfg.harvestsMin, cfg.harvestsMax), p.unit);
  // Price off max(market, 0.9·base) so a market crash doesn't produce absurdly cheap offers.
  const market = Math.max(s.market[p.id] ?? p.basePrice, p.basePrice * 0.9);
  const hi = Math.min(cfg.priceMax, BUY_MARKUP - 0.01);
  // Research perk 'contractPrice' raises the offer, still below BUY_MARKUP so buying to deliver never profits.
  const rate = randRange(s, Math.min(cfg.priceMin, hi), hi);
  const price = r4(market * Math.min(rate * (1 + perk(game, 'contractPrice')), BUY_MARKUP - 0.01));
  const days = cfg.dueMin + Math.floor(random(s) * (cfg.dueMax - cfg.dueMin + 1));
  const value = round2(qty * price);
  s.nextUid = (s.nextUid || 1) + 1;
  return { id: `k${s.nextUid - 1}`, productId: p.id, qty, delivered: 0, price, value, days,
    offeredDay: day, expiresDay: day + cfg.offerDays, dueDay: day + days,
    penalty: round2(value * cfg.penaltyRate), xp: Math.round(value * cfg.xpPerValue), status: 'offer' };
}

function failContract(game, c, day) {
  const s = game.state, p = game.idx.products.get(c.productId);
  const paid = round2(c.delivered * (s.market[c.productId] ?? 0));
  if (paid > 0) game.earn(paid, 'kontrak');
  game.payOrBorrow(c.penalty, 'penalti_kontrak'); // shortfall goes to the loan
  c.status = 'failed';
  c.closedDay = day;
  game.emit('contract_failed', `📋 Kontrak ${p?.name ?? c.productId} gagal. Denda ${fmtMoney(c.penalty)}`
    + (paid > 0 ? `, kiriman ${fmtNum(c.delivered)} ${p?.unit ?? ''} dibayar ${fmtMoney(paid)}.` : '.'),
  { contractId: c.id, productId: c.productId, penalty: c.penalty, paid });
}

/** Daily rollover: fail overdue contracts, drop stale offers and old records, top up offers. */
export function stepContractsDay(game) {
  const s = game.state, day = game.day, cfg = contractConfig(game);
  for (const c of list(game)) if (c.status === 'active' && day > c.dueDay) failContract(game, c, day);
  s.contracts = list(game).filter((c) => !(c.status === 'offer' && day > c.expiresDay)
    && !((c.status === 'done' || c.status === 'failed') && day > (c.closedDay ?? day) + KEEP_FINISHED_DAYS));
  let added = 0;
  while (s.contracts.filter((c) => c.status === 'offer').length < cfg.offers) {
    const c = makeOffer(game, cfg, day);
    if (!c) break;
    s.contracts.push(c);
    added++;
  }
  if (added) game.emit('contract_offer', `📋 ${added} tawaran kontrak baru di Pasar.`, { count: added });
}

export function acceptContract(game, id) {
  const c = findContract(game, id), cfg = contractConfig(game);
  if (!c) return fail('Kontrak tidak ditemukan.');
  if (c.status !== 'offer') return fail('Kontrak ini tidak bisa diterima.');
  if (activeCount(game) >= cfg.maxActive) return fail(`Maksimal ${cfg.maxActive} kontrak aktif.`);
  c.status = 'active';
  c.acceptedDay = game.day;
  c.dueDay = game.day + c.days;
  return ok({ dueDay: c.dueDay });
}

/** Stock usable for delivery: silo minus the feed reserve. */
function available(game, productId) {
  const stock = game.state.silo[productId] || 0;
  return Math.max(0, round2(stock - (game.state.feedReserve?.[productId] || 0)));
}

export function deliverContract(game, id, qty) {
  const s = game.state, c = findContract(game, id);
  if (!c) return fail('Kontrak tidak ditemukan.');
  if (c.status !== 'active') return fail('Kontrak belum aktif.');
  const p = game.idx.products.get(c.productId);
  const remaining = round2(c.qty - c.delivered);
  const avail = available(game, c.productId);
  let amount = qty == null ? Math.min(remaining, avail) : Number(qty);
  if (qty != null && !(amount > 0)) return fail('Jumlah tidak valid.');
  if (!(amount > 0)) return fail(`Stok ${p.name} di gudang kosong${s.feedReserve?.[c.productId] ? ' (sisanya dicadangkan untuk pakan)' : ''}.`);
  amount = round2(Math.min(amount, remaining));
  if (amount > avail + EPS) return fail('Stok tidak cukup.');
  s.silo[c.productId] = round2((s.silo[c.productId] || 0) - amount);
  if (s.silo[c.productId] <= 0) delete s.silo[c.productId];
  c.delivered = round2(c.delivered + amount);
  if (c.delivered < c.qty - EPS) return ok({ delivered: amount, done: false, earned: 0 });
  c.status = 'done';
  c.closedDay = game.day;
  game.earn(c.value, 'kontrak');
  s.stats.contractsDone = (s.stats.contractsDone || 0) + 1;
  game.emit('contract_done', `📋 Kontrak ${p.name} selesai! Dibayar ${fmtMoney(c.value)} (+${c.xp} XP).`,
    { contractId: c.id, productId: c.productId, value: c.value, xp: c.xp });
  game.addXp(c.xp);
  game.checkAchievements();
  return ok({ delivered: amount, done: true, earned: c.value });
}

/** Contracts for the UI, active first. Adds product info, progress, days left and what can be done now. */
export function contractsView(game) {
  const s = game.state, day = game.day, cfg = contractConfig(game);
  const canAcceptMore = activeCount(game) < cfg.maxActive;
  return list(game).map((c) => {
    const p = game.idx.products.get(c.productId) || { name: c.productId, emoji: '', unit: '' };
    const market = s.market[c.productId] ?? 0;
    const avail = available(game, c.productId);
    const remaining = round2(c.qty - c.delivered);
    return { ...c, name: p.name, emoji: p.emoji, unit: p.unit, stock: s.silo[c.productId] || 0, available: avail,
      remaining, progress: c.qty ? Math.min(1, c.delivered / c.qty) : 0, marketPrice: market,
      premium: market ? round2(c.price / market - 1) : 0,
      basePrice: p.basePrice ?? 0, premiumBase: p.basePrice ? round2(c.price / p.basePrice - 1) : 0,
      daysLeft: c.status === 'offer' ? c.expiresDay - day : c.dueDay - day,
      canAccept: c.status === 'offer' && canAcceptMore,
      canDeliver: c.status === 'active' && avail > 0 };
  }).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.daysLeft - b.daysLeft);
}
