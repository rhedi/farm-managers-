// Manajer Logistik: a hired staff member (not a field worker) who sends idle trucks with silo stock to the city
// that pays the most over selling locally. Runs every game hour and after tasks/trips finish (Game.advance),
// deterministic (no RNG), and only through the normal shipToCity path (fuel, driver, wear, sale on arrival).
// state.dispatcher = { hired: null | {tierId, hiredDay}, on, settings, held:{productId: qty}, seen:{productId: qty},
//   stats:{trips, extraProfit, value}, today:{day, trips, profit}, recent:[≤ RECENT], note,
//   shipped:{productId: {time, day, hour, cityId, qty, value}} }
// `held`/`seen`: the "sisakan X%" ledger: X% of every stock increase the manager sees stays in the silo.
// `shipped`: the manager's latest load per product (qty/value summed over that game day), so the Gudang and Pasar › Jual
// can say where stock went that left the hour it was produced (animal goods at midnight); see autoShippedView.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { keptStock, freeStock } from './stockKeep.js';
import { planShipment, shipToCity, routeOf, truckStats, shipments, cityMult } from './logistics.js';
import { conditionOf, BREAKDOWN_BELOW } from './wear.js';
import { staffCfg, staffTier, staffWage, hireStaff, staffSwapCost, replaceStaff, fireStaff, payStaffDay, staffCandidates } from './staff.js';

export const GROUPS = ['crop', 'animal', 'processed'];
export const RECENT = 6;
/** Stepper values offered by the UI (the engine accepts any value inside the limits). */
export const STEPS = {
  minProfit: [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2500, 5000],
  minMargin: [0, 2, 3, 5, 8, 10, 15, 20, 30],
  keepPct: [0, 10, 25, 50, 75, 90],
};
const LIMITS = { minProfit: [0, 1e6], minMargin: [0, 100], keepPct: [0, 90], reserveWorkers: [0, 20], maxTrucks: [0, 50] };
export const defaultSettings = () => ({ groups: { crop: true, animal: true, processed: true }, exclude: [], keepPct: {},
  minProfit: 100, minMargin: 3, blockedCities: [], reserveWorkers: 1, maxTrucks: 0 });

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const floor2 = (v) => Math.floor(v * 100 + 1e-6) / 100;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Number(v) || 0));
/** Staff role for js/engine/staff.js (shared hire / replace / fire with the Manajer Pabrik). */
const ROLE = { key: 'dispatcher', cfg: 'dispatcher', label: 'manajer logistik', Title: 'Manajer Logistik', icon: '🧑‍💼',
  event: 'dispatcher', fireNote: 'Truk yang sedang jalan tetap pulang.', run: (game) => runDispatcher(game) };
const cfg = (game) => staffCfg(game, ROLE);
export const tierOf = (game, id) => staffTier(game, ROLE, id);
const st = (game) => game.state.dispatcher;
const tripCount = (game) => shipments(game).filter((t) => t.auto).length;

/** Trucks the manager may keep on the road: its tier's `trucks`, lowered by the "maks. truk" setting (0 = no extra cap). */
const truckLimit = (game, tier) => Math.min(tier.trucks ?? Infinity, st(game).settings.maxTrucks || Infinity);

/** Daily wage of the hired manager after the research perk 'wages' (0 when nobody is hired). */
export const dispatcherWage = (game) => staffWage(game, ROLE);

/** createGame / load migration: absent = not hired, default settings; unknown ids are dropped. */
export function ensureDispatcher(game) {
  const s = game.state;
  const d = s.dispatcher = { hired: null, on: true, settings: {}, held: {}, seen: {}, stats: {}, today: {}, recent: [], note: '', ...(s.dispatcher || {}) };
  if (d.hired && !tierOf(game, d.hired.tierId)) d.hired = null;
  d.settings = sanitize(game, { ...defaultSettings(), ...d.settings, groups: { ...defaultSettings().groups, ...(d.settings.groups || {}) } });
  d.stats = { trips: 0, extraProfit: 0, value: 0, ...d.stats };
  d.today = { day: game.day, trips: 0, profit: 0, ...d.today };
  d.held ||= {}; d.seen ||= {};
  for (const k of ['held', 'seen']) for (const id of Object.keys(d[k])) if (!d.settings.keepPct[id]) delete d[k][id];
  d.recent = (d.recent || []).slice(0, RECENT);
  const backfill = !d.shipped; // saves before `shipped`: rebuilt from the recent loads (oldest first, newest wins)
  const shipped = {};
  for (const [id, x] of Object.entries(d.shipped || {})) {
    if (game.idx.products.has(id) && x && Number.isFinite(x.time) && x.qty > 0) shipped[id] = { time: x.time, day: x.day, hour: x.hour,
      cityId: game.idx.cities.has(x.cityId) ? x.cityId : null, qty: round2(x.qty), value: round2(x.value || 0) };
  }
  d.shipped = shipped;
  if (backfill) for (const r of [...d.recent].reverse()) noteShipped(game, r.cargo, r.cityId, (r.day - 1) * 24 + (r.hour ?? 0), null);
}

