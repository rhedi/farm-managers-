// Livestock: barns, buying/selling, daily feeding and production.
import { clamp, round2 } from './rng.js';
import { syncCounts } from './economy.js';
import { xpForValue } from './taskrun.js';
import { HERD_DEFAULTS, breedingMods, stepBreedingDay, mixQuality, breedingView } from './breeding.js';
import { storeProduct } from './storage.js';
import { boostMult } from './calendar.js';

export const LOW_FEED_DAYS = 3;
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

export function herdOf(game, animalId) {
  return (game.state.animals[animalId] ||= { count: 0, barns: 0, quality: 1, happiness: 1, fed: 1, ...HERD_DEFAULTS });
}

export const capacityOf = (game, a) => herdOf(game, a.id).barns * a.barnCapacity;

/**
 * Rising expansion cost (v17 balance): `base × (1 + rate × owned)`, 3 significant digits.
 * kind 'barn' (owned = barns of that animal) or 'pond' (owned = ponds of that type). rate = BALANCE.expansion[kind],
 * v20 growth brake: × (1 + late.mult × (level − late.fromLevel) / 50) above late.fromLevel (Lv 50 → 100: ×1 → ×(1 + mult)).
 * Only the price of the next barn/pond changes; herds, barns and ponds already owned are never touched.
 */
export function expansionCost(game, kind, base, owned) {
  const E = game.data.BALANCE.expansion || {}, late = E.late;
  const k = late ? 1 + (late.mult ?? 0) * Math.min(1, Math.max(0, (game.state.level - (late.fromLevel ?? 50)) / 50)) : 1;
  const x = base * (1 + (E[kind] ?? 0) * k * Math.max(0, owned || 0));
  const e = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 2);
  return Math.round(x / e) * e;
}
/** Price of the next barn for animal def `a`. */
export const barnCostOf = (game, a) => expansionCost(game, 'barn', a.barnCost, game.state.animals[a.id]?.barns);

export function buildBarn(game, animalId) {
  const a = game.idx.animals.get(animalId);
  if (!a) return fail('Hewan tidak ditemukan.');
  if (a.unlockLevel > game.state.level) return fail(`${a.name} terbuka di level ${a.unlockLevel}.`);
  const cost = barnCostOf(game, a);
  if (!game.spend(cost, 'kandang')) return fail('Uang tidak cukup.');
  herdOf(game, animalId).barns++;
  game.emit('barn', `Kandang ${a.name} dibangun.`, { animalId });
  return ok({ capacity: capacityOf(game, a), cost });
}

export function buyAnimal(game, animalId, n = 1) {
  const a = game.idx.animals.get(animalId);
  n = Math.floor(n);
  if (!a) return fail('Hewan tidak ditemukan.');
  if (!(n > 0)) return fail('Jumlah tidak valid.');
  if (a.unlockLevel > game.state.level) return fail(`${a.name} terbuka di level ${a.unlockLevel}.`);
  const h = herdOf(game, animalId);
  if (h.barns === 0) return fail(`Bangun kandang ${a.name} terlebih dahulu.`);
  if (h.count + n > capacityOf(game, a)) return fail('Kandang penuh.');
  if (!game.spend(a.price * n, 'beli_ternak')) return fail('Uang tidak cukup.');
  h.breedQuality = mixQuality(h, n, 1); // bought stock has average genes (1.0)
  h.count += n;
  syncCounts(game);
  game.checkAchievements();
  return ok({ count: h.count });
}

export function sellAnimal(game, animalId, n = 1) {
  const a = game.idx.animals.get(animalId);
  n = Math.floor(n);
  if (!a) return fail('Hewan tidak ditemukan.');
  const h = herdOf(game, animalId);
  if (!(n > 0) || n > h.count) return fail('Jumlah hewan tidak cukup.');
  const value = round2(a.sellPrice * (0.5 + 0.5 * h.quality) * (h.breedQuality ?? 1) * n);
  h.count -= n;
  game.earn(value, 'penjualan_ternak');
  syncCounts(game);
  return ok({ earned: value });
}

