// App-shell helpers: save backup, last tab, topbar height CSS variable.
import { SAVE_KEY } from '../engine/persist.js';

const TAB_KEY = 'farm-manager-tab';

/** Copy the raw save to `<SAVE_KEY>.bak-<ts>` so a corrupt save can be recovered (B9). Returns the key or null. */
export function backupSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw == null) return null;
    const key = `${SAVE_KEY}.bak-${Date.now()}`;
    storage.setItem(key, raw);
    return key;
  } catch { return null; }
}

export function loadTab(storage) {
  try { return storage?.getItem(TAB_KEY) ?? null; } catch { return null; }
}

export function saveTab(storage, tab) {
  try { storage?.setItem(TAB_KEY, tab); } catch { /* ignore */ }
}

/** Keep `--top-h` in sync with the sticky topbar (toasts, coach banner, sticky map use it). */
export function trackTopbarHeight() {
  const sync = () => {
    const top = document.getElementById('topbar');
    if (top) document.documentElement.style.setProperty('--top-h', `${top.offsetHeight}px`);
  };
  window.addEventListener('resize', sync);
  sync();
}
