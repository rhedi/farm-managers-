// Gudang penuh: tally of stock force-sold by storage.storeProduct (silo / Gudang dingin overflow at overflowRate).
// Every overflow adds to today's tally; the daily rollover closes it (after the midnight animal/fish production,
// like the ledger) and emits one `storage_overflow_summary` per game day that had overflow.
// state.overflow = { cur: { [kind]: {tons, earned, lost} }, last: null | {day, kinds, earned, lost}, total: {tons, earned, lost} }
// earned = what the forced sale paid; lost = market value − earned.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum } from './defs.js';
import { storageInfo } from './storage.js';

const NAMES = { silo: 'Silo', cold: 'Gudang dingin' };
const blank = () => ({ tons: 0, earned: 0, lost: 0 });

/** createGame / load migration (persist.normalizeState): empty tallies. */
export function ensureOverflow(s) {
  const o = s.overflow || {};
  s.overflow = { cur: o.cur && typeof o.cur === 'object' ? o.cur : {}, last: o.last ?? null,
    total: { ...blank(), ...(o.total || {}) } };
}
const st = (game) => { if (!game.state.overflow) ensureOverflow(game.state); return game.state.overflow; };

/** storage.storeProduct: `tons` of `kind` force-sold for `earned`, worth `value` at market. */
export function recordOverflow(game, kind, tons, earned, value) {
  const o = st(game), c = (o.cur[kind] ||= blank()), lost = Math.max(0, value - earned);
  for (const t of [c, o.total]) {
    t.tons = round2(t.tons + tons);
    t.earned = round2(t.earned + earned);
    t.lost = round2(t.lost + lost);
  }
}

/** Daily rollover (end): close the tally of the day that ended; one summary event when anything overflowed. */
export function closeOverflowDay(game, day) {
  const o = st(game), kinds = o.cur;
  o.cur = {};
  const list = Object.entries(kinds).filter(([, v]) => v.tons > 0);
  if (!list.length) return null;
  const earned = round2(list.reduce((a, [, v]) => a + v.earned, 0)), lost = round2(list.reduce((a, [, v]) => a + v.lost, 0));
  o.last = { day, kinds, earned, lost };
  const parts = list.map(([k, v]) => `${NAMES[k] ?? k} ${fmtNum(v.tons, 1)} t`).join(', ');
  game.emit('storage_overflow_summary', `🏚️ Gudang penuh di hari ${day}: ${parts} dijual paksa ${fmtMoney(earned)} (rugi ${fmtMoney(lost)}).`,
    { day, kinds: structuredClone(kinds), earned, lost });
  return o.last;
}

/**
 * Gudang warning card: the last closed day with overflow when it is yesterday (or today's tally so far), per store
 * with its next upgrade. `null` when nothing overflowed yesterday or today.
 */
export function overflowView(game) {
  const o = st(game), recent = o.last && o.last.day >= game.day - 1 ? o.last : null;
  const today = Object.entries(o.cur).filter(([, v]) => v.tons > 0);
  if (!recent && !today.length) return null;
  const kinds = ['silo', 'cold'].map((kind) => {
    const y = recent?.kinds?.[kind], t = o.cur[kind];
    if (!(y?.tons > 0) && !(t?.tons > 0)) return null;
    const info = storageInfo(game, kind);
    return { kind, name: NAMES[kind], yesterday: y ?? null, today: t ?? null, level: info.level, capacity: info.capacity,
      used: info.used, nextCapacity: info.nextCapacity, upgradeCost: info.nextUpgradeCost, affordable: info.nextUpgradeCost <= game.state.money };
  }).filter(Boolean);
  return { day: recent?.day ?? null, earned: recent?.earned ?? 0, lost: recent?.lost ?? 0, kinds, total: { ...o.total } };
}