/** Add one manager load to `shipped` (`items`: planShipment items with values, or null → market × city price). */
function noteShipped(game, cargo, cityId, time, items) {
  const d = st(game), city = game.idx.cities.get(cityId);
  const day = Math.floor(time / 24) + 1, hour = Math.floor(time - (day - 1) * 24);
  for (const [id, qty] of Object.entries(cargo || {})) {
    if (!game.idx.products.has(id) || !(qty > 0)) continue;
    const it = items?.find((i) => i.productId === id);
    const value = it ? it.value : city ? qty * (game.state.market[id] ?? 0) * cityMult(game, city, id) : 0;
    const prev = d.shipped[id], same = prev?.day === day;
    d.shipped[id] = { time, day, hour, cityId: city ? cityId : null,
      qty: round2((same ? prev.qty : 0) + qty), value: round2((same ? prev.value : 0) + value) };
  }
}

function sanitize(game, x) {
  const products = game.idx.products, cities = game.idx.cities;
  const keepPct = {};
  for (const [id, v] of Object.entries(x.keepPct || {})) {
    const pct = Math.round(clamp(v, LIMITS.keepPct));
    if (products.has(id) && pct > 0) keepPct[id] = pct;
  }
  return {
    groups: Object.fromEntries(GROUPS.map((g) => [g, x.groups?.[g] !== false])),
    exclude: [...new Set((x.exclude || []).filter((id) => products.has(id)))].sort(),
    keepPct,
    minProfit: round2(clamp(x.minProfit, LIMITS.minProfit)),
    minMargin: round2(clamp(x.minMargin, LIMITS.minMargin)),
    blockedCities: [...new Set((x.blockedCities || []).filter((id) => cities.has(id)))].sort(),
    reserveWorkers: Math.round(clamp(x.reserveWorkers, LIMITS.reserveWorkers)),
    maxTrucks: Math.round(clamp(x.maxTrucks, LIMITS.maxTrucks)),
  };
}

export const hireDispatcher = (game, tierId) => hireStaff(game, ROLE, tierId);

/** Price of switching the hired manager to `t`: its hireCost − tradeIn × the current tier's hireCost, never < 0. */
export const swapCost = (game, t) => staffSwapCost(game, ROLE, t);

/**
 * Promote / replace the hired manager with another tier (up or down). Pays swapCost (ledger 'gaji'); settings, stats,
 * recent dispatches, aktif/jeda and trips on the road stay; the new truck limit, radius and negotiation apply from the
 * next planning pass (run at once when aktif). Trips already on the road keep the bonus they left with.
 */
export const replaceDispatcher = (game, tierId) => replaceStaff(game, ROLE, tierId);

export const fireDispatcher = (game) => fireStaff(game, ROLE);

/** Aktif/jeda. Turning it on plans at once. */
export function setDispatcherOn(game, on) {
  const d = st(game);
  if (!d.hired) return fail('Belum ada manajer logistik.');
  d.on = !!on;
  d.note = '';
  if (d.on) runDispatcher(game);
  return ok({ on: d.on });
}

/** Partial update (`groups` merges per key); values are clamped. A changed "sisakan %" restarts its ledger. */
export function setDispatcherSettings(game, patch = {}) {
  const d = st(game), old = d.settings;
  const next = sanitize(game, { ...old, ...patch, groups: { ...old.groups, ...(patch.groups || {}) } });
  for (const id of new Set([...Object.keys(old.keepPct), ...Object.keys(next.keepPct)])) {
    if (old.keepPct[id] === next.keepPct[id]) continue;
    const stock = game.state.silo[id] || 0;
    if (next.keepPct[id]) { d.held[id] = round2(stock * next.keepPct[id] / 100); d.seen[id] = stock; } else { delete d.held[id]; delete d.seen[id]; }
  }
  d.settings = next;
  if (d.hired && d.on) runDispatcher(game);
  return ok({ settings: structuredClone(next) });
}

