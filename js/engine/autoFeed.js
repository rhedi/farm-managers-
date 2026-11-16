// Beli pakan otomatis: at every midnight, before the animals eat (Game daily rollover), buy what is missing for
// today's meal + `days` more days of every herd's feed and of the fish ponds' pelet, at the market buy price
// (×1.2, ledger 'pakan'). Only cash is used (never the loan) and only what fits the silo. The same claims keep that
// feed from plan auto-sell / Manajer Logistik / "Jual semua" (js/engine/stockKeep.js).
// state.autoFeed = { animals: bool, fish: bool, days: 1–14 } (default on, 3 days; old saves migrate to the default).
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { breedingMods } from './breeding.js';
import { buyProduct, BUY_MARKUP } from './purchase.js';
import { freeOf, kindOf, tonsPerUnit } from './storage.js';
import { fishCfg, totalFeedNeed } from './fish.js';

export const DEFAULT_DAYS = 3;
const DAYS = [1, 14];
export const defaultAutoFeed = () => ({ animals: true, fish: true, days: DEFAULT_DAYS });
const clampDays = (d) => Math.round(Math.min(DAYS[1], Math.max(DAYS[0], Number(d) || DEFAULT_DAYS)));

/** createGame / load migration (persist.normalizeState): missing = on for herds and ponds (it only prevents starvation), 3 days. */
export function ensureAutoFeed(s) {
  const a = { ...defaultAutoFeed(), ...(s.autoFeed || {}) };
  s.autoFeed = { animals: a.animals !== false, fish: a.fish !== false, days: clampDays(a.days) };
}
const cfg = (game) => game.state.autoFeed ?? defaultAutoFeed();

/** Partial patch {animals?, fish?, days?} → {ok, autoFeed}. */
export function setAutoFeed(game, patch = {}) {
  const c = cfg(game);
  game.state.autoFeed = { animals: patch.animals ?? c.animals, fish: patch.fish ?? c.fish, days: clampDays(patch.days ?? c.days) };
  game.state.autoFeed.animals = !!game.state.autoFeed.animals;
  game.state.autoFeed.fish = !!game.state.autoFeed.fish;
  return { ok: true, autoFeed: { ...game.state.autoFeed } };
}

/**
 * Feed for today + `days` days of the enabled groups: `claims` {productId: qty in stock it uses} and `buy`
 * {productId: qty missing}. Herds take the cheapest accepted crop first (as they eat), in data order; ponds eat pelet.
 */
export function feedPlan(game, { days = cfg(game).days, animals = cfg(game).animals, fish = cfg(game).fish } = {}) {
  const s = game.state, claims = {}, buy = {}, span = days + 1;
  const left = (id) => Math.max(0, (s.silo[id] || 0) - (claims[id] || 0));
  const take = (id, need) => { const q = Math.min(need, left(id)); if (q > 0) claims[id] = (claims[id] || 0) + q; return need - q; };
  if (animals) for (const a of game.data.ANIMALS) {
    const h = s.animals?.[a.id];
    if (!(h?.count > 0)) continue;
    let need = h.count * a.feedPerDay * breedingMods(game, a, h).feed * span;
    const crops = a.feedCrops.filter((c) => s.market[c] != null).sort((x, y) => s.market[x] - s.market[y] || (x < y ? -1 : 1));
    for (const c of crops) need = take(c, need);
    const buyable = crops.find((c) => game.idx.crops.has(c));
    if (need > 1e-6 && buyable) buy[buyable] = (buy[buyable] || 0) + need;
  }
  const pelletNeed = fish ? totalFeedNeed(game) * span : 0;
  if (pelletNeed > 0) {
    const id = fishCfg(game).feed, miss = take(id, pelletNeed);
    if (miss > 1e-6) buy[id] = (buy[id] || 0) + miss;
  }
  for (const id of Object.keys(claims)) claims[id] = round2(claims[id]);
  return { claims, buy };
}

/** Stock kept for auto-feed (0 when off): today + `days` days of the herds/ponds, from what is in stock. */
export const feedClaims = (game) => feedPlan(game).claims;

/** Daily, before the animals eat: buy the shortfall with cash; emits one `auto_feed` event when it bought or fell short. */
export function stepAutoFeedDay(game) {
  const c = cfg(game);
  if (!c.animals && !c.fish) return null;
  const { buy } = feedPlan(game, c);
  const items = [];
  let cost = 0, short = false;
  for (const id of Object.keys(buy).sort()) {
    const p = game.idx.products.get(id), price = (game.state.market[id] ?? 0) * BUY_MARKUP;
    if (!p || !(price > 0)) continue;
    const want = Math.ceil(round2(buy[id] * 100)) / 100;
    const kind = kindOf(p);
    const room = kind ? Math.floor(freeOf(game, kind) / tonsPerUnit(p) * 100 + 1e-6) / 100 : Infinity;
    const cash = Math.floor(game.state.money / price * 100 + 1e-6) / 100;
    const qty = Math.min(want, room, cash);
    if (qty < want - 1e-9) short = true;
    if (!(qty > 0)) continue;
    const r = buyProduct(game, id, qty, 'pakan', { quiet: true });
    if (!r.ok) { short = true; continue; }
    items.push({ productId: id, qty: r.qty, cost: r.cost });
    cost = round2(cost + r.cost);
  }
  if (!items.length && !short) return null;
  const names = items.map((it) => game.idx.products.get(it.productId)?.name ?? it.productId).join(', ');
  const msg = items.length
    ? `🛒 Pakan otomatis: ${names} dibeli ${fmtMoney(cost)}.${short ? ' Uang/silo kurang untuk sisanya.' : ''}`
    : '🛒 Pakan otomatis tidak bisa membeli: uang atau ruang silo kurang.';
  game.emit('auto_feed', msg, { items, cost, short });
  return { items, cost, short };
}

/** UI view: settings plus per-group days of feed in stock. */
export function autoFeedView(game) {
  const c = cfg(game);
  return { ...c, steps: [1, 2, 3, 5, 7, 14] };
}
