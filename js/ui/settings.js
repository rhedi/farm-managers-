// ⚙️ Pengaturan (top bar button): theme, sound, save now, restart the tutorial, check for updates, install as
// app, version, reset the game.
import { h, mount } from './dom.js';
import { openModal, confirmModal, toast } from './modal.js';
import { app } from './app.js';
import { sfxEnabled, setSfxEnabled, onSfxChange, sfx } from './sfx.js';
import { installControl, updateControl, appVersion } from './pwa.js';
import { resetOnboarding } from './onboarding.js';
import { themePref, setThemePref, onThemeChange } from './theme.js';

const sfxLabel = (on) => (on ? '🔊 Suara: aktif' : '🔇 Suara: mati');

function sfxToggle() {
  const btn = h('button.btn.btn-secondary.btn-block', { type: 'button', 'aria-pressed': String(sfxEnabled()) }, sfxLabel(sfxEnabled()));
  btn.addEventListener('click', () => { setSfxEnabled(!sfxEnabled()); sfx('coin'); });
  const off = onSfxChange((on) => {
    if (!btn.isConnected) { off(); return; }
    btn.textContent = sfxLabel(on);
    btn.setAttribute('aria-pressed', String(on));
  });
  return btn;
}

const THEME_LABELS = { auto: '📱 Otomatis (ikut HP)', light: '☀️ Terang', dark: '🌙 Gelap' };

function themePicker() {
  const btns = Object.entries(THEME_LABELS).map(([id, label]) => h('button.chip', {
    type: 'button', role: 'radio', dataset: { theme: id }, onclick: () => setThemePref(id),
  }, label));
  const sync = (p) => {
    for (const b of btns) {
      const on = b.dataset.theme === p;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  sync(themePref());
  const off = onThemeChange((p) => { if (!btns[0].isConnected) { off(); return; } sync(p); });
  return h('div.theme-setting',
    h('div.theme-label', { id: 'theme-label' }, '🌗 Tema'),
    h('div.theme-seg', { role: 'radiogroup', 'aria-labelledby': 'theme-label' }, btns));
}

async function resetFlow() {
  const ok = await confirmModal({
    title: 'Mulai ulang permainan?',
    message: 'Semua kemajuan (uang, ladang, mesin, ternak) akan dihapus permanen. Lanjutkan?',
    confirmLabel: 'Hapus & mulai baru', danger: true,
  });
  if (ok) app.resetGame();
}

export function openSettings() {
  openModal({
    title: '⚙️ Pengaturan',
    render: (body, m) => mount(body,
      h('div.settings-list',
        themePicker(),
        sfxToggle(),
        h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => app.saveNow(true) }, '💾 Simpan sekarang'),
        h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => {
          resetOnboarding();
          m.close();
          app.setTab('farm');
          toast('📘 Panduan dimulai lagi di tab Ladang.', 'success');
        } }, '📘 Ulangi panduan awal'),
        updateControl(),
        installControl()),
      h('p.small.muted', 'Permainan tersimpan otomatis di peramban ini setiap 10 detik.'),
      h('p.small.muted', `Versi: ${appVersion()}`),
      h('div.settings-danger',
        h('button.btn.btn-danger.btn-block', { type: 'button', onclick: resetFlow }, '🗑️ Reset game'))),
    actions: (m) => [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'Tutup')],
  });
}
