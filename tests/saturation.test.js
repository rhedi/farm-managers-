// v17 balance: 📉 pasar jenuh (animal/fish/processed prices dip with the amount sold, recover over days) and the
// rising barn/pond expansion cost. Consumer-visible behaviour only (sale earnings, quotes, views, prices to pay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, newGame } from './helpers.js';
import { loadGame } from '../js/engine.js';
import { depthValue } from '../js/engine/saturation.js';

const SAT = DATA.BALANCE.market.saturation;

function game(level = 10) {
  const g = newGame(5);
  g.state.level = level;
  g.state.money = 1e8;
  return g;
}
/** Units whose base value is `frac` of the market depth at the game's level (selling them dips the price by `frac`). */
const unitsFor = (g, id, frac) => frac * depthValue(g) / g.idx.products.get(id).basePrice;

test('selling a lot of milk at once dips the price; the next sale the same day earns less per unit', () => {
  const g = game();
  const q = unitsFor(g, 'milk', 0.2); // a fifth of the market depth
  g.state.silo.milk = 3 * q;
  const price = g.state.market.milk;
  const first = g.sellProduct('milk', q);
  assert.equal(first.ok, true);
  assert.ok(first.earned < q * price * 0.95 && first.earned > q * price * 0.85, `avg dip ≈ 10%: ${first.earned / (q * price)}`);
  const second = g.sellProduct('milk', q);
  assert.ok(second.earned < first.earned * 0.9, 'the second batch sells into a dipped market');
  // the market price itself (the random walk) is untouched; the dip is a separate, shown factor
  assert.equal(g.state.market.milk, price);
  const item = g.siloView().items.find((i) => i.id === 'milk');
  assert.ok(Math.abs(item.dip - 0.4) < 0.01, `dip ${item.dip}`);
  assert.equal(item.dipToday, true);
  assert.ok(item.saleValue < item.sellable * price * 0.6 + 1e-6, 'quote of the rest includes the dip');
  assert.ok(Math.abs(g.marketView().find((p) => p.id === 'milk').dip - 0.4) < 0.01);
});

test('one big dump earns the same as the same amount in pieces on one day; spreading over days earns more', () => {
  const a = game(), b = game(), c = game();
  const q = Math.round(unitsFor(a, 'cheese', 0.3) / 3) * 3; // whole kg, split in 3 exactly
  for (const g of [a, b, c]) g.state.silo.cheese = q;
  const one = a.sellProduct('cheese', q).earned;
  let pieces = 0;
  for (let i = 0; i < 3; i++) pieces += b.sellProduct('cheese', q / 3).earned;
  assert.ok(Math.abs(one - pieces) < 0.05, `${one} vs ${pieces}`);
  // over three days (market random walk neutralised by comparing price factors)
  let spread = 0;
  for (let i = 0; i < 3; i++) {
    const m = c.state.market.cheese, r = c.sellProduct('cheese', q / 3);
    spread += r.earned / m;
    c.advance(24);
  }
  assert.ok(spread > one / a.state.market.cheese + 1, 'selling over days beats dumping');
});

test('the dip recovers over a few days without sales', () => {
  const g = game();
  const q = unitsFor(g, 'eggs', 0.3);
  g.state.silo.eggs = q;
  g.sellProduct('eggs', q);
  const dips = [g.saleQuote('eggs').dip];
  for (let d = 0; d < 6; d++) { g.advance(24); dips.push(g.saleQuote('eggs').dip); }
  for (let i = 1; i < dips.length; i++) assert.ok(dips[i] < dips[i - 1], `falls every day: ${dips}`);
  assert.ok(dips[3] < dips[0] * 0.15, `mostly gone after 3 days: ${dips}`);
  assert.equal(g.saleQuote('eggs').today, false);
});

