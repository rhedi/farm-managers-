// Level-up modal: money reward, +research points, newly unlocked crops, machines, animals, factories, regions and fields (U5).
import { h, mount, fmtMoney, fmtNum } from './dom.js';
import { openModal, isModalOpen } from './modal.js';
import { sfx } from './sfx.js';
import { confetti, vibrate } from './fx.js';
import { openResearchModal } from './research.js';
import { iconOf } from './fishArt.js';

const pending = []; // level_up events waiting for a free modal slot

/** Unlocks from the event, or derived from data when the engine doesn't send them. */
function unlocksOf(game, ev) {
  const d = game.data;
  const byLevel = (arr) => (arr || []).filter((x) => x.unlockLevel === ev.level).map((x) => x.id);
  const u = ev.unlocks ?? { crops: byLevel(d.CROPS), machines: byLevel(d.MACHINES), animals: byLevel(d.ANIMALS),
    factories: byLevel(d.FACTORIES), regions: byLevel(d.REGIONS), fields: byLevel(d.FIELDS), ponds: byLevel(d.PONDS) };
  const names = (arr, ids, label = (x) => x.name) => (ids || []).map((id) => (arr || []).find((x) => x.id === id))
    .filter(Boolean).map((x) => { const ic = iconOf(x); return ic ? [ic, ' ', label(x)] : label(x); });
  const regionName = (id) => (d.REGIONS || []).find((r) => r.id === id)?.name ?? id;
  return [
    ['🌱 Tanaman', names(d.CROPS, u.crops)],
    ['🚜 Mesin', names(d.MACHINES, u.machines)],
    ['🐄 Ternak', names(d.ANIMALS, u.animals)],
    ['🐟 Kolam ikan', names(d.PONDS, u.ponds, (p) => `${p.name}${p.climate ? ` (butuh ladang ${p.climate === 'tropical' ? 'tropis' : 'dingin'})` : ''}`)],
    ['🏭 Pabrik', names(d.FACTORIES, u.factories)],
    ['🌍 Wilayah', names(d.REGIONS, u.regions)],
    ['🗺️ Ladang', names(d.FIELDS, u.fields, (f) => `${f.name} · ${regionName(f.regionId)} · ${fmtNum(f.sizeHa)} ha`)],
  ].filter(([, list]) => list.length);
}

function show(game, ev) {
  const groups = unlocksOf(game, ev);
  const reward = ev.reward > 0 ? h('p.levelup-reward', `💰 Hadiah naik level: ${fmtMoney(ev.reward)}`) : null;
  const pts = ev.researchPoints ?? 1;
  const research = pts > 0 && game.researchView
    ? h('p.levelup-research', `🔬 +${pts} poin riset — buka pohon keahlian untuk memakainya.`) : null;
  const maxed = ev.level >= game.data.LEVELS.length ? h('p.small.muted', '🏆 Level maksimal tercapai!') : null;
  openModal({
    title: `⭐ Naik ke level ${ev.level}!`,
    render: (body) => mount(body, reward, research, maxed,
      groups.length
        ? [h('p', 'Konten baru terbuka:'),
          ...groups.map(([label, list]) => h('div.unlock-group',
            h('div.small.muted', label),
            h('ul.unlock-list', list.map((n) => h('li', n)))))]
        : h('p', 'Tidak ada konten baru di level ini, tapi teruslah berkembang!')),
    actions: (m) => [
      research ? h('button.btn.btn-secondary', { onclick: () => { m.close(); openResearchModal(); } }, '🔬 Riset') : null,
      h('button.btn.btn-primary', { onclick: () => m.close() }, 'Mantap!')],
  });
  // Celebrate when the modal actually appears (it may wait behind another modal).
  document.querySelector('.modal')?.classList.add('modal-levelup');
  sfx('levelup');
  vibrate([20, 40, 20]);
  confetti(window.innerWidth / 2, window.innerHeight * 0.35, 72);
}

export function queueLevelUp(ev) { pending.push(ev); }

/** Called from the main loop: shows a queued level-up once no other modal is open. */
export function flushLevelUps(game) {
  if (!pending.length || isModalOpen()) return;
  show(game, pending.shift());
}