/** "Sisakan X%": X% of every increase since the last look stays held; selling shrinks the hold with the stock. */
function updateHeld(game) {
  const d = st(game), silo = game.state.silo;
  for (const [id, pct] of Object.entries(d.settings.keepPct)) {
    const stock = silo[id] || 0;
    const inc = Math.max(0, stock - (d.seen[id] ?? 0));
    d.held[id] = round2(Math.min(stock, (d.held[id] || 0) + inc * pct / 100));
    d.seen[id] = stock;
  }
}

/**
 * Stock the manager may load: silo − kept stock (js/engine/stockKeep.js: feed reserve / auto-feed, active contracts,
 * the Manajer Pabrik hold of one planning interval) − "sisakan %", allowed groups/products only.
 */
export function dispatchableStock(game) {
  const s = game.state, set = st(game).settings, kept = keptStock(game, { factoryHours: 0 });
  updateHeld(game);
  const out = new Map();
  for (const id of Object.keys(s.silo).sort()) {
    const p = game.idx.products.get(id);
    if (!p || !set.groups[p.category ?? 'crop'] || set.exclude.includes(id) || !(s.market[id] > 0)) continue;
    const q = floor2(freeStock(game, id, kept) - (st(game).held[id] || 0));
    if (q > 0) out.set(id, q);
  }
  return out;
}

/**
 * Greedy load for one city: only goods that sell above market there; ton goods by best gain per ton until the truck
 * is full (divisible goods, fixed trip cost ⇒ greedy is optimal), kg/L/pcs goods ride along in full.
 */
function fillCargo(game, city, stock, capacity, bonus) {
  const s = game.state, tons = [], cargo = {};
  for (const [id, qty] of stock) {
    const gain = (s.market[id] ?? 0) * (cityMult(game, city, id, bonus) - 1);
    if (gain <= 1e-9) continue;
    if (game.idx.products.get(id).unit === 't') tons.push({ id, qty, gain });
    else cargo[id] = qty;
  }
  tons.sort((a, b) => b.gain - a.gain || (a.id < b.id ? -1 : 1));
  let room = floor2(capacity);
  for (const x of tons) {
    if (room <= 0) break;
    const q = floor2(Math.min(x.qty, room));
    if (q > 0) { cargo[x.id] = q; room = floor2(room - q); }
  }
  return Object.keys(cargo).length ? cargo : null;
}

/** Best city for one truck: highest estimated profit (city − local − fuel − driver − wear) that passes the minimums. */
function bestTrip(game, m, tier, stock) {
  const s = game.state, set = st(game).settings, truck = truckStats(game, m);
  let best = null;
  for (const city of game.data.CITIES ?? []) {
    if ((city.unlockLevel ?? 1) > s.level || set.blockedCities.includes(city.id)) continue;
    const route = routeOf(game, city);
    if (!route || route.km > tier.radiusKm) continue;
    const cargo = fillCargo(game, city, stock, truck.capacity, tier.bonus);
    if (!cargo) continue;
    const plan = planShipment(game, m.uid, city.id, cargo, { bonus: tier.bonus });
    if (!plan.ok || plan.profit < set.minProfit || plan.profit < plan.localValue * set.minMargin / 100) continue;
    if (!best || plan.profit > best.plan.profit + 1e-9) best = { city, cargo, plan };
  }
  return best;
}

const cargoText = (game, cargo) => Object.entries(cargo).map(([id, q]) => {
  const p = game.idx.products.get(id);
  if (!p) return `${fmtNum(q, 1)} ${id}`;
  return `${p.emoji} ${fmtNum(q, p.unit === 't' ? 1 : 0)} ${p.unit}`;
}).join(', ');

/**
 * One planning pass: every idle truck (biggest first, condition ≥ breakdown limit) with a driver to spare gets the
 * most profitable trip, if any passes the minimums. Stock leaves the silo at dispatch, so the next truck never
 * plans the same goods. Returns the trips sent [{shipmentId, truckUid, cityId, cargo, estProfit}].
 */
