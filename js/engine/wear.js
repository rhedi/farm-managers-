// Machine wear (F10): condition 1 → 0 with working hours; worn machines are slower and may break down.
import { random, round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { perk } from './research.js';

export const WEAR_PER_HOUR = 0.002;
export const SLOW_BELOW = 0.5;
export const SLOW_FACTOR = 1.25; // 20% slower = hours / 0.8
export const BREAKDOWN_BELOW = 0.2;
export const BREAKDOWN_CHANCE = 0.05;
export const BREAKDOWN_FACTOR = 1.5;
export const REPAIR_RATE = 0.3;

const cfg = (game) => game.data.BALANCE.wear ?? {};
export const conditionOf = (m) => (typeof m?.condition === 'number' ? m.condition : 1);

/** Wear the machines of a running task by `hours` of work (`rate` per hour; research perk 'wear' reduces it). */
export function wearMachines(game, uids, hours, rate = cfg(game).perHour ?? WEAR_PER_HOUR) {
  rate *= 1 - perk(game, 'wear');
  for (const uid of uids) {
    const m = game.state.machines.find((x) => x.uid === uid);
    if (m) m.condition = Math.max(0, Math.round((conditionOf(m) - rate * hours) * 1e5) / 1e5);
  }
}

/** Duration multiplier from the worst machine of a rig (1 or SLOW_FACTOR). */
export function wearFactor(game, uids) {
  const worst = Math.min(1, ...uids.map((uid) => conditionOf(game.state.machines.find((m) => m.uid === uid))));
  return worst < (cfg(game).slowBelow ?? SLOW_BELOW) ? SLOW_FACTOR : 1;
}

/**
 * At task start: if a rig machine is below BREAKDOWN_BELOW, roll BREAKDOWN_CHANCE.
 * On a breakdown the task takes BREAKDOWN_FACTOR × longer and 'machine_breakdown' fires.
 * Returns the duration multiplier. Only draws RNG when a machine is that worn.
 */
export function rollBreakdown(game, uids, fieldId) {
  const c = cfg(game);
  const below = c.breakdownBelow ?? BREAKDOWN_BELOW;
  const m = uids.map((uid) => game.state.machines.find((x) => x.uid === uid)).find((x) => x && conditionOf(x) < below);
  if (!m || random(game.state) >= (c.breakdownChance ?? BREAKDOWN_CHANCE)) return 1;
  const d = game.idx.machines.get(m.defId);
  const fname = game.idx.fields.get(fieldId)?.name ?? fieldId;
  game.emit('machine_breakdown', `🔧 ${d?.name ?? m.uid} mogok di ${fname}! Tugas jadi lebih lama. Perbaiki di Garasi.`,
    { uid: m.uid, fieldId });
  return c.breakdownFactor ?? BREAKDOWN_FACTOR;
}

export function repairCost(game, m) {
  const price = game.idx.machines.get(m.defId)?.price ?? 0;
  return round2(price * (1 - conditionOf(m)) * (cfg(game).repairRate ?? REPAIR_RATE));
}

export function repairMachine(game, uid) {
  const m = game.state.machines.find((x) => x.uid === uid);
  if (!m) return { ok: false, reason: 'Mesin tidak ditemukan.' };
  if (m.busy) return { ok: false, reason: 'Mesin sedang dipakai.' };
  const cost = repairCost(game, m);
  if (!(cost > 0)) return { ok: false, reason: 'Mesin masih dalam kondisi prima.' };
  if (!game.spend(cost, 'perbaikan')) return { ok: false, reason: 'Uang tidak cukup.' };
  m.condition = 1;
  const d = game.idx.machines.get(m.defId);
  game.emit('machine_repaired', `${d?.name ?? uid} selesai diperbaiki (${fmtMoney(cost)}).`, { uid, cost });
  return { ok: true, cost };
}
