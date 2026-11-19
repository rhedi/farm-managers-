// Research tree (riset / pohon keahlian): 1 point per level-up, nodes with prerequisites (some cost > 1),
// summed perks read by the other modules through perk(game, key), and a paid respec.
// state.research = { unlocked: [nodeId], respecs }. Points are derived from the level, so old saves get them too.
import { round2 } from './rng.js';
import { fmtMoney } from './defs.js';

const DEFAULTS = { respecPerLevel: 1500 };
const cfg = (game) => ({ ...DEFAULTS, ...game.data.BALANCE.research });
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });
const pct = (v) => `${Math.round(v * 100)}%`;

/** Perk keys (fractions, summed over unlocked nodes) → where they apply. */
export const PERK_KEYS = {
  yield: 'fields.yieldFactorsOf: factor `research` = 1 + yield',
  fertCost: 'tasks.planTask: fertilizer cost × (1 − fertCost)',
  seedCost: 'tasks.planTask: seed cost × (1 − seedCost)',
  fuel: 'tasks.planTask + logistics: fuel cost × (1 − fuel)',
  taskSpeed: 'tasks.planTask: hours ÷ (1 + taskSpeed)',
  feed: 'breeding.breedingMods: feed need × (1 − feed)',
  animalProd: 'breeding.breedingMods: production × (1 + animalProd)',
  births: 'breeding: births per cycle × (1 + births)',
  wages: 'workers.totalWages × (1 − wages)',
  interest: 'economy.loanRate × (1 − interest)',
  contractPrice: 'contracts offer price × (1 + contractPrice), max 1.19 × market',
  cityPrice: 'logistics city multiplier × (1 + cityPrice)',
  wear: 'wear.wearMachines × (1 − wear)',
  silo: 'storage: silo and Gudang dingin capacity × (1 + silo)',
  truckCap: 'logistics truck capacity × (1 + truckCap)',
};

const EFFECT_TEXT = {
  yield: (v) => `Hasil panen +${pct(v)}`,
  fertCost: (v) => `Biaya pupuk −${pct(v)}`,
  seedCost: (v) => `Biaya benih −${pct(v)}`,
  fuel: (v) => `BBM traktor, pemanen & truk −${pct(v)}`,
  taskSpeed: (v) => `Tugas ladang +${pct(v)} lebih cepat`,
  feed: (v) => `Kebutuhan pakan −${pct(v)}`,
  animalProd: (v) => `Produksi ternak +${pct(v)}`,
  births: (v) => `Kelahiran ternak +${pct(v)}`,
  wages: (v) => `Gaji pekerja −${pct(v)}`,
  interest: (v) => `Bunga pinjaman −${pct(v)}`,
  contractPrice: (v) => `Harga tawaran kontrak +${pct(v)} (maks. 119% pasar)`,
  cityPrice: (v) => `Harga jual di kota +${pct(v)} (tanaman maks. 115%)`,
  wear: (v) => `Keausan mesin −${pct(v)}`,
  silo: (v) => `Kapasitas silo & gudang dingin +${pct(v)}`,
  truckCap: (v) => `Kapasitas truk +${pct(v)}`,
};
export const effectText = (effects = {}) =>
  Object.entries(effects).map(([k, v]) => EFFECT_TEXT[k]?.(v) ?? `${k} ${v}`).join(' · ');

const rs = (game) => (game.state.research ||= { unlocked: [], respecs: 0 });
const nodeOf = (game, id) => game.idx.research?.get(id) ?? null;

/** Summed modifier of `key` over unlocked nodes (0 when none). */
export function perk(game, key) {
  const list = game.state.research?.unlocked;
  if (!list?.length) return 0;
  let sum = 0;
  for (const id of list) sum += nodeOf(game, id)?.effects?.[key] ?? 0;
  return Math.min(PERK_MAX, sum);
}

/** No perk key sums above this (the tree tops out at 0.4 per key; the cap guards future nodes). */
export const PERK_MAX = 0.5;

/** Player level a node needs (`minLevel`, tier 5), 1 when none. */
export const nodeMinLevel = (n) => n?.minLevel ?? 1;

