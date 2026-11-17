// Machine upgrades: per owned instance, tracks engine / transmission / efficiency, levels 0–3.
// effectiveStats() is the single source of upgraded hp/speed/haPerHour/fuelPerHour for tasks and views.
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';
import { cosmeticPaints } from './encyclopedia.js';
import { legacyPaints } from './legacyPerks.js';

export const TRACKS = ['engine', 'transmission', 'efficiency'];
export const MAX_UPGRADE = 3;
export const TRACK_NAMES = { engine: 'Mesin', transmission: 'Transmisi', efficiency: 'Efisiensi' };
const DEFAULTS = { costs: [0.15, 0.25, 0.4], levelGap: 2, resale: 0.5, engineHp: 0.15, engineHa: 0.1, transmission: 0.1,
  efficiency: 0.1, paints: [] };

export const cfg = (game) => ({ ...DEFAULTS, ...game.data.BALANCE.machineUpgrades });
export const emptyUpgrades = () => ({ engine: 0, transmission: 0, efficiency: 0 });
export const upgradesOf = (m) => ({ ...emptyUpgrades(), ...m?.upgrades });
/** Paint palette: BALANCE paints + colours unlocked in the 📖 Ensiklopedia / 🚢 Tender Ekspor + 🌳 heritage paints (v18). */
export const paintsOf = (game) => [...new Set([...cfg(game).paints, ...cosmeticPaints(game), ...legacyPaints(game)])];

/** Implements only have a transmission (work rate); tractors and harvesters have all three tracks. */
export const trackApplies = (d, track) => !!d && TRACKS.includes(track) && (d.type !== 'implement' || track === 'transmission');

/** Def stats with the instance's upgrades applied. */
export function statsFor(game, d, up) {
  const c = cfg(game), u = { ...emptyUpgrades(), ...up };
  const s = { ...d };
  if (d.type === 'tractor') {
    s.hp = Math.round(d.hp * (1 + c.engineHp * u.engine));
    s.speed = round2(d.speed * (1 + c.transmission * u.transmission));
  } else if (d.haPerHour != null) {
    const engine = d.type === 'harvester' ? 1 + c.engineHa * u.engine : 1;
    s.haPerHour = round2(d.haPerHour * engine * (1 + c.transmission * u.transmission));
  } else if (d.type === 'truck') { // logistics: engine = payload, transmission = road speed, efficiency = L/km
    s.capacity = round2(d.capacity * (1 + c.engineHa * u.engine));
    s.speedKmh = round2(d.speedKmh * (1 + c.transmission * u.transmission));
    s.fuelPerKm = round2(d.fuelPerKm * (1 - c.efficiency * u.efficiency) * 1000) / 1000;
  }
  if (d.fuelPerHour != null) s.fuelPerHour = round2(d.fuelPerHour * (1 - c.efficiency * u.efficiency));
  return s;
}

export function effectiveStats(game, m) {
  const d = game.idx.machines.get(m.defId);
  return d ? statsFor(game, d, m.upgrades) : null;
}

export const upgradeCost = (game, d, level) => round2(d.price * (cfg(game).costs[level - 1] ?? Infinity));
/** Player level for upgrade `level`: unlock + levelGap per tier, capped at the max level so Lv 47–50 machines can max out. */
export const upgradeReqLevel = (game, d, level) =>
  Math.min(game.data.LEVELS.length, d.unlockLevel + cfg(game).levelGap * (level - 1));

/** $ spent on this instance's upgrades (derived from levels). */
export function upgradeSpent(game, m) {
  const d = game.idx.machines.get(m.defId);
  if (!d) return 0;
  const u = upgradesOf(m);
  let sum = 0;
  for (const t of TRACKS) for (let l = 1; l <= u[t]; l++) sum += upgradeCost(game, d, l);
  return round2(sum);
}

