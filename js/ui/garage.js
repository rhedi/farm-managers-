// Garasi tab: 🚜 Mesin (owned: condition, upgrade, repair, sell) | 👷 Pekerja | 🛒 Toko (type chips, locked folded).
import { h, patch, fmtMoney, fmtNum, fmtPct, progressBar, MACHINE_TYPE_LABEL, TASK_LABEL } from './dom.js';
import { subTabBar, getSub, chipBar, fold } from './subtabs.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { workersSection, workersSig } from './workers.js';
import { openUpgradeModal } from './machineUpgrade.js';

const TYPE_ICON = { tractor: '🚜', harvester: '🌾', implement: '🔧', truck: '🚚' };
const TYPE_ORDER = ['tractor', 'harvester', 'implement', 'truck'];
const SUBS = ['machines', 'workers', 'shop'];
const WORN = 0.2; // below this a machine may break down: badge on the Mesin sub-tab
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

const openRows = new Set(); // machine uids whose row is expanded (survives re-renders)

/** Status chip for the collapsed row: busy (where), worn (F10: <50% slower, <20% may break down) or ready. */
function statusChip(m) {
  const c = m.condition ?? 1;
  if (m.busy) return h('span.badge.badge-blue.mach-status', { title: fieldName(m.busy) }, `🚜 ${fieldName(m.busy)}`);
  if (c < WORN) return h('span.badge.badge-red.mach-status', '⚠️ Bisa mogok');
  if (c < 0.5) return h('span.badge.badge-red.mach-status', '🐢 Aus');
  return h('span.badge.badge-green.mach-status', 'Siap');
}

