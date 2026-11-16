// Ladang tab: 🌾 Ladangku (fields that need a step first, then running ones, fields for sale) | 🗺️ Peta.
// Wide screens (≥1000 px) show both panes side by side.
import { h, mount, fmtMoney, fmtPh, progressBar, STATE_LABEL, STATE_EMOJI } from './dom.js';
import { app } from './app.js';
import { openFieldModal, actionButton } from './fieldModal.js';
import { fieldStatusText, fieldSignature } from './fieldStatus.js';
import { planChip } from './planEditor.js';
import { batchBar } from './batchBar.js';
import { plotEl, updatePlot } from './plot.js';
import { regionBoxes, mapFxLayers, updateMapFx } from './mapFx.js';
import { eventsBanner, updateEventsBanner } from './eventsBanner.js';
import { subTabBar, getSub, fold, setSub, chipBar, goTo } from './subtabs.js';
import { chapterPill } from './missions.js';

const SUBS = ['fields', 'map'];
const FOR_SALE_SHOWN = 3;
let sig = '';
let live = new Map(); // fieldId → { bar, status, plot }
let map = null; // { el, regions }
let banner = null;

/** A field the player should look at now: ready/idle/plowed without a running plan, pests, withering. */
export function needsAction(f) {
  if (!f.owned || f.state === 'busy') return false;
  if (f.pest || f.withering) return true;
  if (!['idle', 'plowed', 'ready'].includes(f.state)) return false;
  return !f.plan || !!f.plan.blocked;
}

function pinLabel(f) {
  if (f.locked) return [h('span.pin-lock', '🔒'), h('span.pin-lv', `Lv ${f.unlockLevel}`)];
  if (!f.owned) return '🏷️';
  if (f.state === 'busy') return '🚜';
  if ((f.state === 'growing' || f.state === 'ready' || f.state === 'orchard') && f.crop) return f.crop.emoji;
  return STATE_EMOJI[f.state] ?? '•';
}

/** Continent ids from data (empty for data without CONTINENTS: one map with every region). */
const continentIds = () => (app.game.data.CONTINENTS || []).map((c) => c.id);
const continentOfRegion = () => new Map((app.game.data.REGIONS || []).map((r) => [r.id, r.continent]));
const activeContinent = () => { const ids = continentIds(); return ids.length ? getSub('farm-map', ids) : null; };

function renderMap(fields, continent) {
  const regions = regionBoxes(fields);
  const fx = mapFxLayers(app.game, regions);
  const el = h('div.map', { role: 'img', 'aria-label': 'Peta ladang', dataset: { continent: continent ?? '' } },
    fx.lands, fx.tints, fx.labels, fx.rain,
    fields.map((f) => h(`button.map-pin.${f.owned ? 'owned' : f.locked ? 'locked' : 'forsale'}.st-${f.state}${f.pest ? '.pest' : ''}`, {
      dataset: { fieldId: f.id },
      style: { left: `${f.x}%`, top: `${f.y}%` },
      title: f.owned ? `${f.name} — ${STATE_LABEL[f.state]}`
        : f.locked ? `${f.name} — terkunci sampai level ${f.unlockLevel}` : `${f.name} — ${fmtMoney(f.price)}`,
      'aria-label': f.owned ? `${f.name}, ${STATE_LABEL[f.state]}` : f.locked ? `${f.name}, terkunci level ${f.unlockLevel}` : `${f.name}, dijual ${fmtMoney(f.price)}`,
      onclick: () => openFieldModal(f.id),
    }, pinLabel(f))),
    fx.clouds);
  map = { el, regions };
  updateMapFx(el, app.game, regions);
  return el;
}

function fieldCard(f) {
  const st = f.state;
  const bar = progressBar(f.progress, st === 'busy' ? 'thin.blue' : st === 'ready' ? 'thin.gold' : 'thin');
  const status = h('div.fc-status-text', fieldStatusText(f));
  const plot = plotEl(f);
  live.set(f.id, { bar, status, plot });
  const acts = (f.actions || []).filter((a) => a !== 'sell');
  return h(`div.card.clickable.field-card.st-${st}`, { dataset: { fieldId: f.id }, onclick: () => openFieldModal(f.id) },
    h('div.card-head',
      h('div.card-icon', f.crop ? f.crop.emoji : STATE_EMOJI[st]),
      h('div.card-main',
        h('div.card-title', f.name, f.greenhouse ? h('span.gh-chip', '🏠 Rumah kaca') : null),
        h('div.card-sub', `${f.region} · ${f.sizeHa} ha · pH ${fmtPh(f.ph)}`)),
      h(`span.badge.st-${st}`, STATE_LABEL[st])),
    plot,
    h('div.fc-status', bar, status),
    planChip(app.game, f),
    acts.length ? h('div.card-actions', acts.map((a) => actionButton(f, a))) : null);
}

