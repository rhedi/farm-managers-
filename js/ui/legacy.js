// 🌳 Warisan (Prestasi sub-tab): the family tree (grows a leaf per perk), ⭐ Bintang Warisan, the run's challenge,
// "Wariskan pertanian" (2-step sheet: preview + optional perks/challenge/region, then a final armed confirm), the perk
// tree, the farm emblem and the 🏛️ Museum of past generations. Engine: game.legacyView() / inheritFarm() / buyLegacyPerk().
import { h, mount, fmtMoney, fmtNum, progressBar } from './dom.js';
import { app, act } from './app.js';
import { openModal, confirmModal, toast } from './modal.js';
import { confetti, vibrate } from './fx.js';
import { sfx } from './sfx.js';
import { fold } from './subtabs.js';
import { backupSave } from './shell.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const WHEN = { start: 'di awal tiap generasi', next: 'mulai generasi berikutnya', live: 'langsung berlaku' };
const ROMAN = (n) => { let s = '', v = n; for (const [k, r] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (v >= k) { s += r; v -= k; } return n > 39 ? String(n) : s; };

export function legacySig(game) {
  const v = game.legacyView();
  return `${v.stars}|${v.owned}|${v.generation}|${v.canInherit}|${v.preview.total}|${v.emblem.icon}${v.emblem.color}|${v.challenge?.done}${v.challenge?.forfeited}|${v.museum.length}`;
}

/** Farm emblem: icon on a coloured shield, framed by the best league division reached. */
export function emblemEl(e, cls = '') {
  return h(`span.emblem.emb-${e.color}.frame-${e.frame ?? 0}${cls ? `.${cls}` : ''}`, { 'aria-hidden': 'true' }, h('span.emblem-ico', e.icon));
}

/** The family tree: trunk + branches draw themselves, one leaf per perk (plus a few), a fruit per past generation. */
function treeSvg(v) {
  const leaves = Math.min(28, 6 + v.owned * 2), fruits = Math.min(8, v.museum.length);
  const pts = [];
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + (i % 3) * 0.4, r = 18 + ((i * 37) % 22);
    pts.push([100 + Math.cos(a) * r * 1.5, 62 + Math.sin(a) * r * 0.9]);
  }
  const NS = 'http://www.w3.org/2000/svg', el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, val);
    return n;
  };
  const svg = el('svg', { viewBox: '0 0 200 150', class: 'lg-tree', role: 'img', 'aria-label': `Pohon keluarga, generasi ${v.generation}` });
  svg.appendChild(el('ellipse', { cx: 100, cy: 140, rx: 70, ry: 7, class: 'tr-ground' }));
  for (const d of ['M100 140 C98 115 102 100 100 80', 'M100 104 C88 92 76 86 64 74', 'M100 96 C112 86 124 80 138 70', 'M100 86 C96 72 92 60 84 50', 'M100 84 C106 70 112 58 120 48'])
    svg.appendChild(el('path', { d, class: 'tr-branch' }));
  pts.forEach(([x, y], i) => svg.appendChild(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 9 + (i % 3) * 2, class: 'tr-leaf', style: `--i:${i}` })));
  for (let i = 0; i < fruits; i++) {
    const [x, y] = pts[(i * 5 + 2) % pts.length];
    svg.appendChild(el('circle', { cx: x.toFixed(1), cy: (y + 4).toFixed(1), r: 3.6, class: 'tr-fruit', style: `--i:${i}` }));
  }
  return svg;
}

/** ⭐ flying from `from` (element) to `to` (element), `n` of them, staggered. */
export function flyStars(from, to, n = 8) {
  if (reduced() || !from || !to) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const s = h('span.fx-star', '⭐');
    const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.6, y0 = a.top + a.height / 2;
    Object.assign(s.style, { left: `${x0}px`, top: `${y0}px`, animationDelay: `${i * 70}ms` });
    s.style.setProperty('--dx', `${b.left + b.width / 2 - x0}px`);
    s.style.setProperty('--dy', `${b.top + b.height / 2 - y0}px`);
    s.style.setProperty('--arc', `${-40 - Math.random() * 60}px`);
    s.addEventListener('animationend', () => s.remove());
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2200);
  }
}

function heroCard(v) {
  return h('div.card.lgc-hero',
    h('div.lgc-tree-wrap', treeSvg(v), h('div.lgc-emblem', emblemEl(v.emblem, 'big'))),
    h('div.lgc-hero-row',
      h('div', h('div.lgc-gen', `Generasi ${ROMAN(v.generation)}`), h('div.small.muted', `${v.owned}/${v.total} perk · ${v.museum.length} generasi di museum`)),
      h('div.lgc-stars', { id: 'legacy-stars' }, h('span.lgc-stars-n', fmtNum(v.stars)), h('span.small', '⭐ Bintang'))));
}

