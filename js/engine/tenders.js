// v18 🚢 Tender Ekspor: late-game (BALANCE.tenders.unlockLevel) export tenders. One offer every `everyDays`, at most
// one tender active. A tender asks a huge amount of one crop (sized from the farm's own field area and its truck
// fleet, so money alone can't buy it) delivered within `durationDays` to an export port city: chunks go by truck
// (shipToCity with `tender`, paid on arrival at the locked price) or, with a ⚓ Pelabuhan Ekspor in the port's
// continent, are loaded straight from the silo every midnight. Finishing pays a cash premium, research points, a
// unique trophy per destination and cosmetics (encyclopedia.js); a missed deadline costs a small penalty on the
// undelivered part. Hash-seeded draws only (never state.rng).
import { hashSeed, random, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { shipToCity, routeOf, truckStats, shipments } from './logistics.js';
import { sellableStock } from './economy.js';
import { projectPerk } from './projects.js';
import { grantResearchPoints } from './rewards.js';
import { conditionOf, BREAKDOWN_BELOW } from './wear.js';
import { syncCosmetics } from './encyclopedia.js';
import { perk } from './research.js';

const DEFAULTS = { unlockLevel: 35, everyDays: 40, firstDelayDays: 2, offerDays: 6, durationDays: 30, farmShare: 0.45,
  truckShare: 0.5, minQty: 2000, priceRate: 1.1, premium: 0.25, rp: 3, penaltyRate: 0.03, xpPerValue: 0.004,
  portLoadPerStage: 0.005, portPremiumPerStage: 0.05, reserveWorkers: 1, ports: [], destinations: [] };
export const tcfg = (game) => ({ ...DEFAULTS, ...(game.data.BALANCE.tenders || {}) });
const fail = (reason) => ({ ok: false, reason });
const EPS = 1e-6;
/** 2 significant digits (47.300 → 47.000). */
const nice2 = (v) => { if (!(v > 0)) return 0; const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };

/** Load migration / new game: `{next, seq, auto, offer, active, history, trophies, done, failed}`. */
export function ensureTenders(s) {
  const t = s.tenders && typeof s.tenders === 'object' ? s.tenders : {};
  t.next = Number.isFinite(t.next) ? t.next : null;
  t.seq = Number.isFinite(t.seq) ? t.seq : 0;
  t.auto ??= true;
  t.offer ??= null; t.active ??= null;
  t.history = Array.isArray(t.history) ? t.history.slice(-8) : [];
  t.trophies = t.trophies && typeof t.trophies === 'object' && !Array.isArray(t.trophies) ? t.trophies : {};
  t.done = Number(t.done) || 0; t.failed = Number(t.failed) || 0;
  for (const k of ['offer', 'active']) {
    const x = t[k];
    if (x && !(x.qty > 0 && typeof x.productId === 'string' && typeof x.cityId === 'string')) t[k] = null;
  }
  if (t.active) { t.active.delivered = Number(t.active.delivered) || 0; t.active.inTransit = Number(t.active.inTransit) || 0; t.active.paid = Number(t.active.paid) || 0; }
  s.tenders = t;
  return t;
}
const st = (game) => (game.state.tenders?.history ? game.state.tenders : ensureTenders(game.state));

const destOf = (game, id) => tcfg(game).destinations.find((d) => d.id === id) ?? { id, name: id, trophy: `Piala ${id}`, emoji: '🏆' };
const continentOf = (game, city) => game.idx.regions.get(Object.keys(city?.km || {})[0])?.continent ?? null;
export const portStage = (game, cityId) => projectPerk(game, 'portStage', continentOf(game, game.idx.cities.get(cityId)));

/** Owned trucks able to drive (condition ≥ the breakdown limit), biggest first. */
function trucks(game, { idle = false } = {}) {
  const lim = game.data.BALANCE.wear?.breakdownBelow ?? BREAKDOWN_BELOW;
  return game.state.machines.filter((m) => truckStats(game, m) && conditionOf(m) >= lim && (!idle || !m.busy))
    .sort((a, b) => truckStats(game, b).capacity - truckStats(game, a).capacity || (a.uid < b.uid ? -1 : 1));
}

/** Tons per day the owned fleet hauls to `city` (round trips 2·km/speed), and fuel per ton. */
export function fleetPerDay(game, city) {
  const route = city && routeOf(game, city);
  if (!route) return { tons: 0, fuelPerTon: 0, trucks: 0 };
  let tons = 0, fuel = 0, cap = 0, n = 0;
  for (const m of trucks(game)) {
    const t = truckStats(game, m), hours = Math.max(0.5, 2 * route.km / t.speedKmh);
    tons += t.capacity * 24 / hours;
    fuel += 2 * route.km * t.fuelPerKm * game.data.BALANCE.fuelPrice * (1 - perk(game, 'fuel'));
    cap += t.capacity; n++;
  }
  return { tons, fuelPerTon: cap > 0 ? fuel / cap : 0, trucks: n };
}

/** Tons per day the farm would grow if every owned annual field grew `crop` (work days included). */
function farmPerDay(game, crop) {
  let t = 0;
  for (const [id, f] of Object.entries(game.state.fields)) {
    const def = game.idx.fields.get(id);
    if (!def || f.orchard) continue;
    t += def.sizeHa * crop.baseYield * 0.85 / ((crop.growDays ?? 5) + 1.5);
  }
  return t;
}

function makeOffer(game, day) {
  const s = game.state, c = tcfg(game), t = st(game);
  const ports = c.ports.map((id) => game.idx.cities.get(id)).filter((city) => city && city.unlockLevel <= s.level && routeOf(game, city));
  if (!ports.length || !trucks(game).length) return null;
  t.seq += 1;
  const r = { rng: hashSeed(`${s.seed}|tender|${day}|${t.seq}`) };
  const pick = (arr) => arr[Math.floor(random(r) * arr.length)];
  const annual = game.data.CROPS.filter((cr) => cr.unlockLevel <= s.level && game.idx.products.get(cr.id)?.unit === 't');
  const known = annual.filter((cr) => s.quality?.records?.[cr.id]);
  const crop = pick(known.length >= 3 ? known : annual);
  const city = pick(ports);
  const unwon = c.destinations.filter((d) => !t.trophies[d.id]);
  const dest = pick(unwon.length ? unwon : c.destinations);
  const fleet = fleetPerDay(game, city);
  const daily = Math.min(farmPerDay(game, crop) * c.farmShare, fleet.tons * c.truckShare);
  const qty = Math.max(c.minQty, nice2(daily * c.durationDays));
  const p = game.idx.products.get(crop.id);
  const price = round2(Math.max(s.market[p.id] ?? p.basePrice, 0.9 * p.basePrice) * c.priceRate);
  return { id: `t${t.seq}`, productId: crop.id, destId: dest?.id ?? 'rotterdam', cityId: city.id, qty, price,
    days: c.durationDays, offeredDay: day, expiresDay: day + c.offerDays };
}

/** Pay a delivered chunk; finishes the tender when complete. */
function deliverChunk(game, a, qty, how) {
  if (!(qty > 0)) return;
  const pay = round2(qty * a.price);
  a.delivered = round2(a.delivered + qty);
  a.paid = round2(a.paid + pay);
  game.earn(pay, 'kontrak');
  const p = game.idx.products.get(a.productId);
  game.emit('tender_delivery', `🚢 Tender ${destOf(game, a.destId).name}: ${fmtNum(qty)} t ${p?.name ?? a.productId} ${how} (${fmtMoney(pay)}) · ${fmtNum(a.delivered)}/${fmtNum(a.qty)} t.`,
    { tenderId: a.id, qty, pay, delivered: a.delivered });
  if (a.delivered >= a.qty - EPS) complete(game);
}

function complete(game) {
  const t = st(game), a = t.active, c = tcfg(game), dest = destOf(game, a.destId);
  const value = round2(a.qty * a.price);
  const stage = portStage(game, a.cityId);
  const bonus = round2(value * c.premium * (1 + c.portPremiumPerStage * stage));
  game.earn(bonus, 'kontrak');
  grantResearchPoints(game, c.rp);
  game.addXp(Math.round(value * c.xpPerValue));
  const tr = t.trophies[a.destId] ||= { count: 0, firstDay: game.day };
  tr.count += 1;
  t.done += 1;
  t.history.push({ id: a.id, productId: a.productId, destId: a.destId, qty: a.qty, delivered: a.delivered, status: 'done', day: game.day, paid: round2(a.paid + bonus), bonus });
  if (t.history.length > 8) t.history.splice(0, t.history.length - 8);
  t.active = null;
  t.next = Math.max(t.next ?? 0, game.day + Math.ceil(c.everyDays / 2));
  game.emit('tender_done', `🏆 Tender ${dest.name} selesai! Bonus ${fmtMoney(bonus)} + ${c.rp} 🔬 + ${dest.emoji} ${dest.trophy}.`,
    { tenderId: a.id, destId: a.destId, bonus, rp: c.rp });
  syncCosmetics(game);
  game.checkAchievements?.();
}

function failTender(game) {
  const t = st(game), a = t.active, c = tcfg(game), dest = destOf(game, a.destId);
  const rest = Math.max(0, a.qty - a.delivered);
  const penalty = round2(rest * a.price * c.penaltyRate);
  if (penalty > 0) game.payOrBorrow(penalty, 'penalti_kontrak');
  t.failed += 1;
  t.history.push({ id: a.id, productId: a.productId, destId: a.destId, qty: a.qty, delivered: a.delivered, status: 'failed', day: game.day, paid: a.paid, penalty });
  if (t.history.length > 8) t.history.splice(0, t.history.length - 8);
  t.active = null;
  game.emit('tender_failed', `🚢 Tender ${dest.name} lewat batas waktu: ${fmtNum(a.delivered)}/${fmtNum(a.qty)} t terkirim. Denda ${fmtMoney(penalty)}.`,
    { tenderId: a.id, penalty, delivered: a.delivered });
}

/** Daily rollover: port loading, deadline, offer expiry and new offers. */
export function stepTendersDay(game, day = game.day) {
  const s = game.state, c = tcfg(game), t = st(game);
  if (s.level < c.unlockLevel && !t.active && !t.offer) return;
  if (t.active) {
    const a = t.active, stage = portStage(game, a.cityId);
    if (stage > 0) {
      const load = round2(Math.min(a.qty * c.portLoadPerStage * stage, toSend(a), sellableStock(game, a.productId)));
      if (load > 0) { takeStock(game, a.productId, load); deliverChunk(game, a, load, 'dimuat Pelabuhan'); }
    }
    if (t.active && day > t.active.dueDay) failTender(game);
  }
  if (t.offer && day > t.offer.expiresDay) {
    game.emit('tender_expired', `🚢 Tawaran tender ${destOf(game, t.offer.destId).name} berakhir.`, { tenderId: t.offer.id });
    t.offer = null;
    t.next = day + c.everyDays;
  }
  if (s.level < c.unlockLevel) return;
  t.next ??= day + c.firstDelayDays;
  if (!t.offer && !t.active && day >= t.next) {
    const o = makeOffer(game, day);
    if (!o) { t.next = day + 5; return; }
    t.offer = o;
    t.next = day + c.everyDays;
    const p = game.idx.products.get(o.productId), dest = destOf(game, o.destId);
    game.emit('tender_offer', `🚢 Tender Ekspor baru: ${fmtNum(o.qty)} t ${p?.emoji ?? ''} ${p?.name ?? o.productId} ke ${dest.name} dalam ${o.days} hari. Lihat Pasar › Kontrak.`,
      { tenderId: o.id });
  }
}

const toSend = (a) => Math.max(0, round2(a.qty - a.delivered - a.inTransit));
function takeStock(game, productId, qty) {
  const s = game.state.silo;
  s[productId] = round2((s[productId] || 0) - qty);
  if (s[productId] <= 0) delete s[productId];
}

export function acceptTender(game) {
  const t = st(game);
  if (t.active) return fail('Masih ada tender berjalan.');
  if (!t.offer) return fail('Tidak ada tawaran tender.');
  const o = t.offer;
  t.active = { ...o, acceptedDay: game.day, dueDay: game.day + o.days, delivered: 0, inTransit: 0, paid: 0 };
  t.offer = null;
  if (t.auto) runTenderAuto(game);
  return { ok: true, dueDay: t.active?.dueDay ?? game.day };
}

export function declineTender(game) {
  const t = st(game);
  if (!t.offer) return fail('Tidak ada tawaran tender.');
  t.offer = null;
  t.next = game.day + tcfg(game).everyDays;
  return { ok: true };
}

export function setTenderAuto(game, on) {
  const t = st(game);
  t.auto = !!on;
  if (t.auto) runTenderAuto(game);
  return { ok: true, auto: t.auto };
}

/**
 * Send every idle truck (biggest first, keeping `reserveWorkers` workers free) to the port with a tender load.
 * `auto` trips skip the summary event. Returns {ok, trips, tons} or {ok:false, reason}.
 */
export function shipTender(game, { auto = false } = {}) {
  const t = st(game), a = t.active, c = tcfg(game);
  if (!a) return fail('Tidak ada tender berjalan.');
  const city = game.idx.cities.get(a.cityId);
  if (!city || !routeOf(game, city)) return fail('Pelabuhan tidak terjangkau dari ladangmu.');
  let trips = 0, tons = 0, reason = null;
  for (const m of trucks(game, { idle: true })) {
    const free = game.state.workers.filter((w) => !w.busy).length;
    if (free <= c.reserveWorkers) { reason ||= `Sisakan ${c.reserveWorkers} pekerja untuk ladang.`; break; }
    const qty = round2(Math.min(truckStats(game, m).capacity, toSend(a), sellableStock(game, a.productId)));
    if (!(qty >= 0.01)) { reason ||= toSend(a) > 0 ? 'Stok di silo habis.' : 'Semua sisa sudah di jalan.'; break; }
    const r = shipToCity(game, m.uid, city.id, { [a.productId]: qty }, { auto: true, tender: a.id });
    if (!r.ok) { reason ||= r.reason; break; }
    a.inTransit = round2(a.inTransit + qty);
    trips++; tons = round2(tons + qty);
  }
  if (!trips) return fail(reason || 'Tidak ada truk bebas.');
  if (!auto) game.emit('tender_ship', `🚢 ${trips} truk berangkat ke ${city.name} membawa ${fmtNum(tons)} t untuk tender.`, { trips, tons });
  return { ok: true, trips, tons };
}

/** Hourly (Game.advance, before the Manajer Logistik): auto-send idle trucks while the tender runs. */
export function runTenderAuto(game) {
  const t = game.state.tenders;
  if (!t?.active || !t.auto || toSend(t.active) <= 0) return;
  shipTender(game, { auto: true });
}

/** logistics.arrive hook: a tender load reached the port. Returns true when handled (else it sells normally). */
export function receiveTender(game, trip) {
  const a = game.state.tenders?.active;
  if (!a || a.id !== trip.tender) return false;
  const qty = round2(trip.cargo?.[a.productId] || 0);
  a.inTransit = Math.max(0, round2(a.inTransit - qty));
  const use = round2(Math.min(qty, Math.max(0, a.qty - a.delivered)));
  trip.sold = true;
  trip.value = round2(use * a.price);
  deliverChunk(game, a, use, 'tiba di pelabuhan');
  return true;
}

/** Coarse offline day (trucks are frozen there): with auto-send, the fleet's daily haul × `eff`, fuel paid in cash. */
export function coarseTenderDay(game, eff) {
  const t = game.state.tenders, a = t?.active;
  if (!a || !t.auto) return;
  const city = game.idx.cities.get(a.cityId);
  const fleet = fleetPerDay(game, city);
  let qty = round2(Math.min(fleet.tons * eff, toSend(a), sellableStock(game, a.productId)));
  if (!(qty > 0)) return;
  const fuel = round2(qty * fleet.fuelPerTon);
  if (fuel > game.state.money) qty = round2(qty * game.state.money / fuel);
  if (!(qty > 0)) return;
  if (!game.spend(round2(qty * fleet.fuelPerTon), 'transportasi')) return;
  takeStock(game, a.productId, qty);
  deliverChunk(game, a, qty, 'terkirim (mode hemat)');
}

/** Pasar › Kontrak card. */
export function tenderView(game) {
  const s = game.state, c = tcfg(game), t = st(game);
  const one = (x, active) => {
    if (!x) return null;
    const p = game.idx.products.get(x.productId) || { name: x.productId, emoji: '' };
    const city = game.idx.cities.get(x.cityId), dest = destOf(game, x.destId);
    const route = city && routeOf(game, city), fleet = fleetPerDay(game, city), stage = portStage(game, x.cityId);
    const value = round2(x.qty * x.price), delivered = x.delivered || 0, inTransit = x.inTransit || 0;
    const daysLeft = active ? x.dueDay - game.day : x.expiresDay - game.day;
    const rest = Math.max(0, x.qty - delivered);
    const idle = trucks(game, { idle: true }).length;
    return {
      id: x.id, productId: x.productId, name: p.name, emoji: p.emoji, destId: x.destId, destName: dest.name, destEmoji: dest.emoji,
      trophy: dest.trophy, won: t.trophies[x.destId]?.count || 0, cityId: x.cityId, cityName: city?.name ?? x.cityId,
      cityEmoji: city?.emoji ?? '⚓', km: route?.km ?? 0, qty: x.qty, delivered, inTransit, remaining: round2(rest),
      toSend: active ? toSend(x) : x.qty, progress: x.qty ? Math.min(1, delivered / x.qty) : 0,
      transitFrac: x.qty ? Math.min(1, (delivered + inTransit) / x.qty) : 0, price: x.price, value,
      paid: x.paid || 0, bonus: round2(value * c.premium * (1 + c.portPremiumPerStage * stage)), rp: c.rp,
      penalty: round2(rest * x.price * c.penaltyRate), days: x.days, daysLeft, dueDay: x.dueDay ?? null,
      stock: sellableStock(game, x.productId), portStage: stage, portLoadPerDay: round2(x.qty * c.portLoadPerStage * stage),
      fleetPerDay: Math.round(fleet.tons), trucks: fleet.trucks, idleTrucks: idle,
      perDayNeeded: active && daysLeft >= 0 ? Math.ceil(rest / Math.max(1, daysLeft + 1)) : Math.ceil(x.qty / Math.max(1, x.days)),
      onRoad: active ? shipments(game).filter((sh) => sh.tender === x.id && !sh.sold).length : 0, // loaded, not yet at the port
    };
  };
  const trophies = c.destinations.map((d) => ({ ...d, count: t.trophies[d.id]?.count || 0, firstDay: t.trophies[d.id]?.firstDay ?? null }));
  return { unlocked: s.level >= c.unlockLevel, unlockLevel: c.unlockLevel, level: s.level, auto: t.auto,
    next: t.next, daysToNext: t.next != null ? Math.max(0, t.next - game.day) : null,
    offer: one(t.offer, false), active: one(t.active, true), done: t.done, failed: t.failed,
    history: [...t.history].reverse().map((h) => ({ ...h, destName: destOf(game, h.destId).name, destEmoji: destOf(game, h.destId).emoji,
      name: game.idx.products.get(h.productId)?.name ?? h.productId, emoji: game.idx.products.get(h.productId)?.emoji ?? '' })),
    trophies };
}
