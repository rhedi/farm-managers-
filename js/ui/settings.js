// ⚙️ Pengaturan (top bar button): sound, save now, install as app, restart the tutorial, reset the game.
import { h, mount } from './dom.js';
import { openModal, confirmModal, toast } from './modal.js';
import { app } from './app.js';
import { sfxEnabled, setSfxEnabled, onSfxChange, sfx } from './sfx.js';
import { installControl } from './pwa.js';
import { resetOnboarding } from './onboarding.js';

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
        sfxToggle(),
        h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => app.saveNow(true) }, '💾 Simpan sekarang'),
        h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => {
          resetOnboarding();
          m.close();
          app.setTab('farm');
          toast('📘 Panduan dimulai lagi di tab Ladang.', 'success');
        } }, '📘 Ulangi panduan awal'),
        installControl()),
      h('p.small.muted', 'Permainan tersimpan otomatis di peramban ini setiap 10 detik.'),
      h('div.settings-danger',
        h('button.btn.btn-danger.btn-block', { type: 'button', onclick: resetFlow }, '🗑️ Reset game'))),
    actions: (m) => [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'Tutup')],
  });
}
