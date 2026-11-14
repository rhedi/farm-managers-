// Crop picker (U2): expected yield, revenue and profit per crop for one or more fields, pH fit, locked crops collapsed.
import { h, fmtMoney, fmtTons, fmtPh, WATER_LABEL } from './dom.js';

export const phFits = (field, crop) => field.ph >= crop.idealPh[0] && field.ph <= crop.idealPh[1];

/** Expected tons on this field (keeps the field's fertilized flag); null when the engine can't tell. */
function expectedTons(game, field, crop) {
  if (typeof game.estimateYield !== 'function') return null;
  try {
    const t = game.estimateYield(field.id, crop.id, { fertilized: !!field.fertilized });
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}

/** Totals for planting `crop` on every field in `fields`. */
export function cropOutlook(game, fields, crop) {
  const price = game.state.market?.[crop.id];
  let tons = 0;
  let known = true;
  let seed = 0;
  let fit = 0;
  for (const f of fields) {
    const t = expectedTons(game, f, crop);
    if (t == null) known = false; else tons += t;
    seed += crop.seedCostPerHa * f.sizeHa;
    if (phFits(f, crop)) fit++;
  }
  const revenue = known && Number.isFinite(price) ? tons * price : null;
  return { tons: known ? tons : null, revenue, seed, profit: revenue == null ? null : revenue - seed, fit, total: fields.length };
}

function phBadge(fields, crop, o) {
  const range = `pH ${fmtPh(crop.idealPh[0])}–${fmtPh(crop.idealPh[1])}`;
  if (fields.length === 1) {
    return o.fit ? h('span.ph-fit.ok', `✅ ${range}`)
      : h('span.ph-fit.warn', { title: `pH ladang ${fmtPh(fields[0].ph)}` }, `⚠️ ${range} (ladang ${fmtPh(fields[0].ph)})`);
  }
  return h(`span.ph-fit.${o.fit === o.total ? 'ok' : 'warn'}`, `${o.fit === o.total ? '✅' : '⚠️'} pH cocok ${o.fit}/${o.total} ladang`);
}

const FIT_RANK = { cold: 3, off: 2, neutral: 1, good: 0 };

/** Worst season fit over the fields' regions (F5), or null when the engine has no seasons. */
function seasonOutlook(game, fields, crop) {
  if (typeof game.cropFit !== 'function') return null;
  let worst = null;
  for (const regionId of new Set(fields.map((f) => f.regionId))) {
    const v = game.cropFit(regionId, crop.id);
    const rank = (x) => FIT_RANK[x.fit] * 10 + x.coldDays;
    if (v && (!worst || rank(v) > rank(worst))) worst = v;
  }
  return worst;
}

function seasonBadge(crop, s) {
  if (!s) return null;
  if (s.fit === 'cold') return h('span.season-fit.cold', { title: `Butuh ≥ ${s.minTemp}°C` }, '❄️ terlalu dingin');
  if (s.fit === 'off') return h('span.season-fit.off', { title: `${s.season.name}: tumbuh lebih lambat, hasil sedikit turun` }, `⏳ luar musim`);
  if (s.fit === 'good') return h('span.season-fit.good', { title: `${s.season.name}: musim tanam yang cocok` }, `✅ ${s.season.emoji} musimnya`);
  return null;
}

/** Forecast-aware hint for the next days (cold stops growth; dry days hurt thirsty crops). */
function forecastHint(crop, s) {
  if (!s?.days) return null;
  if (s.coldDays && s.fit !== 'cold') return h('div.small.season-hint.warn', `❄️ ${s.coldDays}/${s.days} hari ke depan di bawah ${s.minTemp}°C: pertumbuhan berhenti`);
  if (s.fit === 'cold') return h('div.small.season-hint.warn', `❄️ Sekarang terlalu dingin (min ${s.minTemp}°C); tunggu musim hangat`);
  if (s.fit === 'off') return h('div.small.season-hint', `⏳ ${s.season.name}: tumbuh ×${String(s.growthMult).replace('.', ',')}, hasil −5%`);
  if (crop.waterNeed === 'high' && s.dryDays >= 2) return h('div.small.season-hint', `☀️ ${s.dryDays}/${s.days} hari kering ke depan: siapkan irigasi`);
  return null;
}

function outlookLine(o) {
  if (o.tons == null) return null;
  const parts = [`≈ ${fmtTons(o.tons)}`];
  if (o.revenue != null) parts.push(`≈ ${fmtMoney(o.revenue)}`);
  return h('div.crop-outlook', parts.join(' · '),
    o.profit != null ? h(`span.${o.profit >= 0 ? 'pos' : 'neg'}`, ` (untung ${fmtMoney(o.profit)})`) : null);
}

function lockedLine(locked) {
  if (!locked.length) return null;
  const lv = locked.map((c) => c.unlockLevel);
  const lo = Math.min(...lv);
  const hi = Math.max(...lv);
  return h('details.crop-locked',
    h('summary', `🔒 ${locked.length} tanaman lagi di level ${lo === hi ? lo : `${lo}–${hi}`}`),
    h('div.small.muted', locked.map((c) => `${c.emoji} ${c.name} (Lv ${c.unlockLevel})`).join(' · ')));
}

/**
 * sel.cropId is read/written. `fields` is one field view or an array of them.
 * Returns a .field-group node.
 */
export function cropPicker(game, sel, fields, rerender, label = 'Pilih tanaman') {
  const list = Array.isArray(fields) ? fields : [fields];
  const level = game.state.level;
  const crops = game.data.CROPS;
  const open = crops.filter((c) => c.unlockLevel <= level);
  const locked = crops.filter((c) => c.unlockLevel > level);
  const ha = list.reduce((s, f) => s + f.sizeHa, 0);
  return h('div.field-group', h('label', label),
    h('div.choice-list.crop-list', open.map((c) => {
      const o = cropOutlook(game, list, c);
      const so = seasonOutlook(game, list, c);
      return h(`button.choice${sel.cropId === c.id ? '.selected' : ''}`,
        { type: 'button', onclick: () => { sel.cropId = c.id; rerender(); } },
        h('span.card-icon', c.emoji),
        h('div.crop-main',
          h('div.card-title', c.name, ' ', phBadge(list, c, o), ' ', seasonBadge(c, so)),
          outlookLine(o),
          forecastHint(c, so),
          h('div.card-sub', `Benih ${fmtMoney(c.seedCostPerHa * ha)} · ${c.growDays} hari · air ${WATER_LABEL[c.waterNeed] ?? c.waterNeed}`)));
    })),
    lockedLine(locked));
}

/** Unlocked crop with the best expected profit on these fields (falls back to the first unlocked). */
export function bestCropId(game, fields) {
  const open = game.data.CROPS.filter((c) => c.unlockLevel <= game.state.level);
  let best = open[0]?.id ?? null;
  let bestProfit = -Infinity;
  for (const c of open) {
    const p = cropOutlook(game, fields, c).profit;
    if (p != null && p > bestProfit) { bestProfit = p; best = c.id; }
  }
  return best;
}