function challengeCard(game, v) {
  const c = v.challenge;
  if (!c) return null;
  const state = c.forfeited ? 'Dilepas' : c.done ? '✅ Selesai' : `Aktif · capai Lv ${v.unlockLevel}`;
  return h(`div.card.lgc-challenge${c.done ? '.done' : ''}${c.forfeited ? '.off' : ''}`,
    h('div.card-head', h('div.card-icon', c.emoji),
      h('div.card-main', h('div.card-title', `Tantangan: ${c.name}`), h('div.card-sub', c.desc)),
      h(`span.badge${c.done ? '.badge-gold' : ''}`, `×${fmtNum(c.mult, 2)} ⭐`)),
    h('div.small.muted', state),
    c.active && !c.done ? h('button.btn.btn-secondary.btn-small', { type: 'button', onclick: async () => {
      const ok = await confirmModal({ title: 'Lepas tantangan?', message: `Aturan "${c.name}" tidak berlaku lagi dan bonus ×${fmtNum(c.mult, 2)} bintang hilang untuk generasi ini.`, confirmLabel: 'Lepas tantangan', danger: true });
      if (ok) act(game.forfeitChallenge(), '🌳 Tantangan dilepas.');
    } }, '🏳️ Lepas tantangan') : null);
}

function previewRows(pv) {
  return h('div.lgc-preview',
    pv.parts.map((p, i) => h('div.lgc-prow', { style: { '--i': i } }, h('span', `${p.emoji} ${p.label}`), h('span.small.muted', p.detail), h('b.num', `+${fmtNum(p.value, 1)}`))),
    pv.challenge ? h('div.lgc-prow', h('span', `${pv.challenge.emoji} Tantangan`), h('span.small.muted', pv.challenge.done ? 'selesai' : 'belum selesai'), h('b.num', `×${fmtNum(pv.mult, 2)}`)) : null,
    h('div.lgc-prow.total', h('span', 'Bintang didapat'), h('span'), h('b.num', `⭐ ${fmtNum(pv.total)}`)));
}

function inheritCard(game, v) {
  const pv = v.preview;
  if (!pv.canInherit) {
    return h('div.card.lgc-inherit.locked',
      h('div.card-title', '🌳 Wariskan pertanian'),
      h('p.small.muted', `Terbuka di Lv ${v.unlockLevel}. Pertanian diwariskan ke generasi berikutnya: mulai lagi dari Lv 1 dengan ⭐ Bintang Warisan untuk perk permanen. Tidak wajib.`),
      progressBar(Math.min(1, v.level / v.unlockLevel), 'gold'), h('div.small.muted', `Lv ${v.level} / ${v.unlockLevel}`));
  }
  return h('div.card.lgc-inherit',
    h('div.card-title', '🌳 Wariskan pertanian'),
    h('p.small.muted', 'Opsional. Generasi ini masuk Museum, lalu pertanian baru dimulai dari Lv 1 dengan bintang dan perkmu.'),
    previewRows(pv),
    h('button.btn.btn-primary.btn-block.lgc-go', { type: 'button', onclick: () => inheritSheet(game) }, `🌳 Wariskan · +${fmtNum(pv.total)} ⭐`));
}

function perkNode(game, p) {
  const buy = async (e) => {
    const btn = e.currentTarget;
    const ok = await confirmModal({ title: `${p.emoji} ${p.name}`, message: `${p.desc} (${WHEN[p.when]}). Bayar ${p.cost} ⭐?`, confirmLabel: `Beli · ${p.cost} ⭐` });
    if (!ok) return;
    const star = document.getElementById('legacy-stars');
    const r = act(game.buyLegacyPerk(p.id), `🌳 ${p.name} dimiliki!`);
    if (r?.ok) { sfx('achievement'); vibrate(25); flyStars(star, btn.isConnected ? btn : document.querySelector(`[data-perk="${p.id}"]`), Math.min(8, p.cost + 2)); }
  };
  return h(`button.lgc-node.st-${p.status}`, { type: 'button', dataset: { perk: p.id }, disabled: p.status !== 'ready', onclick: buy,
    'aria-label': `${p.name}: ${p.desc}. ${p.owned ? 'Dimiliki' : p.reason ?? `${p.cost} bintang`}` },
  h('span.lgc-node-ico', p.emoji),
  h('span.lgc-node-main', h('span.lgc-node-name', p.name), h('span.lgc-node-desc', p.desc), h('span.lgc-node-when', WHEN[p.when])),
  h('span.lgc-node-cost', p.owned ? '✓' : `${p.cost}⭐`));
}

function perkTree(game, v) {
  return h('div.lgc-branches', v.branches.map((b) => h('div.lgc-branch',
    h('div.lgc-branch-title', `${b.emoji} ${b.name}`),
    h('div.lgc-vine', v.perks.filter((p) => p.branch === b.id).map((p) => perkNode(game, p))))));
}

