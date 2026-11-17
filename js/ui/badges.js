// Bottom-nav badges: only counts of things the player can act on now. Red = something is going wrong.
import { needsAction } from './farm.js';
import { deliverableCount } from './contracts.js';
import { nearlyFull } from './silo.js';

const last = {};
const WORN = 0.2;

function badgeEl(tab) {
  const b = document.querySelector(`#tabs .tab[data-tab="${tab}"]`);
  if (!b) return null;
  let el = b.querySelector('.tab-badge');
  if (!el) {
    el = document.createElement('span');
    el.className = 'tab-badge';
    el.hidden = true;
    b.appendChild(el);
  }
  return el;
}

function setBadge(tab, text, title, warn = false) {
  const key = `${text}|${title}|${warn}`;
  if (last[tab] === key) return;
  last[tab] = key;
  const el = badgeEl(tab);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.title = title;
  el.classList.toggle('warn', warn);
  const tabEl = el.closest('.tab');
  const label = tabEl?.querySelector('.tab-label')?.textContent ?? tab;
  tabEl?.setAttribute('aria-label', text ? `${label}: ${title}` : label);
}

export function updateBadges(game) {
  const fields = game.fieldsView().filter((f) => f.owned);
  const todo = fields.filter(needsAction);
  const trouble = todo.filter((f) => f.pest || f.withering).length;
  const ready = todo.filter((f) => f.state === 'ready').length;
  const kv = game.kabarView?.(); // 📰 open dilemma / ⚠️ unprepared Bencana Besar when no field needs action
  const alarm = kv?.disaster?.phase === 'forecast' && !kv.disaster.choice;
  const news = todo.length ? String(todo.length) : alarm ? '⚠️' : kv?.open ? '📰' : '';
  setBadge('farm', news, todo.length ? `${todo.length} ladang perlu tindakan (${ready} siap panen${trouble ? `, ${trouble} bermasalah` : ''})`
    : alarm ? `Bencana Besar: ${kv.disaster.name} — siapkan` : kv?.open ? `Kabar Desa: ${kv.open.title}` : '', trouble > 0 || alarm);

  const worn = game.machinesView().filter((m) => (m.condition ?? 1) < WORN).length;
  setBadge('garage', worn ? String(worn) : '', worn ? `${worn} mesin hampir rusak — perbaiki` : '', true);

  const deliver = deliverableCount(game);
  setBadge('market', deliver ? String(deliver) : '', deliver ? `${deliver} kontrak bisa dikirim sekarang` : '');

  const hungry = game.animalsView().filter((a) => a.count > 0 && a.feedDaysLeft != null && a.feedDaysLeft < 1);
  setBadge('animals', hungry.length ? '⚠️' : '',
    hungry.length ? `Pakan hampir habis: ${hungry.map((a) => a.name).join(', ')}` : '', true);

  const siloFull = nearlyFull(game.storageInfo('silo')), coldFull = nearlyFull(game.storageInfo('cold'));
  const blocked = (game.factoriesView?.() ?? []).filter((f) => f.owned && f.blocked).length;
  const n = blocked + (siloFull ? 1 : 0) + (coldFull ? 1 : 0);
  setBadge('silo', n ? String(n) : '',
    [siloFull ? 'Silo hampir penuh' : '', coldFull ? 'Gudang dingin hampir penuh' : '', blocked ? `${blocked} pabrik terhenti` : '']
      .filter(Boolean).join(' · '), true);

  const claimable = game.missionsView?.().claimable ?? 0;
  const points = game.researchPoints?.().available ?? 0;
  const tips = [claimable ? `${claimable} hadiah misi siap diambil` : '', points > 0 ? `${points} poin riset tersedia` : ''].filter(Boolean);
  setBadge('achievements', claimable ? String(claimable) : points > 0 ? '🔬' : '', tips.join(' · '));
}
