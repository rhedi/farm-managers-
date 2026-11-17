// Truck deliveries (logistics): load silo stock on a truck, drive to a city, sell there at
// market × city demand on arrival (half-way), then drive back. A free worker drives (busy the whole trip).
// state.shipments = [{ id, truckUid, workerId, cityId, regionId, km, cargo:{productId:qty}, hours, done,
//   fuelCost, sold, value, departDay, auto?, bonus? }], state.nextTripId. Truck/worker `busy` = the shipment id ('trip3').
// `auto` marks trips sent by the Manajer Logistik (dispatcher.js); `bonus` = its negotiated extra city price.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { sellableStock } from './economy.js';
import { saleCategory } from './ledger.js';
import { effectiveStats } from './upgrades.js';
import { wearMachines, wearFactor, REPAIR_RATE } from './wear.js';
import { NO_WORKER } from './workers.js';
import { BUY_MARKUP } from './purchase.js';
import { perk } from './research.js';
import { projectPerk } from './projects.js';
import { takeSale } from './saturation.js';

/** Continent of a city: the one of the first region it is reachable from (⚓ Pelabuhan Ekspor bonus). */
const cityContinent = (game, city) => game.idx.regions.get(Object.keys(city.km || {})[0])?.continent ?? null;

const DEFAULTS = { wearPerHour: 0.0006, cropCap: 1.15 };
export const cfg = (game) => ({ ...DEFAULTS, ...game.data.BALANCE.logistics });
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const r4 = (v) => Math.round(v * 10000) / 10000;
export const shipments = (game) => (game.state.shipments ||= []);

/**
 * Truck load per unit (t): only products measured in tons fill the truck (same rule as the silo).
 * kg / L / pcs goods (milk, eggs, cheese…) ride along in the cab/cooler without using capacity.
 */
export const tonsPerUnit = (game, productId) => (game.idx.products.get(productId)?.unit === 't' ? 1 : 0);

/**
 * City price multiplier: demand (or base) × (1 + perk 'cityPrice' + `bonus`); crops never above cropCap (< BUY_MARKUP).
 * `bonus` = the Manajer Logistik's negotiation bonus on its own trips (0 for manual trips).
 */
/** v17 Diversifikasi: non-crop goods sell for more in cities as the farm grows (BALANCE.diversify.city). */
export function lateNonCropBonus(game, productId) {
  const c = game.data.BALANCE.diversify?.city;
  if (!c || game.idx.crops.has(productId) || game.idx.products.get(productId)?.buyable) return 0; // buy-and-ship never profits
  return Math.min(c.max, Math.max(0, (game.state.level - c.fromLevel) * c.perLevel));
}
export function cityMult(game, city, productId, bonus = 0) {
  let m = (city.demand?.[productId] ?? city.base ?? 1) * (1 + perk(game, 'cityPrice') + bonus + lateNonCropBonus(game, productId)
    + projectPerk(game, 'cityPrice', cityContinent(game, city)));
  if (game.idx.crops.has(productId)) m = Math.min(m, Math.min(cfg(game).cropCap, BUY_MARKUP - 0.01));
  return r4(m);
}

/** Nearest owned region the city can be reached from: {regionId, km} or null. */
export function routeOf(game, city) {
  const owned = new Set(Object.keys(game.state.fields).map((id) => game.idx.fields.get(id)?.regionId));
  let best = null;
  for (const [regionId, km] of Object.entries(city.km || {})) if (owned.has(regionId) && (!best || km < best.km)) best = { regionId, km };
  return best;
}

/** Truck stats with upgrades and the 'truckCap' perk, or null for non-trucks. */
export function truckStats(game, m) {
  const s = m && effectiveStats(game, m);
  if (s?.type !== 'truck') return null;
  return { ...s, capacity: round2(s.capacity * (1 + perk(game, 'truckCap'))) };
}

/** Driver: the least skilled free worker (keeps the best ones for field work). */
export const freeDriver = (game) => game.state.workers.filter((w) => !w.busy).sort((a, b) => a.skill - b.skill)[0] ?? null;

/**
 * Validate and price a trip. Always fills the numbers it can: items, tons, capacity, km, hours, fuelCost,
 * value (city), localValue (market), gain, wageCost, wearCost, profit = gain − fuel − wage time − wear.
 */
