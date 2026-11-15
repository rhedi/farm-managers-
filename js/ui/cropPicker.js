// Crop picker (U2): expected yield, revenue and profit per crop for one or more fields, pH fit, locked crops collapsed.
// Trees (kebun buah) get their own "🌳 Pohon" section with the yearly outlook from game.orchardOutlook.
import { h, fmtMoney, fmtTons, fmtPh, fmtNum, WATER_LABEL } from './dom.js';
import { fold } from './subtabs.js';

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
  if (s.fit === 'cold') return h('span.season-fit.cold', `❄️ terlalu dingin (min ${s.minTemp}°C)`);
  if (s.fit === 'off') return h('span.season-fit.off', `⏳ luar musim`);
  if (s.fit === 'good') return h('span.season-fit.good', `✅ ${s.season.emoji} musimnya`);
  return null;
}

/** Every field has a rumah kaca: season and cold don't matter for annual crops. */
const allGreenhouse = (fields) => fields.length > 0 && fields.every((f) => f.greenhouse);
const ghBadge = () => h('span.gh-badge', '🏠 bebas musim');

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

function lockedLine(locked, what = 'tanaman') {
  if (!locked.length) return null;
  const lv = locked.map((c) => c.unlockLevel);
  const lo = Math.min(...lv);
  const hi = Math.max(...lv);
  return h('details.crop-locked',
    h('summary', `🔒 ${locked.length} ${what} lagi di level ${lo === hi ? lo : `${lo}–${hi}`}`),
    h('div.small.muted', locked.map((c) => `${c.emoji} ${c.name} (Lv ${c.unlockLevel})`).join(' · ')));
}

const days = (n) => `${fmtNum(n)} hari`;

/** Summed orchardOutlook over the fields (null when the engine has none). */
export function treeOutlook(game, fields, tree) {
  if (typeof game.orchardOutlook !== 'function') return null;
  const os = fields.map((f) => game.orchardOutlook(f.id, tree.id)).filter(Boolean);
  if (!os.length) return null;
  const sum = (k) => os.reduce((s, o) => s + (o[k] || 0), 0);
  const profit = sum('yearlyProfit');
  const plantCost = sum('plantCost');
  const paybacks = os.map((o) => o.paybackDays);
  return { tons: sum('tons'), harvestsPerYear: Math.min(...os.map((o) => o.harvestsPerYear)), revenue: sum('yearlyRevenue'),
    cost: sum('yearlyCost'), profit, plantCost, cold: os.every((o) => o.cold),
    paybackDays: paybacks.every((p) => p != null) ? Math.max(...paybacks) : null,
    seasons: os[0].windowSeasons || [], blocked: os.find((o) => o.blocked)?.blocked ?? null };
}

function treeChoice(game, sel, list, t, rerender) {
  const o = treeOutlook(game, list, t);
  const blocked = o?.blocked ?? null;
  const ha = list.reduce((s, f) => s + f.sizeHa, 0);
  return h(`button.choice.tree-choice${sel.cropId === t.id ? '.selected' : ''}`,
    { type: 'button', disabled: !!blocked, onclick: () => { sel.cropId = t.id; rerender(); } },
    h('span.card-icon', t.emoji),
    h('div.crop-main',
      h('div.card-title', t.name, ' ', h('span.tree-tag', '🌳 pohon'), ' ', phBadge(list, t, { fit: list.filter((f) => phFits(f, t)).length, total: list.length })),
      h('div.tree-facts',
        h('span', `🌱→🌳 ${days(t.maturityDays)}`),
        h('span', `${t.emoji} tiap ${days(t.harvestEveryDays)}`),
        h('span', `⏳ umur ${days(t.lifespanDays)}`)),
      o ? h('div.crop-outlook', `≈ ${fmtTons(o.tons)}/panen (dipupuk) · ${fmtNum(o.harvestsPerYear, 1)}× panen/tahun`,
        h(`span.${o.profit >= 0 ? 'pos' : 'neg'}`, ` · untung ${fmtMoney(o.profit)}/tahun`)) : null,
      o && o.seasons.length ? h('div.small.muted', `Berbuah: ${o.seasons.map((s) => `${s.emoji} ${s.name}`).join(', ')}`) : null,
      o?.cold ? h('div.small.season-hint.warn', '❄️ Terlalu dingin di wilayah ini: pohon tidak berbuah') : null,
      blocked ? h('div.small.neg', `🚫 ${blocked}`) : null,
      h('div.card-sub', `Bibit ${fmtMoney(t.plantCostPerHa * ha)}${o?.paybackDays != null ? ` · balik modal ±${days(o.paybackDays)}` : ''} · air ${WATER_LABEL[t.waterNeed] ?? t.waterNeed}`)));
}