test('crops and buyable goods never saturate; a bigger farm has a deeper market', () => {
  const g = game();
  g.state.silo.wheat = 5000;
  const price = g.state.market.wheat;
  assert.equal(g.sellProduct('wheat', 5000).earned, Math.round(5000 * price * 100) / 100);
  assert.equal(g.saleQuote('wheat', 1e6).mult, 1);
  assert.equal(g.saleQuote('pelet_ikan', 1e6).mult, 1);
  const low = game(5), high = game(30);
  assert.ok(high.saleQuote('milk', 50000).mult > low.saleQuote('milk', 50000).mult);
  assert.ok(low.saleQuote('milk', 1e9).mult >= 1 - SAT.maxDip - 1e-9, 'the dip is capped');
});

test('Gudang dingin overflow is a sale too: it earns less after a big sale and adds to the dip', () => {
  const run = (presell) => {
    const g = game();
    const q = unitsFor(g, 'milk', 0.3);
    if (presell) { g.state.silo.milk = q; g.sellProduct('milk', q); }
    const cap = g.storageInfo('cold').capacity;
    g.state.silo.milk = cap * 1000; // full: everything stored next is force-sold
    const evs = [];
    g.on((e) => e.type === 'cold_overflow' && evs.push(e));
    const dip0 = g.saleQuote('milk').dip;
    g.buildBarn('cows'); g.buyAnimal('cows', 20); g.buyFeed('cows', 3);
    g.advance(24);
    return { per: evs[0].earned / evs[0].qty / g.state.market.milk, dip0 };
  };
  const fresh = run(false), dipped = run(true);
  assert.ok(dipped.dip0 > 0.2);
  assert.ok(dipped.per < fresh.per * 0.9, `${dipped.per} vs ${fresh.per}`);
});

test('saturation survives save/load; an old save without it loads with no dip and no herd loss', () => {
  const g = game();
  g.buildBarn('cows'); g.buyAnimal('cows', 20);
  g.state.silo.milk = 10000;
  g.sellProduct('milk', 10000);
  const dip = g.saleQuote('milk').dip;
  const back = loadGame(g.serialize(), { data: DATA });
  assert.equal(back.saleQuote('milk').dip, dip);
  const old = JSON.parse(g.serialize());
  delete old.saturation;
  const o = loadGame(JSON.stringify(old), { data: DATA });
  assert.equal(o.saleQuote('milk').dip, 0);
  assert.equal(o.state.animals.cows.count, 20);
  assert.equal(o.state.animals.cows.barns, 1);
});

test('barn cost rises with every barn of that animal; other animals and the first barn keep the base price', () => {
  const g = game(10);
  const cow = DATA.ANIMALS.find((a) => a.id === 'cows');
  const view = () => g.animalsView().find((a) => a.id === 'cows');
  assert.equal(view().barnCost, cow.barnCost);
  const costs = [];
  for (let i = 0; i < 30; i++) {
    const want = view().barnCost, m0 = g.state.money;
    const r = g.buildBarn('cows');
    assert.equal(r.ok, true);
    assert.equal(r.cost, want);
    assert.ok(Math.abs(m0 - g.state.money - want) < 1e-6, 'pays the shown price');
    costs.push(want);
  }
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] >= costs[i - 1]);
  const rate = DATA.BALANCE.expansion.barn;
  assert.ok(Math.abs(view().barnCost / cow.barnCost - (1 + rate * 30)) < 0.01, 'base × (1 + rate × owned)');
  assert.equal(view().baseBarnCost, cow.barnCost);
  assert.equal(g.animalsView().find((a) => a.id === 'chickens').barnCost, DATA.ANIMALS[0].barnCost);
  g.state.money = view().barnCost - 1;
  assert.equal(g.buildBarn('cows').ok, false);
});

test('pond cost rises per pond of that type', () => {
  const g = game(10);
  const def = DATA.PONDS.find((p) => p.id === 'lele');
  const view = () => g.fishView().defs.find((d) => d.id === 'lele');
  assert.equal(view().buildCost, def.buildCost);
  for (let i = 0; i < 10; i++) assert.equal(g.buildPond('lele').ok, true);
  assert.ok(view().buildCost > def.buildCost);
  assert.ok(Math.abs(view().buildCost / def.buildCost - (1 + DATA.BALANCE.expansion.pond * 10)) < 0.01);
});
