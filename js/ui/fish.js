// Ternak › 🐟 Ikan: pond cards (animated scene, growth / kualitas air / survival, panen, tebar, ganti air, aerator,
// auto toggles) + pelet / build / locked (fishShop.js). Numbers that change daily are patched in place
// (patchFish) so pond animations keep running; only structural changes (fishSig) rebuild the pane.
import { h, fmtMoney, fmtNum, fmtPct, progressBar } from './dom.js';
import { app, act } from './app.js';
import { floatText, vibrate } from './fx.js';
import { sfx } from './sfx.js';
import { pondScene, updateScene, harvestSplash, waterWash, sceneOf } from './fishFx.js';
import { iconOf } from './fishArt.js';
import { pelletPanel, buildFolds } from './fishShop.js';

const meter = (label, v, cls) => h('div.herd-meter', h('div.small', h('span.muted', label), ' ', h('b', fmtPct(v))), progressBar(v, `thin.${cls}`));

function harvest(p, btn) {
  const scene = sceneOf(p.uid);
  const r = act(app.game.harvestPond(p.uid), (x) => `${p.def.emoji} Panen ${fmtNum(x.kg)} kg ${p.product?.name ?? ''}${x.overflow > 0 ? ` · ${fmtNum(x.overflow)} kg dijual paksa (gudang penuh)` : ''}.`);
  if (!r?.ok) return;
  harvestSplash(sceneOf(p.uid) ?? scene ?? btn, p.def);
  floatText(sceneOf(p.uid) ?? btn, `+${fmtNum(r.kg)} kg`, 'harvest');
  sfx('harvest');
  vibrate([15, 30, 15]);
}

function toggle(p, key, label) {
  return h('label.pond-toggle', h('input', { type: 'checkbox', checked: !!p[key === 'water' ? 'autoWater' : 'autoRestock'],
    onchange: (e) => act(app.game.setPondAuto(p.uid, { [key]: e.target.checked })) }), h('span', label));
}

// Live parts of a card (rebuilt by the patch; none of them animate).
const subText = (p) => (p.count === 0 ? `Kapasitas ${fmtNum(p.def.capacity)} ekor · benih ${fmtMoney(p.def.capacity * p.def.fryPrice)}`
  : `${fmtNum(p.count)} ekor · ${p.ready ? 'panen sekarang' : `±${p.daysLeft} hari lagi`} · ≈ ${fmtNum(p.expectedKg)} kg`);
const status = (p) => (p.count === 0 ? h('span.badge.pond-status', 'Kosong') : p.ready ? h('span.badge.badge-green.pond-ready-badge.pond-status', '✅ Siap panen')
  : h('span.badge.badge-blue.pond-status', `${Math.floor(p.growth * 100)}%`));
const meters = (p) => (p.count > 0 ? h('div.herd-meters.pond-meters',
  meter('Tumbuh', p.growth, 'gold'), meter('Air', p.water / 100, p.waterBad ? 'ops-red' : p.waterLow ? 'gold' : 'blue'),
  meter('Hidup', p.survival, 'green')) : h('div.pond-meters.pond-none'));
const info = (p) => (p.count > 0 ? h(`div.small.pond-info${p.waterBad ? '.neg' : '.muted'}`,
  `🟤 ${fmtNum(p.feedPerDay, 1)} kg pelet/hari · ${p.fed < 1 ? '⚠️ kurang pelet · ' : ''}`
  + `${p.growthRate < 1 ? `tumbuh ×${fmtNum(p.growthRate, 2)} · ` : ''}mati ${fmtNum(p.mortalityPct, 1)}%/hari`) : h('div.pond-info.pond-none'));
const harvestLabel = (p) => `🎣 Panen ${fmtNum(p.expectedKg)} kg`;

function pondCard(p) {
  const game = app.game, money = game.state.money, d = p.def;
  const fryCost = d.capacity * d.fryPrice;
  return h(`div.card.pond-card${p.waterBad ? '.pond-alert' : ''}`, { dataset: { pond: p.uid } },
    h('div.card-head',
      h('div.card-icon', iconOf(d)),
      h('div.card-main', h('div.card-title', d.name, p.aerator ? h('span.pond-aer', ' 🫧') : null), h('div.card-sub.pond-sub', subText(p))),
      status(p)),
    pondScene(p), meters(p), info(p),
    h('div.card-actions.pond-actions',
      p.ready ? h('button.btn.btn-primary.pond-harvest', { onclick: (e) => harvest(p, e.currentTarget) }, harvestLabel(p)) : null,
      p.count === 0 ? h('button.btn.btn-primary', { dataset: { role: 'stock' }, disabled: money < fryCost, title: money < fryCost ? 'Uang tidak cukup' : null,
        onclick: () => act(game.stockPond(p.uid), (r) => `${d.emoji} ${fmtNum(r.count)} benih ditebar (${fmtMoney(r.cost)}).`) },
      `🐟 Tebar benih ${fmtMoney(fryCost)}`) : null,
      h('button.btn.btn-small.btn-secondary', { dataset: { role: 'water' }, disabled: p.water >= 99.5 || money < d.waterCost,
        onclick: () => { if (act(game.changeWater(p.uid), `💧 Air ${d.name} diganti.`)?.ok) waterWash(sceneOf(p.uid)); } },
      `💧 Ganti air ${fmtMoney(d.waterCost)}`),
      p.aerator ? null : h('button.btn.btn-small.btn-secondary', { dataset: { role: 'aerator' }, disabled: money < p.aeratorCost,
        onclick: () => act(game.buyAerator(p.uid), '🫧 Aerator terpasang: air lebih awet.') }, `🫧 Aerator ${fmtMoney(p.aeratorCost)}`)),
    h('div.pond-toggles', toggle(p, 'water', 'Ganti air otomatis (<50%)'), toggle(p, 'restock', 'Tebar ulang setelah panen')));
}