/** "🌳 Pohon" block: open trees plus the locked line; null when the game has no trees. */
function treeSection(game, sel, list, rerender) {
  const trees = game.data.TREES || [];
  if (!trees.length) return null;
  const level = game.state.level;
  const open = trees.filter((t) => t.unlockLevel <= level);
  const locked = trees.filter((t) => t.unlockLevel > level);
  const picked = open.some((t) => t.id === sel.cropId);
  const body = [open.length ? h('div.choice-list.crop-list', open.map((t) => treeChoice(game, sel, list, t, rerender))) : null,
    lockedLine(locked, 'pohon')];
  // Picking a tree keeps the fold open across re-renders; otherwise it is remembered like other folds.
  return picked ? h('div.tree-section', h('div.tree-head', '🌳 Pohon', h('span.small.muted', ' · tanam sekali, panen berkali-kali')), body)
    : fold('crop-trees', '🌳 Pohon (kebun buah)', { meta: open.length ? `${open.length} terbuka` : '🔒', cls: 'tree-section' },
      h('p.small.muted', 'Tanam sekali, panen berkali-kali.'), body);
}

const TOP_CROPS = 5;

/** The most profitable crops (plus the selected one) as a list; the rest in a remembered "Tanaman lain" fold. */
function cropChoices(ranked, sel, build) {
  const top = ranked.filter((r, i) => i < TOP_CROPS || r.c.id === sel.cropId);
  const rest = ranked.filter((r) => !top.includes(r));
  return [
    h('div.choice-list.crop-list', top.map(({ c, o }) => build(c, o))),
    rest.length ? fold('crop-more', '🌾 Tanaman lain', { meta: String(rest.length) },
      h('div.choice-list.crop-list', rest.map(({ c, o }) => build(c, o)))) : null,
  ];
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
  const gh = allGreenhouse(list);
  const ranked = rankCrops(game, list, open);
  const bestId = ranked[0]?.o.profit != null && !ranked[0].cold ? ranked[0].c.id : null;
  return h('div.field-group', h('label', `${label} · untung terbesar di atas`),
    gh ? h('p.small.gh-note', '🏠 Rumah kaca: musim dan suhu dingin tidak memperlambat tanaman, hasil +20%.') : null,
    ...cropChoices(ranked, sel, (c, o) => {
      const so = gh ? null : seasonOutlook(game, list, c);
      return h(`button.choice${sel.cropId === c.id ? '.selected' : ''}`,
        { type: 'button', onclick: () => { sel.cropId = c.id; rerender(); } },
        h('span.card-icon', c.emoji),
        h('div.crop-main',
          h('div.card-title', c.name, c.id === bestId ? h('span.best-tag', '⭐ Terbaik') : null, ' ', phBadge(list, c, o), ' ', gh ? ghBadge() : seasonBadge(c, so)),
          outlookLine(o),
          forecastHint(c, so),
          h('div.card-sub', `Benih ${fmtMoney(c.seedCostPerHa * ha)} · ${c.growDays} hari · air ${WATER_LABEL[c.waterNeed] ?? c.waterNeed}`)));
    }),
    lockedLine(locked),
    treeSection(game, sel, list, rerender));
}

/**
 * Crops ranked for these fields: ones that can grow now first (too cold = growth stops, unless every field is a
 * greenhouse), then by expected profit (unknown profits last, in data order).
 */
function rankCrops(game, fields, crops) {
  const gh = allGreenhouse(fields);
  return crops.map((c) => ({ c, o: cropOutlook(game, fields, c), cold: !gh && seasonOutlook(game, fields, c)?.fit === 'cold' }))
    .sort((a, b) => Number(a.cold) - Number(b.cold) || (b.o.profit ?? -Infinity) - (a.o.profit ?? -Infinity));
}

/** Unlocked crop ranked first by rankCrops (falls back to the first unlocked). */
export function bestCropId(game, fields) {
  const open = game.data.CROPS.filter((c) => c.unlockLevel <= game.state.level);
  return rankCrops(game, fields, open)[0]?.c.id ?? open[0]?.id ?? null;
}
