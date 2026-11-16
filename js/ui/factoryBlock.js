// Manajer Pabrik card: a managed factory idle for ≥ 1 game day → clear reason + one-tap fix
// (engine factoryManagerView().blocked, js/engine/factoryManager.js).
import { h, fmtHours } from './dom.js';
import { app, act } from './app.js';
import { goTo } from './subtabs.js';

const WHY = {
  'bahan kurang': 'bahan baku kurang',
  'gudang hampir penuh': 'gudang hampir penuh',
  'margin terlalu kecil': 'untungnya di bawah margin minimum',
};

function runFix(fix) {
  const game = app.game;
  if (fix.action === 'buyInputs') return act(game.setFactoryManagerSettings({ buyInputs: true }), '🛒 Direktur kini membeli bahan yang kurang di pasar.');
  if (fix.action === 'margin') return act(game.setFactoryManagerSettings({ minMargin: 0 }), 'Margin minimum kini 0%.');
  if (fix.action === 'storage') return act(game.upgradeStorage(fix.kind), (r) => `Silo kini Lv ${r.level}.`);
  return goTo('market', 'prices');
}

/** Red box under the card's status, or null. */
export function factoryBlockBox(blocked) {
  if (!blocked) return null;
  const { fix } = blocked;
  return h('div.fm-blocked', { role: 'alert' },
    h('div', h('b', `⛔ ${blocked.factories.join(', ')} menganggur ${fmtHours(blocked.hours)}`),
      h('div.small', `Alasan: ${WHY[blocked.reason] ?? blocked.reason}${blocked.missing.length ? ` (${blocked.missing.join(', ')})` : ''}.`
        + (fix.action === 'market' ? ' Tanam bahan dengan rencana ladang (stoknya kini disisakan untuk pabrik) atau beli di Pasar.' : ''))),
    h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => runFix(fix) }, fix.label));
}
