// Level-up modal: money reward, +research points, newly unlocked crops, machines, animals, factories, regions, fields,
// cities, research nodes, staff tiers and v20 systems (project stages, tender tiers, league division, legacy perks) (U5).
import { h, mount, fmtMoney, fmtNum } from './dom.js';
import { openModal, isModalOpen } from './modal.js';
import { sfx } from './sfx.js';
import { confetti, vibrate } from './fx.js';
import { openResearchModal } from './research.js';
import { iconOf } from './fishArt.js';

const pending = []; // level_up events waiting for a free modal slot

/** Indonesian label of a `systems` unlock id ('project:4', 'tender:raksasa', 'league:master', 'legacy:mentor'). */
function systemLabel(d, id) {
  const [kind, key] = id.split(':');
  const B = d.BALANCE || {};
  if (kind === 'project') return `🏛️ Proyek Warisan tahap ${key}`;
  if (kind === 'tender') {
    const t = (B.tenders?.tiers || []).find((x) => x.id === key);
    return t ? `${t.emoji ?? '🚢'} ${t.name}: tender lebih besar, bonus & 🔬 lebih banyak` : '🚢 Tender Ekspor';
  }
  if (kind === 'league') {
    const v = (B.league?.divisions || []).find((x) => x.id === key);
    return v ? `${v.emoji} Divisi ${v.name} di Liga Musiman` : id;
  }
  if (kind === 'legacy') {
    const p = (B.legacy?.perks || []).find((x) => x.id === key);
    return p ? `🌳 Perk warisan ${p.emoji} ${p.name}` : id;
  }
  return id;
}

/** Unlocks from the event, or derived from data when the engine doesn't send them. */
function unlocksOf(game, ev) {
  const d = game.data, B = d.BALANCE || {};
  const byLevel = (arr, key = 'unlockLevel') => (arr || []).filter((x) => x[key] === ev.level).map((x) => x.id);
  const u = ev.unlocks ?? { crops: [...byLevel(d.CROPS), ...byLevel(d.TREES)], machines: byLevel(d.MACHINES), animals: byLevel(d.ANIMALS),
    factories: byLevel(d.FACTORIES), regions: byLevel(d.REGIONS), fields: byLevel(d.FIELDS), ponds: byLevel(d.PONDS),
    mandors: byLevel(B.mandor?.tiers), cities: byLevel(d.CITIES), research: byLevel(d.RESEARCH, 'minLevel'),
    dispatchers: byLevel(B.dispatcher?.tiers), factoryManagers: byLevel(B.factoryManager?.tiers), systems: [] };
  const names = (arr, ids, label = (x) => x.name) => (ids || []).map((id) => (arr || []).find((x) => x.id === id))
    .filter(Boolean).map((x) => { const ic = iconOf(x); return ic ? [ic, ' ', label(x)] : label(x); });
  const regionName = (id) => (d.REGIONS || []).find((r) => r.id === id)?.name ?? id;
  const staff = (t) => `${t.emoji} ${t.title} (${t.name}) ${'★'.repeat(t.skill || 1)}`;
  const tierOf = (n) => (n.minLevel >= 80 ? 'T7' : n.minLevel >= 55 ? 'T6' : 'T5');
  return [
    ['✨ Fitur baru', (u.systems || []).map((id) => systemLabel(d, id))],
    ['🌱 Tanaman', names([...(d.CROPS || []), ...(d.TREES || [])], u.crops)],
    ['🚜 Mesin', names(d.MACHINES, u.machines)],
    ['🐄 Ternak', names(d.ANIMALS, u.animals)],
    ['🐟 Kolam ikan', names(d.PONDS, u.ponds, (p) => `${p.name}${p.climate ? ` (butuh ladang ${p.climate === 'tropical' ? 'tropis' : 'dingin'})` : ''}`)],
    ['🏭 Pabrik', names(d.FACTORIES, u.factories)],
    ['👷 Mandor Ladang', names(B.mandor?.tiers, u.mandors, (t) => `${t.title} (${t.name}) · ${t.fields == null ? 'semua' : `≤ ${t.fields}`} ladang berencana`)],
    ['🧑‍💼 Staf', [...(u.dispatchers || []).map((id) => (B.dispatcher?.tiers || []).find((t) => t.id === id)),
      ...(u.factoryManagers || []).map((id) => (B.factoryManager?.tiers || []).find((t) => t.id === id))].filter(Boolean).map(staff)],
    ['🔬 Riset', names(d.RESEARCH, u.research, (n) => `${n.name} · ${tierOf(n)}`)],
    ['🌍 Wilayah', names(d.REGIONS, u.regions)],
    ['🗺️ Ladang', names(d.FIELDS, u.fields, (f) => `${f.name} · ${regionName(f.regionId)} · ${fmtNum(f.sizeHa)} ha`)],
    ['🏙️ Kota', names(d.CITIES, u.cities)],
  ].filter(([, list]) => list.length);
}