/** Load migration: old saves get an empty tree (their points come from the current level); unknown nodes drop. */
export function ensureResearch(game) {
  const r = rs(game);
  r.unlocked = [...new Set(Array.isArray(r.unlocked) ? r.unlocked : [])].filter((id) => nodeOf(game, id));
  r.respecs = r.respecs || 0;
}

/** {earned, spent, available}: 1 point per level-up (level − 1) plus bonus points from missions/chapters/achievements. */
export function researchPoints(game) {
  const earned = Math.max(0, (game.state.level || 1) - 1) + (rs(game).bonus || 0);
  const spent = rs(game).unlocked.reduce((sum, id) => sum + (nodeOf(game, id)?.cost ?? 0), 0);
  return { earned, spent, available: earned - spent };
}

export const respecCost = (game) => round2(cfg(game).respecPerLevel * game.state.level);

function blockReason(game, n, points) {
  if (rs(game).unlocked.includes(n.id)) return 'Sudah diteliti.';
  if (game.state.level < nodeMinLevel(n)) return `Butuh level ${nodeMinLevel(n)}.`;
  const missing = (n.requires || []).filter((id) => !rs(game).unlocked.includes(id));
  if (missing.length) return `Butuh ${missing.map((id) => nodeOf(game, id)?.name ?? id).join(' & ')}.`;
  if (points.available < n.cost) return `Butuh ${n.cost} poin riset.`;
  return null;
}

export function unlockResearch(game, nodeId) {
  const n = nodeOf(game, nodeId);
  if (!n) return fail('Riset tidak ditemukan.');
  const reason = blockReason(game, n, researchPoints(game));
  if (reason) return fail(reason);
  rs(game).unlocked.push(n.id);
  game.emit('research_unlocked', `🔬 Riset ${n.emoji} ${n.name} selesai: ${effectText(n.effects)}.`, { nodeId: n.id });
  return ok({ nodeId: n.id, points: researchPoints(game).available });
}

/** Reset every node (all points back) for respecPerLevel × level. */
export function respecResearch(game) {
  const r = rs(game);
  if (!r.unlocked.length) return fail('Belum ada riset untuk direset.');
  const cost = respecCost(game);
  if (!game.spend(cost, 'riset')) return fail('Uang tidak cukup.');
  const refunded = researchPoints(game).spent;
  r.unlocked = [];
  r.respecs = (r.respecs || 0) + 1;
  game.emit('research_reset', `🔬 Riset direset (${fmtMoney(cost)}): ${refunded} poin kembali.`, { cost, refunded });
  return ok({ cost, refunded });
}

/** Tree for the UI. Node status: 'unlocked' | 'ready' (can unlock now) | 'open' (needs points) | 'locked' (prerequisites or level). */
export function researchView(game) {
  const points = researchPoints(game);
  const unlocked = new Set(rs(game).unlocked);
  const nodes = game.data.RESEARCH ?? [];
  const nodeView = (n) => {
    const reason = blockReason(game, n, points);
    const minLevel = nodeMinLevel(n), levelOk = game.state.level >= minLevel;
    const prereqOk = levelOk && (n.requires || []).every((id) => unlocked.has(id));
    const status = unlocked.has(n.id) ? 'unlocked' : !reason ? 'ready' : prereqOk ? 'open' : 'locked';
    return { id: n.id, name: n.name, emoji: n.emoji, cost: n.cost, effects: { ...n.effects }, desc: effectText(n.effects),
      requires: (n.requires || []).map((id) => ({ id, name: nodeOf(game, id)?.name ?? id, unlocked: unlocked.has(id) })),
      minLevel, levelOk, tier: n.tier ?? null, unlocked: unlocked.has(n.id), status, reason: status === 'unlocked' ? null : reason };
  };
  const branches = (game.data.RESEARCH_BRANCHES ?? []).map((b) => {
    const list = nodes.filter((n) => n.branch === b.id).map(nodeView);
    return { ...b, nodes: list, done: list.filter((n) => n.unlocked).length };
  });
  const perks = Object.fromEntries(Object.keys(PERK_KEYS).map((k) => [k, round2(perk(game, k))]).filter(([, v]) => v));
  const cost = respecCost(game);
  return { points, perks, branches, respecCost: cost, respecs: rs(game).respecs || 0,
    canRespec: unlocked.size > 0 && game.state.money >= cost };
}
