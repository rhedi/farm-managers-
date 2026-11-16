// Map ambience: per-region season tint + emoji label, rain/snow over raining regions,
// drifting clouds. Elements are built with the map; updateMapFx only toggles classes.
import { h } from './dom.js';

/** Region boxes (percent coords) from the field list. */
export function regionBoxes(fields) {
  const acc = new Map();
  for (const f of fields) {
    const r = acc.get(f.regionId) || { id: f.regionId, name: f.region, sx: 0, n: 0, x0: 100, x1: 0, y0: 100, y1: 0 };
    r.sx += f.x; r.n++;
    r.x0 = Math.min(r.x0, f.x); r.x1 = Math.max(r.x1, f.x);
    r.y0 = Math.min(r.y0, f.y); r.y1 = Math.max(r.y1, f.y);
    acc.set(f.regionId, r);
  }
  return [...acc.values()].map((r) => ({ ...r, x: r.sx / r.n, labelY: Math.min(96, r.y1 + 9) }));
}

function seasonOf(game, regionId) {
  try { return typeof game.seasonOf === 'function' ? game.seasonOf(regionId) : null; } catch { return null; }
}

/** Ground colour of a region from its climate: wet tropics lush, cold pale, dry tan, else temperate green. */
function groundOf(game, regionId) {
  const c = (game.data.REGIONS || []).find((r) => r.id === regionId)?.climate;
  if (!c) return 'temperate';
  if (c.tropical && c.rainChance >= 0.4) return 'lush';
  if (c.baseTemp <= 10) return 'cool';
  if (c.rainChance < 0.3) return 'dry';
  return 'temperate';
}

/** Ground layer (climate-coloured land per region), season tints, rain + clouds, plus region labels. */
export function mapFxLayers(game, regions) {
  const lands = regions.map((r) => h('div.map-land', {
    dataset: { ground: groundOf(game, r.id) },
    style: { left: `${r.x0 - 13}%`, top: `${r.y0 - 13}%`, width: `${r.x1 - r.x0 + 26}%`, height: `${r.y1 - r.y0 + 30}%` },
  }));
  const tints = regions.map((r) => h('div.map-tint', {
    dataset: { region: r.id },
    style: { left: `${r.x0 - 10}%`, top: `${r.y0 - 12}%`, width: `${r.x1 - r.x0 + 20}%`, height: `${r.y1 - r.y0 + 26}%` },
  }));
  const rain = regions.map((r) => h('div.map-rain', {
    dataset: { region: r.id },
    style: { left: `${r.x0 - 8}%`, top: `${r.y0 - 14}%`, width: `${r.x1 - r.x0 + 16}%`, height: `${r.y1 - r.y0 + 22}%` },
  }, h('span.map-rain-cloud', '☁️')));
  const labels = regions.map((r) => h('div.map-region-label', {
    dataset: { region: r.id }, style: { left: `${r.x}%`, top: `${r.labelY}%` },
  }, r.name));
  const clouds = h('div.map-clouds', h('span.c1'), h('span.c2'), h('span.c3'));
  return { lands, tints, rain, labels, clouds };
}

/** Toggle rain/snow and season tint classes; refresh label emoji. */
export function updateMapFx(mapEl, game, regions) {
  if (!mapEl) return;
  const wv = typeof game.weatherView === 'function' ? game.weatherView() : [];
  for (const r of regions) {
    const w = wv.find((x) => x.regionId === r.id);
    const sel = `[data-region="${CSS.escape(String(r.id))}"]`;
    const rain = mapEl.querySelector(`.map-rain${sel}`);
    if (rain) {
      rain.classList.toggle('on', !!w?.rain);
      rain.classList.toggle('snow', !!w?.rain && w.temp < 2);
    }
    const s = seasonOf(game, r.id);
    const tint = mapEl.querySelector(`.map-tint${sel}`);
    const sid = s?.id ?? '';
    if (tint && tint.dataset.season !== sid) tint.dataset.season = sid;
    const label = mapEl.querySelector(`.map-region-label${sel}`);
    const text = s?.emoji ? `${s.emoji} ${r.name}` : r.name;
    if (label && label.textContent !== text) {
      label.textContent = text;
      label.title = s?.name ?? '';
    }
  }
}
