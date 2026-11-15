// Garage tab: owned machines (busy status, sell) + shop grouped by type.
import { h, mount, fmtMoney, fmtNum, fmtPct, progressBar, MACHINE_TYPE_LABEL, TASK_LABEL } from './dom.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { workersSection, workersSig } from './workers.js';
import { openUpgradeModal } from './machineUpgrade.js';

const TYPE_ICON = { tractor: '🚜', harvester: '🌾', implement: '🔧', truck: '🚚' };
const TYPE_ORDER = ['tractor', 'harvester', 'implement', 'truck'];
let sig = '';

function specs(m) {
  if (m.type === 'tractor') return `${m.hp} HP · kecepatan ×${fmtNum(m.speed, 1)} · BBM ${fmtNum(m.fuelPerHour, 1)} L/jam`;
  if (m.type === 'truck') {
    const fuel = m.fuelPerKm * (app.game.data.BALANCE?.fuelPrice ?? 0);
    return `Muatan ${fmtNum(m.capacity, 1)} t · ${fmtNum(m.speedKmh)} km/jam · BBM ${fmtNum(m.fuelPerKm, 2)} L/km (${fmtMoney(fuel * 100)}/100 km)`;
  }
  if (m.type === 'harvester') {
    const d = app.game.data;
    const save = (d.STARTING?.harvesterRentPerHa ?? 0) - m.fuelPerHour * (d.BALANCE?.fuelPrice ?? 0) / m.haPerHour;
    return `${fmtNum(m.haPerHour, 1)} ha/jam · BBM ${fmtNum(m.fuelPerHour, 1)} L/jam · hemat ${fmtMoney(save)}/ha vs sewa`;
  }
  return `${TASK_LABEL[m.task] ?? m.task} · ${fmtNum(m.haPerHour, 1)} ha/jam · butuh ${m.hpRequired} HP`;
}

/** What a busy machine is doing: a field name, or a truck trip ("🚚 Jakarta"). */
function fieldName(id) {
  const trip = app.game.shipmentsView?.().find((t) => t.id === id);
  if (trip) return `${trip.cityEmoji} ${trip.cityName}`;
  return app.game.data.FIELDS.find((f) => f.id === id)?.name ?? id;
}

async function sellFlow(m) {
  const ok = await confirmModal({
    title: 'Jual mesin?',
    message: `${m.name} akan dijual seharga ${fmtMoney(m.sellValue)}.`,
    confirmLabel: 'Jual', danger: true,
  });
  if (ok) act(app.game.sellMachine(m.uid), (r) => `${m.name} terjual (${fmtMoney(r.refund)}).`);
}

function repairFlow(m) {
  act(app.game.repairMachine?.(m.uid), (r) => `${m.name} diperbaiki (${fmtMoney(r.cost)}).`);
}

/** Condition (F10): full-width bar, note on its own line. Red below 50% (slower), warning below 20% (breakdowns). */
function conditionRow(m) {
  if (typeof m.condition !== 'number') return null;
  const c = m.condition;
  const note = c < 0.2 ? ' · ⚠️ bisa mogok' : c < 0.5 ? ' · 🐢 lebih lambat' : '';
  return h('div.ops-cond',
    progressBar(c, c < 0.5 ? 'thin.ops-red' : 'thin'),
    h(`div.small${c < 0.5 ? '.ops-bad' : '.muted'}`, `Kondisi ${fmtPct(c)}${note}`));
}

function ownedItem(m) {
  const canRepair = !m.busy && m.repairCost > 0.5;
  const poor = m.repairCost > app.game.state.money;
  return h('div.list-item.ops-machine',
    h('div.card-icon', TYPE_ICON[m.type] ?? '⚙️'),
    h('div.ops-body',
      h('div.card-title', m.paint ? h('span.upg-dot', { style: { background: m.paint }, 'aria-hidden': 'true' }) : null, m.name,
        m.upgradeLevel ? h('span.badge.upg-badge', `🔧 +${m.upgradeLevel}`) : null),
      h('div.card-sub', specs(m)),
      conditionRow(m),
      h('div.ops-actions',
        h('button.btn.btn-small.btn-secondary.upg-open', { onclick: () => openUpgradeModal(m.uid) }, '🔧 Upgrade'),
        m.busy
          ? h('span.badge.badge-blue', { title: fieldName(m.busy) }, `Dipakai: ${fieldName(m.busy)}`)
          : [canRepair ? h('button.btn.btn-small.btn-secondary', { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
            onclick: () => repairFlow(m) }, `Perbaiki ${fmtMoney(m.repairCost)}`) : null,
          h('button.btn.btn-small.btn-danger', { onclick: () => sellFlow(m) }, `Jual ${fmtMoney(m.sellValue)}`)])));
}

