// Ternak › Ikan: pelet stock + purchase, ponds to build (economics) and locked ponds (reason). Pond cards: fish.js.
import { h, fmtMoney, fmtNum } from './dom.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';
import { iconOf } from './fishArt.js';

/** Pelet stock, days left and 3/7-day buttons (replaced as a whole by the in-place patch). */
export function pelletPanel(v) {
  const game = app.game, pl = v.pellet;
  const low = pl.daysLeft != null && pl.daysLeft < 3;
  const btn = (days, label, primary) => {
    const q = game.pelletQuote(days);
    return q ? h(`button.btn.btn-small.${primary ? 'btn-primary' : 'btn-secondary'}`, { disabled: !q.affordable,
      onclick: () => act(game.buyPellet(days), (r) => `🟤 Pelet ikan dibeli: ${fmtNum(r.qty, 2)} t (${fmtMoney(r.cost)}).`) },
    `${label} (${fmtMoney(q.cost)})`) : null;
  };
  return h(`div.pond-pellet${low ? '.neg' : ''}`,
    h('div', `${low ? '⚠️' : '🟤'} Pelet ikan: `, h('b', `${fmtNum(pl.stock, 2)} t`),
      pl.daysLeft != null ? ` · cukup ${pl.daysLeft} hari (${fmtNum(pl.needPerDay * 1000)} kg/hari)` : ' · belum ada ikan'),
    h('div.card-actions', btn(3, '🟤 Pelet 3 hari', low), btn(7, '7 hari', false)),
    h('div.small.muted', 'Pelet juga bisa diproduksi di Pabrik Pakan Ikan (kedelai + jagung) atau dibeli di Pasar.'));
}

function buildRow(d) {
  const game = app.game, e = d.economics, poor = game.state.money < d.buildCost;
  return h('div.list-item.pond-start',
    h('div.card-icon', iconOf(d)),
    h('div.card-main',
      h('div.card-title', d.name, d.owned ? h('span.badge.pond-owned', `punya ${d.owned}`) : null),
      h('div.pond-facts',
        h('span', `🐟 ${fmtNum(d.capacity)} ekor`), h('span', `⏱️ ${d.growDays} hari`),
        h('span', `⚖️ ${fmtNum(e.kg)} kg/panen`), h('span', `🐣 benih ${fmtMoney(e.fryCost)}`)),
      h('div.small.pond-econ', 'Untung ≈ ', h(`b.${e.profitPerDay >= 0 ? 'pos' : 'neg'}`, `${fmtMoney(e.profitPerDay)}/hari`),
        h('span.muted', e.paybackDays ? ` · balik modal ±${e.paybackDays} hari` : ' · rugi di harga sekarang')),
      d.climate ? h('div.small.muted', `🌍 ${d.climate === 'tropical' ? 'Wilayah tropis' : 'Wilayah dingin'} ✓`) : null,
      h('div.card-actions', h('button.btn.btn-primary.pond-build-btn', { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => act(game.buildPond(d.id), `${d.emoji} ${d.name} dibangun! Tebar benih untuk mulai.`) },
      `🏗️ Bangun ${fmtMoney(d.buildCost)}`), poor ? h('span.small.pond-poor', `Uang kurang ${fmtMoney(d.buildCost - game.state.money)}`) : null)));
}

function lockedRow(d) {
  const lvl = app.game.state.level >= d.unlockLevel;
  return h('div.list-item.locked.pond-locked',
    h('div.card-icon', iconOf(d)),
    h('div.card-main', h('div.card-title', d.name),
      h('div.card-sub', `${fmtMoney(d.buildCost)} · ${fmtNum(d.capacity)} ekor · ${d.growDays} hari`),
      h('div.small.pond-lock-reason', `🔒 ${d.reason}`)),
    h('span.badge', lvl ? '🌍 Wilayah' : `Lv ${d.unlockLevel}`));
}

/** "Bangun kolam" (open defs) and "Kolam terkunci" folds. */
export function buildFolds(v) {
  const open = v.defs.filter((d) => d.unlocked), locked = v.defs.filter((d) => !d.unlocked);
  return [
    open.length ? fold('fish-build', '🏗️ Bangun kolam', { open: !v.ponds.length, meta: String(open.length) },
      h('div.list', open.map(buildRow))) : null,
    locked.length ? fold('fish-locked', '🔒 Kolam terkunci', { meta: `${locked.length} · Lv ${Math.min(...locked.map((d) => d.unlockLevel))}+` },
      h('div.list', locked.map(lockedRow))) : null,
  ];
}