export function totalAnimals(game) {
  return Object.values(game.state.animals).reduce((s, h) => s + h.count, 0);
}

function feedStock(game, a) {
  return a.feedCrops.reduce((s, c) => s + (game.state.silo[c] || 0), 0);
}

/** Daily feed consumption + production (into the Gudang dingin). Animals eat the cheapest accepted crop first. */
export function stepAnimalsDay(game) {
  const { state } = game;
  let producedValue = 0;
  for (const a of game.data.ANIMALS) {
    const h = state.animals[a.id];
    if (!h || h.count === 0) continue;
    const mods = breedingMods(game, a, h);
    const need = h.count * a.feedPerDay * mods.feed;
    let remaining = need;
    const price = (c) => state.market[c] ?? Infinity;
    const crops = a.feedCrops.filter((c) => (state.silo[c] || 0) > 0).sort((x, y) => price(x) - price(y));
    for (const c of crops) {
      if (remaining <= 1e-9) break;
      const take = Math.min(remaining, state.silo[c]);
      state.silo[c] = Math.round((state.silo[c] - take) * 1e6) / 1e6;
      if (state.silo[c] <= 0) delete state.silo[c];
      remaining -= take;
    }
    const fed = need > 0 ? clamp(1 - remaining / need, 0, 1) : 1;
    h.fed = round2(fed);
    if (fed >= 0.999) {
      h.happiness = clamp(h.happiness + 0.05, 0, 1);
      h.quality = clamp(h.quality + 0.03, 0.1, 1);
    } else {
      h.happiness = clamp(h.happiness - 0.25 * (1 - fed), 0, 1);
      h.quality = clamp(h.quality - 0.15 * (1 - fed), 0.1, 1);
    }
    const produced = round2(h.count * a.productPerDay * h.quality * fed * mods.production * boostMult(game, 'animalProd')); // 🐄 booster (calendar.js)
    if (produced > 0) {
      storeProduct(game, a.product, produced); // Gudang dingin; what doesn't fit is force-sold
      producedValue += produced * (game.idx.products.get(a.product)?.basePrice ?? 0);
    }
    // Alert only when the feed situation changes (ok → low → starving), not every day.
    const alert = fed < 0.999 ? 'starving' : feedStock(game, a) < need * LOW_FEED_DAYS ? 'low' : 'ok';
    if (alert !== (h.feedAlert ?? 'ok')) {
      if (alert === 'starving') game.emit('low_feed', `${a.emoji} ${a.name} kekurangan pakan! Kualitas menurun.`, { animalId: a.id, fed: h.fed });
      else if (alert === 'low') game.emit('low_feed', `Pakan ${a.name} tinggal kurang dari ${LOW_FEED_DAYS} hari.`, { animalId: a.id, fed: h.fed });
    }
    h.feedAlert = alert;
    if (stepBreedingDay(game, a, h, fed, mods.intensive) > 0) syncCounts(game);
  }
  if (producedValue > 0) game.addXp(round2(xpForValue(game, producedValue)));
}

export function animalsView(game) {
  return game.data.ANIMALS.map((a) => {
    const h = { count: 0, barns: 0, quality: 1, happiness: 1, fed: 1, ...HERD_DEFAULTS, ...game.state.animals[a.id] };
    const mods = breedingMods(game, a, h);
    const need = h.count * a.feedPerDay * mods.feed;
    const stock = feedStock(game, a);
    return {
      ...a, count: h.count, barns: h.barns, capacity: h.barns * a.barnCapacity,
      barnCost: barnCostOf(game, a), baseBarnCost: a.barnCost, // next barn (rises per barn owned)
      quality: round2(h.quality), happiness: round2(h.happiness), fed: h.fed,
      productionPerDay: round2(h.count * a.productPerDay * h.quality * mods.production),
      unlocked: a.unlockLevel <= game.state.level,
      feedNeedPerDay: round2(need * 1000) / 1000, feedStock: round2(stock),
      feedDaysLeft: need > 0 ? Math.floor(stock / need) : null,
      ...breedingView(game, a, h),
    };
  });
}
