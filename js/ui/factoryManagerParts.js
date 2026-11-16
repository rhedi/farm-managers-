// 🏭 Manajer Pabrik card parts: candidate rows, 🔄 ganti / promosikan fold, per-factory control and the settings fold.
// Same look as the Manajer Logistik card (js/ui/dispatcher.js, css disp-*). Engine: game.factoryManagerView & co.
import { h, fmtMoney, fmtNum, fmtHours } from './dom.js';
import { fmtAmt } from './ecoFmt.js';
import { confirmModal } from './modal.js';
import { app, act } from './app.js';
import { fold } from './subtabs.js';
import { stars, stepper, chip } from './dispatcher.js';

const pctOf = (m) => { const v = Math.round((m - 1) * 100); return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v))}%`; };
/** "≤2 pabrik · rencana tiap 6 jam · bahan −5% · hasil +6% · boleh beli bahan" */
export function tierLine(t) {
  return [t.factories == null ? 'Semua pabrik' : `≤${t.factories} pabrik`, `rencana tiap ${fmtHours(t.intervalHours)}`,
    t.inputMult < 1 ? `bahan ${pctOf(t.inputMult)}` : null, t.outputMult > 1 ? `hasil ${pctOf(t.outputMult)}` : null,
    t.buyInputs ? 'boleh beli bahan' : null].filter(Boolean).join(' · ');
}

export function candidateItem(c) {
  return h(`div.list-item.disp-cand${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', `Gaji ${fmtMoney(c.wage)}/hari`, c.reason ? h('span.disp-why', ` · ${c.reason}`) : null)),
    h('button.btn.btn-small.btn-primary', { type: 'button', disabled: !!c.reason, 'aria-label': `Rekrut ${c.name} ${fmtMoney(c.hireCost)}`,
      onclick: () => act(app.game.hireFactoryManager(c.id), `🏭 ${c.name} mulai bekerja sebagai Manajer Pabrik!`) },
    c.locked ? `🔒 Lv ${c.unlockLevel}` : 'Rekrut', h('span.disp-cost', fmtMoney(c.hireCost))));
}

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtMoney(Math.abs(v))}`;
const change = (label, from, to) => h('span.disp-swap-change', h('span.muted', `${label} `), from == null || from === to ? h('b', to) : [`${from} → `, h('b', to)]);
const reach = (t) => (t.factories == null ? 'semua' : `${t.factories}`);

async function swapFlow(v, c) {
  const hd = v.hired, up = c.stars > hd.stars;
  const ok = await confirmModal({
    title: `${up ? 'Promosikan' : 'Ganti'} ke ${c.name}?`,
    message: [
      h('span.disp-swap-change', `${hd.emoji} ${hd.name} (${hd.title}) diganti ${c.emoji} ${c.name} (${c.title}).`),
      change('Pabrik dikelola:', reach(hd), reach(c)),
      change('Rencana tiap:', fmtHours(hd.intervalHours), fmtHours(c.intervalHours)),
      change('Bahan / hasil:', `${pctOf(hd.inputMult)} / ${pctOf(hd.outputMult)}`, `${pctOf(c.inputMult)} / ${pctOf(c.outputMult)}`),
      change('Gaji:', `${fmtMoney(hd.wagePaid)}/hari`, `${fmtMoney(hd.wagePaid + c.wageDiff)}/hari`),
      change('Bayar sekarang:', null, c.price > 0 ? `${fmtMoney(c.price)} (${fmtMoney(c.hireCost)} − tukar ${fmtMoney(c.credit)})` : '$0 (gratis setelah tukar)'),
      h('span.disp-swap-change.muted', 'Pengaturan, statistik, dan batch yang sedang diproses tetap.'),
    ],
    confirmLabel: `${up ? 'Promosikan' : 'Ganti'} · ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`,
  });
  if (ok) act(app.game.replaceFactoryManager(c.id), `🏭 ${c.name} sekarang ${c.title}!`);
}

function swapItem(v, c) {
  const up = c.stars > v.hired.stars, nw = (t) => h('span.nowrap', t);
  return h(`div.list-item.disp-cand.disp-swap-item${c.locked ? '.locked' : ''}`,
    h('div.card-icon', c.emoji),
    h('div.disp-cand-body',
      h('div.card-title', `${c.name} `, h('span.ops-stars', stars(c.stars))),
      h('div.card-sub', h('b', c.title), ` · ${tierLine(c)}`),
      h('div.card-sub', nw(`Gaji ${fmtMoney(c.wage)}/hari`), ' ', h('b.nowrap', `(${signed(c.wageDiff)}/hari)`)),
      c.locked ? h('div.card-sub.disp-why', `🔒 Terbuka di Lv ${c.unlockLevel}`) : null),
    h(`button.btn.btn-small.${up ? 'btn-primary' : 'btn-secondary'}`, { type: 'button', disabled: !!c.reason,
      'aria-label': `${up ? 'Promosikan' : 'Ganti'} ke ${c.name} ${fmtMoney(c.price)}`, onclick: () => swapFlow(v, c) },
    c.locked ? `🔒 Terbuka di Lv ${c.unlockLevel}` : up ? '⬆️ Promosikan' : '🔄 Ganti',
    c.locked ? null : h('span.disp-cost', `· ${c.price > 0 ? fmtMoney(c.price) : 'Gratis'}`)));
}

export function swapFold(v) {
  const others = v.candidates.filter((c) => !c.current);
  if (!others.length) return null;
  const next = others.find((c) => c.stars > v.hired.stars && !c.locked);
  const sum = next ? `Naik ke ${next.title}: ${fmtMoney(next.price)} setelah tukar` : `${others.length} tingkat lain · potongan tukar ${fmtNum(v.tradeIn * 100)}%`;
  return fold('fm-swap', [h('span.disp-fold-name', '🔄 Ganti / promosikan manajer'), h('span.disp-fold-sum', sum)], { cls: 'boxed disp-swap' },
    h('p.small.disp-swap-why', 'Tingkat lebih tinggi mengelola lebih banyak pabrik, merencanakan lebih sering, dan hemat bahan.'),
    h('p.small.muted.disp-note', `Harga = biaya rekrut tingkat baru − ${fmtNum(v.tradeIn * 100)}% biaya rekrut ${v.hired.name} (tidak pernah di bawah $0). Turun tingkat gratis.`),
    h('div.list.disp-cands', others.map((c) => swapItem(v, c))));
}

export const setFm = (patch) => act(app.game.setFactoryManagerSettings(patch), null, { rerenderModal: false });

/** Tap = manager takes / releases this factory (settings.factories; null = every factory). */
function toggleFactory(v, f) {
  const allowed = v.factories.filter((x) => x.allowed).map((x) => x.id);
  const next = f.allowed ? allowed.filter((id) => id !== f.id) : [...allowed, f.id];
  setFm({ factories: next.length === v.factories.length ? null : next });
}

function factoryState(f) {
  if (f.managed) {
    if (f.running) return h('span.fm-state.run', `⚙️ ${f.recipeEmoji} ${f.recipeName}${f.queued > 1 ? ` · antre ${f.queued - 1}` : ''}`);
    return h('span.fm-state.wait', `💤 ${f.wait ?? 'menunggu rencana berikutnya'}`);
  }
  if (f.overCap) return h('span.fm-state.cap', '⛔ Melebihi batas tingkat ini — kamu yang atur');
  return h('span.fm-state', f.allowed ? 'Kamu yang atur' : '✋ Kamu yang atur (dilepas)');
}

export function factoryRows(v) {
  return h('div.fm-facs', v.factories.map((f) => h(`div.fm-fac${f.managed ? '.managed' : ''}`,
    h('div.fm-fac-main', h('div.fm-fac-name', `${f.emoji} ${f.name}`), factoryState(f)),
    chip(f.allowed ? '✓ Kelola' : '＋ Kelola', f.allowed, () => toggleFactory(v, f),
      { 'aria-label': `${f.name}: ${f.allowed ? 'dikelola manajer, ketuk untuk melepas' : 'tidak dikelola, ketuk untuk menyerahkan'}` }))));
}

export function settingsFold(v) {
  const s = v.settings, steps = v.steps, canBuy = v.hired.buyInputs;
  const summary = `Margin min. ${s.minMargin}% · gudang ≤${s.headroom}%${canBuy && s.buyInputs ? ' · beli bahan' : ''}`;
  return fold('fm-settings', [h('span.disp-fold-name', '⚙️ Pengaturan manajer'), h('span.disp-fold-sum', summary)], { cls: 'boxed disp-settings' },
    stepper('Margin minimum', s.minMargin, steps.minMargin, (x) => `${x}%`, (x) => setFm({ minMargin: x }), 'untung di atas harga bahan + gaji'),
    stepper('Isi gudang maks.', s.headroom, steps.headroom, (x) => `${x}%`, (x) => setFm({ headroom: x }), 'tidak memproduksi ke gudang yang penuh'),
    h('div.disp-chips',
      chip(s.contracts ? '📜 Sisakan stok kontrak' : '📜 Kontrak tidak disisakan', s.contracts, () => setFm({ contracts: !s.contracts })),
      chip(canBuy ? (s.buyInputs ? '🛒 Beli bahan kurang: ya' : '🛒 Beli bahan kurang: tidak') : '🛒 Beli bahan: khusus Direktur Pabrik',
        canBuy && s.buyInputs, () => setFm({ buyInputs: !s.buyInputs }), { disabled: !canBuy })),
    h('div.disp-set-title', `Bahan baku (${v.products.length})`),
    v.products.length ? h('div.disp-prods', v.products.map((p) => h('div.disp-prod',
      h('div.disp-prod-name', `${p.emoji} ${p.name}`, h('span.small.muted', ` ${fmtAmt(p.qty, p.unit)}`)),
      stepper('Sisakan', p.reservePct, steps.reservePct, (x) => `${x}%`, (x) => setFm({ reservePct: { ...s.reservePct, [p.id]: x } })))))
      : h('p.small.muted', 'Belum ada pabrik.'),
    h('p.small.muted.disp-note', '🔒 Cadangan pakan, stok kontrak aktif, dan bahan yang disisakan Manajer Logistik tidak dipakai. Bahan yang direncanakan pabrik tidak dikirim truk.'));
}
