// Read-only view helpers for the UI.
import { round2 } from './rng.js';
import { loanCap, loanRate, machineResale, statValue } from './economy.js';
import { conditionOf, repairCost } from './wear.js';
import { effectiveStats, upgradesOf, upgradeSpent } from './upgrades.js';
import { kindOf, tonsPerUnit } from './storage.js';
import { achievementReward } from './rewards.js';
import { saleQuote } from './saturation.js';
import { stockGrade, stockMult } from './quality.js';

/**
 * Stock items. `reserve` = feed reserve (t) that sellProduct keeps; `isFeed` = an owned herd eats it;
 * `storage` = 'silo' | 'cold' | null (store it fills), `tons` = space it takes there.
 * 📉 `dip` = current price dip from recent sales (0–1), `dipToday` = it comes from today's sales,
 * `saleValue` = what selling all `sellable` earns now (dips further as it sells).
 */
export function siloView(game) {
  const s = game.state;
  const feed = new Set(game.data.ANIMALS.filter((a) => (s.animals?.[a.id]?.count || 0) > 0).flatMap((a) => a.feedCrops));
  const items = Object.entries(s.silo).filter(([, q]) => q > 0).map(([id, qty]) => {
    const p = game.idx.products.get(id) || { id, name: id, emoji: '', unit: '' };
    const price = s.market[id] ?? 0;
    const reserve = Math.min(qty, s.feedReserve?.[id] || 0);
    const storage = kindOf(game.idx.products.get(id));
    const sellable = round2(qty - reserve), q = saleQuote(game, id, sellable), g = stockGrade(game, id); // ⭐ v18 stock grade (crops)
    return { id, name: p.name, emoji: p.emoji, unit: p.unit, category: p.category ?? 'crop', qty, price, value: round2(qty * price),
      reserve, sellable, isFeed: feed.has(id), storage, tons: storage ? Math.round(qty * tonsPerUnit(p) * 1000) / 1000 : 0,
      dip: q.dip, dipToday: q.today, saleValue: round2(q.value * stockMult(game, id)),
      grade: g ? { id: g.id, label: g.label, mult: stockMult(game, id) } : null };
  });
  return { items, totalValue: round2(items.reduce((sum, i) => sum + i.value, 0)) };
}

/**
 * Owned machines with upgraded stats; `base` = unupgraded def, `condition` 0–1, `repairCost` $ to bring it
 * back to 1, `sellValue` = (60% price + 50% upgrade spend) × condition.
 */
export function machinesView(game) {
  return game.state.machines.map((m) => {
    const d = game.idx.machines.get(m.defId);
    const upgrades = upgradesOf(m);
    return { ...effectiveStats(game, m), base: d, uid: m.uid, busy: m.busy || false, condition: conditionOf(m),
      repairCost: repairCost(game, m), upgrades, upgradeLevel: upgrades.engine + upgrades.transmission + upgrades.efficiency,
      upgradeSpent: upgradeSpent(game, m), paint: m.paint ?? null, sellValue: round2(machineResale(game, m)) };
  });
}

/** Shop list. `maxTractorHp` = strongest owned tractor; `hpOk` = false for implements no owned tractor can pull (B14). */
export function shopView(game) {
  const s = game.state;
  const maxTractorHp = s.machines.reduce((mx, m) => {
    const d = effectiveStats(game, m);
    return d?.type === 'tractor' ? Math.max(mx, d.hp || 0) : mx;
  }, 0);
  return game.data.MACHINES.map((d) => ({ ...d, unlocked: d.unlockLevel <= s.level,
    affordable: d.price <= s.money, owned: s.machines.filter((m) => m.defId === d.id).length,
    maxTractorHp, hpOk: d.type !== 'implement' || maxTractorHp >= (d.hpRequired || 0) }));
}

export function levelInfo(game) {
  const L = game.data.LEVELS, lvl = game.state.level, xp = game.state.xp;
  const cur = L[lvl - 1] ?? 0, next = L[lvl] ?? null;
  return { level: lvl, xp, current: cur, next, maxed: next == null,
    progress: next == null ? 1 : round2((xp - cur) / (next - cur)) };
}

export function loanInfo(game) {
  return { loan: game.state.loan, cap: loanCap(game), dailyRate: loanRate(game) };
}

export function achievementsView(game) {
  const s = game.state;
  return game.data.ACHIEVEMENTS.map((a) => ({ ...a, unlocked: s.achievements.includes(a.id),
    value: statValue(game, a.condition.stat), payout: achievementReward(game, a) })); // payout: {money, rp} if unlocked now
}
