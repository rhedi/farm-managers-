// 🏛️ Proyek Warisan pane (Ladang › 🏛️ Proyek): building slots, continent chips, Monumen card, region cards with
// 3-stage projects (pips, current/next effect, cost/days/level, crane + progress while building, Bangun button).
import { h, fmtMoney, fmtCompact, progressBar } from './dom.js';
import { app, act } from './app.js';
import { confirmModal } from './modal.js';
import { chipBar, getSub } from './subtabs.js';

const pv = (game) => { try { return game.projectsView?.() ?? null; } catch { return null; } };

/** Re-render key: stages, builds, affordability, level. */
export function projectsSig(game) {
  const v = pv(game);
  if (!v) return '';
  return `${v.level}|${v.building}|` + v.regions.map((r) => `${r.owned ? 1 : 0}${r.projects.map((p) => `${p.stage}${p.build ? 'b' : ''}${p.reason ? p.reason.length : 0}`).join('')}`).join(',')
    + v.monuments.map((m) => `${m.done}${m.build ? 'b' : ''}${m.reason.length}`).join('');
}

const pips = (stage, building) => h('span.proj-pips', { 'aria-label': `Tahap ${stage} dari 3` },
  [1, 2, 3].map((k) => h(`i.pip${k <= stage ? '.on' : ''}${building && k === stage + 1 ? '.build' : ''}`)));

async function build(game, region, p) {
  const ok = await confirmModal({ title: `${p.emoji} ${p.name} · tahap ${p.next.stage}`,
    message: `Bangun di ${region.name} seharga ${fmtMoney(p.next.cost)} selama ${p.next.days} hari game? Efek: ${p.effectNext}.`,
    confirmLabel: `🏗️ Bangun (${fmtMoney(p.next.cost)})` });
  if (ok) act(game.startProject(region.id, p.typeId), (r) => `🏗️ ${p.name} tahap ${r.stage} mulai dibangun.`);
}

function buildRow(b, key) {
  return h('div.proj-build', { dataset: { pkey: key } }, h('span.proj-crane', '🏗️'), h('div.proj-build-main', progressBar(b.progress, 'thin.gold'),
    h('span.small.muted', `Tahap ${b.stage} · selesai ${b.daysLeft <= 1 ? 'besok pagi' : `${b.daysLeft} hari lagi`}`)));
}

function projectRow(game, region, p) {
  const canBuild = !p.reason && region.owned;
  return h(`div.proj-row${p.build ? '.is-building' : ''}${p.done ? '.is-done' : ''}`,
    h('span.proj-ico', { dataset: { stage: String(p.stage) } }, p.emoji),
    h('div.proj-main',
      h('div.proj-name', h('b', p.name), pips(p.stage, !!p.build)),
      p.effectNow ? h('div.small.proj-eff', `✅ ${p.effectNow}`) : null,
      p.build ? buildRow(p.build, `${region.id}:${p.typeId}`) : null,
      !p.build && p.next ? h('div.small.muted', `Tahap ${p.next.stage}: ${p.effectNext} · ${fmtMoney(p.next.cost)} · ${p.next.days} hari · Lv ${p.next.level}`) : null,
      !p.build && p.next && p.reason ? h('div.small.proj-why', p.reason) : null),
    p.done ? h('span.proj-done', '✨') : !p.build && p.next ? h(`button.btn.btn-small${canBuild ? '.btn-primary' : '.btn-secondary'}.proj-btn`, {
      type: 'button', disabled: !canBuild, onclick: () => build(game, region, p),
    }, '🏗️ Bangun') : null);
}

function regionCard(game, r) {
  return h(`section.card.proj-region${r.owned ? '' : '.not-owned'}`, { dataset: { region: r.id } },
    h('div.card-head', h('div.card-main', h('div.card-title', r.name),
      h('div.card-sub', r.owned ? `Lv ${r.unlockLevel}+ · ${r.projects.filter((p) => p.stage).length} proyek berjalan` : '🔒 Beli 1 ladang di sini untuk membangun'))),
    r.projects.map((p) => projectRow(game, r, p)));
}

