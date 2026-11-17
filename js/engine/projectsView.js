// 🏛️ Proyek Warisan view for the UI (Ladang › 🏛️ Proyek, map landmarks). Read-only.
import { round2 } from './rng.js';
import { MAX_STAGE, regionTypes, stageCost, stageLevel, ownsRegion, blockReason, effectText, buildingCount,
  monumentInfo, monumentReason, projectsValue, ensureProjects } from './projects.js';

const cfgOf = (game) => game.data.BALANCE.projects || null;

function buildView(game, b) {
  if (!b) return null;
  const t = game.state.time, total = Math.max(1, b.end - b.start);
  return { stage: b.stage, cost: b.cost, progress: round2(Math.min(1, Math.max(0, (t - b.start) / total))),
    hoursLeft: round2(Math.max(0, b.end - t)), daysLeft: Math.max(0, Math.ceil((b.end - t) / 24 - 1e-9)), endDay: Math.round(b.end / 24) + 1 };
}

/**
 * {unlockLevel, unlocked, level, money, building, maxBuilding, spent, value, regions:[{id, name, continent, owned,
 * unlockLevel, projects:[{typeId, name, emoji, effect, stage, maxStage, done, effectNow, effectNext, next:{stage, cost,
 * days, level} | null, reason (empty = can start), build}]}], monuments:[{continentId, name, emoji, cost, days, level,
 * rp, done, build, reason, regionsDone, regionsTotal}], landmarks:[{regionId, typeId, emoji, stage, building}]}.
 */
export function projectsView(game) {
  const C = cfgOf(game);
  if (!C) return null;
  if (!game.state.projects?.regions) ensureProjects(game.state, game.data);
  const p = game.state.projects, landmarks = [];
  const regions = game.data.REGIONS.map((r) => {
    const projects = regionTypes(game, r.id).map((t) => {
      const x = p.regions[r.id]?.[t.id] ?? { stage: 0, build: null };
      const k = x.stage + 1, more = x.stage < MAX_STAGE;
      if (x.stage > 0 || x.build) landmarks.push({ regionId: r.id, typeId: t.id, emoji: t.emoji, stage: x.stage, building: !!x.build });
      return { typeId: t.id, name: t.name, emoji: t.emoji, effect: t.effect, stage: x.stage, maxStage: MAX_STAGE, done: !more,
        effectNow: x.stage ? effectText(game, t, r.id, x.stage) : '', effectNext: more ? effectText(game, t, r.id, k) : '',
        next: more ? { stage: k, cost: stageCost(game, r.id, k), days: C.stages[k - 1].days, level: stageLevel(game, r.id, k) } : null,
        reason: blockReason(game, r.id, t.id), build: buildView(game, x.build) };
    });
    return { id: r.id, name: r.name, continent: r.continent, owned: ownsRegion(game, r.id), unlockLevel: r.unlockLevel ?? 1, projects };
  });
  const monuments = (game.data.CONTINENTS || []).map((c) => {
    const m = p.monuments[c.id], info = monumentInfo(game, c.id);
    const regs = game.data.REGIONS.filter((r) => r.continent === c.id);
    const regionsDone = regs.filter((r) => Object.values(p.regions[r.id] || {}).some((x) => x.stage >= MAX_STAGE)).length;
    return { continentId: c.id, continentName: c.name, ...info, done: !!m?.done, build: buildView(game, m?.build),
      reason: monumentReason(game, c.id), regionsDone, regionsTotal: regs.length };
  });
  return { unlockLevel: C.unlockLevel, unlocked: game.state.level >= C.unlockLevel, level: game.state.level,
    money: game.state.money, building: buildingCount(game), maxBuilding: C.maxBuilding, spent: p.spent,
    value: projectsValue(game), regions, monuments, landmarks };
}