function emblemPicker(game, v) {
  if (!v.emblemPerk) return h('p.small.muted', '🛡️ Beli perk Lambang Keluarga untuk memilih lambang dan warnanya.');
  return h('div.lgc-emblem-pick', { 'data-no-swipe': '' },
    h('div.lgc-chips', v.emblems.icons.map((i) => h(`button.chip.lgc-ico${i === v.emblem.icon ? '.active' : ''}`, { type: 'button', 'aria-pressed': String(i === v.emblem.icon), onclick: () => act(game.setEmblem({ icon: i })) }, i))),
    h('div.lgc-chips', v.emblems.colors.map((c) => h(`button.chip.lgc-col.emb-${c}${c === v.emblem.color ? '.active' : ''}`, { type: 'button', 'aria-label': `Warna ${c}`, 'aria-pressed': String(c === v.emblem.color), onclick: () => act(game.setEmblem({ color: c })) }, h('span.lgc-swatch'), c))));
}

function museum(v) {
  if (!v.museum.length) return h('div.empty.compact', '🏛️ Belum ada generasi yang diwariskan.');
  return h('div.lgc-museum', v.museum.map((m, i) => h('div.lgc-exhibit', { style: { '--i': i } },
    emblemEl(m.emblem && { ...m.emblem, frame: m.frame }),
    h('div.lgc-exhibit-main', h('div.card-title', m.name),
      h('div.small.muted', `${fmtNum(m.days)} hari · Lv ${m.level} · ${fmtMoney(m.netWorth)}`),
      h('div.small.muted', `${m.achievements} prestasi · ${m.stages} tahap proyek${m.cups ? ` · ${m.cups} piala` : ''}${m.challengeName ? ` · ${m.challengeName}` : ''}`)),
    h('span.badge.badge-gold', `+${m.stars}⭐`))));
}

export function legacyPane(game) {
  const v = game.legacyView();
  return [
    h('section.section', heroCard(v)),
    challengeCard(game, v),
    h('section.section', inheritCard(game, v)),
    h('section.section', h('div.section-title', '🌿 Pohon perk', h('span.small.muted', `${v.owned}/${v.total} · ${fmtNum(v.earned)} ⭐ total`)), perkTree(game, v)),
    fold('legacy-emblem', '🛡️ Lambang pertanian', { meta: v.emblem.icon }, emblemPicker(game, v)),
    fold('legacy-museum', '🏛️ Museum generasi', { open: true, meta: String(v.museum.length) }, museum(v)),
  ];
}

// ---------- 2-step inheritance sheet ----------

