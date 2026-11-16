// "Laporan Pagi": what happened while the player was away, from before/after snapshots of stats, ledger totals,
// overflow tallies and event counts (Game.tally, filled by Game.emit during catch-up even while listeners are muted).
import { round2 } from './rng.js';
import { netWorth } from './economy.js';

const SALES = ['penjualan_panen', 'penjualan_ternak_produk', 'penjualan_olahan', 'kontrak'];
const animalStockValue = (game) => Object.entries(game.state.silo).reduce((a, [id, q]) =>
  a + (game.idx.products.get(id)?.category === 'animal' ? q * (game.state.market[id] ?? 0) : 0), 0);

export function snapshot(game) {
  const s = game.state;
  return { time: s.time, day: game.day, level: s.level, money: s.money, netWorth: netWorth(game),
    tons: s.stats.tonsHarvested, harvests: s.stats.harvests, contractsDone: s.stats.contractsDone || 0,
    ledger: { ...(s.ledger?.total || {}) }, overflow: { ...(s.overflow?.total || {}) }, animalStock: animalStockValue(game) };
}

/** Report between two snapshots; `tally` = {eventType: count} during the catch-up; `info` = {exactHours, coarseDays}. */
export function buildReport(game, before, tally = {}, info = {}) {
  const after = snapshot(game), d = (k) => round2((after.ledger[k] || 0) - (before.ledger[k] || 0));
  return {
    hours: round2(after.time - before.time), fromDay: before.day, toDay: after.day, days: after.day - before.day,
    exactHours: info.exactHours ?? 0, coarseDays: info.coarseDays ?? 0,
    harvestTons: round2(after.tons - before.tons), harvests: after.harvests - before.harvests,
    sales: round2(SALES.reduce((a, k) => a + d(k), 0)),
    animalOutput: round2(d('penjualan_ternak_produk') + after.animalStock - before.animalStock),
    contractsDone: after.contractsDone - before.contractsDone, contractsFailed: tally.contract_failed || 0,
    overflowEarned: round2((after.overflow.earned || 0) - (before.overflow.earned || 0)),
    overflowLost: round2((after.overflow.lost || 0) - (before.overflow.lost || 0)),
    wages: d('gaji'), feed: d('pakan'),
    moneyChange: round2(after.money - before.money), netWorthChange: round2(after.netWorth - before.netWorth),
    levelFrom: before.level, levelTo: after.level,
  };
}