/** Ponds needing attention: ready to harvest, water < 50% or pelet for < 1 day (Ikan sub-tab badge). */
export function fishAlerts(game, v = game.fishView()) {
  const noPellet = v.pellet.daysLeft != null && v.pellet.daysLeft < 1;
  return v.ponds.filter((p) => p.count > 0 && (p.ready || p.water < 50 || noPellet)).length;
}

/** Structural signature: a change rebuilds the pane (which ponds/defs exist, filled/ready/aerator, toggles, build affordability). */
export function fishSig(game) {
  const v = game.fishView(), m = game.state.money;
  return v.ponds.map((p) => `${p.uid}:${p.count > 0}:${p.ready}:${p.aerator}:${p.autoWater}:${p.autoRestock}`).join(',')
    + '|' + v.defs.map((d) => `${d.unlocked}:${d.owned}:${m >= d.buildCost ? 1 : 0}`).join('');
}

/** Pond button enabled states (patched in place). */
function buttonStates(p, money) {
  return { stock: money < p.def.capacity * p.def.fryPrice, water: p.water >= 99.5 || money < p.def.waterCost, aerator: money < p.aeratorCost };
}

/** Everything else the pane shows (patched in place). */
export function fishLiveSig(game) {
  const v = game.fishView(), m = game.state.money;
  return `${v.pellet.stock}:${v.pellet.needPerDay}:${[3, 7].map((d) => game.pelletQuote(d)?.affordable).join(':')}|`
    + v.ponds.map((p) => `${p.count}:${p.growth}:${p.water}:${p.fed}:${Object.values(buttonStates(p, m)).join('')}`).join(',');
}

export function fishPane() {
  const v = app.game.fishView();
  const anyOpen = v.defs.some((d) => d.unlocked);
  return h('section.section.fish-section',
    h('div.section-title', '🐟 Kolamku', h('span.small.muted', `${v.ponds.length} kolam`)),
    v.ponds.length ? [pelletPanel(v), h('div.cards', v.ponds.map(pondCard))]
      : h('div.empty.compact', anyOpen ? 'Belum punya kolam. Bangun kolam pertama di bawah.'
        : `Peternakan ikan terbuka di level ${Math.min(...v.defs.map((d) => d.unlockLevel))}.`),
    buildFolds(v),
    h('p.hint', 'Ikan makan pelet tiap hari. Air kotor (<40%) memperlambat tumbuh & membunuh ikan — ganti air atau pasang aerator. Hasil panen masuk Gudang dingin.'));
}

/** Update numbers, meters and scenes of the rendered pane without touching the animated nodes. */
export function patchFish(root) {
  const v = app.game.fishView();
  root.querySelector('.pond-pellet')?.replaceWith(pelletPanel(v));
  for (const p of v.ponds) {
    const card = root.querySelector(`.pond-card[data-pond="${p.uid}"]`);
    if (!card) continue;
    card.classList.toggle('pond-alert', p.waterBad);
    for (const [role, off] of Object.entries(buttonStates(p, app.game.state.money))) {
      const b = card.querySelector(`button[data-role="${role}"]`);
      if (b && b.disabled !== off) b.disabled = off;
    }
    const sub = card.querySelector('.pond-sub');
    if (sub.textContent !== subText(p)) sub.textContent = subText(p);
    card.querySelector('.pond-status').replaceWith(status(p));
    card.querySelector('.pond-meters').replaceWith(meters(p));
    card.querySelector('.pond-info').replaceWith(info(p));
    const hb = card.querySelector('.pond-harvest');
    if (hb) hb.textContent = harvestLabel(p);
    updateScene(card.querySelector('.pond-scene'), p);
    const st = status(p), old = card.querySelector('.pond-status');
    if (old.textContent !== st.textContent) old.replaceWith(st);
  }
}
