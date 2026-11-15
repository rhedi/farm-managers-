// Yield breakdown (U4): why the predicted yield is what it is, from view.yieldFactors (multipliers, 1 = neutral).
import { h } from './dom.js';

const FACTORS = [
  ['soil', 'Tanah'],
  ['ph', 'pH'],
  ['fert', 'Pupuk'],
  ['irrig', 'Irigasi'],
  ['contamination', 'Kontaminasi'],
  ['weather', 'Cuaca (hari kering)'],
  ['wither', 'Layu'],
  ['season', 'Musim'],
  ['nutrients', 'Nutrisi tanah'],
  ['rotation', 'Rotasi tanaman'],
  ['pest', 'Hama'],
  ['storm', 'Kerusakan badai'],
  ['research', 'Riset'],
  ['greenhouse', '🏠 Rumah kaca'],
  ['age', '🌳 Umur pohon'],
  ['prune', '✂️ Pangkas'],
];

const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0, signDisplay: 'exceptZero' });

function factorRow(label, v) {
  const d = Math.round((v - 1) * 100);
  const cls = d > 0 ? 'yf-up' : d < -15 ? 'yf-bad' : d < 0 ? 'yf-down' : 'yf-flat';
  return h(`div.yf-row.${cls}`, h('span', label), h('span.num', d ? `${pct.format(d)}%` : '±0%'));
}

/** Breakdown node for an owned field view, or null when the engine gives no factors. */
export function yieldBreakdown(f) {
  const yf = f.yieldFactors;
  if (!yf || typeof yf !== 'object') return null;
  const rows = FACTORS.filter(([k]) => Number.isFinite(yf[k])).map(([k, label]) => factorRow(label, yf[k]));
  if (!rows.length) return null;
  const low = (k, lim = 1) => Number.isFinite(yf[k]) && yf[k] < lim;
  const hints = [];
  if (low('weather') && !f.irrigated) {
    hints.push((f.actions || []).includes('irrigate')
      ? '💡 Terlalu banyak hari kering. Airi ladang untuk menghapus penalti cuaca.'
      : '💡 Terlalu banyak hari kering. Irigasi menghapus penalti ini (alat irigasi di Garasi).');
  }
  if (low('pest')) hints.push('🐛 Semprot hama untuk memulihkan hasil.');
  if (Number.isFinite(f.soilState?.nutrients) && f.soilState.nutrients < 0.75 && !f.fertilized) hints.push('💡 Nutrisi tanah rendah. Pupuk menambah nutrisi; kedelai juga memulihkannya.');
  if (low('rotation')) hints.push('🔄 Tanaman sama dua kali berturut-turut (−10%). Ganti tanaman di siklus berikutnya.');
  if (low('ph', 0.95)) hints.push('🪨 pH tidak cocok. Kapur menggeser pH 0,5 ke arah 6,8 sebelum menanam.');
  if (low('season')) hints.push('⏳ Ditanam di luar musim: tumbuh lebih lambat dan hasil sedikit turun.');
  if (f.greenhouse) hints.push('🏠 Rumah kaca: tanpa penalti musim, hari kering dan badai.');
  if (low('age')) hints.push('🌳 Pohon melewati umur produktif: hasil terus turun. Tebang dan tanam baru.');
  if (f.orchard && !f.orchard.pruned && f.orchard.mature && (f.actions || []).includes('prune')) hints.push('✂️ Pangkas pohon untuk +15% hasil siklus ini.');
  return h('div.yield-breakdown',
    h('div.small.muted', 'Faktor hasil'),
    h('div.yf-list', rows),
    hints.map((t) => h('p.small.yf-hint', t)));
}

/** Signature of the factors, so modals re-render when they change. */
export const yieldFactorsSig = (f) => (f.yieldFactors
  ? FACTORS.map(([k]) => Math.round((f.yieldFactors[k] ?? 1) * 100)).join(',') : '');