/** Element with its stagger index (CSS: animation-delay = --i × step). */
const staggered = (el, i) => { el.style.setProperty('--i', String(i)); return el; };

function show(game, ev) {
  const groups = unlocksOf(game, ev);
  let k = 0; // running card index across groups: cards reveal one by one
  const reward = ev.reward > 0 ? staggered(h('p.levelup-reward.lu-pop', `💰 Hadiah naik level: ${fmtMoney(ev.reward)}`), k++) : null;
  const pts = ev.researchPoints ?? 1;
  const research = pts > 0 && game.researchView
    ? staggered(h('p.levelup-research.lu-pop', `🔬 +${pts} poin riset — buka pohon keahlian untuk memakainya.`), k++) : null;
  const top = ev.level >= game.data.LEVELS.length;
  const maxed = top ? staggered(h('div.lu-max.lu-pop', h('span.lu-max-crown', '👑'),
    h('div', h('b', `Level maksimal ${ev.level}!`), h('div.small', 'Kamu Legenda Seratus: semua konten terbuka. XP tetap terkumpul.'))), k++) : null;
  const body = groups.length
    ? [h('p', 'Konten baru terbuka:'),
      ...groups.map(([label, list]) => h('div.unlock-group',
        h('div.small.muted', label),
        h('ul.unlock-list.lu-cards', list.map((n) => staggered(h('li.lu-card', n), k++)))))]
    : h('p', 'Tidak ada konten baru di level ini, tapi teruslah berkembang!');
  // The game pauses while the modal is open; the previous speed comes back on close (unless the player changed it).
  // state.modalPause keeps the pre-modal speed so a save taken meanwhile never persists the pause (persist.js).
  const prevSpeed = game.state.speed;
  if (prevSpeed > 0) { game.state.modalPause = prevSpeed; game.setSpeed(0); }
  openModal({
    title: top ? `👑 Level maksimal ${ev.level}!` : `⭐ Naik ke level ${ev.level}!`,
    render: (b) => mount(b, h('p.small.muted.lu-paused', '⏸ Permainan dijeda'), reward, research, maxed, body),
    onClose: () => {
      delete game.state.modalPause;
      if (prevSpeed > 0 && game.state.speed === 0) game.setSpeed(prevSpeed);
    },
    actions: (m) => [
      research ? h('button.btn.btn-secondary', { onclick: () => { m.close(); openResearchModal(); } }, '🔬 Riset') : null,
      h('button.btn.btn-primary', { onclick: () => m.close() }, 'Mantap!')],
  });
  // Celebrate when the modal actually appears (it may wait behind another modal).
  document.querySelector('.modal')?.classList.add('modal-levelup', ...(top ? ['modal-levelmax'] : []));
  sfx('levelup');
  vibrate([20, 40, 20]);
  confetti(window.innerWidth / 2, window.innerHeight * 0.35, 72);
  // Second burst when the last card has landed (stagger 140 ms per card).
  if (k > 2) setTimeout(() => { if (document.querySelector('.modal-levelup')) confetti(window.innerWidth / 2, window.innerHeight * 0.55, 40); }, 140 * k + 350);
  if (top) setTimeout(() => { if (document.querySelector('.modal-levelmax')) confetti(window.innerWidth / 2, window.innerHeight * 0.25, 90); }, 900);
}

export function queueLevelUp(ev) { pending.push(ev); }

/** Called from the main loop: shows a queued level-up once no other modal is open. */
export function flushLevelUps(game) {
  if (!pending.length || isModalOpen()) return;
  show(game, pending.shift());
}
