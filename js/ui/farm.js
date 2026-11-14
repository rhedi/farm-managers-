// Farm tab: stylized world map + owned field cards.
import { h, mount, fmtMoney, fmtPh, progressBar, STATE_LABEL, STATE_EMOJI } from './dom.js';
import { app } from './app.js';
import { openFieldModal, actionButton } from './fieldModal.js';
import { fieldStatusText, fieldSignature } from './fieldStatus.js';
import { planChip } from './planEditor.js';
import { batchBar } from './batchBar.js';
import { plotEl, updatePlot } from './plot.js';
import { regionBoxes, mapFxLayers, updateMapFx } from './mapFx.js';
import { eventsBanner, updateEventsBanner } from './eventsBanner.js';

let sig = '';
let live = new Map(); // fieldId → { bar, status, plot }
let map = null; // { el, regions }
let banner = null;

function pinLabel(f) {
  if (f.locked) return [h('span.pin-lock', '🔒'), h('span.pin-lv', `Lv ${f.unlockLevel}`)];
  if (!f.owned) return '🏷️';
  if (f.state === 'busy') return '🚜';
  if ((f.state === 'growing' || f.state === 'ready') && f.crop) return f.crop.emoji;
  return STATE_EMOJI[f.state] ?? '•';
}

function renderMap(fields) {
  const regions = regionBoxes(fields);
  const fx = mapFxLayers(app.game, regions);
  const el = h('div.map', { role: 'img', 'aria-label': 'Peta ladang' },
    fx.tints, fx.labels, fx.rain,
    fields.map((f) => h(`button.map-pin.${f.owned ? 'owned' : f.locked ? 'locked' : 'forsale'}.st-${f.state}${f.pest ? '.pest' : ''}`, {
      dataset: { fieldId: f.id },
      style: { left: `${f.x}%`, top: `${f.y}%` },
      title: f.owned ? `${f.name} — ${STATE_LABEL[f.state]}`
        : f.locked ? `${f.name} — terkunci sampai level ${f.unlockLevel}` : `${f.name} — ${fmtMoney(f.price)}`,
      onclick: () => openFieldModal(f.id),
    }, pinLabel(f))),
    fx.clouds);
  map = { el, regions };
  updateMapFx(el, app.game, regions);
  return el;
}

function fieldCard(f) {
  const st = f.state;
  const bar = progressBar(f.progress, st === 'busy' ? 'blue' : st === 'ready' ? 'gold' : '');
  const status = h('div.small.muted', fieldStatusText(f));
  const plot = plotEl(f);
  live.set(f.id, { bar, status, plot });
  return h(`div.card.clickable.field-card.st-${st}`, { dataset: { fieldId: f.id }, onclick: () => openFieldModal(f.id) },
    h('div.card-head',
      h('div.card-icon', f.crop ? f.crop.emoji : STATE_EMOJI[st]),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.card-title', f.name),
        h('div.card-sub', `${f.region} · ${f.sizeHa} ha · pH ${fmtPh(f.ph)}`)),
      h(`span.badge.st-${st}`, STATE_LABEL[st])),
    h('div.card-body', plot, bar, status, planChip(app.game, f)),
    f.actions.length ? h('div.card-actions', f.actions.map((a) => actionButton(f, a))) : null);
}

function computeSig(fields) {
  return fields.map((f) => fieldSignature(f) + (f.locked ? ':L' : '')).join('|');
}

export function renderFarm(root) {
  const fields = app.game.fieldsView();
  const owned = fields.filter((f) => f.owned);
  sig = computeSig(fields);
  live = new Map();
  const locked = fields.filter((f) => f.locked).length;
  const forSale = fields.length - owned.length - locked;
  banner = eventsBanner(app.game);
  mount(root,
    banner,
    h('section.section',
      h('div.section-title', '🗺️ Peta', h('span.spacer'),
        h('span.small.muted', `${owned.length} dimiliki · ${forSale} dijual${locked ? ` · 🔒 ${locked}` : ''}`)),
      renderMap(fields),
      h('p.small.muted', `Ketuk pin untuk detail. Pin bergaris putus-putus = ladang yang dijual${locked ? ', 🔒 Lv N = terbuka di level N' : ''}.`)),
    h('section.section',
      h('div.section-title', '🌾 Ladangku'),
      batchBar(owned),
      owned.length
        ? h('div.cards', owned.map(fieldCard))
        : h('div.empty', 'Belum punya ladang. Beli dari peta.')));
}

/** Cheap periodic update: rebuild only when states/actions change. */
export function updateFarm(root) {
  const fields = app.game.fieldsView();
  if (computeSig(fields) !== sig) { renderFarm(root); return; }
  for (const f of fields) {
    const l = live.get(f.id);
    if (!l) continue;
    l.bar.firstChild.style.width = `${Math.round(f.progress * 100)}%`;
    const t = fieldStatusText(f);
    if (l.status.textContent !== t) l.status.textContent = t;
    updatePlot(l.plot, f);
    map?.el.querySelector(`.map-pin[data-field-id="${CSS.escape(String(f.id))}"]`)?.classList.toggle('pest', !!f.pest);
  }
  if (map) updateMapFx(map.el, app.game, map.regions);
  updateEventsBanner(banner, app.game);
}
