// Read-only views for truck deliveries (js/engine/logistics.js).
import { round2 } from './rng.js';
import { conditionOf } from './wear.js';
import { cityMult, routeOf, truckStats, shipments, tonsPerUnit } from './logistics.js';

const regionName = (game, id) => game.idx.regions.get(id)?.name ?? id;

/** Cities: unlock state, nearest owned route (km, region) and demand multipliers, best first. */
export function citiesView(game) {
  return (game.data.CITIES ?? []).map((c) => {
    const route = routeOf(game, c);
    const demand = Object.keys(c.demand || {}).filter((id) => game.idx.products.has(id)).map((id) => {
      const p = game.idx.products.get(id);
      return { productId: id, name: p.name, emoji: p.emoji, mult: cityMult(game, c, id) };
    }).sort((a, b) => b.mult - a.mult);
    return { id: c.id, name: c.name, emoji: c.emoji, unlockLevel: c.unlockLevel ?? 1, unlocked: (c.unlockLevel ?? 1) <= game.state.level,
      reachable: !!route, regionId: route?.regionId ?? null, regionName: route ? regionName(game, route.regionId) : null,
      km: route?.km ?? null, fromRegions: Object.keys(c.km || {}).map((id) => regionName(game, id)),
      baseMult: round2((c.base ?? 1)), demand };
  });
}

/** City prices of one product, best first: [{cityId, name, emoji, mult, price, km, reachable, unlocked}]. */
export function cityPrices(game, productId) {
  const price = game.state.market[productId] ?? 0;
  return (game.data.CITIES ?? []).map((c) => {
    const route = routeOf(game, c), mult = cityMult(game, c, productId);
    return { cityId: c.id, name: c.name, emoji: c.emoji, mult, price: round2(price * mult), km: route?.km ?? null,
      reachable: !!route, unlocked: (c.unlockLevel ?? 1) <= game.state.level };
  }).sort((a, b) => b.price - a.price);
}

/** Owned trucks with effective stats (upgrades + research): capacity t, speedKmh, fuelPerKm. */
export function trucksView(game) {
  return game.state.machines.map((m) => ({ m, s: truckStats(game, m) })).filter((x) => x.s).map(({ m, s }) => ({
    uid: m.uid, defId: m.defId, name: s.name, capacity: s.capacity, speedKmh: s.speedKmh, fuelPerKm: s.fuelPerKm,
    price: s.price, busy: m.busy || false, condition: conditionOf(m) }));
}

/** Trips on the road: progress 0–1, phase 'pergi' (to the city) / 'pulang' (sold, driving back). */
export function shipmentsView(game) {
  return shipments(game).map((t) => {
    const city = game.idx.cities.get(t.cityId);
    const m = game.state.machines.find((x) => x.uid === t.truckUid);
    const cargo = Object.entries(t.cargo).map(([id, qty]) => {
      const p = game.idx.products.get(id);
      return { productId: id, name: p?.name ?? id, emoji: p?.emoji ?? '', unit: p?.unit ?? '', qty };
    });
    const estValue = round2(cargo.reduce((a, c) => a + c.qty * (game.state.market[c.productId] ?? 0) * (city ? cityMult(game, city, c.productId) : 1), 0));
    return { id: t.id, truckUid: t.truckUid, truckName: game.idx.machines.get(m?.defId)?.name ?? t.truckUid,
      workerName: game.state.workers.find((w) => w.id === t.workerId)?.name ?? null,
      cityId: t.cityId, cityName: city?.name ?? t.cityId, cityEmoji: city?.emoji ?? '🏙️', regionName: regionName(game, t.regionId),
      km: t.km, hours: t.hours, done: t.done, progress: round2(t.done / t.hours), hoursLeft: round2(t.hours - t.done),
      phase: t.sold ? 'pulang' : 'pergi', sold: t.sold, value: t.value, estValue, fuelCost: t.fuelCost, cargo,
      tons: round2(cargo.reduce((a, c) => a + c.qty * tonsPerUnit(game, c.productId), 0)) };
  });
}