export function planShipment(game, truckUid, cityId, cargo = {}, { bonus = 0 } = {}) {
  const s = game.state, B = game.data.BALANCE;
  const m = s.machines.find((x) => x.uid === truckUid);
  const truck = truckStats(game, m);
  const city = game.idx.cities.get(cityId);
  if (!truck) return fail('Pilih truk.');
  if (!city) return fail('Kota tidak ditemukan.');
  const route = routeOf(game, city);
  const items = [];
  let bad = null;
  for (const [productId, raw] of Object.entries(cargo || {})) {
    const qty = round2(Number(raw));
    if (!(qty > 0)) continue;
    const p = game.idx.products.get(productId);
    if (!p) { bad ||= 'Produk tidak ditemukan.'; continue; }
    const stock = sellableStock(game, productId);
    if (qty > stock + 1e-9) bad ||= `Stok ${p.name} tidak cukup (tersedia ${fmtNum(stock)} ${p.unit}).`;
    const price = s.market[productId] ?? 0, mult = cityMult(game, city, productId, bonus);
    items.push({ productId, name: p.name, emoji: p.emoji, unit: p.unit, qty, tons: round2(qty * tonsPerUnit(game, productId)),
      price, mult, cityPrice: round2(price * mult), value: round2(qty * price * mult), localValue: round2(qty * price) });
  }
  const km = route?.km ?? 0;
  const hours = round2((2 * km / truck.speedKmh) * wearFactor(game, [truckUid]));
  const driver = freeDriver(game);
  const sum = (k) => round2(items.reduce((a, i) => a + i[k], 0));
  const value = sum('value'), localValue = sum('localValue'), tons = sum('tons');
  const fuelCost = round2(2 * km * truck.fuelPerKm * B.fuelPrice * (1 - perk(game, 'fuel')));
  const wage = driver?.wage ?? (s.workers.length ? Math.min(...s.workers.map((w) => w.wage)) : 0);
  const wageCost = round2(wage * (1 - perk(game, 'wages')) * hours / 24);
  const wearRate = cfg(game).wearPerHour * (1 - perk(game, 'wear'));
  const wearCost = round2(truck.price * wearRate * hours * (B.wear?.repairRate ?? REPAIR_RATE));
  const gain = round2(value - localValue);
  const plan = { ok: true, truckUid, cityId, regionId: route?.regionId ?? null, km, items, tons, capacity: truck.capacity,
    hours, fuelCost, value, localValue, gain, wageCost, wearCost, profit: round2(gain - fuelCost - wageCost - wearCost),
    workerId: driver?.id ?? null, workerName: driver?.name ?? null };
  const regions = Object.keys(city.km || {}).map((id) => game.idx.regions.get(id)?.name ?? id).join(' / ');
  const reason = city.unlockLevel > s.level ? `${city.name} terbuka di level ${city.unlockLevel}.`
    : !route ? `Butuh ladang di ${regions} untuk mengirim ke ${city.name}.`
      : m.busy ? 'Truk sedang di jalan.'
        : bad ?? (!items.length ? 'Muatan kosong.'
          : tons > truck.capacity + 1e-9 ? `Muatan ${fmtNum(tons)} t melebihi kapasitas ${fmtNum(truck.capacity)} t.`
            : !driver ? NO_WORKER
              : fuelCost > s.money + 1e-9 ? 'Uang tidak cukup untuk BBM.' : null);
  return reason ? { ...plan, ok: false, reason } : plan;
}

/**
 * Start a delivery: fuel booked now ('transportasi'), cargo leaves the silo, truck + driver busy.
 * `auto` (Manajer Logistik trips) marks the shipment and skips the `delivery_start` event (it emits `auto_dispatch`).
 */