function blockReason(game, m, d, track) {
  if (!trackApplies(d, track)) return d ? 'Tidak berlaku untuk alat ini.' : 'Mesin tidak ditemukan.';
  const lvl = upgradesOf(m)[track];
  if (lvl >= MAX_UPGRADE) return 'Sudah level maksimal.';
  if (m.busy) return 'Mesin sedang dipakai.';
  const req = upgradeReqLevel(game, d, lvl + 1);
  if (game.state.level < req) return `Butuh level ${req}.`;
  if (upgradeCost(game, d, lvl + 1) > game.state.money + 1e-9) return 'Uang tidak cukup.';
  return null;
}

const STAT_OF = {
  tractor: { engine: ['hp', 'HP'], transmission: ['speed', 'kecepatan ×'], efficiency: ['fuelPerHour', 'BBM L/jam'] },
  harvester: { engine: ['haPerHour', 'ha/jam'], transmission: ['haPerHour', 'ha/jam'], efficiency: ['fuelPerHour', 'BBM L/jam'] },
  implement: { transmission: ['haPerHour', 'ha/jam'] },
  truck: { engine: ['capacity', 't muatan'], transmission: ['speedKmh', 'km/jam'], efficiency: ['fuelPerKm', 'BBM L/km'] },
};

export function upgradeMachine(game, uid, track) {
  const m = game.state.machines.find((x) => x.uid === uid);
  if (!m) return { ok: false, reason: 'Mesin tidak ditemukan.' };
  const d = game.idx.machines.get(m.defId);
  if (!TRACKS.includes(track)) return { ok: false, reason: 'Jenis upgrade tidak dikenal.' };
  const reason = blockReason(game, m, d, track);
  if (reason) return { ok: false, reason };
  const level = upgradesOf(m)[track] + 1;
  const cost = upgradeCost(game, d, level);
  if (!game.spend(cost, 'upgrade_mesin')) return { ok: false, reason: 'Uang tidak cukup.' };
  m.upgrades = { ...upgradesOf(m), [track]: level };
  game.emit('machine_upgraded', `🔧 ${d.name}: ${TRACK_NAMES[track]} naik ke level ${level} (${fmtMoney(cost)}).`,
    { uid, track, level, cost });
  return { ok: true, level, cost };
}

/** Upgrade panel data: per track current → next stat, cost, required level, and why it is blocked. */
export function machineUpgradeInfo(game, uid, resale) {
  const m = game.state.machines.find((x) => x.uid === uid);
  const d = m && game.idx.machines.get(m.defId);
  if (!d) return null;
  const u = upgradesOf(m);
  const cur = statsFor(game, d, u);
  const tracks = TRACKS.map((t) => {
    const applies = trackApplies(d, t), level = u[t], max = level >= MAX_UPGRADE;
    const [stat, unit] = STAT_OF[d.type]?.[t] ?? [null, ''];
    const next = applies && !max ? statsFor(game, d, { ...u, [t]: level + 1 }) : null;
    return { id: t, name: TRACK_NAMES[t], applies, level, max: MAX_UPGRADE, stat, unit,
      current: stat ? cur[stat] : null, next: next && stat ? next[stat] : null,
      cost: applies && !max ? upgradeCost(game, d, level + 1) : null,
      reqLevel: applies && !max ? upgradeReqLevel(game, d, level + 1) : null,
      reason: blockReason(game, m, d, t) };
  });
  return { uid, defId: d.id, name: d.name, type: d.type, busy: m.busy || false, paint: m.paint ?? null,
    paints: paintsOf(game), stats: cur, upgrades: u, spent: upgradeSpent(game, m), resaleValue: resale, tracks };
}

/** Free cosmetic paint (`null` = factory colour). */
export function paintMachine(game, uid, color) {
  const m = game.state.machines.find((x) => x.uid === uid);
  if (!m) return { ok: false, reason: 'Mesin tidak ditemukan.' };
  if (color != null && !paintsOf(game).includes(color)) return { ok: false, reason: 'Warna tidak tersedia.' };
  m.paint = color ?? null;
  return { ok: true, paint: m.paint };
}