function autoRepairToggle(game) {
  if (!game.setAutoRepair) return null;
  return h('div.ops-autorepair', h('label.ops-autorepair-row',
    h('input', { type: 'checkbox', checked: !!game.state.autoRepair,
      onchange: (e) => act(game.setAutoRepair(e.target.checked), e.target.checked ? '🔧 Perbaikan otomatis aktif.' : 'Perbaikan otomatis mati.') }),
    ' 🔧 Perbaikan otomatis (<30%)'),
    h('div.small.muted.ops-autorepair-hint', 'Mesin diperbaiki setelah bekerja, jika uang cukup.'));
}

function hpWarning(m) {
  if (m.type !== 'implement' || m.hpOk !== false) return null;
  return m.maxTractorHp > 0
    ? `⚠️ Butuh traktor ≥${m.hpRequired} HP (punyamu ${m.maxTractorHp} HP)`
    : `⚠️ Butuh traktor ≥${m.hpRequired} HP (kamu belum punya traktor)`;
}

async function buyFlow(m, warn) {
  if (warn) {
    const ok = await confirmModal({
      title: 'Traktor kurang kuat',
      message: `${warn}. Alat ini belum bisa dipakai sampai kamu membeli traktor yang lebih kuat. Tetap beli?`,
      confirmLabel: 'Tetap beli',
    });
    if (!ok) return;
  }
  act(app.game.buyMachine(m.id), `${m.name} dibeli!`);
}

function shopCard(m, level) {
  const locked = !m.unlocked;
  const reason = locked ? `🔒 Level ${m.unlockLevel}` : !m.affordable ? 'Uang tidak cukup' : null;
  const warn = locked ? null : hpWarning(m);
  return h(`div.card${locked ? '.locked' : ''}`,
    h('div.card-head',
      h('div.card-icon', TYPE_ICON[m.type] ?? '⚙️'),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.card-title', m.name),
        h('div.card-sub', specs(m))),
      m.owned ? h('span.badge.badge-green', `Punya ${m.owned}`) : null),
    warn ? h('div.small.eco-warn', warn) : null,
    h('div.card-actions',
      h('span.small.muted', reason ?? (level >= m.unlockLevel ? m.brand : '')),
      h('span.spacer'),
      h(`button.btn.btn-small.${warn ? 'btn-secondary' : 'btn-primary'}`, {
        disabled: !!reason, title: reason ?? warn,
        onclick: () => buyFlow(m, warn),
      }, `Beli ${fmtMoney(m.price)}`)));
}

function computeSig(game) {
  const money = game.state.money;
  return `${game.state.level}|${game.state.autoRepair ? 1 : 0}|${game.machinesView().map((m) => `${m.uid}:${m.busy}:${Math.round((m.condition ?? 1) * 100)}:${(m.repairCost ?? 0) <= money ? 1 : 0}:${m.upgradeLevel ?? 0}:${m.paint ?? ''}`).join(',')}|`
    + game.shopView().map((m) => `${m.affordable ? 1 : 0}${m.hpOk === false ? 0 : 1}`).join('') + workersSig(game);
}

export function renderGarage(root) {
  const game = app.game;
  sig = computeSig(game);
  const owned = game.machinesView();
  const shop = game.shopView();
  const level = game.state.level;
  mount(root,
    h('section.section',
      h('div.section-title', '🚜 Mesin milikku', h('span.spacer'), h('span.small.muted', `${owned.length} unit`)),
      autoRepairToggle(game),
      owned.length
        ? h('div.list', [...owned].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)).map(ownedItem))
        : h('div.empty', 'Garasi kosong.')),
    workersSection(game),
    TYPE_ORDER.map((t) => h('section.section',
      h('div.section-title', `🛒 Toko — ${MACHINE_TYPE_LABEL[t]}`),
      h('div.cards', shop.filter((m) => m.type === t)
        .sort((a, b) => (a.task ?? '').localeCompare(b.task ?? '') || a.price - b.price)
        .map((m) => shopCard(m, level))))));
}

export function updateGarage(root) {
  if (computeSig(app.game) !== sig) renderGarage(root);
}
