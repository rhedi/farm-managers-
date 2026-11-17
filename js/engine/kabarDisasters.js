// ⚠️ Bencana Besar (Kabar Desa): 1–2 per game year, forecast `forecastDays` ahead with preparation options (default =
// the cautious cheap one, applied at the start). El Niño: one owned region gets no rain for `days` days (Bendungan
// lets some rain through, weather.js) · Krisis Pangan: crop prices × priceMult + extra contract offers · Wabah: the
// biggest herd loses `loss` unless vaccinated/quarantined. Losses are capped at lossCapDays × S.
// state.kabar.disaster = null | { id, type, regionId?, animalId?, startDay, endDay, phase: 'forecast'|'active', choice, ctx, options, def }.
import { round2 } from './rng.js';
import { clampPrice } from './market.js';
import { makeOffer, contractConfig } from './contracts.js';
import { kcfg, fmt, rngFor, draw, pick, pctText, daysCash, xpReward, scale, pay, herds, loseHeads, effect } from './kabarCore.js';
import { projectPerk } from './projects.js';

export const DISASTERS = {
  elnino: { name: 'El Niño', emoji: '🔥' }, krisis: { name: 'Krisis Pangan', emoji: '🌾' }, wabah: { name: 'Wabah Ternak', emoji: '🦠' },
};
const opt = (id, label, desc, cost = 0) => ({ id, label, desc, cost });
const dcfg = (game) => kcfg(game).disasters || {};