export function runDispatcher(game) {
  const d = st(game);
  if (!d?.hired || !d.on) return [];
  const s = game.state, set = d.settings, tier = tierOf(game, d.hired.tierId);
  const trucks = s.machines.filter((m) => !m.busy && truckStats(game, m))
    .sort((a, b) => truckStats(game, b).capacity - truckStats(game, a).capacity || (a.uid < b.uid ? -1 : 1));
  const usable = trucks.filter((m) => conditionOf(m) >= (game.data.BALANCE.wear?.breakdownBelow ?? BREAKDOWN_BELOW));
  const sent = [];
  let note = !s.machines.some((m) => truckStats(game, m)) ? 'Belum punya truk. Beli di Garasi › Toko.'
    : !trucks.length ? 'Semua truk sedang di jalan.'
      : !usable.length ? 'Truk yang bebas hampir rusak (<20%). Perbaiki di Garasi.' : '';
  const limit = truckLimit(game, tier);
  for (const m of usable) {
    if (tripCount(game) >= limit) { note = `Semua ${limit} truk jatah manajer sedang di jalan.`; break; }
    const free = s.workers.filter((w) => !w.busy).length;
    if (free <= set.reserveWorkers) {
      note = free ? `Menunggu sopir: ${free} pekerja bebas disisakan untuk ladang.` : 'Menunggu sopir: tidak ada pekerja bebas.';
      break;
    }
    const stock = dispatchableStock(game);
    if (!stock.size) { note = 'Tidak ada stok yang boleh dikirim.'; break; }
    const best = bestTrip(game, m, tier, stock);
    if (!best) { note ||= 'Belum ada kiriman yang memenuhi untung minimum.'; continue; }
    const r = shipToCity(game, m.uid, best.city.id, best.cargo, { auto: true, bonus: tier.bonus });
    if (!r.ok) { note = r.reason; continue; }
    note = '';
    record(game, m, best, r.id);
    sent.push({ shipmentId: r.id, truckUid: m.uid, cityId: best.city.id, cargo: best.cargo, estProfit: best.plan.profit });
  }
  if (sent.length && note === 'Belum ada kiriman yang memenuhi untung minimum.') note = '';
  d.note = note;
  if (sent.length) updateHeld(game); // the manager's own loads are not "new stock"
  return sent;
}

function record(game, m, best, shipmentId) {
  const d = st(game), { city, cargo, plan } = best, tier = tierOf(game, d.hired.tierId);
  const truckName = game.idx.machines.get(m.defId)?.name ?? m.uid;
  if (d.today.day !== game.day) d.today = { day: game.day, trips: 0, profit: 0 };
  d.today.trips++;
  d.today.profit = round2(d.today.profit + plan.profit);
  d.stats.trips++;
  d.stats.extraProfit = round2(d.stats.extraProfit + plan.profit);
  d.stats.value = round2(d.stats.value + plan.value);
  d.recent.unshift({ day: game.day, hour: game.hour, shipmentId, truckUid: m.uid, truckName, cityId: city.id, cargo,
    tons: plan.tons, value: plan.value, estProfit: plan.profit });
  d.recent.length = Math.min(d.recent.length, RECENT);
  noteShipped(game, cargo, city.id, game.state.time, plan.items);
  game.emit('auto_dispatch', `🧑‍💼 ${tier.name} mengirim ${truckName} ke ${city.name}: ${cargoText(game, cargo)} · perkiraan untung ${fmtMoney(plan.profit)}.`,
    { truck: m.uid, truckName, city: city.id, cityName: city.name, cargo, estProfit: plan.profit, shipmentId });
}

/** Daily rollover: the manager's wage (ledger 'gaji'); a shortfall goes to the loan. */
export function stepDispatcherDay(game) {
  const d = st(game);
  if (d.today.day !== game.day) d.today = { day: game.day, trips: 0, profit: 0 };
  payStaffDay(game, ROLE);
}

