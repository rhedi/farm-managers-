// Pasar → 🚚 Pengiriman (feature 6): pick a truck, a city and the cargo; live estimate vs selling locally;
// active trips with progress. Engine: game.trucksView / citiesView / estimateShipment / shipToCity / shipmentsView.
import { h, fmtMoney, fmtPrice, fmtNum, fmtHours, progressBar } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { app, act } from './app.js';
import { iconOf } from './fishArt.js';

const pick = { truck: null, city: null };
const cargo = new Map(); // productId → typed qty (survives re-render)
// At 5× trucks leave and come back several times a second: while trips run, the in-transit list keeps its tallest
// height, so the form below it doesn't jump with every departure/return.
let tripsMinH = 0;
function holdTripsHeight() {
  const el = document.querySelector('#view .ship-trips');
  if (!el || el.offsetHeight <= tripsMinH) return;
  tripsMinH = el.offsetHeight;
  el.style.minHeight = `${tripsMinH}px`;
}

const pctTxt = (m) => `${m >= 1 ? '+' : '−'}${fmtNum(Math.abs(m - 1) * 100)}%`;

function chooseDefaults(trucks, cities) {
  const free = trucks.filter((t) => !t.busy);
  if (!trucks.some((t) => t.uid === pick.truck && !t.busy)) pick.truck = free[0]?.uid ?? null;
  const open = cities.filter((c) => c.unlocked && c.reachable);
  if (!open.some((c) => c.id === pick.city)) pick.city = open[0]?.id ?? null;
}

function truckChoice(t) {
  return h(`button.choice.ship-choice${t.uid === pick.truck ? '.selected' : ''}`, {
    type: 'button', disabled: !!t.busy, onclick: () => { pick.truck = t.uid; app.requestRender(); },
  }, h('b', `🚚 ${t.name}`),
  h('span.small.muted', `${fmtNum(t.capacity, 1)} t · ${fmtNum(t.speedKmh)} km/jam · ${fmtNum(t.fuelPerKm, 2)} L/km${t.busy ? ' · di jalan' : ''}`));
}

function cityChoice(c, truck) {
  const ok = c.unlocked && c.reachable;
  const trip = ok && truck ? ` · ⏱️ ${fmtHours(2 * c.km / truck.speedKmh)} pp` : '';
  const why = !c.unlocked ? `🔒 Level ${c.unlockLevel}` : !c.reachable ? `Butuh ladang di ${c.fromRegions.join(' / ')}` : null;
  const top = c.demand.filter((d) => d.mult > 1).slice(0, 4);
  return h(`button.choice.ship-choice${c.id === pick.city ? '.selected' : ''}`, {
    type: 'button', disabled: !ok, onclick: () => { pick.city = c.id; app.requestRender(); },
  }, h('b', `${c.emoji} ${c.name}`, h('span.small.muted', ok ? ` ${fmtNum(c.km)} km dari ${c.regionName}${trip}` : ` ${why}`)),
  h('span.ship-demand',
    h('span.badge', `Lainnya ${pctTxt(c.baseMult)}`),
    top.map((d) => h('span.badge.badge-gold', iconOf({ id: d.productId, emoji: d.emoji }), ` ${pctTxt(d.mult)}`))));
}

/** Silo stock that can go on the truck, best city price first. */
function cargoRows(game, city) {
  const prices = new Map(city ? game.citiesView().find((c) => c.id === city)?.demand.map((d) => [d.productId, d.mult]) ?? [] : []);
  const base = city ? game.citiesView().find((c) => c.id === city)?.baseMult ?? 1 : 1;
  return game.marketView().filter((p) => p.stock - (p.reserve || 0) > 0)
    .map((p) => ({ ...p, avail: p.stock - (p.reserve || 0), mult: prices.get(p.id) ?? base }))
    .sort((a, b) => b.mult - a.mult || b.avail * b.price - a.avail * a.price);
}

function cargoRow(p, cap) {
  const max = p.unit === 't' ? Math.min(p.avail, cap) : p.avail;
  return h('div.ship-cargo-row',
    h('span.ship-cargo-name', iconOf(p), ` ${p.name}`,
      h('span.small.muted', ` ${fmtAmt(p.avail, p.unit)} · ${fmtPrice(p.price)}→`),
      h(`span.small${p.mult > 1 ? '.pos' : p.mult < 1 ? '.neg' : '.muted'}`, `${fmtPrice(p.price * p.mult)} (${pctTxt(p.mult)})`)),
    h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: p.unit, value: cargo.get(p.id) ?? '',
      'aria-label': `Muatan ${p.name}`, oninput: (e) => { cargo.set(p.id, e.target.value); refreshEstimate(); } }),
    h('button.btn.btn-small', { type: 'button', onclick: () => { cargo.set(p.id, String(Math.floor(max * 100) / 100)); app.requestRender(); } }, 'Maks'));
}

const cargoObj = () => Object.fromEntries([...cargo].filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));

