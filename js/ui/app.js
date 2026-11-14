// Shared UI context: the current Game plus render hooks (set by main.js).
import { toast, rerenderModal } from './modal.js';

export const app = {
  game: null,
  /** Re-render the active view immediately (main.js wires this). */
  requestRender: () => {},
  /** Start a fresh game (main.js wires this). */
  resetGame: () => {},
  /** Save immediately (main.js wires this). */
  saveNow: () => {},
};

/**
 * Apply an action result: error toast with reason, or success toast + re-render
 * of the view and the open modal. Returns the result for chaining.
 */
export function act(result, okMsg, { rerenderModal: rm = true } = {}) {
  if (!result || !result.ok) {
    toast(result?.reason || 'Aksi gagal.', 'error');
    return result;
  }
  if (okMsg) toast(typeof okMsg === 'function' ? okMsg(result) : okMsg, 'success');
  app.requestRender();
  if (rm) rerenderModal();
  return result;
}
