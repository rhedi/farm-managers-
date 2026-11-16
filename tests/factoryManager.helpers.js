import assert from 'node:assert/strict';
import { DATA } from './helpers.js';
import { createGame } from '../js/engine.js';

export const tier = (id) => DATA.BALANCE.factoryManager.tiers.find((t) => t.id === id);
export const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Level-N game owning `factories` (550 t silo), fixed market prices, silo stock. */
export function setup({ seed = 3, level = 25, factories = ['mill'], silo = { wheat: 40 }, market = {}, data = DATA } = {}) {
  const g = createGame({ seed, data });
  g.state.level = level;
  g.state.money = 1e6;
  g.state.storageUpgrades.silo = 2; // 150 → 550 t
  for (const id of factories) assert.equal(g.buyFactory(id).ok, true, id);
  // pelet_ikan (mill, fish feed) priced out so the mill tests compare flour vs malt only
  Object.assign(g.state.market, { wheat: 200, barley: 200, flour: 400, malt: 300, sugarcane: 60, sugar: 700, pelet_ikan: 1, ...market });
  Object.assign(g.state.silo, silo);
  return g;
}
