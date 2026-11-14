import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame, runTask, startField, starterCrop, cheapestOtherField } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { CATEGORIES, LEDGER_DAYS } from '../js/engine/ledger.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg ?? ''} ${a} ≠ ${b}`);
const snap = (g) => ({ ...g.state.ledger.total });
/** Category deltas since snapshot `s0`, dropping zeros. */
function delta(g, s0) {
  const out = {};
  for (const [id, v] of Object.entries(g.state.ledger.total)) {
    const d = Math.round((v - (s0[id] || 0)) * 100) / 100;
    if (d) out[id] = d;
  }
  return out;
}
/** money change implied by ledger deltas: income + loanIn − opex − capex − repaid. */
function implied(d) {
  let sum = 0;
  for (const [id, v] of Object.entries(d)) {
    const c = CATEGORIES.find((x) => x.id === id);
    sum += c.group === 'income' || id === 'pinjaman_masuk' ? v : -v;
  }
  return sum;
}

test('field tasks book fuel, seed, fertilizer, rent and harvest sales separately', () => {
  const g = newGame(7);
  const fid = startField(), crop = starterCrop();
  let s = snap(g);
  const plow = runTask(g, fid, 'plow');
  assert.deepEqual(Object.keys(delta(g, s)), ['bbm']);
  near(delta(g, s).bbm, plow.cost);
  s = snap(g);
  runTask(g, fid, 'fertilize');
  assert.deepEqual(Object.keys(delta(g, s)).sort(), ['bbm', 'pupuk_kapur_irigasi']);
  s = snap(g);
  const seed = runTask(g, fid, 'seed', { cropId: crop.id });
  const ds = delta(g, s);
  assert.ok(ds.benih > 0 && !ds.pupuk_kapur_irigasi, 'seed → benih'); // midnight may add gaji/hadiah
  near(ds.bbm + ds.benih, seed.cost);
  g.advance(crop.growDays * 24);
  s = snap(g);
  const money0 = g.state.money;
  runTask(g, fid, 'harvest', { rent: true });
  const dh = delta(g, s);
  assert.ok(dh.sewa_pemanen > 0, 'rent booked');
  near(money0 - g.state.money, implied(dh) * -1, 'harvest cost');
  s = snap(g);
  const r = g.sellProduct(crop.id);
  assert.equal(r.ok, true);
  assert.deepEqual(delta(g, s), { penjualan_panen: r.earned });
});

test('wages book as gaji on the day that ended; shortfall is borrowed, not income', () => {
  const g = newGame(3);
  g.state.money = 1e6;
  g.hireWorker(g.workerCandidates()[0].id);
  const wages = g.state.workers.reduce((s, w) => s + w.wage, 0);
  g.advance(24 - g.hour);
  const y = g.financeReport('yesterday');
  const gaji = y.opex.byCat.find((c) => c.id === 'gaji');
  near(gaji.amount, wages);
  assert.equal(g.financeReport('today').opex.total, 0);
  g.state.money = 10;
  const s = snap(g);
  g.advance(24);
  const d = delta(g, s);
  near(d.gaji, wages);
  near(d.pinjaman_masuk, wages - 10);
  assert.equal(g.state.money, 0);
  assert.equal(g.financeReport('yesterday').income.total, 0);
});

test('loans are financing: not income, not expense, not totalEarned', () => {
  const g = newGame(4);
  const earned = g.state.stats.totalEarned, spent = g.state.stats.totalSpent;
  g.takeLoan(10000);
  g.repayLoan(4000);
  const r = g.financeReport('today');
  assert.equal(r.income.total, 0);
  assert.equal(r.opex.total, 0);
  assert.deepEqual(r.financing, { loanIn: 10000, repaid: 4000 });
  near(r.netCashFlow, 6000);
  assert.equal(g.state.stats.totalEarned, earned);
  assert.equal(g.state.stats.totalSpent, spent);
});