function inheritSheet(game) {
  const v0 = game.legacyView(), pv = v0.preview;
  const st = { step: 1, buy: [], challengeId: null, regionId: v0.region, armed: false };
  let timer = null;
  const owned = (id) => v0.perks.find((p) => p.id === id)?.owned || st.buy.includes(id);
  const budget = () => v0.stars + pv.total - st.buy.reduce((a, id) => a + v0.perks.find((p) => p.id === id).cost, 0);
  const canRegion = () => owned('tanah');
  const regionOk = (r) => !(st.challengeId === 'tropis' && !r.tropical);

  const toggle = (p, m) => {
    if (st.buy.includes(p.id)) {
      const drop = new Set([p.id]); // dropping a perk also drops what needs it
      let grew = true;
      while (grew) { grew = false; for (const id of st.buy) if (!drop.has(id) && v0.perks.find((x) => x.id === id).requires.some((q) => drop.has(q))) { drop.add(id); grew = true; } }
      st.buy = st.buy.filter((id) => !drop.has(id));
    } else st.buy.push(p.id);
    if (!canRegion()) st.regionId = v0.region;
    m.rerender();
  };
  const cart = (m) => h('div.lgc-cart', v0.perks.filter((p) => !p.owned).map((p) => {
    const inCart = st.buy.includes(p.id), prereq = p.requires.every(owned);
    const can = inCart || (prereq && budget() >= p.cost);
    return h(`button.chip.lgc-cart-chip${inCart ? '.active' : ''}`, { type: 'button', disabled: !can, 'aria-pressed': String(inCart), onclick: () => toggle(p, m) },
      `${p.emoji} ${p.name} · ${p.cost}⭐`);
  }));
  const pick = (items, cur, set, m) => h('div.lgc-chips', items.map((it) => h(`button.chip${cur === it.id ? '.active' : ''}`,
    { type: 'button', disabled: it.disabled, 'aria-pressed': String(cur === it.id), onclick: () => { set(it.id); m.rerender(); } }, it.label)));

  const step1 = (body, m) => mount(body,
    h('div.lgc-warn', h('b', '⚠️ Generasi ini akan berakhir.'), ' Uang, ladang, mesin, ternak, pabrik, proyek, riset, liga, dan level kembali ke awal (Lv 1, hari 1). ',
      h('b', 'Tetap: '), '⭐ bintang, perk, lambang, rak piala, dan Museum. Simpanan lama dicadangkan dulu.'),
    previewRows(pv),
    h('div.lgc-budget', `⭐ ${fmtNum(budget())} tersedia untuk perk`),
    h('div.modal-section', h('div.section-title', '🌿 Beli perk sekarang (opsional)'), cart(m)),
    h('div.modal-section', h('div.section-title', '🎯 Tantangan generasi baru (opsional)'),
      pick([{ id: null, label: 'Tanpa tantangan' }, ...v0.challenges.map((c) => ({ id: c.id, label: `${c.emoji} ${c.name} ×${fmtNum(c.mult, 2)}` }))],
        st.challengeId, (id) => { st.challengeId = id; if (id === 'tropis' && st.regionId && !v0.regions.find((r) => r.id === st.regionId)?.tropical) st.regionId = null; }, m),
      h('p.small.muted', st.challengeId ? v0.challenges.find((c) => c.id === st.challengeId).desc : 'Tantangan menambah bintang bila Lv 30 tercapai dengan aturannya.')),
    canRegion() ? h('div.modal-section', h('div.section-title', '🗺️ Wilayah awal'),
      pick([{ id: null, label: 'Jawa Barat (bawaan)' }, ...v0.regions.filter((r) => r.id !== 'jabar').map((r) => ({ id: r.id, label: `${r.name} · ${r.fieldName} ${r.sizeHa} ha`, disabled: !regionOk(r) }))],
        st.regionId, (id) => { st.regionId = id; }, m)) : null);

  const step2 = (body) => mount(body,
    h('div.lgc-final',
      h('div.lgc-final-tree', '🌳'),
      h('p', h('b', `Wariskan Generasi ${ROMAN(v0.generation)}?`)),
      h('p.small', `Lv ${v0.level} → Lv 1. Kamu mendapat ⭐ ${fmtNum(pv.total)}${st.buy.length ? ` dan membeli ${st.buy.length} perk` : ''}${st.challengeId ? ` · tantangan ${v0.challenges.find((c) => c.id === st.challengeId).name}` : ''}.`),
      h('p.small.muted', 'Tindakan ini tidak bisa dibatalkan dari dalam game (cadangan simpanan disimpan di peramban).')));

  const confirm = (m) => {
    app.saveNow();
    let bak = null;
    try { bak = backupSave(window.localStorage); } catch { /* storage blocked */ }
    const r = game.inheritFarm({ challengeId: st.challengeId, regionId: canRegion() ? st.regionId : undefined, buy: st.buy, seed: Date.now() });
    if (!r.ok) { toast(r.reason, 'error'); return; }
    const from = m.body.querySelector('.lgc-final-tree');
    flyStars(from, document.getElementById('settings-btn') ?? from, 12);
    sfx('levelup'); vibrate([40, 50, 40]);
    confetti(window.innerWidth / 2, window.innerHeight * 0.35, 70);
    m.body.querySelector('.lgc-final')?.classList.add('lgc-growing');
    setTimeout(() => {
      app.startGame(r.game);
      app.setTab('achievements');
      toast(`🌳 Generasi ${r.game.legacy.generation} dimulai! +${r.stars} ⭐${bak ? ' · simpanan lama dicadangkan' : ''}`, 'success');
    }, reduced() ? 200 : 1300);
  };

  openModal({
    title: '🌳 Wariskan pertanian',
    render: (body, m) => {
      if (st.step === 1) step1(body, m);
      else step2(body, m);
    },
    onClose: () => clearInterval(timer),
    actions: (m) => (st.step === 1
      ? [h('button.btn.btn-secondary', { type: 'button', onclick: () => m.close() }, 'Batal'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => {
          st.step = 2; st.armed = false; m.rerender();
          let n = 3;
          const btn = () => m.footer.querySelector('.lgc-arm');
          clearInterval(timer);
          timer = setInterval(() => {
            n--;
            const b = btn();
            if (!b) { clearInterval(timer); return; }
            if (n <= 0) { clearInterval(timer); b.disabled = false; b.textContent = '🌳 Ya, wariskan sekarang'; } else b.textContent = `Tunggu ${n}…`;
          }, 700);
        } }, 'Lanjut →')]
      : [h('button.btn.btn-secondary', { type: 'button', onclick: () => { clearInterval(timer); st.step = 1; m.rerender(); } }, '← Kembali'),
        h('button.btn.btn-danger.lgc-arm', { type: 'button', disabled: true, onclick: () => confirm(m) }, 'Tunggu 3…')]),
  });
}
