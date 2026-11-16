// Game event → toast routing (U1). Low-value events (task_done, sale, purchase,
// weather, worker_hired…) and level_up (shown as a modal) only go to the log in the Prestasi tab. Repeats merge into one toast.
import { toast } from './modal.js';
import { queueLevelUp } from './levelUp.js';
import { onboardingEvent } from './onboarding.js';
import { app } from './app.js';

const TOAST_EVENTS = {
  crop_ready: { kind: 'success', merged: (n) => `🌾 ${n} ladang siap panen.` },
  wither: { kind: 'warn', merged: (n) => `🥀 ${n} ladang mulai layu!` },
  achievement: { kind: 'success' },
  low_feed: { kind: 'warn', merged: (n) => `⚠️ ${n} peringatan pakan ternak.` },
  contract_offer: { kind: '', merged: (n) => `📋 ${n} tawaran kontrak baru.` },
  contract_done: { kind: 'success' },
  contract_failed: { kind: 'error' },
  season_change: { kind: '', merged: (n) => `🍂 Musim berganti di ${n} wilayah.` },
  event_start: { kind: 'warn', merged: (n) => `📣 ${n} kejadian baru.` },
  pest: { kind: 'error', merged: (n) => `🐛 Hama menyerang ${n} ladang!` },
  silo_overflow: { kind: 'warn', merged: (n) => `🏚️ Silo penuh — ${n} kali hasil panen dijual paksa.` },
  cold_overflow: { kind: 'warn', merged: (n) => `❄️ Gudang dingin penuh — ${n} kali produk ternak dijual paksa.` },
  machine_breakdown: { kind: 'error', merged: (n) => `🔧 ${n} mesin rusak.` },
  wages_unpaid: { kind: 'error', merged: (n) => `💸 ${n} kali gaji pekerja tak terbayar.` },
  mission_done: { kind: 'success', merged: (n) => `🎯 ${n} misi harian selesai! Ambil hadiah di Prestasi › Misi.` },
  mission_streak: { kind: 'success' },
  rank_up: { kind: 'success' },
  factory_blocked: { kind: 'warn', merged: (n) => `🏭 ${n} pabrik terhenti — cek Gudang › Olahan.` },
  breed_improved: { kind: 'success', merged: (n) => `🧬 Genetika ternak membaik (${n}×).` },
  herd_full: { kind: 'warn', merged: (n) => `🏠 ${n} kandang penuh — kelahiran berhenti.` },
  delivery_done: { kind: 'success', merged: (n) => `🚚 ${n} muatan terjual di kota.` },
  auto_dispatch: { kind: 'success', merged: (n) => `🧑‍💼 Manajer logistik mengirim ${n} truk.` },
  factory_manager_run: { kind: 'success', merged: (n) => `🏭 Manajer pabrik menjalankan ${n} resep.` },
  fish_ready: { kind: 'success', merged: (n) => `🐟 ${n} kolam siap panen.` },
  pond_alert: { kind: 'warn', merged: (n) => `⚠️ ${n} peringatan kolam ikan.` },
};

/** Season changes only matter for regions where the player owns a field. */
function ownsRegion(regionId) {
  const g = app.game;
  if (!g || regionId == null) return true;
  return Object.keys(g.state.fields ?? {}).some((id) => g.data.FIELDS?.find((f) => f.id === id)?.regionId === regionId);
}

/** Births merge into one toast showing the running head count while it is visible. */
const born = { total: 0, at: 0 };
function bornToast(ev) {
  const now = Date.now();
  if (now - born.at > 2500) born.total = 0;
  born.at = now;
  born.total += ev.n || 0;
  toast(ev.msg, 'success', { key: 'animals_born', merged: () => `🐣 ${born.total} ternak lahir.` });
}

/** Returns true when the event should trigger a full re-render. */
export function notifyEvent(ev) {
  const t = TOAST_EVENTS[ev.type];
  const bannerShown = ev.type === 'event_start' && document.getElementById('view')?.dataset.tab === 'farm';
  if (t && !bannerShown && !(ev.type === 'season_change' && !ownsRegion(ev.regionId))) {
    toast(ev.msg, t.kind, t.merged ? { key: ev.type, merged: t.merged } : {});
  }
  if (ev.type === 'animals_born') bornToast(ev);
  onboardingEvent(ev);
  if (ev.type === 'fish_harvest' && ev.auto) toast(ev.msg, 'success', { key: 'fish_harvest', merged: (n) => `🎣 ${n} kolam dipanen otomatis.` });
  if (ev.type === 'level_up') queueLevelUp(ev);
  return ev.type === 'level_up' || ev.type === 'achievement';
}
