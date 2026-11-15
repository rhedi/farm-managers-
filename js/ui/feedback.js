// Game event → sound + visual feedback (floating texts, confetti, vibration).
import { fmtTons } from './dom.js';
import { sfx } from './sfx.js';
import { floatText, confetti, vibrate, truckDepart } from './fx.js';
import { app } from './app.js';

const WARN = new Set(['wither', 'pest', 'low_feed', 'silo_overflow', 'cold_overflow', 'machine_breakdown', 'wages_unpaid', 'contract_failed']);

function fieldEl(fieldId) {
  if (fieldId == null) return null;
  const card = document.querySelector(`.field-card[data-field-id="${CSS.escape(String(fieldId))}"]`);
  return card?.querySelector('.plot') ?? card ?? null;
}

/** Called for every game event (after notify routing). */
export function feedbackEvent(ev) {
  switch (ev.type) {
    case 'task_done':
      if (ev.task === 'harvest') {
        sfx('harvest');
        vibrate(30);
        if (ev.tons > 0) floatText(fieldEl(ev.fieldId), `+${fmtTons(ev.tons)} ${cropEmoji(ev.cropId)}`, 'harvest');
      } else sfx('pop');
      break;
    case 'crop_ready': sfx('pop'); break;
    case 'sale': case 'contract_done': sfx('coin'); break;
    case 'auto_dispatch': sfx('honk'); truckDepart(app.game?.idx.cities.get(ev.city)?.emoji ?? '🏙️'); break;
    case 'achievement': sfx('achievement'); confetti(window.innerWidth / 2, 90, 32); break;
    default:
      if (WARN.has(ev.type)) sfx('warning');
  }
}

function cropEmoji(id) { return app.game?.data?.CROPS?.find((c) => c.id === id)?.emoji ?? ''; }

/** Click sound for buttons/tabs anywhere in the app. */
export function initClickSounds() {
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('button, .clickable, .map-pin')) sfx('click');
  }, { capture: true });
}
