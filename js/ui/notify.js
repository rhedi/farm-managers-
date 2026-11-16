// Game event → toast routing (U1). Low-value events (task_done, sale, purchase,
// weather, worker_hired…) and level_up (shown as a modal) only go to the log in the Prestasi tab.
// De-duplication (v16): the same key within DEDUP_MS real time becomes one toast with a running ×N counter
// (or the event's `merged` text), even after the first toast has faded. Fields under 🔁 Rencana don't toast
// "siap dipanen" (the plan harvests them); all feed warnings share one key; achievements that unlock together
// (old-save catch-up) become one summary "🏆 N prestasi baru terbuka (+$X)".
import { toast } from './modal.js';
import { fmtMoney } from './dom.js';
import { queueLevelUp } from './levelUp.js';
import { onboardingEvent } from './onboarding.js';
import { app } from './app.js';

export const DEDUP_MS = 60000;

const TOAST_EVENTS = {
  crop_ready: { kind: 'success', merged: (n) => `🌾 ${n} ladang siap panen.` },
  wither: { kind: 'warn', merged: (n) => `🥀 ${n} ladang mulai layu!` },
  achievement: { kind: 'success', merged: (n, r) => `🏆 ${n} prestasi baru terbuka (+${fmtMoney(r.sum)}).` },
  low_feed: { kind: 'warn', merged: (n) => `⚠️ Peringatan pakan ternak (${n}×) — cek Ternak.` },
  contract_offer: { kind: '', merged: (n) => `📋 ${n} tawaran kontrak baru.` },
  contract_done: { kind: 'success', merged: (n) => `🤝 ${n} kontrak selesai.` },
  contract_failed: { kind: 'error' },
  season_change: { kind: '', merged: (n) => `🍂 Musim berganti di ${n} wilayah.` },
  event_start: { kind: 'warn', merged: (n) => `📣 ${n} kejadian baru.` },
  pest: { kind: 'error', merged: (n) => `🐛 Hama menyerang ${n} ladang!` },
  silo_overflow: { kind: 'warn', merged: (n) => `🏚️ Silo penuh — ${n} kali hasil panen dijual paksa.` },
  cold_overflow: { kind: 'warn', merged: (n) => `❄️ Gudang dingin penuh — ${n} kali produk ternak dijual paksa.` },
  machine_breakdown: { kind: 'error', merged: (n) => `🔧 ${n} mesin rusak.` },
  wages_unpaid: { kind: 'error', merged: (n) => `💸 ${n} kali gaji pekerja tak terbayar.` },
  mission_done: { kind: 'success', merged: (n) => `🎯 ${n} misi selesai! Ambil hadiah di Prestasi › Misi.` },
  mission_streak: { kind: 'success' },
  chapter_step: { kind: 'success' },
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

/** key → {at, n, sum}: repeats inside DEDUP_MS real time. */
const recent = new Map();

/** One toast per key per minute: the count keeps growing while repeats arrive (×N or `merged(n, info)`). */
export function dedupToast(key, msg, kind = '', merged = null, amount = 0, now = Date.now()) {
  let r = recent.get(key);
  if (!r || now - r.at > DEDUP_MS) { r = { n: 0, sum: 0 }; recent.set(key, r); }
  r.n += 1; r.sum += amount || 0; r.at = now;
  const text = r.n === 1 ? msg : merged ? merged(r.n, r) : `${msg} (×${r.n})`;
  toast(text, kind, { key, merged: () => text });
  return text;
}

/** Season changes only matter for regions where the player owns a field. */
function ownsRegion(regionId) {
  const g = app.game;
  if (!g || regionId == null) return true;
  return Object.keys(g.state.fields ?? {}).some((id) => g.data.FIELDS?.find((f) => f.id === id)?.regionId === regionId);
}

/** The field's 🔁 plan will harvest it: no "siap dipanen" toast. */
const planned = (fieldId) => !!app.game?.state.fields?.[fieldId]?.plan;

/** Births merge into one toast showing the running head count. */
function bornToast(ev) {
  dedupToast('animals_born', ev.msg, 'success', (n, r) => `🐣 ${r.sum} ternak lahir.`, ev.n || 0);
}

/** Returns true when the event should trigger a full re-render. */
export function notifyEvent(ev) {
  const t = TOAST_EVENTS[ev.type];
  const bannerShown = ev.type === 'event_start' && document.getElementById('view')?.dataset.tab === 'farm';
  const skip = bannerShown || (ev.type === 'season_change' && !ownsRegion(ev.regionId))
    || (ev.type === 'crop_ready' && planned(ev.fieldId));
  // Types with a `merged` summary ("3 ladang siap panen", one feed warning, "N prestasi baru") merge by type; all
  // others merge only identical messages, so a different message never shows under the first one's text.
  if (t && !skip) dedupToast(t.merged ? ev.type : `${ev.type}|${ev.msg}`, ev.msg, t.kind, t.merged ?? null, ev.reward || 0);
  if (ev.type === 'animals_born') bornToast(ev);
  onboardingEvent(ev);
  if (ev.type === 'fish_harvest' && ev.auto) dedupToast('fish_harvest', ev.msg, 'success', (n) => `🎣 ${n} kolam dipanen otomatis.`);
  if (ev.type === 'level_up') queueLevelUp(ev);
  return ev.type === 'level_up' || ev.type === 'achievement' || ev.type === 'chapter_step';
}

/** Old save loaded: chapter steps it had already met were completed silently — one summary toast. */
export function announceChapterNotice(game) {
  const n = game.takeChapterNotice?.() ?? 0;
  if (n > 0) setTimeout(() => toast(`📖 Bab Petani: ${n} langkah sudah kamu kuasai — lanjutkan di Prestasi › Misi.`, 'success'), 400);
}
