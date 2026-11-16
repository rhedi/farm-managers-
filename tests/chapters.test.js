import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from '../js/engine.js';
import { CHAPTERS, STEPS } from '../js/engine/chapters.js';
import { DATA, newGame, cheapestOtherField, starterCrop } from './helpers.js';

test('chapter chain: hidden until the first sale, then one step at a time with progress and "Tunjukkan" target', () => {
  const g = newGame(31);
  let v = g.chaptersView();
  assert.equal(v.started, false);
  assert.equal(v.current.id, 'field2');
  g.state.silo.wheat = 2;
  g.sellProduct('wheat', 1);
  v = g.chaptersView();
  assert.equal(v.started, true);
  assert.equal(v.chapter.index, 1);
  assert.equal(v.current.status, 'active');
  assert.deepEqual(v.current.go, { tab: 'farm', sub: 'map' });
  assert.equal(v.current.progress, 1);
  assert.equal(g.claimChapterStep('field2').ok, false, 'goal not met');
  assert.equal(g.claimChapterStep('plan').ok, false, 'not the current step');
  g.state.money = 1e7;
  assert.equal(g.buyField(cheapestOtherField(g).id).ok, true);
  v = g.chaptersView();
  assert.equal(v.ready, true);
  assert.equal(v.current.status, 'ready');
  const m0 = g.state.money, xp0 = g.state.xp;
  const r = g.claimChapterStep('field2');
  assert.equal(r.ok, true);
  assert.ok(r.money >= STEPS[0].reward);
  assert.equal(g.state.money, m0 + r.money);
  assert.ok(g.state.xp >= xp0 + r.xp);
  assert.equal(g.claimChapterStep('field2').ok, false, 'claim once');
  assert.equal(g.chaptersView().current.id, 'plan');
  g.setFieldPlan(Object.keys(g.state.fields)[0], { cropId: starterCrop().id });
  assert.equal(g.chaptersView().ready, true);
});

test('level-gated steps report locked; last step of a chapter gives +1 research point', () => {
  const g = newGame(32);
  g.state.chapters.claimed = STEPS.filter((s) => s.chapterId === 'bab1').map((s) => s.id);
  const v = g.chaptersView();
  assert.equal(v.chapter.id, 'bab2');
  assert.equal(v.current.id, 'pond');
  assert.equal(v.current.locked, true);
  assert.equal(v.current.level, 3);
  const last = CHAPTERS[0].steps.at(-1);
  assert.equal(STEPS.find((s) => s.id === last.id).last, true);
  g.state.chapters.claimed = STEPS.slice(0, 3).map((s) => s.id);
  g.state.stats.contractsDone = 1;
  const pts = g.researchPoints().available;
  assert.equal(g.claimChapterStep('contract1').rp, 1);
  assert.equal(g.researchPoints().available, pts + 1);
});

test('chapter rewards scale with recent income', () => {
  const g = newGame(33);
  const L = g.state.ledger;
  L.days = [{ day: 0, cats: { penjualan_panen: 4e6 } }];
  const v = g.chaptersView();
  assert.ok(v.current.reward.money >= 0.15 * 4e6 * 0.95 && v.current.reward.money <= 0.15 * 4e6 * 1.05);
});

test('old saves: already-met steps complete silently once (no reward), one notice', () => {
  const g = newGame(34);
  g.state.money = 1e8;
  g.state.level = 12;
  g.buyField(cheapestOtherField(g).id);
  g.state.stats.contractsDone = 12;
  g.state.stats.salesValue = 1000;
  const old = JSON.parse(g.serialize());
  delete old.chapters;
  const b = loadGame(old, { data: DATA });
  const m0 = b.state.money;
  assert.ok(b.state.chapters.claimed.includes('field2'));
  assert.ok(b.state.chapters.claimed.includes('contract1'));
  assert.ok(b.state.chapters.claimed.includes('contracts10'));
  assert.equal(b.state.money, m0);
  assert.equal(b.takeChapterNotice(), 3);
  assert.equal(b.takeChapterNotice(), 0);
  assert.equal(b.chaptersView().current.id, 'plan', 'first unmet step is current');
  // Round trip keeps progress; new games start unseeded-free.
  const c = loadGame(b.serialize(), { data: DATA });
  assert.deepEqual(c.state.chapters, b.state.chapters);
  assert.deepEqual(newGame(35).state.chapters, { claimed: [], seeded: true, notice: 0 });
});
