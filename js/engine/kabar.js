// 📰 Kabar Desa: choice events ("dilemma") + ⚠️ Bencana Besar. Daily rollover (stepKabarDay): pay the investor share
// and contract bonuses, run the disaster calendar, resolve an expired dilemma with its default option, maybe open a
// new one (seeded per day, only types relevant to what the player owns). All draws use hash-seeded streams.
// state.kabar = { next, nextDisaster, seq, open, disaster, history: [≤10], rep: {left, pct}, share, stats: {decided, auto} }.
import { round2 } from './rng.js';
import { kcfg, fmt, rngFor, draw, pay, scale } from './kabarCore.js';
import { TYPES_A } from './kabarTypes.js';
import { TYPES_B } from './kabarTypes2.js';
import { TYPES_C } from './kabarTypes3.js';
import { makeDisaster, startDisaster, stepActiveDisaster, endDisaster, nextDisasterDay, DISASTERS } from './kabarDisasters.js';
import { projectPerk } from './projects.js';

export const TYPES = [...TYPES_A, ...TYPES_B, ...TYPES_C];
const TYPE = new Map(TYPES.map((t) => [t.id, t]));
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

/** createGame / load migration: missing → nothing open, first dilemma soon, disasters scheduled from the first eligible day. */
export function ensureKabar(s) {
  const k = s.kabar && typeof s.kabar === 'object' ? s.kabar : {};
  const valid = (o) => o && typeof o === 'object' && Array.isArray(o.options) && o.options.length;
  s.kabar = {
    next: Number.isFinite(k.next) ? k.next : 0, nextDisaster: Number.isFinite(k.nextDisaster) ? k.nextDisaster : null,
    seq: k.seq | 0, open: valid(k.open) && TYPE.has(k.open.type) ? k.open : null,
    disaster: valid(k.disaster) && DISASTERS[k.disaster.type] ? k.disaster : null,
    history: (Array.isArray(k.history) ? k.history : []).filter((h) => h && typeof h === 'object').slice(-10),
    rep: k.rep && k.rep.left > 0 ? { left: k.rep.left | 0, pct: Number(k.rep.pct) || 0 } : null,
    share: k.share && Number.isFinite(k.share.untilDay) ? k.share : null,
    stats: { decided: k.stats?.decided | 0, auto: k.stats?.auto | 0 },
  };
  return s.kabar;
}
const K = (game) => (game.state.kabar?.stats ? game.state.kabar : ensureKabar(game.state));

function record(game, entry) {
  const k = K(game), max = kcfg(game).history ?? 10;
  k.history.push(entry);
  if (k.history.length > max) k.history.splice(0, k.history.length - max);
}

/** Income of the day that just ended (the ledger day is still open at the rollover). */
function dayIncome(game) {
  const L = game.state.ledger, c = L?.cur?.day === game.day - 1 ? L.cur.cats || {} : {};
  return Math.max(0, ['penjualan_panen', 'penjualan_ternak_produk', 'penjualan_olahan', 'kontrak'].reduce((a, id) => a + (c[id] || 0), 0)
    - (c.pembelian_produk || 0));
}

/** Investor share + contract bonuses (reputation from Kabar Desa, Pasar Induk). Each done contract is looked at once. */
function payEffects(game, day) {
  const k = K(game);
  if (k.share) {
    if (day > k.share.untilDay) k.share = null;
    else {
      const v = round2(Math.min(k.share.pct * dayIncome(game), Math.max(0, game.state.money)));
      if (v > 0) { game.spend(v, 'kabar_desa'); k.share.paid = round2((k.share.paid || 0) + v); }
    }
  }
  let bonus = 0, n = 0;
  for (const c of game.state.contracts || []) {
    if (c.status !== 'done' || c.bonusChecked) continue;
    c.bonusChecked = true;
    let pct = projectPerk(game, 'contractBonus');
    if (k.rep?.left > 0) { pct += k.rep.pct; k.rep.left--; }
    const v = round2((c.value || 0) * pct);
    if (v > 0) { bonus += v; n++; }
  }
  if (k.rep && k.rep.left <= 0) k.rep = null;
  if (bonus > 0) {
    game.earn(round2(bonus), 'kontrak');
    game.emit('contract_bonus', `🤝 Bonus reputasi & Pasar Induk: +${fmt(bonus)} untuk ${n} kontrak.`, { amount: round2(bonus), count: n });
  }
}