function estimateBox(game) {
  if (!pick.truck || !pick.city) return h('div.ship-estimate');
  const e = game.estimateShipment(pick.truck, pick.city, cargoObj());
  const load = e.capacity ? Math.min(1, e.tons / e.capacity) : 0;
  const rows = [
    ['Muatan', `${fmtNum(e.tons ?? 0, 2)} / ${fmtNum(e.capacity ?? 0, 1)} t`],
    ['Waktu pulang-pergi', fmtHours(e.hours ?? 0)],
    ['Jual di kota', fmtMoney(e.value ?? 0)],
    ['Jual di pasar lokal', fmtMoney(e.localValue ?? 0)],
    ['Selisih harga', fmtMoney(e.gain ?? 0)],
    ['BBM (dibayar sekarang)', `−${fmtMoney(e.fuelCost ?? 0)}`],
    ['Gaji sopir + aus truk', `−${fmtMoney((e.wageCost ?? 0) + (e.wearCost ?? 0))}`],
  ];
  const profit = e.profit ?? 0;
  return h('div.ship-estimate',
    progressBar(load, load > 1 ? 'thin.ops-red' : 'thin'),
    h('div.kv', rows.flatMap(([k, v]) => [h('span', k), h('span.num', v)]),
      h('span', h('b', 'Untung vs jual lokal')), h(`span.num.${profit > 0 ? 'pos' : 'neg'}`, h('b', fmtMoney(profit)))),
    h('div.card-actions',
      h('span.small.muted', e.ok ? `Sopir: ${e.workerName}` : `⚠️ ${e.reason}`),
      h('span.spacer'),
      h('button.btn.btn-primary.ship-send', { disabled: !e.ok, onclick: send }, '🚚 Kirim')));
}

function send() {
  const r = app.game.shipToCity(pick.truck, pick.city, cargoObj());
  if (r.ok) cargo.clear();
  act(r, (x) => `🚚 Truk berangkat (${fmtHours(x.hours)}, BBM ${fmtMoney(x.fuelCost)}).`);
}

/** Re-render only the estimate while typing (keeps input focus). */
function refreshEstimate() {
  const box = document.querySelector('.ship-estimate');
  if (box) box.replaceWith(estimateBox(app.game));
}

function tripCard(t) {
  const items = t.cargo.map((c) => `${c.emoji} ${fmtAmt(c.qty, c.unit)}`).join(' · ');
  return h('div.card.ship-trip',
    h('div.card-head',
      h('div.card-icon', t.cityEmoji),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.card-title', `${t.truckName} → ${t.cityName}`),
        h('div.card-sub', `${t.workerName ?? 'Sopir'} · ${fmtNum(t.km)} km · ${items}`)),
      h(`span.badge.${t.sold ? 'badge-green' : 'badge-blue'}`, t.sold ? 'Pulang' : 'Berangkat')),
    progressBar(t.progress, 'blue'),
    h('div.small.muted', t.sold ? `Terjual ${fmtMoney(t.value)} · tiba di garasi ${fmtHours(t.hoursLeft)} lagi`
      : `Perkiraan ${fmtMoney(t.estValue)} · tiba di kota ${fmtHours(Math.max(0, t.hours / 2 - t.done))} lagi`));
}

export function shippingPanel() {
  const game = app.game;
  if (!game.trucksView) return null;
  const trucks = game.trucksView(), cities = game.citiesView(), trips = game.shipmentsView();
  if (!trips.length) tripsMinH = 0;
  else requestAnimationFrame(holdTripsHeight);
  chooseDefaults(trucks, cities);
  const truck = trucks.find((t) => t.uid === pick.truck);
  const title = h('div.section-title', '🚚 Pengiriman', h('span.spacer'), h('span.small.muted', `${trips.length} di jalan`));
  if (!trucks.length) {
    return h('section.section.ship', title,
      h('p.small.muted', 'Beli truk di Garasi untuk menjual hasil ke kota dengan harga lebih tinggi. Untung jika selisih harga melebihi BBM dan waktu perjalanan.'));
  }
  const rows = cargoRows(game, pick.city);
  const open = cities.filter((c) => c.unlocked && c.reachable), closed = cities.filter((c) => !(c.unlocked && c.reachable));
  return h('section.section.ship', title,
    trips.length ? h('div.cards.ship-trips', { style: tripsMinH ? { minHeight: `${tripsMinH}px` } : null }, trips.map(tripCard)) : null,
    h('div.card.ship-form',
      h('div.small.muted', '1. Truk'), h('div.choice-list', trucks.map(truckChoice)),
      h('div.small.muted.eco-subtitle', '2. Kota tujuan'),
      h('div.choice-list', open.map((c) => cityChoice(c, truck))),
      closed.length ? h('details.ship-more', h('summary.small.muted', `Kota lain (${closed.length}) — butuh level atau ladang di wilayahnya`),
        h('div.choice-list', closed.map((c) => cityChoice(c, truck)))) : null,
      h('div.small.muted.eco-subtitle', '3. Muatan (kapasitas dihitung dari produk ton; susu, telur & barang kg ikut tanpa memakan kapasitas)'),
      rows.length ? h('div.ship-cargo', rows.map((p) => cargoRow(p, truck?.capacity ?? 0)))
        : h('p.small.muted', 'Gudang kosong.'),
      estimateBox(game)));
}

/** Render signature for the panel. */
export function shippingSig(game) {
  if (!game.trucksView) return '';
  return `${pick.truck}|${pick.city}|${game.trucksView().map((t) => `${t.uid}:${t.busy}`).join(',')}|`
    + game.shipmentsView().map((t) => `${t.id}:${Math.round(t.progress * 50)}:${t.sold}`).join(',');
}