/** Owned machine: compact row (name, condition, status); tap to expand specs and Upgrade / Perbaiki / Jual. */
function ownedItem(m) {
  const c = m.condition ?? 1;
  const canRepair = !m.busy && m.repairCost > 0.5;
  const poor = m.repairCost > app.game.state.money;
  return h('details.mach-row', { open: openRows.has(m.uid),
    ontoggle: (e) => (e.target.open ? openRows.add(m.uid) : openRows.delete(m.uid)) },
  h('summary',
    h('span.card-icon', TYPE_ICON[m.type] ?? '⚙️'),
    h('span.mach-main',
      h('span.card-title', m.paint ? h('span.upg-dot', { style: { background: m.paint }, 'aria-hidden': 'true' }) : null, m.name,
        m.upgradeLevel ? h('span.badge.upg-badge', `🔧 +${m.upgradeLevel}`) : null),
      h('span.mach-cond', progressBar(c, c < 0.5 ? 'thin.ops-red' : 'thin'), h(`span.small${c < 0.5 ? '.ops-bad' : '.muted'}`, `Kondisi ${fmtPct(c)}`))),
    statusChip(m)),
  h('div.mach-body',
    h('div.card-sub', specs(m)),
    c < 0.5 ? h('div.small.ops-bad', c < WORN ? '⚠️ Di bawah 20%: bisa mogok saat mulai bekerja.' : '🐢 Di bawah 50%: tugas 20% lebih lambat.') : null,
    h('div.ops-actions',
      h('button.btn.btn-small.btn-secondary.upg-open', { onclick: () => openUpgradeModal(m.uid) }, '🔧 Upgrade'),
      canRepair ? h(`button.btn.btn-small.${c < 0.5 ? 'btn-primary' : 'btn-secondary'}`, { disabled: poor, title: poor ? 'Uang tidak cukup' : null,
        onclick: () => repairFlow(m) }, `Perbaiki ${fmtMoney(m.repairCost)}`) : null,
      m.busy ? null : h('button.btn.btn-small.btn-danger', { onclick: () => sellFlow(m) }, `Jual ${fmtMoney(m.sellValue)}`))));
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

function shopCard(m) {
  const locked = !m.unlocked;
  const reason = locked ? `🔒 Level ${m.unlockLevel}` : !m.affordable ? 'Uang tidak cukup' : null;
  const warn = locked ? null : hpWarning(m);
  return h(`div.card.shop-card${locked ? '.locked' : ''}`,
    h('div.card-head',
      h('div.card-icon', TYPE_ICON[m.type] ?? '⚙️'),
      h('div.card-main',
        h('div.card-title', m.name),
        h('div.card-sub', specs(m)),
        m.owned || reason ? h('div.shop-note', m.owned ? h('span.badge.badge-green', `Punya ${m.owned}`) : null,
          reason ? h('span.small.muted', reason) : null) : null),
      h(`button.btn.btn-small.shop-buy.${warn || reason ? 'btn-secondary' : 'btn-primary'}`, {
        disabled: !!reason, title: reason ?? warn,
        onclick: () => buyFlow(m, warn),
      }, `Beli ${fmtMoney(m.price)}`)),
    warn ? h('div.small.eco-warn', warn) : null);
}

function computeSig(game) {
  const money = game.state.money;
  return `${getSub('garage', SUBS)}|${getSub('garage-shop', TYPE_ORDER)}|${game.state.level}|${game.state.autoRepair ? 1 : 0}|${game.machinesView().map((m) => `${m.uid}:${m.busy}:${Math.round((m.condition ?? 1) * 100)}:${(m.repairCost ?? 0) <= money ? 1 : 0}:${m.upgradeLevel ?? 0}:${m.paint ?? ''}`).join(',')}|`
    + game.shopView().map((m) => `${m.affordable ? 1 : 0}${m.hpOk === false ? 0 : 1}`).join('') + workersSig(game);
}

function machinesPane(game, owned) {
  return [
    autoRepairToggle(game),
    owned.length
      ? TYPE_ORDER.filter((t) => owned.some((m) => m.type === t)).map((t) => {
        const list = owned.filter((m) => m.type === t);
        return h('section.section',
          h('div.section-title', `${TYPE_ICON[t]} ${MACHINE_TYPE_LABEL[t]}`, h('span.count-chip', String(list.length))),
          h('div.list', list.map(ownedItem)));
      })
      : h('div.empty', 'Garasi kosong. Beli mesin di 🛒 Toko.'),
  ];
}

function shopPane(game, shop) {
  const type = getSub('garage-shop', TYPE_ORDER);
  const list = shop.filter((m) => m.type === type)
    .sort((a, b) => (a.task ?? '').localeCompare(b.task ?? '') || a.price - b.price);
  const open = list.filter((m) => m.unlocked);
  const locked = list.filter((m) => !m.unlocked);
  const lv = locked.map((m) => m.unlockLevel);
  return [
    chipBar('garage-shop', TYPE_ORDER.map((t) => ({ id: t, label: `${TYPE_ICON[t]} ${MACHINE_TYPE_LABEL[t]}` })), type),
    open.length ? h('div.cards', open.map(shopCard)) : h('div.empty.compact', 'Belum ada yang terbuka di levelmu.'),
    locked.length ? fold(`garage-locked-${type}`, '🔒 Terkunci', { meta: `${locked.length} · Lv ${Math.min(...lv)}–${Math.max(...lv)}` },
      h('div.cards', locked.map(shopCard))) : null,
  ];
}

export function renderGarage(root) {
  const game = app.game;
  sig = computeSig(game);
  const owned = game.machinesView();
  const sub = getSub('garage', SUBS);
  const worn = owned.filter((m) => (m.condition ?? 1) < WORN).length;
  patch(root,
    subTabBar('garage', [
      { id: 'machines', icon: '🚜', label: 'Mesin', badge: worn || null, warn: true },
      { id: 'workers', icon: '👷', label: 'Pekerja' },
      { id: 'shop', icon: '🛒', label: 'Toko' },
    ], sub),
    sub === 'machines' ? machinesPane(game, owned)
      : sub === 'workers' ? workersSection(game)
        : shopPane(game, game.shopView()));
}

export function updateGarage(root) {
  if (computeSig(app.game) !== sig) renderGarage(root);
}
