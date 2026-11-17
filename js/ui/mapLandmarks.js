// 🏛️ Proyek Warisan on the Peta: next to each region label a row of landmark icons that grow with the stage (1 → 3),
// a bobbing crane + dust while a stage is built, a sparkle on finished (stage 3) projects, and the continent's Monumen
// on top of the map. The row sits under the label (beside it on the map's bottom edge), clear of pins and neighbours.
// Decorative only (pointer-events: none).
import { h } from './dom.js';

function view(game) {
  try { return game.projectsView?.() ?? null; } catch { return null; }
}

/** {rows: Map(regionId → element), monument: element | null} for the regions on this map. */
export function landmarkLayer(game, regions) {
  const v = view(game), rows = new Map();
  if (!v) return { rows, monument: null };
  const byRegion = new Map();
  for (const l of v.landmarks) (byRegion.get(l.regionId) ?? byRegion.set(l.regionId, []).get(l.regionId)).push(l);
  for (const r of regions) {
    const list = byRegion.get(r.id);
    if (!list?.length) continue;
    // below the name, unless the label sits on the map's bottom edge: then beside it, toward the map centre
    const side = r.labelY > 88 ? (r.x > 50 ? 'lm-left' : 'lm-right') : 'lm-below';
    rows.set(r.id, h(`span.map-landmarks.${side}`, { 'aria-hidden': 'true' },
      list.map((l) => h(`span.lm.st-${l.stage}${l.building ? '.building' : ''}`,
        h('span.lm-ico', l.emoji), l.building ? h('span.lm-crane', '🏗️') : null, l.stage >= 3 ? h('span.lm-spark', '✨') : null))));
  }
  const cont = game.data.REGIONS.find((x) => x.id === regions[0]?.id)?.continent;
  const mon = v.monuments.find((m) => m.continentId === cont);
  const monument = mon && (mon.done || mon.build)
    ? h(`div.map-monument${mon.done ? '.done' : '.building'}`, { 'aria-hidden': 'true', title: mon.name },
      h('span.lm-ico', mon.emoji), mon.build ? h('span.lm-crane', '🏗️') : h('span.lm-spark', '✨'))
    : null;
  return { rows, monument };
}
