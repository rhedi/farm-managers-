import * as DATA from '../js/data.js';
import { createGame } from '../js/engine.js';

export { DATA };

export const startField = () => DATA.STARTING.fieldIds[0];
export const starterCrop = () => DATA.CROPS.find((c) => c.unlockLevel <= 1);

export function newGame(seed = 42) {
  return createGame({ seed, data: DATA });
}

/** Run a task and advance until it finishes. */
export function runTask(game, fieldId, task, opts) {
  const r = game.startTask(fieldId, task, opts);
  if (!r.ok) throw new Error(`${task} failed: ${r.reason}`);
  game.advance(Math.ceil(r.hours) + 1);
  return r;
}

/** Strip non-deterministic fields for state comparison. */
export function comparable(game) {
  const { savedAt, ...rest } = JSON.parse(game.serialize());
  return rest;
}

export function cheapestOtherField(game) {
  return DATA.FIELDS.filter((f) => !game.state.fields[f.id]).sort((a, b) => a.price - b.price)[0];
}
