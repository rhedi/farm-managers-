// Tab badges: "what should I do now" signals on the bottom nav.
const last = {};

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
  const key = `${text}|${title}`;
  if (last[tab] === key) return;
  last[tab] = key;
  const el = badgeEl(tab);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.title = title;
  el.classList.toggle('warn', warn);
}

export function updateBadges(game) {
  const fields = game.fieldsView().filter((f) => f.owned);
  const ready = fields.filter((f) => f.state === 'ready').length;
  const idle = fields.filter((f) => f.state === 'idle').length;
  setBadge('farm', ready + idle ? String(ready + idle) : '',
    `${ready} siap panen · ${idle} kosong`, ready > 0);

  const hungry = game.animalsView().filter((a) => a.count > 0 && a.feedDaysLeft != null && a.feedDaysLeft < 1);
  setBadge('animals', hungry.length ? '⚠️' : '',
    hungry.length ? `Pakan hampir habis: ${hungry.map((a) => a.name).join(', ')}` : '', true);

  const active = (game.contractsView?.() ?? []).filter((c) => c.status === 'active').length;
  setBadge('market', active ? String(active) : '', active ? `${active} kontrak aktif` : '');

  const claimable = game.missionsView?.().claimable ?? 0;
  const points = game.researchPoints?.().available ?? 0;
  const tips = [claimable ? `${claimable} hadiah misi siap diambil` : '', points > 0 ? `${points} poin riset tersedia` : ''].filter(Boolean);
  setBadge('achievements', claimable ? String(claimable) : points > 0 ? '🔬' : '', tips.join(' · '));
}
