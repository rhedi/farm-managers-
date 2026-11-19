// 🏆 Liga Musiman: one league season per in-game year (BALANCE.yearDays = 40 days, js/engine/seasons.js). Each season
// rates ONE skill metric, normalized by farm size so a small farm can win (METRICS). The 7 rivals of js/engine/rivals.js
// play in the player's division; at the start of every season their targets are rubber-banded to the player's own form
// (EMA of the player's past season values) × the division strength ± a seeded per-rival spread (personality), so a 6×
// richer farm still has a race. Divisions Perunggu → Perak → Emas → Berlian: top `promote` go up, bottom `relegate` go
// down. Rewards (top 3): a cup on the trophy shelf (game.legacy.shelf, kept across generations), research points by
// division and a timed booster themed on the metric; never raw cash.
// Hash-seeded (`seed|liga|…`), never consumes state.rng. Runs in every rollover, also the coarse offline days (offline.js
// reports coarse harvests through trackHarvest), so seasons never get skipped while away.
// state.league = { division, best, season: null | {n, startDay, t0, metric, rated, snap, acc, rivals}, form: {metric: v},
//   history: [≤ history results], pending: [results not shown yet] }.
import { hashSeed, round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { CATEGORIES } from './ledger.js';
import { RIVALS } from './rivals.js';
import { breedingMods } from './breeding.js';
import { boostMult, addSourcedBooster, BOOSTERS } from './calendar.js';
import { grantResearchPoints } from './rewards.js';
import { expectedYield } from './fields.js';
import { yearDays } from './seasons.js';

export const LEAGUE_DEFAULTS = {
  unlockLevel: 5, history: 12, shelfMax: 60, promote: 2, relegate: 2, formWeight: 0.5, spread: 0.08, graceDays: 3,
  minTons: 10, minHa: 5, minHead: 10,
  divisions: [
    { id: 'perunggu', name: 'Perunggu', emoji: '🥉', strength: 0.9 },
    { id: 'perak', name: 'Perak', emoji: '🥈', strength: 0.97 },
    { id: 'emas', name: 'Emas', emoji: '🥇', strength: 1.03 },
    { id: 'berlian', name: 'Berlian', emoji: '💎', strength: 1.09 },
  ],
  rewards: [
    { rank: 1, cup: 'emas', rp: [1, 2, 2, 3], boosterDays: 10 },
    { rank: 2, cup: 'perak', rp: [0, 1, 1, 2], boosterDays: 6 },
    { rank: 3, cup: 'perunggu', rp: [0, 0, 1, 1], boosterDays: 4 },
  ],
  boosters: { profitHa: { kind: 'seedCost', mult: 0.8 }, yieldIdx: { kind: 'yield', mult: 1.1 }, contracts: { kind: 'yield', mult: 1.05 },
    fuelT: { kind: 'taskSpeed', mult: 1.15 }, animalIdx: { kind: 'animalProd', mult: 1.1 } },
};
export const leagueCfg = (game) => ({ ...LEAGUE_DEFAULTS, ...(game.data.BALANCE.league || {}) });
/** Highest division index the player may be promoted into: v20 divisions may carry `minLevel` (💠 Master: Lv 70). */
export function reachableTop(game, cfg = leagueCfg(game)) {
  let top = 0;
  cfg.divisions.forEach((d, i) => { if (game.state.level >= (d.minLevel ?? 0)) top = i; });
  return Math.max(top, st(game)?.division ?? 0);
}

/** kind 'ratio' = a rate comparable at any point of the season; 'count' = grows through the season. */
export const METRICS = {
  profitHa: { id: 'profitHa', name: 'Untung per hektare', emoji: '💰', unit: '$/ha/hari', better: 'high', kind: 'ratio', floor: 20,
    desc: 'Laba operasional musim ini (penjualan panen, ternak, olahan, kontrak − biaya operasional) dibagi luas ladang rata-rata dan jumlah hari. Ladang kecil yang efisien bisa menang.' },
  yieldIdx: { id: 'yieldIdx', name: 'Panen terbaik per hektare', emoji: '🌾', unit: '% hasil dasar', better: 'high', kind: 'ratio', floor: 0.9,
    desc: 'Hasil t/ha tanaman terbaikmu musim ini dibanding hasil dasar tanaman itu (min. 5 ha dipanen). Pupuk, irigasi, pH, rotasi, rumah kaca, dan riset menentukan.' },
  contracts: { id: 'contracts', name: 'Kontrak selesai', emoji: '📋', unit: 'kontrak', better: 'high', kind: 'count', floor: 3,
    desc: 'Jumlah kontrak yang selesai musim ini. Slot kontrak sama untuk semua ukuran pertanian.' },
  fuelT: { id: 'fuelT', name: 'Hemat BBM', emoji: '⛽', unit: 'L/t', better: 'low', kind: 'ratio', floor: 0.5,
    desc: 'Liter BBM ladang per ton hasil panen musim ini (min. 10 t). Mesin yang pas, upgrade efisiensi, dan riset BBM membantu. Makin kecil makin baik.' },
  animalIdx: { id: 'animalIdx', name: 'Produktivitas ternak', emoji: '🐄', unit: '% standar', better: 'high', kind: 'ratio', floor: 0.8,
    desc: 'Produk ternak per ekor dibanding standar jenisnya: kualitas, pakan, genetika, dan riset. Butuh min. 10 ekor saat musim dimulai.' },
};
export const METRIC_IDS = Object.keys(METRICS);
/** Rival personality in the league: spread of its strength, bias, and how much its value wobbles day to day. */
const PERS = { steady: { spread: 0.6, bias: 0, amp: 0.03 }, aggressive: { spread: 1, bias: 0.02, amp: 0.05 }, volatile: { spread: 1.6, bias: -0.01, amp: 0.09 } };
const INCOME = ['penjualan_panen', 'penjualan_ternak_produk', 'penjualan_olahan', 'kontrak'];
const OPEX = CATEGORIES.filter((c) => c.group === 'opex').map((c) => c.id);

const unit = (seed, salt) => hashSeed(`${seed}|liga|${salt}`) / 4294967296;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const st = (game) => game.state.league;
export const seasonIndex = (game, day = game.day) => Math.floor((day - 1) / yearDays(game));
const ownedHa = (game) => Object.keys(game.state.fields).reduce((a, id) => a + (game.idx.fields.get(id)?.sizeHa ?? 0), 0);
const headCount = (game) => Object.values(game.state.animals || {}).reduce((a, h) => a + (h?.count || 0), 0);
const newAcc = () => ({ haDays: 0, days: 0, act: 0, std: 0, crops: {} });

/** persist.normalizeState / createGame: missing → Perunggu, no season yet (started lazily by ensureSeason). */
export function ensureLeague(s, data) {
  const cfg = { ...LEAGUE_DEFAULTS, ...(data?.BALANCE?.league || {}) }, top = cfg.divisions.length - 1;
  const L = s.league && typeof s.league === 'object' ? s.league : {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const se = L.season;
  const okSeason = se && typeof se === 'object' && Number.isInteger(se.n) && Number.isFinite(se.t0) && se.snap && se.acc && Array.isArray(se.rivals)
    && (se.metric == null || METRICS[se.metric]);
  s.league = {
    division: Math.min(top, Math.max(0, num(L.division) | 0)),
    best: Math.min(top, Math.max(0, num(L.best) | 0, num(L.division) | 0)),
    season: okSeason ? { ...se, rated: !!se.rated && !!se.metric, acc: { ...newAcc(), ...se.acc, crops: { ...(se.acc.crops || {}) } } } : null,
    form: Object.fromEntries(Object.entries(L.form || {}).filter(([k, v]) => METRICS[k] && Number.isFinite(v))),
    history: (Array.isArray(L.history) ? L.history : []).filter((x) => x && METRICS[x.metric]).slice(-cfg.history),
    pending: (Array.isArray(L.pending) ? L.pending : []).filter((x) => x && METRICS[x.metric]).slice(-cfg.history),
  };
}

function snapshot(game) {
  const t = game.state.ledger?.total || {}, cats = {};
  for (const id of [...INCOME, ...OPEX]) cats[id] = t[id] || 0;
  return { cats, contracts: game.state.stats.contractsDone || 0, tons: game.state.stats.tonsHarvested || 0 };
}

/** Metrics the farm can take part in when a season starts (no herd → no animal metric). */
function eligible(game) {
  return METRIC_IDS.filter((id) => id !== 'animalIdx' || headCount(game) >= leagueCfg(game).minHead);
}

function pickMetric(game, n) {
  const last = st(game).history[st(game).history.length - 1]?.metric;
  let list = eligible(game);
  if (list.length > 1) list = list.filter((id) => id !== last);
  return list[Math.floor(unit(game.state.seed, `${n}|metric`) * list.length)] ?? 'profitHa';
}

/** The player's value of `metric` in the season so far → {value: number | null, detail}. */
export function playerValue(game, metric, se = st(game)?.season) {
  if (!se) return { value: null, detail: '' };
  const s = game.state, cfg = leagueCfg(game), t = s.ledger?.total || {}, d = (id) => (t[id] || 0) - (se.snap.cats[id] || 0);
  switch (metric) {
    case 'profitHa': {
      const days = (s.time - se.t0) / 24, ha = se.acc.days > 0 ? se.acc.haDays / se.acc.days : ownedHa(game);
      if (days < 0.25 || !(ha > 0)) return { value: null, detail: 'Belum cukup data' };
      const profit = INCOME.reduce((a, id) => a + d(id), 0) - OPEX.reduce((a, id) => a + d(id), 0);
      return { value: round2(profit / ha / days), detail: `laba ${fmtMoney(profit)} · ${fmtNum(ha)} ha` };
    }
    case 'yieldIdx': {
      let best = null;
      for (const [id, c] of Object.entries(se.acc.crops)) {
        const crop = game.idx.crops.get(id);
        if (!crop?.baseYield || c.ha < cfg.minHa) continue;
        const v = c.t / c.ha / crop.baseYield;
        if (!best || v > best.v) best = { v, crop, tph: c.t / c.ha };
      }
      return best ? { value: r4(best.v), detail: `${best.crop.emoji} ${best.crop.name} ${round2(best.tph)} t/ha` } : { value: null, detail: `Belum ada tanaman dengan ≥ ${cfg.minHa} ha dipanen` };
    }
    case 'contracts': return { value: Math.max(0, (s.stats.contractsDone || 0) - se.snap.contracts), detail: '' };
    case 'fuelT': {
      const tons = (s.stats.tonsHarvested || 0) - se.snap.tons;
      if (tons < cfg.minTons) return { value: null, detail: `Panen ${round2(tons)} / ${cfg.minTons} t` };
      const liters = d('bbm') / (game.data.BALANCE.fuelPrice || 1);
      return { value: round2(liters / tons), detail: `${fmtMoney(liters).slice(1)} L · ${fmtNum(Math.round(tons))} t` };
    }
    case 'animalIdx': return se.acc.std > 0 ? { value: r4(se.acc.act / se.acc.std), detail: '' } : { value: null, detail: 'Belum ada produksi ternak' };
    default: return { value: null, detail: '' };
  }
}

/** Starting point for the rubber band when there is no form yet (first season of a metric). */
function estimate(game, metric) {
  const s = game.state;
  if (metric === 'profitHa') {
    const days = (s.ledger?.days || []).slice(-7), ha = ownedHa(game);
    if (!days.length || !(ha > 0)) return 0;
    const p = days.reduce((a, b) => a + INCOME.reduce((x, id) => x + (b.cats[id] || 0), 0) - OPEX.reduce((x, id) => x + (b.cats[id] || 0), 0), 0);
    return p / days.length / ha;
  }
  if (metric === 'yieldIdx') {
    let best = 0;
    for (const [id, f] of Object.entries(s.fields)) {
      const cropId = f.plan?.cropId ?? f.cropId, crop = cropId && game.idx.crops.get(cropId), def = game.idx.fields.get(id);
      if (!crop?.baseYield || !def) continue;
      const t = expectedYield(game, id, cropId, { fertilized: f.plan ? !!f.plan.fertilize : f.fertilized, irrigated: f.plan ? !!f.plan.irrigate : f.irrigated });
      best = Math.max(best, t / def.sizeHa / crop.baseYield);
    }
    return best;
  }
  if (metric === 'contracts') return ((s.stats.contractsDone || 0) / Math.max(1, game.day)) * yearDays(game);
  if (metric === 'fuelT') {
    const days = s.ledger?.days || [], liters = days.reduce((a, b) => a + (b.cats.bbm || 0), 0) / (game.data.BALANCE.fuelPrice || 1);
    const rate = s.stats.tonsHarvested / Math.max(1, game.day); // t/day over the whole run
    return liters > 0 && rate > 0 ? liters / days.length / rate : 8;
  }
  if (metric === 'animalIdx') {
    let act = 0, std = 0;
    for (const a of game.data.ANIMALS) {
      const h = s.animals[a.id];
      if (!h?.count) continue;
      const v = h.count * a.productPerDay * (game.idx.products.get(a.product)?.basePrice ?? 0);
      std += v; act += v * h.quality * (h.fed ?? 1) * breedingMods(game, a, h).production;
    }
    return std > 0 ? act / std : 1;
  }
  return 0;
}

/** Rubber band: the player's form for the metric (or an estimate), never below the metric's floor. */
export function baseline(game, metric) {
  const M = METRICS[metric], f = st(game).form[metric];
  const v = Number.isFinite(f) ? f : estimate(game, metric);
  return Math.max(M.floor, Number.isFinite(v) ? v : M.floor);
}

/** Season targets of the 7 rivals: baseline × division strength × (1 + bias + spread × z), seeded per season. */
export function rivalTargets(game, metric, n, division = st(game).division) {
  const cfg = leagueCfg(game), div = cfg.divisions[division] ?? cfg.divisions[0], base = baseline(game, metric), M = METRICS[metric];
  return RIVALS.map((r) => {
    const p = PERS[r.personality] ?? PERS.steady, z = unit(game.state.seed, `${n}|${r.id}`) * 2 - 1;
    const strength = div.strength * (1 + p.bias + cfg.spread * p.spread * z);
    return { id: r.id, target: r4(M.better === 'low' ? base / strength : base * strength) };
  });
}

function startSeason(game, day, rated) {
  const n = seasonIndex(game, day), metric = rated ? pickMetric(game, n) : null;
  st(game).season = { n, startDay: n * yearDays(game) + 1, t0: game.state.time, metric, rated: !!metric, snap: snapshot(game),
    acc: newAcc(), rivals: metric ? rivalTargets(game, metric, n) : [] };
}

/** Lazy start (new game, migrated save): rated only at a season start within graceDays and at the unlock level. */
export function ensureSeason(game) {
  if (!st(game)) ensureLeague(game.state, game.data);
  if (st(game).season) return st(game).season;
  const cfg = leagueCfg(game), Y = yearDays(game), dayIn = game.state.time / 24 - seasonIndex(game) * Y;
  startSeason(game, game.day, game.state.level >= cfg.unlockLevel && dayIn <= cfg.graceDays);
  return st(game).season;
}

/** Live value of a rival at season progress p (0–1): ratio metrics wobble less as the season ends; counts grow. */
function rivalValue(game, se, rv, p, final) {
  const r = RIVALS.find((x) => x.id === rv.id), P = PERS[r?.personality] ?? PERS.steady, M = METRICS[se.metric];
  const ph = unit(game.state.seed, `${se.n}|${rv.id}|ph`) * 2 * Math.PI;
  const wave = Math.sin((2 * Math.PI * game.day) / 7 + ph); // one step per game day: standings don't jitter every frame
  if (M.kind === 'count') return final ? Math.round(rv.target) : Math.max(0, Math.floor(rv.target * p * (1 + P.amp * wave) + 1e-9));
  return r4(rv.target * (1 + P.amp * wave * (final ? 0.3 : 1 - 0.7 * p)));
}

/** Standings of a rated season: 8 rows, best first; no value (null) last; ties go to the player. */
export function standings(game, se = st(game)?.season, final = false) {
  if (!se?.rated) return [];
  const Y = yearDays(game), p = final ? 1 : Math.min(1, Math.max(0, (game.day - se.startDay + 1) / Y));
  const M = METRICS[se.metric], me = playerValue(game, se.metric, se);
  const rows = se.rivals.map((rv) => {
    const r = RIVALS.find((x) => x.id === rv.id);
    return { id: rv.id, name: r?.name ?? rv.id, emoji: r?.emoji ?? '🏠', personality: r?.personality ?? null, value: rivalValue(game, se, rv, p, final), isPlayer: false };
  });
  rows.push({ id: 'player', name: 'Pertanianmu', emoji: game.legacy?.emblem?.icon ?? '🧑‍🌾', personality: null, value: me.value, detail: me.detail, isPlayer: true });
  const key = (x) => (x.value == null ? Infinity : M.better === 'low' ? x.value : -x.value);
  rows.sort((a, b) => key(a) - key(b) || Number(b.isPlayer) - Number(a.isPlayer));
  const cfg = leagueCfg(game), top = reachableTop(game, cfg), div = st(game).division;
  rows.forEach((x, i) => {
    x.rank = i + 1;
    x.zone = div < top && x.rank <= cfg.promote ? 'up' : div > 0 && x.rank > rows.length - cfg.relegate ? 'down' : null;
  });
  return rows;
}

/** Coarse/exact harvests: tons and harvested ha per crop for the yield metric. */
export function trackHarvest(game, cropId, tons, ha) {
  const se = st(game)?.season;
  if (!se || !(ha > 0) || !cropId) return;
  const c = (se.acc.crops[cropId] ||= { t: 0, ha: 0 });
  c.t = round2(c.t + Math.max(0, tons || 0));
  c.ha = round2(c.ha + ha);
}

/** Game.emit hook (every event, muted or not): exact harvests. */
export function trackEvent(game, ev) {
  if (ev.type !== 'task_done' || ev.task !== 'harvest' || !ev.cropId) return;
  trackHarvest(game, ev.cropId, ev.tons, game.idx.fields.get(ev.fieldId)?.sizeHa ?? 0);
}

/** The day that ended: owned ha and herd output vs standard (runs after the animals ate and produced). */
function accumulate(game, se) {
  const s = game.state, a = se.acc;
  a.days += 1;
  a.haDays = round2(a.haDays + ownedHa(game));
  const boost = boostMult(game, 'animalProd');
  for (const def of game.data.ANIMALS) {
    const h = s.animals[def.id];
    if (!h?.count) continue;
    const std = h.count * def.productPerDay * (game.idx.products.get(def.product)?.basePrice ?? 0);
    a.std = round2(a.std + std);
    a.act = round2(a.act + std * h.quality * (h.fed ?? 1) * breedingMods(game, def, h).production * boost);
  }
}

function rewardOf(game, rank, division, metric) {
  const cfg = leagueCfg(game), rw = cfg.rewards.find((x) => x.rank === rank);
  if (!rw) return null;
  const b = cfg.boosters[metric] ?? { kind: 'yield', mult: 1.05 };
  return { cup: rw.cup, rp: rw.rp[division] ?? 0, booster: { kind: b.kind, mult: b.mult, days: rw.boosterDays,
    text: `${BOOSTERS[b.kind]?.fmt(b.mult) ?? b.kind} · ${rw.boosterDays} hari game` } };
}

const CUP_NAME = { emas: '🏆 Piala Emas', perak: '🥈 Piala Perak', perunggu: '🥉 Piala Perunggu' };

function endSeason(game) {
  const L = st(game), se = L.season, cfg = leagueCfg(game), Y = yearDays(game);
  const values = Object.fromEntries(METRIC_IDS.map((id) => [id, playerValue(game, id, se).value]));
  if (se.rated) {
    const rows = standings(game, se, true), me = rows.find((x) => x.isPlayer), top = cfg.divisions.length - 1;
    const division = L.division, promoted = me.zone === 'up', relegated = me.zone === 'down';
    const reward = rewardOf(game, me.rank, division, se.metric);
    if (reward) {
      grantResearchPoints(game, reward.rp);
      addSourcedBooster(game, { ...reward.booster, src: 'liga', name: 'Hadiah Liga', emoji: '🏆', text: reward.booster.text });
      const shelf = (game.legacy.shelf ||= []);
      shelf.push({ gen: game.legacy.generation, season: se.n + 1, cup: reward.cup, division, metric: se.metric });
      if (shelf.length > cfg.shelfMax) shelf.splice(0, shelf.length - cfg.shelfMax);
    }
    L.division = Math.min(top, Math.max(0, division + (promoted ? 1 : relegated ? -1 : 0)));
    L.best = Math.max(L.best, L.division);
    const result = { season: se.n + 1, metric: se.metric, division, newDivision: L.division, rank: me.rank, of: rows.length,
      value: me.value, promoted, relegated, cup: reward?.cup ?? null, rp: reward?.rp ?? 0, booster: reward?.booster ?? null,
      top: rows.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, value: x.value, rank: x.rank, isPlayer: x.isPlayer })) };
    const { top: _rows, ...short } = result;
    L.history.push(short);
    if (L.history.length > cfg.history) L.history.splice(0, L.history.length - cfg.history);
    L.pending.push(result);
    if (L.pending.length > cfg.history) L.pending.splice(0, L.pending.length - cfg.history);
    const D = cfg.divisions;
    const move = promoted ? ` Naik ke Divisi ${D[L.division].emoji} ${D[L.division].name}!` : relegated ? ` Turun ke Divisi ${D[L.division].name}.` : '';
    game.emit('league_season_end', `🏆 Liga Musim ${se.n + 1} selesai: peringkat #${me.rank} di Divisi ${D[division].name}${reward ? ` · ${CUP_NAME[reward.cup]}${reward.rp ? ` +${reward.rp} 🔬` : ''}` : ''}.${move}`,
      { season: se.n + 1, rank: me.rank, division, newDivision: L.division, cup: reward?.cup ?? null });
  }
  // Form for the next rubber band: EMA of every metric with a value (counts of a partial season scaled to a full one).
  const days = Math.max(0.25, (game.state.time - se.t0) / 24), w = cfg.formWeight;
  for (const [id, v] of Object.entries(values)) {
    if (v == null) continue;
    const full = METRICS[id].kind === 'count' ? v * Math.min(4, Y / days) : v;
    L.form[id] = r4(Number.isFinite(L.form[id]) ? (1 - w) * L.form[id] + w * full : full);
  }
}

