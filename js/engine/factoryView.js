// Read-only factory view for the UI (stream B).
import { round2 } from './rng.js';
import { sellableStock } from './economy.js';
import { stateOf, valueOf, batchHours, speedOf, upgradeCostOf, missingInput } from './factories.js';

function items(game, map) {
  return Object.entries(map).map(([id, qty]) => {
    const p = game.idx.products.get(id) || { name: id, emoji: '', unit: '' };
    const stock = sellableStock(game, id);
    return { id, name: p.name, emoji: p.emoji, unit: p.unit, qty, stock, enough: stock + 1e-9 >= qty };
  });
}

function recipeView(game, r, level) {
  const inValue = valueOf(game, r.inputs), outValue = valueOf(game, r.outputs);
  const out = game.idx.products.get(Object.keys(r.outputs)[0]);
  return {
    id: r.id, name: r.name ?? out?.name ?? r.id, emoji: out?.emoji ?? '',
    inputs: items(game, r.inputs), outputs: items(game, r.outputs),
    baseHours: r.hours, hours: batchHours(r, level), inValue, outValue,
    valueAdd: inValue > 0 ? round2((outValue - inValue) / inValue) : 0,
    canStart: !missingInput(game, r),
  };
}

/**
 * `[{ id, name, emoji, unlockLevel, price, maxLevel, unlocked, owned, level (0 if not owned), speed, upgradeCost|null,
 *    recipeId, recipe, recipes, running, queued, auto, progress 0–1, hoursLeft, blocked }]`.
 */
export function factoriesView(game) {
  return (game.data.FACTORIES || []).map((def) => {
    const f = stateOf(game, def.id);
    const level = f ? f.level : 0;
    const recipes = def.recipes.map((r) => recipeView(game, r, Math.max(1, level)));
    const recipe = f ? recipes.find((r) => r.id === f.recipeId) ?? null : null;
    const need = recipe ? recipe.hours : 0;
    const done = f?.running ? Math.min(f.progress, need) : 0;
    return {
      id: def.id, name: def.name, emoji: def.emoji, unlockLevel: def.unlockLevel, price: def.price, maxLevel: def.maxLevel,
      unlocked: def.unlockLevel <= game.state.level, owned: !!f, level, speed: round2(speedOf(Math.max(1, level))),
      upgradeCost: f ? upgradeCostOf(def, level) : null,
      recipeId: f?.recipeId ?? null, recipe, recipes,
      running: !!f?.running, queued: f?.queued ?? 0, auto: !!f?.auto,
      progress: need > 0 ? round2(done / need) : 0, hoursLeft: f?.running ? need - done : 0,
      blocked: f?.blocked ?? null, managed: !!f?.managed,
    };
  });
}