function monumentCard(game, m) {
  return h(`section.card.proj-monument${m.done ? '.is-done' : ''}`,
    h('div.card-head', h('div.card-icon.proj-mon-ico', m.emoji), h('div.card-main', h('div.card-title', m.name),
      h('div.card-sub', m.done ? `Berdiri megah · +${m.rp} poin riset` : `${m.regionsDone}/${m.regionsTotal} wilayah punya proyek tahap 3 · ${fmtMoney(m.cost)} · ${m.days} hari · Lv ${m.level}`))),
    m.build ? buildRow(m.build, `mon:${m.continentId}`) : null,
    !m.done && !m.build ? h('div.proj-mon-act', m.reason ? h('div.small.proj-why', m.reason) : null,
      h(`button.btn.btn-small${m.reason ? '.btn-secondary' : '.btn-primary'}.proj-btn`, { type: 'button', disabled: !!m.reason,
        onclick: async () => {
          const ok = await confirmModal({ title: `${m.emoji} ${m.name}`, message: `Bangun Monumen seharga ${fmtMoney(m.cost)} selama ${m.days} hari game?`, confirmLabel: '🏗️ Bangun' });
          if (ok) act(game.startMonument(m.continentId), `🏗️ ${m.name} mulai dibangun.`);
        } }, '🏗️ Bangun Monumen')) : null);
}

/** Ladang › 🏛️ Proyek. */
export function projectsPane(game) {
  const v = pv(game);
  const conts = game.data.CONTINENTS || [];
  if (!v) return h('div.pane.pane-projects', h('div.empty', 'Proyek Warisan tidak tersedia.'));
  const cur = conts.length ? getSub('farm-proj', conts.map((c) => c.id)) : null;
  const regions = v.regions.filter((r) => !cur || r.continent === cur).sort((a, b) => (b.owned - a.owned) || a.unlockLevel - b.unlockLevel);
  const head = h('section.section.proj-head',
    h('div.section-title', '🏛️ Proyek Warisan', h('span.small.muted', `🏗️ ${v.building}/${v.maxBuilding} · $${fmtCompact(v.spent)}`)),
    h('p.small.muted', 'Bangun bendungan, pelabuhan, pusat riset, koperasi dan pasar induk di wilayahmu. Tiap proyek 3 tahap; efeknya kecil tapi beragam, dan semuanya tampil di peta.'));
  if (!v.unlocked) return h('div.pane.pane-projects', head, h('div.empty', `🔒 Proyek Warisan terbuka di level ${v.unlockLevel}.`));
  return h('div.pane.pane-projects', head,
    conts.length ? chipBar('farm-proj', conts.map((c) => ({ id: c.id, label: `${c.emoji} ${c.short ?? c.name}`,
      count: v.regions.filter((r) => r.continent === c.id).reduce((a, r) => a + r.projects.reduce((s, p) => s + p.stage, 0), 0) || null })), cur) : null,
    v.monuments.filter((m) => !cur || m.continentId === cur).map((m) => monumentCard(game, m)),
    h('div.cards', regions.map((r) => regionCard(game, r))));
}

/** Live progress bars (update loop): only the widths. */
export function updateProjectsPane(root, game) {
  const rows = root?.querySelectorAll?.('.proj-build[data-pkey]');
  if (!rows?.length) return;
  const v = pv(game), prog = new Map();
  for (const r of v?.regions ?? []) for (const p of r.projects) if (p.build) prog.set(`${r.id}:${p.typeId}`, p.build.progress);
  for (const m of v?.monuments ?? []) if (m.build) prog.set(`mon:${m.continentId}`, m.build.progress);
  for (const row of rows) {
    const f = prog.get(row.dataset.pkey), bar = row.querySelector('.bar');
    if (f != null && bar) bar.style.width = `${Math.round(f * 100)}%`;
  }
}
