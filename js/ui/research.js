// 🔬 Riset (feature 7): research tree as branch cards with node status, points counter, unlock and respec.
// Shown in Prestasi › Riset and as a modal from the top-bar level badge.
import { h, mount, fmtMoney, fmtNum } from './dom.js';
import { openModal, confirmModal } from './modal.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';

const STATUS = {
  unlocked: ['✅', 'Sudah diteliti'],
  ready: ['🔓', 'Bisa diteliti'],
  open: ['⏳', 'Poin kurang'],
  locked: ['🔒', 'Terkunci'],
};

function nodeRow(n) {
  const [icon, label] = STATUS[n.status];
  const lvl = n.levelOk === false ? `Terbuka di Lv ${n.minLevel}` : null; // tier-5 nodes (minLevel)
  const reqs = n.requires.length ? `Butuh: ${n.requires.map((r) => `${r.unlocked ? '✓' : '✗'} ${r.name}`).join(', ')}` : null;
  const req = [lvl, reqs].filter(Boolean).join(' · ') || null;
  const ready = n.status === 'ready';
  return h(`div.rs-node.rs-${n.status}`,
    h('div.rs-node-head',
      h('span.rs-node-emoji', n.emoji),
      h('span.rs-node-main', h('span.rs-node-name', n.name, n.minLevel > 1 ? h('span.rs-lv', `Lv ${n.minLevel}`) : null),
        h('span.small.rs-effect', n.desc)),
      ready
        ? h('button.btn.btn-small.btn-primary.rs-unlock', {
          onclick: () => act(app.game.unlockResearch(n.id), `🔬 ${n.name} diteliti.`),
        }, `Teliti · ${n.cost}`)
        : [h('span.badge.rs-cost', `${n.cost} poin`), h('span.rs-node-status', { title: label, 'aria-label': label }, icon)]),
    req && !n.unlocked && !ready ? h('div.small.muted', `${label} · ${req}`) : null);
}

/** One branch as a fold; open by default while it has something to research. */
function branchCard(b) {
  const ready = b.nodes.filter((n) => n.status === 'ready').length;
  return fold(`rs-${b.id}`, `${b.emoji} ${b.name}`, { open: ready > 0, meta: `${ready ? `🔓 ${ready} · ` : ''}${b.done}/${b.nodes.length}`, cls: 'rs-branch' },
    h('div.rs-nodes', b.nodes.map(nodeRow)));
}

async function respecFlow(v) {
  const ok = await confirmModal({
    title: 'Reset riset?',
    message: `Semua riset dibatalkan dan ${fmtNum(v.points.spent)} poin kembali. Biaya ${fmtMoney(v.respecCost)}.`,
    confirmLabel: 'Reset', danger: true,
  });
  if (ok) act(app.game.respecResearch(), (r) => `🔬 Riset direset, ${r.refunded} poin kembali.`);
}

/** Body of the research section (also used inside the modal). */
export function researchBody(game) {
  const v = game.researchView();
  const perks = Object.keys(v.perks);
  return [
    h('div.card.rs-summary',
      h('div.rs-points', h('span.rs-points-num', fmtNum(v.points.available)), h('span', ' poin riset tersedia')),
      h('div.small.muted', `+1 poin setiap naik level · terpakai ${fmtNum(v.points.spent)} dari ${fmtNum(v.points.earned)}`),
      perks.length ? h('div.small.rs-active', `Aktif: ${v.branches.flatMap((b) => b.nodes).filter((n) => n.unlocked).map((n) => n.desc).join(' · ')}`) : null),
    h('div.rs-branches', v.branches.map(branchCard)),
    v.points.spent > 0
      ? h('div.card-actions.rs-respec', h('span.small.muted', 'Atur ulang semua riset dan dapatkan poinnya kembali.'), h('span.spacer'),
        h('button.btn.btn-small.btn-danger', { disabled: !v.canRespec, title: v.canRespec ? null : 'Uang tidak cukup',
          onclick: () => respecFlow(v) }, `Reset riset ${fmtMoney(v.respecCost)}`))
      : null,
  ];
}

export function researchSection(game) {
  if (!game.researchView) return null;
  const avail = game.researchView().points.available;
  return h('section.section.rs-section', { id: 'research' },
    h('div.section-title', '🔬 Riset', h('span.spacer'),
      avail > 0 ? h('span.badge.badge-gold', `${avail} poin`) : h('span.small.muted', 'Pohon keahlian')),
    researchBody(game));
}

/** Signature for re-rendering (points, unlocked nodes, money for respec). */
export function researchSig(game) {
  if (!game.researchView) return '';
  const v = game.researchView();
  return `${v.points.available}:${v.points.spent}:${v.canRespec ? 1 : 0}`;
}

export function openResearchModal() {
  openModal({
    title: '🔬 Riset & Keahlian',
    render: (body) => mount(body, researchBody(app.game)),
    actions: (m) => [h('button.btn.btn-primary', { onclick: () => m.close() }, 'Tutup')],
  });
}
