// Active random events banner on top of the Ladang tab. Hidden when there are none.
import { h, mount, fmtMoney } from './dom.js';
import { app, act } from './app.js';

function activeEvents(game) {
  try { return typeof game.activeEvents === 'function' ? game.activeEvents() || [] : []; } catch { return []; }
}

function pestCost(game, ev) {
  if (Number.isFinite(ev.cost)) return ev.cost;
  try { return typeof game.treatPestCost === 'function' ? game.treatPestCost(ev.fieldId) : null; } catch { return null; }
}

function daysLeft(game, ev) {
  if (ev.endsDay == null) return ev.type === 'pest' ? 'sampai disemprot' : '';
  const d = Math.max(0, ev.endsDay - game.day);
  return d <= 0 ? 'berakhir hari ini' : `${d} hari lagi`;
}

function where(game, ev) {
  const d = game.data;
  const field = ev.fieldId != null ? d.FIELDS?.find((f) => f.id === ev.fieldId) : null;
  if (field) return field.name;
  const region = ev.regionId != null ? d.REGIONS?.find?.((r) => r.id === ev.regionId) : null;
  return region?.name ?? '';
}

function treat(fieldId) {
  if (typeof app.game.treatPest !== 'function') return;
  act(app.game.treatPest(fieldId), (r) => `🧴 Ladang disemprot${Number.isFinite(r.cost) ? ` (${fmtMoney(r.cost)})` : ''}.`);
}

function eventRow(game, ev) {
  const cost = ev.type === 'pest' ? pestCost(game, ev) : null;
  const loc = where(game, ev);
  const left = daysLeft(game, ev);
  return h(`div.event-item.ev-${ev.type ?? 'misc'}`,
    h('span.event-emoji', ev.emoji ?? '📣'),
    h('div.event-text',
      h('div.event-name', ev.name ?? 'Kejadian', loc ? h('span.muted', ` · ${loc}`) : null),
      ev.desc ? h('div.small.muted', ev.desc) : null),
    h('div.event-actions',
      left ? h('span.badge.event-left', left) : null,
      ev.type === 'pest' && ev.fieldId != null && typeof game.treatPest === 'function'
        ? h('button.btn.btn-small.btn-danger', {
          disabled: cost != null && game.state.money < cost,
          onclick: (e) => { e.stopPropagation(); treat(ev.fieldId); },
        }, `🧴 Semprot${cost != null ? ` (${fmtMoney(cost)})` : ''}`)
        : null));
}

function sigOf(game, list) {
  const poor = list.map((ev) => (ev.type === 'pest' && game.state.money < (pestCost(game, ev) ?? 0) ? 1 : 0)).join('');
  return `${game.day}|${poor}|${list.map((e) => `${e.id}:${e.endsDay}`).join(',')}`;
}

/** Banner element; call updateEventsBanner on it every view update. */
export function eventsBanner(game) {
  const el = h('section.events-banner', { 'aria-live': 'polite' });
  el.dataset.sig = '';
  updateEventsBanner(el, game);
  return el;
}

export function updateEventsBanner(el, game) {
  if (!el) return;
  const list = activeEvents(game);
  const sig = sigOf(game, list);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.hidden = !list.length;
  if (!list.length) { el.replaceChildren(); return; }
  mount(el, h('div.events-title', '📣 Kejadian aktif'), list.map((ev) => eventRow(game, ev)));
}