export function shipToCity(game, truckUid, cityId, cargo, { auto = false, bonus = 0 } = {}) {
  const plan = planShipment(game, truckUid, cityId, cargo, { bonus });
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const s = game.state;
  if (!game.spend(plan.fuelCost, 'transportasi')) return fail('Uang tidak cukup untuk BBM.');
  const load = {};
  for (const i of plan.items) {
    load[i.productId] = round2((load[i.productId] || 0) + i.qty);
    s.silo[i.productId] = round2((s.silo[i.productId] || 0) - i.qty);
    if (s.silo[i.productId] <= 0) delete s.silo[i.productId];
  }
  s.nextTripId = (s.nextTripId || 1) + 1;
  const id = `trip${s.nextTripId - 1}`;
  shipments(game).push({ id, truckUid, workerId: plan.workerId, cityId, regionId: plan.regionId, km: plan.km, cargo: load,
    hours: Math.max(0.01, plan.hours), done: 0, fuelCost: plan.fuelCost, sold: false, value: 0, departDay: game.day,
    ...(auto ? { auto: true } : {}), ...(bonus ? { bonus } : {}) });
  s.machines.find((m) => m.uid === truckUid).busy = id;
  s.workers.find((w) => w.id === plan.workerId).busy = id;
  const city = game.idx.cities.get(cityId);
  if (!auto) game.emit('delivery_start', `🚚 ${plan.workerName} berangkat ke ${city.name} (${fmtNum(plan.km)} km) membawa ${fmtNum(plan.tons)} t, BBM ${fmtMoney(plan.fuelCost)}.`,
    { shipmentId: id, cityId });
  return { ok: true, id, hours: plan.hours, fuelCost: plan.fuelCost, estValue: plan.value };
}

/** Arrival at the city: sell everything at market × city multiplier (income by product type). */
function arrive(game, t) {
  const s = game.state, city = game.idx.cities.get(t.cityId);
  const split = {};
  let value = 0, local = 0;
  for (const [id, qty] of Object.entries(t.cargo)) {
    const price = s.market[id] ?? 0, v = round2(qty * price * (city ? cityMult(game, city, id, t.bonus || 0) : 1) * takeSale(game, id, qty));
    const cat = saleCategory(game, id);
    split[cat] = round2((split[cat] || 0) + v);
    value += v; local += qty * price;
    s.stats.productsSold = round2(s.stats.productsSold + qty);
  }
  value = round2(value);
  s.stats.salesValue = round2((s.stats.salesValue || 0) + value);
  if (value > 0) game.earn(value, split);
  t.sold = true; t.value = value;
  const gain = round2(value - local);
  game.emit('delivery_done', `🚚 Muatan terjual di ${city?.name ?? t.cityId}: ${fmtMoney(value)} (${gain >= 0 ? '+' : ''}${fmtMoney(gain)} vs pasar).`,
    { cityId: t.cityId, value, gain, shipmentId: t.id });
  game.checkAchievements();
}

/** Advance trips by `dt` hours (Game.advance). Returns the number of trucks that came back. */
export function stepShipments(game, dt) {
  const list = shipments(game);
  if (!list.length) return 0;
  let back = 0;
  for (const t of [...list]) {
    const before = t.done;
    t.done = round2(Math.min(t.hours, t.done + dt));
    wearMachines(game, [t.truckUid], t.done - before, cfg(game).wearPerHour);
    if (!t.sold && t.done >= t.hours / 2 - 1e-9) arrive(game, t);
    if (t.done >= t.hours - 1e-9) { finishTrip(game, t); back++; }
  }
  return back;
}

function finishTrip(game, t) {
  const s = game.state;
  for (const m of s.machines) if (m.busy === t.id) m.busy = false;
  for (const w of s.workers) if (w.busy === t.id) w.busy = false;
  s.shipments = shipments(game).filter((x) => x !== t);
  const d = game.idx.machines.get(s.machines.find((m) => m.uid === t.truckUid)?.defId);
  game.emit('truck_returned', `🚚 ${d?.name ?? 'Truk'} kembali ke garasi.`, { shipmentId: t.id, truckUid: t.truckUid });
}

/** Load migration: shipments list, trip id counter, re-mark busy trucks/drivers (normalizeState clears them). */
export function ensureLogistics(game) {
  const s = game.state;
  s.shipments = (s.shipments || []).filter((t) => s.machines.some((m) => m.uid === t.truckUid) && game.idx.cities.has(t.cityId));
  const maxId = Math.max(0, ...s.shipments.map((t) => Number(String(t.id).slice(4)) || 0));
  s.nextTripId = Math.max(s.nextTripId || 1, maxId + 1);
  for (const t of s.shipments) {
    s.machines.find((m) => m.uid === t.truckUid).busy = t.id;
    const w = s.workers.find((x) => x.id === t.workerId);
    if (w) w.busy = t.id;
  }
}