/** Cheapest unlocked fields for sale; a row opens the field dialog (Beli there). */
function forSaleFold(fields) {
  const sale = fields.filter((f) => !f.owned && !f.locked).sort((a, b) => a.price - b.price);
  if (!sale.length) return null;
  const money = app.game.state.money;
  const row = (f) => h('button.list-item.buy-row', { type: 'button', dataset: { fieldId: f.id }, onclick: () => openFieldModal(f.id) },
    h('span.buy-row-icon', '🏷️'),
    h('span.buy-row-main', h('b', f.name), h('span.small.muted', `${f.region} · ${f.sizeHa} ha · pH ${fmtPh(f.ph)}`)),
    h(`span.buy-row-price.num${f.price > money ? '.muted' : ''}`, fmtMoney(f.price)));
  return fold('farm-forsale', '🛒 Ladang dijual', { open: true, meta: String(sale.length) },
    h('div.list', sale.slice(0, FOR_SALE_SHOWN).map(row)),
    h('button.btn.btn-secondary.btn-block.more-btn', { type: 'button', onclick: () => { setSub('farm', 'map'); app.requestRender(); window.scrollTo(0, 0); } },
      `🗺️ Lihat semua di peta (${sale.length})`));
}

function fieldsPane(fields) {
  const owned = fields.filter((f) => f.owned);
  const todo = owned.filter(needsAction);
  const running = owned.filter((f) => !needsAction(f));
  banner = eventsBanner(app.game);
  return h('div.pane.pane-fields',
    banner,
    owned.length ? null : h('div.empty', 'Belum punya ladang. Beli dari daftar di bawah atau dari peta.'),
    todo.length ? h('section.section',
      h('div.section-title', `⚡ Perlu tindakan`, h('span.count-chip.hot', String(todo.length))),
      batchBar(owned),
      h('div.cards', todo.map(fieldCard))) : null,
    running.length ? fold('farm-running', '⏳ Sedang berjalan', { open: true, meta: String(running.length) },
      todo.length ? null : batchBar(owned),
      h('div.cards', running.map(fieldCard))) : null,
    forSaleFold(fields));
}

/** One continent at a time (chips); pins of other continents aren't rendered. */
function mapPane(fields) {
  const owned = fields.filter((f) => f.owned).length;
  const locked = fields.filter((f) => f.locked).length;
  const forSale = fields.length - owned - locked;
  const conts = app.game.data.CONTINENTS || [];
  const cur = activeContinent();
  const contOf = continentOfRegion();
  const shown = cur ? fields.filter((f) => contOf.get(f.regionId) === cur) : fields;
  const ready = (c) => fields.filter((f) => f.owned && f.state === 'ready' && contOf.get(f.regionId) === c.id).length;
  return h('div.pane.pane-map',
    h('section.section',
      h('div.section-title', '🗺️ Peta', h('span.small.muted', `${owned} dimiliki · ${forSale} dijual${locked ? ` · 🔒 ${locked}` : ''}`)),
      conts.length ? chipBar('farm-map', conts.map((c) => ({ id: c.id,
        label: `${c.emoji} ${c.short ?? c.name}${ready(c) ? ' 🌾' : ''}`,
        count: fields.filter((f) => f.owned && contOf.get(f.regionId) === c.id).length || null })), cur) : null,
      renderMap(shown, cur),
      h('div.map-legend',
        h('span', h('i.lg.lg-owned'), 'Milikmu'),
        h('span', h('i.lg.lg-sale'), 'Dijual'),
        locked ? h('span', h('i.lg.lg-lock'), '🔒 Lv N') : null,
        h('span.muted', 'Ketuk pin untuk detail'))));
}

function computeSig(fields) {
  const ch = app.game.chaptersView?.();
  return `${getSub('farm', SUBS)}|${activeContinent()}|${ch?.started && ch.ready ? ch.current.id : ''}|`
    + fields.map((f) => fieldSignature(f) + (f.locked ? ':L' : '') + (f.pest ? ':P' : '')).join('|');
}

export function renderFarm(root) {
  const fields = app.game.fieldsView();
  sig = computeSig(fields);
  live = new Map();
  map = null;
  const sub = getSub('farm', SUBS);
  const todo = fields.filter(needsAction).length;
  const panes = [fieldsPane(fields), mapPane(fields)];
  panes[sub === 'map' ? 0 : 1].hidden = true;
  const pill = chapterPill(app.game, goTo); // 📖 Bab Petani: a step's reward is ready (top of Ladangku)
  if (pill) panes[0].prepend(pill);
  mount(root,
    subTabBar('farm', [
      { id: 'fields', icon: '🌾', label: 'Ladangku', badge: todo || null },
      { id: 'map', icon: '🗺️', label: 'Peta' },
    ], sub),
    panes);
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
  }
  if (map) updateMapFx(map.el, app.game, map.regions);
  updateEventsBanner(banner, app.game);
}
