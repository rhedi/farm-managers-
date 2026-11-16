// Gudang: red "Gudang penuh" warning card above the store capacity card when stock was force-sold (70% of market)
// yesterday or today (engine overflowView, js/engine/overflow.js), with a one-tap store upgrade.
import { h, fmtMoney, fmtNum } from './dom.js';

const BTN = { silo: 'Perbesar silo', cold: 'Perbesar gudang dingin' };
const ICON = { silo: '🏚️', cold: '❄️' };

/** Signature part for the Gudang re-render check. */
export function overflowSig(game) {
  const v = game.overflowView();
  return v ? v.kinds.map((k) => `${k.kind}:${k.yesterday?.lost ?? 0}:${k.today?.lost ?? 0}:${k.affordable ? 1 : 0}`).join(',') : '';
}

/** Card for store `kind` ('silo' | 'cold'), or null when it did not overflow; `onUpgrade(info)` runs the upgrade flow. */
export function overflowCard(game, kind, onUpgrade) {
  const k = game.overflowView()?.kinds.find((x) => x.kind === kind);
  if (!k) return null;
  const when = k.yesterday ? 'kemarin' : 'hari ini';
  const t = k.yesterday ?? k.today;
  const extra = k.yesterday && k.today ? h('div.small', `Hari ini sudah ${fmtNum(k.today.tons, 1)} t lagi (rugi ${fmtMoney(k.today.lost)}).`) : null;
  return h(`div.card.overflow-card.store-${kind}`, { role: 'alert' },
    h('div.overflow-head', h('span.overflow-icon', ICON[kind]),
      h('div', h('strong', `Gudang penuh — ${when} ${fmtMoney(t.earned)} dijual paksa`),
        h('div.overflow-loss', `rugi ${fmtMoney(t.lost)} · ${fmtNum(t.tons, 1)} t tidak muat ${k.name.toLowerCase()} (dijual 70% harga pasar)`))),
    extra,
    h('button.btn.btn-danger.btn-block.overflow-up', { type: 'button', disabled: !k.affordable,
      onclick: () => onUpgrade(game.storageInfo(kind)) },
    `🏗️ ${BTN[kind]} (${fmtMoney(k.upgradeCost)})`),
    k.affordable ? null : h('div.small.ops-bad', `💰 Butuh ${fmtMoney(k.upgradeCost)}`));
}