test('buying land and machines is capex; selling them is asset income', () => {
  const g = newGame(5);
  g.state.money = 1e6;
  const f = cheapestOtherField(g);
  g.buyField(f.id);
  g.buyMachine('jd_5075');
  const r = g.financeReport('today');
  assert.deepEqual(r.capex.byCat.map((c) => c.id).sort(), ['beli_ladang', 'beli_mesin']);
  near(r.capex.total, f.price + DATA.MACHINES.find((m) => m.id === 'jd_5075').price);
  assert.equal(r.opex.total, 0);
  const sold = g.sellField(f.id);
  assert.equal(g.financeReport('today').income.byCat[0].id, 'penjualan_aset');
  near(g.financeReport('today').income.total, sold.refund);
});

test('ledger totals match the money change over a simulated period', () => {
  const g = newGame(11);
  const fid = startField(), crop = starterCrop();
  const money0 = g.state.money;
  g.takeLoan(20000);
  g.hireWorker(g.workerCandidates()[0].id);
  for (let cycle = 0; cycle < 3; cycle++) {
    runTask(g, fid, 'plow');
    runTask(g, fid, 'fertilize');
    runTask(g, fid, 'seed', { cropId: crop.id });
    g.advance(crop.growDays * 24);
    runTask(g, fid, 'harvest', { rent: true });
    g.sellProduct(crop.id);
    g.advance(30);
  }
  g.repayLoan(5000);
  g.buyMachine('plow_s');
  const r = g.financeReport('all');
  near(g.state.money - money0, r.income.total + r.financing.loanIn - r.opex.total - r.capex.total - r.financing.repaid);
  near(r.netCashFlow, g.state.money - money0);
  near(r.operatingProfit, r.income.total - r.opex.total);
  assert.ok(r.opex.byCat.some((c) => c.id === 'gaji'));
  near(r.daily.reduce((s, d) => s + d.income, 0), r.income.total);
  for (const grp of [r.income, r.opex, r.capex]) {
    for (let i = 1; i < grp.byCat.length; i++) assert.ok(grp.byCat[i - 1].amount >= grp.byCat[i].amount);
    if (grp.byCat.length) assert.ok(Math.abs(grp.byCat.reduce((s, c) => s + c.pct, 0) - 100) < 0.5, 'pct');
  }
});

test('rolling window keeps 60 days; periods aggregate the right days', () => {
  const g = newGame(9);
  g.hireWorker(g.workerCandidates()[0].id);
  g.state.money = 1e7;
  const wages = g.state.workers.reduce((s, w) => s + w.wage, 0);
  g.advance(24 * 75);
  assert.equal(g.state.ledger.days.length, LEDGER_DAYS);
  const w7 = g.financeReport('7d'), w30 = g.financeReport('30d');
  assert.equal(w7.days, 7);
  assert.equal(w7.daily.length, 7);
  assert.equal(w30.days, 30);
  near(w7.opex.byCat.find((c) => c.id === 'gaji').amount, 6 * wages);
  near(w30.opex.byCat.find((c) => c.id === 'gaji').amount, 29 * wages);
  near(g.financeReport('all').opex.byCat.find((c) => c.id === 'gaji').amount, 75 * wages);
  assert.equal(g.financeReport('all').days, g.day);
  assert.equal(g.financeReport('bogus').period, '7d');
});

test('save/load keeps the ledger; old saves start an empty one', () => {
  const g = newGame(12);
  runTask(g, startField(), 'plow');
  g.advance(48);
  const g2 = loadGame(g.serialize());
  assert.deepEqual(g2.state.ledger, g.state.ledger);
  assert.deepEqual(g2.financeReport('all'), g.financeReport('all'));
  const old = JSON.parse(g.serialize());
  delete old.ledger;
  const g3 = loadGame(old);
  assert.equal(g3.state.ledger.since, g3.day);
  assert.equal(g3.financeReport('all').opex.total, 0);
  g3.takeLoan(1000);
  assert.equal(g3.financeReport('today').financing.loanIn, 1000);
});

test('unknown or missing categories fall back to lainnya', () => {
  const g = newGame(13);
  g.spend(5);
  g.earn(7, 'nope');
  g.earn(3, 'bbm'); // expense id on income → income fallback
  const r = g.financeReport('today');
  assert.deepEqual(r.opex.byCat.map((c) => c.id), ['lainnya']);
  assert.deepEqual(r.income.byCat.map((c) => [c.id, c.amount]), [['lainnya_masuk', 10]]);
});
