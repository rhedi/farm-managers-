// Animated field plot for field cards: soil, growth-stage sprites, a tractor crossing
// the plot while busy, sway when ready, grey when withering, 🐛 on pests.
// Built once per card render; updatePlot() only touches CSS vars/text so running
// CSS animations never restart.
import { h } from './dom.js';

const SPRITES = 14;

/** Sprite emoji for the current growth stage ('' = bare soil). Orchards: 🌱 young → 🌳 → fruit when ripening. */
function stageEmoji(f) {
  const crop = f.crop;
  if (!crop) return '';
  if (f.orchard) {
    if (f.state === 'ready' || (f.state === 'busy' && f.task === 'harvest')) return crop.emoji;
    if (!f.orchard.mature) return f.orchard.maturity < 0.4 ? '🌱' : '🌳';
    return f.orchard.fruit >= 0.6 ? crop.emoji : '🌳';
  }
  if (f.state === 'busy' && !['harvest', 'irrigate'].includes(f.task)) return '';
  if (f.state === 'ready' || (f.state === 'busy' && f.task === 'harvest')) return crop.emoji;
  const g = f.growth ?? 0;
  return g < 0.34 ? '🌱' : g < 0.7 ? '🌿' : crop.emoji;
}

function soilClass(f) {
  if (f.state !== 'busy') return `ps-${f.state}${f.fertilized && f.state === 'plowed' ? ' ps-fert' : ''}`;
  const base = f.baseState ?? (f.task === 'plow' ? 'idle' : f.task === 'harvest' ? 'ready' : 'plowed');
  return `ps-busy ps-${base} pt-${f.task}`;
}

function classes(f) {
  const wither = f.withering && !f.orchard ? ' withering' : '';
  const pest = f.pest ? ' pest' : '';
  const orch = f.orchard ? ' ps-trees' : '';
  const gh = f.greenhouse ? ' ps-gh' : '';
  return `plot ${soilClass(f)}${wither}${pest}${orch}${gh}`;
}

function vars(el, f) {
  const p = `${(Math.min(1, Math.max(0, f.progress ?? 0))).toFixed(3)}`;
  const g = `${(Math.min(1, Math.max(0, f.state === 'ready' ? 1 : f.orchard ? (f.orchard.mature ? 1 : f.orchard.maturity) : f.growth ?? 0))).toFixed(3)}`;
  if (el.style.getPropertyValue('--p') !== p) el.style.setProperty('--p', p);
  if (el.style.getPropertyValue('--g') !== g) el.style.setProperty('--g', g);
}

/** Build the plot element for a field view. */
export function plotEl(f) {
  const stage = stageEmoji(f);
  const el = h('div', { class: classes(f), 'aria-hidden': 'true' },
    h('div.plot-done'),
    h('div.plot-rows', Array.from({ length: SPRITES }, () => h('span.sp', stage))),
    f.state === 'busy' ? h(`span.plot-rig${f.task === 'harvest' ? '.harvest' : ''}`, h('span', f.orchard || ['prune', 'clear'].includes(f.task) ? (f.task === 'harvest' ? '🧺' : '🧑‍🌾') : '🚜')) : null,
    h('span.plot-pest', '🐛'),
    h('span.plot-glass'));
  el.querySelectorAll('.sp').forEach((s, i) => s.style.setProperty('--i', String(i)));
  el.dataset.stage = stage;
  vars(el, f);
  return el;
}

/** Cheap in-place update (every 500 ms). */
export function updatePlot(el, f) {
  if (!el) return;
  const cls = classes(f);
  if (el.className !== cls) el.className = cls;
  vars(el, f);
  const stage = stageEmoji(f);
  if (el.dataset.stage !== stage) {
    el.dataset.stage = stage;
    for (const s of el.querySelectorAll('.sp')) s.textContent = stage;
  }
}