/** Open a new dilemma for `day` from the relevant types (weighted, seeded); null when none applies. */
function openDilemma(game, day) {
  const k = K(game), C = kcfg(game), r = rngFor(game, `d|${day}`);
  const made = TYPES.filter((t) => game.state.level >= (t.minLevel ?? 1)).map((t) => ({ t, m: t.make(game, r) })).filter((x) => x.m);
  if (!made.length) return null;
  const recent = new Set(k.history.slice(-3).map((h) => h.type));
  const pool = made.filter((x) => !recent.has(x.t.id)).length ? made.filter((x) => !recent.has(x.t.id)) : made;
  const total = pool.reduce((a, x) => a + (x.t.weight ?? 1), 0);
  let u = draw(r) * total;
  const { t, m } = pool.find((x) => (u -= x.t.weight ?? 1) < 0) ?? pool[pool.length - 1];
  const [a, b] = C.deadlineDays ?? [1, 2];
  const deadlineDay = day + a + Math.floor(draw(r) * (b - a + 1));
  k.seq++;
  k.open = { id: `kd${k.seq}`, type: t.id, emoji: t.emoji, title: t.title, text: m.text, day, deadlineDay, def: m.def, ctx: m.ctx,
    options: m.options.map((o) => ({ ...o, default: o.id === m.def })) };
  game.emit('dilemma_new', `📰 Kabar Desa: ${t.title}. Putuskan sebelum hari ${deadlineDay}.`, { id: k.open.id, dilemmaType: t.id, deadlineDay });
  return k.open;
}

/** Apply option `optionId` of the open dilemma (auto: the default at the deadline). */
function resolve(game, optionId, auto) {
  const k = K(game), d = k.open, t = TYPE.get(d.type);
  const o = d.options.find((x) => x.id === optionId);
  if (!o) return fail('Pilihan tidak dikenal.');
  if (o.cost > 0 && !pay(game, o.cost)) {
    if (!auto) return fail(`Uang tidak cukup (butuh ${fmt(o.cost)}).`);
    pay(game, Math.max(0, game.state.money)); // default while broke: the village settles for what cash there is
  }
  const outcome = t.apply(game, d.ctx, o.id, rngFor(game, `o|${d.id}|${o.id}`));
  k.open = null;
  if (auto) k.stats.auto++; else k.stats.decided++;
  record(game, { id: d.id, type: d.type, emoji: d.emoji, title: d.title, day: game.day, option: o.id, optionLabel: o.label,
    auto: !!auto, cost: o.cost || 0, text: outcome.text, good: outcome.good ?? null });
  game.emit('dilemma_resolved', `${d.emoji} ${d.title}: ${auto ? '(otomatis) ' : ''}${outcome.text}`,
    { id: d.id, dilemmaType: d.type, option: o.id, outcome, auto: !!auto });
  if (!auto) game.checkAchievements();
  return ok({ id: d.id, option: o.id, outcome });
}

/** Player decision on the open dilemma → {ok, id, option, outcome:{text, good}}. */
export function chooseDilemma(game, optionId) {
  if (!K(game).open) return fail('Tidak ada kabar yang perlu diputuskan.');
  return resolve(game, optionId, false);
}

/** Pick the preparation for a forecast disaster (paid now, fixed until it starts). */
export function prepareDisaster(game, optionId) {
  const d = K(game).disaster;
  if (!d || d.phase !== 'forecast') return fail('Tidak ada bencana yang bisa disiapkan.');
  if (d.choice) return fail('Persiapan sudah dipilih.');
  const o = d.options.find((x) => x.id === optionId);
  if (!o) return fail('Pilihan tidak dikenal.');
  if (!pay(game, o.cost)) return fail(`Uang tidak cukup (butuh ${fmt(o.cost)}).`);
  d.choice = o.id;
  K(game).stats.decided++;
  game.emit('disaster_prepared', `${d.emoji} ${d.name}: ${o.label} disiapkan.`, { id: d.id, disasterType: d.type, option: o.id });
  game.checkAchievements();
  return ok({ id: d.id, option: o.id });
}