function ownedRegionsByFields(game) {
  const n = new Map();
  for (const id of Object.keys(game.state.fields)) { const r = game.idx.fields.get(id)?.regionId; if (r) n.set(r, (n.get(r) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
}

/** Build a forecast disaster for `day` (starts at day + forecastDays) or null when none applies. */
export function makeDisaster(game, day, seq) {
  const C = dcfg(game), r = rngFor(game, `dz|${day}`), start = day + (C.forecastDays ?? 3);
  const kinds = ['krisis'];
  const regions = ownedRegionsByFields(game);
  if (regions.length) kinds.push('elnino');
  const herd = herds(game, () => true, 20)[0];
  if (herd) kinds.push('wabah');
  const type = pick(r, kinds), info = DISASTERS[type];
  const d = { id: `bb${seq}`, type, startDay: start, endDay: start, phase: 'forecast', choice: null, ctx: {} };
  if (type === 'elnino') {
    d.regionId = regions[0];
    d.endDay = start + (C.elnino?.days ?? 10) - 1;
    const dam = projectPerk(game, 'damStage', d.regionId), name = game.idx.regions.get(d.regionId).name;
    d.ctx = { full: daysCash(game, 0.8), half: daysCash(game, 0.25), dam };
    d.text = `${info.emoji} ${info.name}: ${name} tanpa hujan selama ${d.endDay - start + 1} hari mulai hari ${start}${dam ? ' (bendunganmu tetap mengalirkan sebagian air)' : ''}.`;
    d.options = [opt('irigasi', `💧 Irigasi penuh (${fmt(d.ctx.full)})`, 'Ladang tumbuh di wilayah ini tidak kekeringan sama sekali.', d.ctx.full),
      opt('hemat', `🪣 Irigasi bergilir (${fmt(d.ctx.half)})`, 'Separuh hari kering tertolong.', d.ctx.half),
      opt('pasrah', '🙏 Pasrah', 'Gratis. Hasil turun mengikuti hari kering (tanaman tahan kering lebih aman).')];
    d.def = 'hemat';
  } else if (type === 'krisis') {
    d.endDay = start + (C.krisis?.days ?? 6) - 1;
    d.ctx = { mult: C.krisis?.priceMult ?? 1.5, offers: C.krisis?.extraOffers ?? 3, cost: daysCash(game, 0.5), xp: xpReward(game, 0.6) };
    d.text = `${info.emoji} ${info.name}: mulai hari ${start}, harga tanaman ×${d.ctx.mult} selama ${d.endDay - start + 1} hari dan banjir tawaran kontrak.`;
    d.options = [opt('lumbung', `🏚️ Buka lumbung desa (${fmt(d.ctx.cost)})`, `Bantu warga: +${d.ctx.xp} XP, 3 kontrak berikutnya +10%.`, d.ctx.cost),
      opt('dagang', '📈 Fokus berdagang', 'Nikmati harga tinggi saja.')];
    d.def = 'dagang';
  } else {
    d.animalId = herd.id;
    d.ctx = { vaksin: daysCash(game, 1.2), karantina: daysCash(game, 0.3), loss: C.wabah?.loss ?? 0.5,
      cap: round2((C.lossCapDays ?? 3) * scale(game)) };
    d.text = `${info.emoji} ${info.name}: virus mendekati ${herd.def.name} (${herd.h.count} ekor), tiba hari ${start}.`;
    d.options = [opt('vaksin', `💉 Vaksin massal (${fmt(d.ctx.vaksin)})`, 'Tidak ada yang mati; ternak kebal: produksi ternak +5% selama 5 hari.', d.ctx.vaksin),
      opt('karantina', `🚧 Karantina (${fmt(d.ctx.karantina)})`, 'Tidak ada yang mati.', d.ctx.karantina),
      opt('biarkan', '🤞 Biarkan', `Gratis. ${pctText(d.ctx.loss)} ${herd.def.name} mati (kerugian maks. ${fmt(d.ctx.cap)}).`)];
    d.def = 'karantina';
  }
  d.name = info.name; d.emoji = info.emoji;
  return d;
}

/** Start: apply the preparation (choice, else the default; while broke the default costs what cash there is). */
export function startDisaster(game, d) {
  let choice = d.choice;
  if (!choice) {
    const o = d.options.find((x) => x.id === d.def) ?? d.options[d.options.length - 1];
    pay(game, Math.min(o.cost || 0, Math.max(0, game.state.money)));
    choice = o.id;
    d.auto = true;
  }
  d.choice = choice;
  d.phase = 'active';
  let text = '';
  if (d.type === 'krisis') {
    for (const id of game.idx.crops.keys()) { // annual crops and fruit (same set as events.marketEventMult)
      const p = game.idx.products.get(id);
      if (p && game.state.market[id] > 0) game.state.market[id] = clampPrice(p, game.state.market[id] * d.ctx.mult);
    }
    const cfg = contractConfig(game);
    let added = 0;
    for (let i = 0; i < d.ctx.offers; i++) { const c = makeOffer(game, cfg, game.day); if (c) { game.state.contracts.push(c); added++; } }
    if (choice === 'lumbung') {
      game.addXp(d.ctx.xp);
      const k = game.state.kabar;
      k.rep = { left: Math.max(k.rep?.left || 0, 3), pct: Math.max(k.rep?.pct || 0, 0.1) };
    }
    text = `Harga tanaman ×${d.ctx.mult}, ${added} tawaran kontrak baru${choice === 'lumbung' ? `, lumbung dibuka (+${d.ctx.xp} XP)` : ''}.`;
  } else if (d.type === 'wabah') {
    const share = choice === 'biarkan' ? d.ctx.loss : 0;
    const n = loseHeads(game, d.animalId, share, d.ctx.cap);
    if (choice === 'vaksin') effect(game, 'wabah', 'animalProd', 1.05, 5, 'Ternak Kebal', '💉', 'produksi ternak +5%');
    d.lost = n;
    text = n ? `${n} ${game.idx.animals.get(d.animalId)?.name ?? 'ternak'} mati.` : choice === 'vaksin' ? 'Semua ternak selamat dan kebal.' : 'Karantina berhasil, semua ternak selamat.';
  } else text = `${game.idx.regions.get(d.regionId)?.name} mulai kering.`;
  d.startText = text;
  return text;
}

/** El Niño irrigation: today's dry day becomes wet on growing fields (irigasi: every day, hemat: every other day). */
export function stepActiveDisaster(game, d, day) {
  if (d.type !== 'elnino' || d.phase !== 'active' || day > d.endDay + 1) return;
  if (!(d.choice === 'irigasi' || (d.choice === 'hemat' && day % 2 === 0))) return;
  for (const [id, f] of Object.entries(game.state.fields)) {
    if (game.idx.fields.get(id)?.regionId !== d.regionId || f.greenhouse || (f.state !== 'growing' && f.state !== 'orchard')) continue;
    if (f.dryDays > 0 && !game.state.weather[d.regionId]?.rain) { f.dryDays--; f.wetDays++; }
  }
}

/** End: Krisis prices back (÷ mult); returns the summary text. */
export function endDisaster(game, d) {
  if (d.type === 'krisis') {
    for (const id of game.idx.crops.keys()) {
      const p = game.idx.products.get(id);
      if (p && game.state.market[id] > 0) game.state.market[id] = clampPrice(p, game.state.market[id] / d.ctx.mult);
    }
    return 'Harga tanaman kembali normal.';
  }
  if (d.type === 'elnino') return `Hujan kembali turun di ${game.idx.regions.get(d.regionId)?.name}.`;
  return 'Wabah mereda.';
}

/** Next disaster day after `day`: gapDays (seeded). */
export function nextDisasterDay(game, day) {
  const [a, b] = dcfg(game).gapDays ?? [22, 36];
  return day + a + Math.floor(draw(rngFor(game, `dzgap|${day}`)) * (b - a + 1));
}