/** Everything the Pasar › Kirim card and Garasi › Pekerja need. */
export function dispatcherView(game) {
  const s = game.state, d = st(game), set = d.settings;
  const tiers = cfg(game).tiers;
  const hiredTier = d.hired ? tierOf(game, d.hired.tierId) : null;
  const tierView = (t) => ({ id: t.id, name: t.name, title: t.title, emoji: t.emoji, stars: t.skill, unlockLevel: t.unlockLevel,
    hireCost: t.hireCost, wage: t.wage, trucks: t.trucks, radiusKm: t.radiusKm, bonus: t.bonus });
  const candidates = staffCandidates(game, ROLE, tierView);
  const radius = hiredTier?.radiusKm ?? Math.max(0, ...tiers.map((t) => t.radiusKm));
  const cities = (game.data.CITIES ?? []).filter((c) => (c.unlockLevel ?? 1) <= s.level && routeOf(game, c)).map((c) => {
    const km = routeOf(game, c).km;
    return { id: c.id, name: c.name, emoji: c.emoji, km, allowed: !set.blockedCities.includes(c.id), inRange: km <= radius };
  });
  // Products the manager shipped in the last 10 game days stay listed (✓ Kirim / 🚫 Tidak) even at 0 stock: animal
  // goods leave the hour they are produced, so a stock-only list never showed them.
  const shippedIds = Object.keys(d.shipped).filter((id) => s.time - d.shipped[id].time <= 240);
  const ids = new Set([...Object.keys(s.silo).filter((id) => s.silo[id] > 0), ...set.exclude, ...Object.keys(set.keepPct), ...shippedIds]);
  const products = [...ids].map((id) => game.idx.products.get(id)).filter(Boolean).map((p) => ({
    id: p.id, name: p.name, emoji: p.emoji, unit: p.unit, category: p.category ?? 'crop', qty: s.silo[p.id] || 0,
    excluded: set.exclude.includes(p.id), keepPct: set.keepPct[p.id] || 0, held: d.held[p.id] || 0,
    groupOn: set.groups[p.category ?? 'crop'] })).sort((a, b) => GROUPS.indexOf(a.category) - GROUPS.indexOf(b.category) || a.name.localeCompare(b.name));
  const today = d.today.day === game.day ? d.today : { trips: 0, profit: 0 };
  const sellPlans = Object.values(s.fields).filter((f) => f.plan?.sell).length;
  return {
    unlockLevel: Math.min(...tiers.map((t) => t.unlockLevel)), level: s.level,
    hired: hiredTier ? { ...tierView(hiredTier), hiredDay: d.hired.hiredDay, wagePaid: dispatcherWage(game) } : null,
    tradeIn: cfg(game).tradeIn ?? 0.5,
    on: d.on, note: d.note, candidates, settings: structuredClone(set), steps: STEPS,
    stats: { ...d.stats }, today: { trips: today.trips, profit: today.profit }, onRoad: tripCount(game),
    recent: d.recent.map((r) => {
      const c = game.idx.cities.get(r.cityId);
      return { ...r, cityName: c?.name ?? r.cityId, cityEmoji: c?.emoji ?? '🏙️', cargoText: cargoText(game, r.cargo) };
    }),
    trucks: s.machines.filter((m) => truckStats(game, m)).length, workers: s.workers.length, cities, products, sellPlans,
  };
}

/** How long a manager load stays listed in the Gudang / Pasar › Jual (game hours). */
export const SHIPPED_HOURS = 48;

/**
 * Products the hired Manajer Logistik loaded in the last `hours`, newest first: where the stock went (city, qty and city
 * value summed over that game day) and whether new stock is now kept (`excluded`, or its group switched off).
 */
export function autoShippedView(game, { hours = SHIPPED_HOURS } = {}) {
  const s = game.state, d = st(game);
  if (!d?.hired) return [];
  return Object.entries(d.shipped).filter(([, x]) => s.time - x.time <= hours).sort(([a, x], [b, y]) => y.time - x.time || (a < b ? -1 : 1))
    .map(([id, x]) => {
      const p = game.idx.products.get(id), c = game.idx.cities.get(x.cityId), category = p.category ?? 'crop';
      const excluded = d.settings.exclude.includes(id), groupOn = d.settings.groups[category];
      return { id, name: p.name, emoji: p.emoji, unit: p.unit, category, qty: x.qty, value: x.value, day: x.day, hour: x.hour,
        hoursAgo: Math.max(0, Math.floor(s.time - x.time)), cityId: x.cityId, cityName: c?.name ?? '', cityEmoji: c?.emoji ?? '🏙️',
        stock: s.silo[id] || 0, excluded, groupOn, kept: excluded || !groupOn, on: d.on };
    });
}