function stepDisasters(game, day) {
  const k = K(game), D = kcfg(game).disasters || {};
  const d = k.disaster;
  if (!d) {
    if (game.state.level < (D.unlockLevel ?? 10)) return;
    if (k.nextDisaster == null) { k.nextDisaster = nextDisasterDay(game, day); return; }
    if (day < k.nextDisaster) return;
    k.seq++;
    k.disaster = makeDisaster(game, day, k.seq);
    game.emit('disaster_forecast', `⚠️ Bencana Besar: ${k.disaster.text}`, { id: k.disaster.id, disasterType: k.disaster.type,
      startDay: k.disaster.startDay, regionId: k.disaster.regionId ?? null });
    return;
  }
  if (d.phase === 'forecast' && day >= d.startDay) {
    const text = startDisaster(game, d);
    game.emit('disaster_start', `${d.emoji} ${d.name} dimulai: ${text}`, { id: d.id, disasterType: d.type, option: d.choice, auto: !!d.auto });
  }
  if (d.phase !== 'active') return;
  if (day <= d.endDay) { stepActiveDisaster(game, d, day); return; }
  const text = endDisaster(game, d), o = d.options.find((x) => x.id === d.choice);
  record(game, { id: d.id, type: d.type, emoji: d.emoji, title: d.name, day, option: d.choice, optionLabel: o?.label ?? '',
    auto: !!d.auto, cost: o?.cost || 0, text: `${d.startText} ${text}`, good: d.choice === d.options[0].id ? true : null, disaster: true });
  game.emit('disaster_end', `${d.emoji} ${d.name} berakhir. ${text}`, { id: d.id, disasterType: d.type });
  k.disaster = null;
  k.nextDisaster = nextDisasterDay(game, day);
}

/** Daily rollover (after contracts): effects, disasters, the dilemma deadline, maybe a new dilemma. */
export function stepKabarDay(game, day) {
  const k = K(game), C = kcfg(game);
  payEffects(game, day);
  stepDisasters(game, day);
  if (k.open && day >= k.open.deadlineDay) resolve(game, k.open.def, true);
  if (k.open || game.state.level < (C.unlockLevel ?? 3)) return;
  if (!k.next) { k.next = day + 1; return; }
  if (day < k.next) return;
  const o = openDilemma(game, day), [a, b] = C.gapDays ?? [2, 4];
  k.next = o ? day + a + Math.floor(draw(rngFor(game, `gap|${day}`)) * (b - a + 1)) : day + 1;
}

const optView = (game, o) => ({ ...o, affordable: !(o.cost > 0) || game.state.money >= o.cost });

/** Everything the 📰 UI needs: {unlocked, unlockLevel, open, disaster, history (newest first), rep, share, stats, scale}. */
export function kabarView(game) {
  const k = K(game), C = kcfg(game), t = game.state.time, day = game.day;
  const o = k.open, d = k.disaster;
  return {
    unlocked: game.state.level >= (C.unlockLevel ?? 3), unlockLevel: C.unlockLevel ?? 3,
    open: o ? { id: o.id, type: o.type, emoji: o.emoji, title: o.title, text: o.text, day: o.day, deadlineDay: o.deadlineDay,
      hoursLeft: round2(Math.max(0, (o.deadlineDay - 1) * 24 - t)), def: o.def, options: o.options.map((x) => optView(game, x)) } : null,
    disaster: d ? { id: d.id, type: d.type, name: d.name, emoji: d.emoji, text: d.text, phase: d.phase, startDay: d.startDay,
      endDay: d.endDay, regionId: d.regionId ?? null, animalId: d.animalId ?? null, daysToStart: Math.max(0, d.startDay - day),
      hoursToStart: round2(Math.max(0, (d.startDay - 1) * 24 - t)), daysLeft: Math.max(0, d.endDay - day + 1), choice: d.choice,
      choiceLabel: d.options.find((x) => x.id === d.choice)?.label ?? null, def: d.def, startText: d.startText ?? null,
      options: d.options.map((x) => optView(game, x)) } : null,
    history: [...k.history].reverse(), rep: k.rep, share: k.share, stats: { ...k.stats }, scale: scale(game),
  };
}