/** Daily rollover (every day, coarse offline days included): sample the ended day, close/start seasons at year starts. */
export function stepLeagueDay(game, day) {
  const se = ensureSeason(game);
  accumulate(game, se);
  if (seasonIndex(game, day) === se.n) return;
  endSeason(game);
  startSeason(game, day, game.state.level >= leagueCfg(game).unlockLevel);
}

/** Everything the league card needs. */
export function leagueView(game) {
  const se = ensureSeason(game), L = st(game), cfg = leagueCfg(game), Y = yearDays(game), s = game.state;
  const endH = (se.startDay - 1 + Y) * 24, dayIn = Math.min(Y, Math.floor(s.time / 24) - (se.startDay - 1) + 1);
  const rows = standings(game, se);
  const me = rows.find((x) => x.isPlayer);
  const div = (i) => ({ index: i, ...cfg.divisions[i], locked: s.level < (cfg.divisions[i].minLevel ?? 0) });
  const shelf = [...(game.legacy?.shelf || [])].reverse();
  const counts = { emas: 0, perak: 0, perunggu: 0 };
  for (const c of shelf) counts[c.cup]++;
  return {
    unlocked: s.level >= cfg.unlockLevel, unlockLevel: cfg.unlockLevel, level: s.level,
    divisions: cfg.divisions.map((_, i) => div(i)), division: div(L.division), best: div(L.best), promote: cfg.promote, relegate: cfg.relegate,
    season: { n: se.n + 1, rated: se.rated, metric: se.metric ? { ...METRICS[se.metric] } : null, day: dayIn, days: Y,
      daysLeft: Math.max(0, Math.ceil((endH - s.time) / 24 - 1e-9)), hoursLeft: round2(Math.max(0, endH - s.time)),
      progress: round2(Math.min(1, Math.max(0, (s.time - (se.startDay - 1) * 24) / (Y * 24)))), endDay: se.startDay + Y },
    standings: rows, player: se.rated ? { ...playerValue(game, se.metric, se), rank: me?.rank ?? null } : null,
    metrics: METRIC_IDS.map((id) => ({ ...METRICS[id], ...playerValue(game, id, se), form: L.form[id] ?? null })),
    rewards: cfg.rewards.map((rw) => ({ rank: rw.rank, ...rewardOf(game, rw.rank, L.division, se.metric ?? 'yieldIdx') })),
    history: [...L.history].reverse(), shelf, cups: counts, pending: L.pending.length,
  };
}

/** Season results not shown yet (end-of-season modal); clears them. */
export function takeLeagueResults(game) {
  const L = st(game);
  if (!L?.pending?.length) return [];
  const out = L.pending;
  L.pending = [];
  return out;
}
