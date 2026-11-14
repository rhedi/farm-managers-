import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVALS, rivalNetWorth, rivalCurve } from '../js/engine/rivals.js';
import { newGame } from './helpers.js';

test('rival net worth is deterministic per seed and grows over time', () => {
  for (const r of RIVALS) {
    assert.equal(rivalNetWorth(1, r, 40), rivalNetWorth(1, r, 40));
    assert.ok(rivalNetWorth(1, r, 200) > rivalNetWorth(1, r, 1) * 1.5, r.id);
  }
  assert.notEqual(rivalNetWorth(1, RIVALS[1], 40), rivalNetWorth(2, RIVALS[1], 40));
  const a = newGame(21), b = newGame(21);
  a.advance(24 * 10); b.advance(24 * 10);
  assert.deepEqual(a.leaderboard(), b.leaderboard());
});

test('volatile rivals swing more than steady ones', () => {
  const swing = (r) => {
    let s = 0;
    for (let d = 2; d < 120; d++) s += Math.abs(Math.log(rivalNetWorth(7, r, d) / rivalNetWorth(7, r, d - 1)));
    return s;
  };
  const by = (p) => RIVALS.filter((r) => r.personality === p);
  assert.ok(Math.min(...by('volatile').map(swing)) > Math.max(...by('steady').map(swing)));
});

test('curve: player starts mid-pack, top rival is far ahead and still large late', () => {
  const g = newGame(42), lb = g.leaderboard();
  assert.equal(lb.length, RIVALS.length + 1);
  assert.deepEqual(lb.map((x) => x.rank), lb.map((_, i) => i + 1));
  assert.ok(lb.every((x, i) => i === 0 || lb[i - 1].netWorth >= x.netWorth), 'sorted');
  const me = lb.find((x) => x.isPlayer);
  assert.ok(me.rank > 1 && me.rank < lb.length, `start rank ${me.rank}`);
  const top = RIVALS.reduce((m, r) => (rivalNetWorth(42, r, 200) > rivalNetWorth(42, m, 200) ? r : m));
  assert.ok(rivalNetWorth(42, top, 100) > 500000 && rivalNetWorth(42, top, 200) > 1500000);
  const weakest = Math.min(...RIVALS.map((r) => rivalNetWorth(42, r, 60)));
  assert.ok(weakest < 150000, 'some rivals are beatable by mid-game');
});

test('rank_up is emitted when the player passes rivals; change tracks places gained', () => {
  const g = newGame(42), ev = [];
  g.on((e) => ev.push(e));
  const start = g.leaderboard().find((x) => x.isPlayer).rank;
  g.state.money += 5e6;
  assert.ok(g.leaderboard().find((x) => x.isPlayer).change > 0, 'live change before rollover');
  g.advance(24);
  const ups = ev.filter((e) => e.type === 'rank_up');
  assert.equal(ups.length, 1);
  assert.equal(ups[0].rank, 1);
  assert.equal(ups[0].passed.length, start - 1);
  const me = g.leaderboard().find((x) => x.isPlayer);
  assert.equal(me.rank, 1);
  assert.equal(me.change, 0);
  g.advance(24);
  assert.equal(ev.filter((e) => e.type === 'rank_up').length, 1, 'no repeat while rank holds');
});

test('keypoint curves: geometric between points, still growing after the last point (elite never stalls)', () => {
  const elite = RIVALS.find((r) => r.id === 'nusantara');
  const [[d0, v0], [d1, v1]] = elite.points;
  assert.equal(rivalCurve(elite, d0), v0);
  assert.equal(Math.round(rivalCurve(elite, d1)), v1);
  assert.ok(Math.abs(rivalCurve(elite, (d0 + d1) / 2) - Math.sqrt(v0 * v1)) < 1);
  for (const r of RIVALS) {
    const last = r.points[r.points.length - 1][0];
    assert.ok(rivalCurve(r, last + 300) > rivalCurve(r, last) * 1.1, r.id);
    for (let d = 2; d < last + 300; d += 7) assert.ok(rivalCurve(r, d) >= rivalCurve(r, d - 1), `${r.id} monotone d${d}`);
  }
  // Calibrated on Lv30 data: elite ≈ $25M at day 400 (overtaken ≈ Lv 20–23), #2 rival ≈ $1M at day 180.
  assert.ok(rivalCurve(elite, 400) > 15e6 && rivalCurve(elite, 400) < 40e6);
  const second = RIVALS.find((r) => r.id === 'iowagolden');
  assert.ok(rivalCurve(second, 180) < 1.5e6 && rivalCurve(second, 180) > 0.5e6);
});
