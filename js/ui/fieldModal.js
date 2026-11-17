// Field detail modal (owned and for-sale fields).
import { h, mount, liveNode, setText, fmtMoney, fmtTons, fmtPct, fmtPh, fmtWeather, fmtHours, fmtNum, progressBar,
  STATE_LABEL, TASK_LABEL, TASK_ICON, SOIL_LABEL, CONTAM_LABEL } from './dom.js';
import { openModal, closeModal, confirmModal } from './modal.js';
import { app, act } from './app.js';
import { FIELD_REFUND } from '../engine/economy.js';
import { openTaskModal } from './taskModal.js';
import { fieldStatusText, fieldSignature } from './fieldStatus.js';
import { yieldBreakdown, yieldFactorsSig } from './yieldBreakdown.js';
import { qualitySection, qualitySig } from './quality.js'; // v18 ⭐ Kualitas panen
import { planSection, planDraft, nextStepText } from './planEditor.js';
import { seasonChip, forecastStrip, forecastHint } from './forecast.js';
import { plotEl, updatePlot } from './plot.js';
import { fold } from './subtabs.js';

/** Ask, then sell an owned field. */
export async function sellFieldFlow(f) {
  const ok = await confirmModal({
    title: 'Jual ladang?',
    message: `${f.name} akan dijual seharga ${fmtMoney(f.price * FIELD_REFUND)} (${fmtPct(FIELD_REFUND)} dari harga beli).`,
    confirmLabel: 'Jual', danger: true,
  });
  if (ok) act(app.game.sellField(f.id), `${f.name} terjual.`);
}

/** Task button; the field's next step (engine `nextStep`) is the one primary button, field selling is a quiet danger button. */
export function actionButton(f, a, small = true) {
  const kind = a === 'sell' ? 'btn-danger' : a === f.nextStep ? 'btn-primary' : 'btn-secondary';
  const cls = `button.btn${small ? '.btn-small' : ''}.${kind}`;
  const label = a === 'sell' ? '💸 Jual ladang'
    : a === 'plow' && f.state === 'ready' ? `${TASK_ICON.plow} Bersihkan`
      : a === 'harvest' && f.orchard ? '🧺 Petik'
        : `${TASK_ICON[a] ?? ''} ${TASK_LABEL[a] ?? a}`;
  return h(cls, { onclick: (e) => {
    e.stopPropagation();
    if (a === 'sell') sellFieldFlow(f);
    else if (a === 'clear') clearOrchardFlow(app.game, f);
    else openTaskModal(f.id, a);
  } }, label);
}

function kv(rows) {
  return h('div.kv', rows.filter(Boolean).flatMap(([k, v]) => [h('span', k), h('span', v)]));
}

function landInfo(f) {
  return [
    ['Wilayah', f.region],
    ['Luas', `${f.sizeHa} ha`],
    ['Tanah', SOIL_LABEL[f.soil] ?? f.soil],
    ['pH', fmtPh(f.ph)],
    f.soilState ? ['Nutrisi tanah', fmtPct(f.soilState.nutrients)] : null,
    ['Kontaminasi', CONTAM_LABEL[f.contamination] ?? f.contamination],
    ['Cuaca', fmtWeather(f.weather)],
  ];
}

function renderUnowned(body, footer, f, m) {
  const game = app.game;
  const short = f.price > game.state.money;
  mount(body,
    f.locked ? null : h('div.field-plot.st-idle'),
    f.locked ? h('p.field-locked', `🔒 Terkunci: ladang ini terbuka di level ${f.unlockLevel} (kamu level ${game.state.level}).`) : null,
    kv([...landInfo(f), ['Harga', fmtMoney(f.price)]]),
    worldSection(game, f),
    short && !f.locked ? h('p.neg.small', `Uang kurang ${fmtMoney(f.price - game.state.money)}.`) : null);
  mount(footer,
    h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Tutup'),
    h('button.btn.btn-primary', { disabled: short || f.locked,
      title: f.locked ? `Butuh level ${f.unlockLevel}` : short ? 'Uang tidak cukup' : null,
      onclick: () => act(game.buyField(f.id), `${f.name} dibeli!`) }, f.locked ? `🔒 Lv ${f.unlockLevel}` : `Beli ${fmtMoney(f.price)}`));
}

/** Season chip + 3-day forecast (+ irrigation hint) for the field's region (F5); folded in the owned-field dialog. */
function worldSection(game, f, folded = false) {
  const strip = forecastStrip(game, f.regionId);
  if (!strip && !f.season) return null;
  const hint = forecastHint(game, f);
  if (folded) {
    return fold('fm-forecast', '🌦️ Prakiraan 3 hari', { meta: game.seasonOf?.(f.regionId)?.name ?? null }, strip);
  }
  return [h('div.section-title.row.between', h('span', '🌦️ Prakiraan 3 hari'), seasonChip(game, f.regionId)),
    strip, hint ? h('p.small.yf-hint', hint) : null];
}

/** Pest alert with the treat button (F5 events). */
function pestAlert(game, f) {
  if (!f.pest) return null;
  const cost = f.pestCost ?? game.treatPestCost?.(f.id) ?? 0;
  return h('div.pest-alert', h('span', '🐛 Hama menyerang! Hasil −25% sampai disemprot.'),
    h('button.btn.btn-small.btn-danger.btn-solid', {
      onclick: () => act(game.treatPest(f.id), `🐛 Hama disemprot (${fmtMoney(cost)}).`) }, `Semprot ${fmtMoney(cost)}`));
}

function growthText(f) {
  if (f.growthMult == null || f.growthMult === 1) return null;
  if (f.growthMult === 0) return ['Laju tumbuh', f.orchard && !f.orchard.windowOpen ? '⏸ Luar musim buah' : '❄️ Berhenti (terlalu dingin)'];
  return ['Laju tumbuh', `×${String(f.growthMult).replace('.', ',')}${f.growthMult > 1 ? ' 🌈' : ''}`];
}

const yieldText = (f) => (f.crop ? `±${fmtTons(f.predictedYield)}${f.orchard ? ' / panen' : ''}` : '—');

const STAGE_TEXT = { young: '🌱 Pohon muda', prime: '🌳 Produktif', old: '🍂 Tua (hasil turun)' };
const days = (n) => `${fmtNum(n)} hari`;

/** "🌳 Kebun buah": age, stage/health, fruiting window, prune + tebang buttons. */
function orchardSection(game, f) {
  const o = f.orchard;
  if (!o) return null;
  const can = (a) => (f.actions || []).includes(a);
  const pruneCost = (game.data.BALANCE.orchard?.pruneCostPerHa ?? 70) * f.sizeHa;
  const pruneNote = f.state === 'busy' ? '✂️ Pangkas dan 🪓 tebang tersedia setelah tugas ladang selesai.'
    : o.pruned ? '✅ Sudah dipangkas siklus ini (+15% hasil).'
      : !o.mature ? '✂️ Pangkas tersedia setelah pohon dewasa.'
        : f.state === 'ready' ? '✂️ Pangkas lagi setelah dipetik.' : `✂️ Pangkas: +15% hasil siklus ini (${fmtMoney(pruneCost)}).`;
  return fold('fm-orchard', `🌳 Kebun ${f.crop.name}`, { open: true, meta: STAGE_TEXT[o.stage] ?? o.stage, cls: 'orchard-section' },
    o.mature ? null : h('div.orch-maturity', h('span.small', `Menuju dewasa ${fmtPct(o.maturity)}`), progressBar(o.maturity, '')),
    kv([
      ['Umur', `${days(Math.floor(o.ageDays))} / produktif ${days(o.lifespanDays)}`],
      ['Dewasa', o.mature ? `✅ sejak hari ke-${o.maturityDays}` : `dalam ±${days(Math.ceil(o.maturityDays - o.ageDays))}`],
      ['Kesehatan', `${fmtPct(o.vitality)} hasil${o.vitality < 1 ? ' (menua)' : ''}`],
      ['Panen', `tiap ${days(o.harvestEveryDays)} musim buah · sudah ${o.harvests}×`],
      ['Musim buah', o.windowSeasons.length ? o.windowSeasons.map((s) => `${s.emoji} ${s.name}`).join(', ') : '❄️ tidak ada di wilayah ini'],
      o.mature && f.state === 'orchard' ? ['Panen berikut', o.hoursToRipe == null ? 'tidak berbuah' : `±${fmtHours(o.hoursToRipe)}`] : null,
    ]),
    h('p.small.muted', pruneNote),
    h('div.row.orch-buttons',
      h('button.btn.btn-small.btn-secondary', { type: 'button', disabled: !can('prune'), onclick: () => openTaskModal(f.id, 'prune') }, '✂️ Pangkas'),
      h('button.btn.btn-small.btn-danger', { type: 'button', disabled: !can('clear'), onclick: () => clearOrchardFlow(game, f) }, '🪓 Tebang')),
    h('p.small.muted', '🪓 Tebang mengosongkan ladang; pohon hilang dan harus ditanam ulang dari bibit.'));
}

async function clearOrchardFlow(game, f) {
  const ok = await confirmModal({ title: `Tebang kebun ${f.crop.name}?`,
    message: `Semua pohon di ${f.name} ditebang (${days(Math.floor(f.orchard.ageDays))}). Ladang jadi kosong; bibit tidak dikembalikan.`,
    confirmLabel: '🪓 Lanjut', danger: true });
  if (ok) openTaskModal(f.id, 'clear');
}

/** "🏠 Rumah kaca": cost, upkeep, effects as text, build/remove with confirm; the reason when it can't be built. */
function greenhouseSection(game, f) {
  if (typeof game.greenhouseQuote !== 'function') return null;
  const q = game.greenhouseQuote(f.id);
  const C = game.data.BALANCE.greenhouse || {};
  const effects = [
    '🌤️ Tumbuh normal di semua musim (tanpa penalti musim / suhu dingin)',
    '☀️ Hari kering tidak mengurangi hasil',
    '⛈️ Kebal badai',
    `📈 Hasil +${fmtPct(q.yieldBonus ?? C.yieldBonus ?? 0.2)}`,
  ];
  const build = async () => {
    const ok = await confirmModal({ title: '🏠 Bangun rumah kaca?',
      message: `${f.name} (${f.sizeHa} ha): ${fmtMoney(q.cost)} sekarang, listrik ${fmtMoney(q.upkeepPerDay)}/hari.`, confirmLabel: 'Bangun' });
    if (ok) act(game.buildGreenhouse(f.id), `🏠 Rumah kaca dibangun di ${f.name}.`);
  };
  const remove = async () => {
    const ok = await confirmModal({ title: 'Bongkar rumah kaca?',
      message: `Kamu dapat kembali ${fmtMoney(q.refund)} (${fmtPct(C.refund ?? 0.3)} biaya bangun). Tanaman tetap tumbuh di luar ruangan.`,
      confirmLabel: 'Bongkar', danger: true });
    if (ok) act(game.removeGreenhouse(f.id), (r) => `Rumah kaca dibongkar (+${fmtMoney(r.refund)}).`);
  };
  return fold('fm-greenhouse', '🏠 Rumah kaca', { meta: q.built ? '✅ Terpasang' : q.ok ? fmtMoney(q.cost) : '🚫', cls: `gh-section${q.built ? '.built' : ''}` },
    kv([
      q.built ? ['Biaya bangun', fmtMoney(f.greenhouse?.cost ?? q.cost)] : ['Biaya bangun', `${fmtMoney(q.cost)} (${fmtMoney(C.costPerHa ?? 18000)}/ha)`],
      ['Listrik', `${fmtMoney(q.upkeepPerDay)}/hari`],
      q.built ? ['Nilai bongkar', fmtMoney(q.refund)] : null,
    ]),
    h('ul.gh-effects', effects.map((t) => h('li', t))),
    q.built ? null : h('p.small.muted', `Maks ${q.maxHa} ha · terbuka di level ${q.unlockLevel} · tidak untuk kebun buah.`),
    !q.built && q.reason ? h('p.gh-reason', `🚫 ${q.reason}`) : null,
    q.built && f.state === 'busy' ? h('p.gh-reason', '🚫 Bongkar tersedia setelah tugas ladang selesai.') : null,
    h('div.row.gh-buttons', q.built
      ? h('button.btn.btn-small.btn-danger', { type: 'button', disabled: !!f.busy || f.state === 'busy', onclick: remove }, `Bongkar (+${fmtMoney(q.refund)})`)
      : h('button.btn.btn-small.btn-primary', { type: 'button', disabled: !q.ok, onclick: build }, `🏠 Bangun ${fmtMoney(q.cost)}`)));
}

function renderOwned(body, footer, f, m, live, draft) {
  const st = f.state === 'busy' ? 'busy' : f.state;
  live.bar = progressBar(f.progress, f.state === 'busy' ? 'blue' : f.state === 'ready' ? 'gold' : '');
  live.status = h('div.small', fieldStatusText(f));
  live.yield = h('span', yieldText(f));
  live.plot = plotEl(f);
  const next = !f.plan ? nextStepText(f) : null;
  const hint = forecastHint(app.game, f);
  mount(body,
    h('div.row.between', h(`span.badge.st-${st}`, STATE_LABEL[st]), f.crop ? h('span', `${f.crop.emoji} ${f.crop.name}`) : null),
    live.plot,
    live.bar, live.status,
    next ? h('div.small.muted', next) : null,
    pestAlert(app.game, f),
    hint ? h('p.small.yf-hint', hint) : null,
    kv([
      ['Perkiraan hasil', live.yield],
      ['Dipupuk', f.fertilized ? '✅ Ya' : '— Belum'],
      ['Diairi', f.irrigated ? '✅ Ya' : '— Belum'],
      f.withering ? ['Layu', `hasil tinggal ${fmtPct(f.witherFactor)}`] : null,
      growthText(f),
    ]),
    orchardSection(app.game, f),
    planSection(app.game, f, draft, () => m.rerender()),
    f.crop ? fold('fm-yield', '📈 Faktor hasil', { meta: `${f.dryDays ?? 0} hari kering` },
      kv([['Hari kering / basah', `${f.dryDays ?? 0} / ${f.wetDays ?? 0}`]]), yieldBreakdown(f)) : null,
    qualitySection(f),
    greenhouseSection(app.game, f),
    worldSection(app.game, f, true),
    fold('fm-land', '📍 Lahan', { meta: `${SOIL_LABEL[f.soil] ?? f.soil} · pH ${fmtPh(f.ph)}` }, kv(landInfo(f))));
  const acts = f.actions.filter((a) => a !== 'sell' && a !== 'prune' && a !== 'clear').map((a) => actionButton(f, a, false));
  mount(footer,
    f.actions.includes('sell') ? actionButton(f, 'sell', false) : null,
    ...acts,
    acts.length ? null : h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Tutup'));
}

export function openFieldModal(fieldId) {
  const game = app.game;
  const worldSig = (f) => `:${game.day}:${f.pest}:${f.growthMult}:${f.ph}:${f.soilState?.nutrients}:${game.state.level}`;
  // Money only matters for affordability: 🏠 Bangun (owned) or Beli + the shortfall line (for sale).
  const moneySig = (f) => (f.owned ? `${game.greenhouseQuote?.(f.id)?.ok}`
    : f.price > game.state.money ? fmtMoney(f.price - game.state.money) : 'ok');
  const modalSig = (f) => fieldSignature(f) + worldSig(f) + `:${moneySig(f)}` + (f.owned ? `:${yieldFactorsSig(f)}:${qualitySig(f)}` : `:${f.locked}`);
  let sig = '';
  let draft = null; // plan editor draft, kept across re-renders
  const live = {};
  openModal({
    title: game.getFieldView(fieldId)?.name ?? 'Ladang',
    render: (body, m) => {
      const f = game.getFieldView(fieldId);
      sig = modalSig(f);
      m.setTitle(`${f.owned ? '📍' : f.locked ? '🔒' : '🏷️'} ${f.name}`);
      if (f.owned) {
        draft = planDraft(game, f, draft);
        renderOwned(body, m.footer, f, m, live, draft);
      } else renderUnowned(body, m.footer, f, m);
      m.footer.hidden = false;
    },
    refresh: (m) => {
      const f = game.getFieldView(fieldId);
      if (modalSig(f) !== sig) {
        m.update(); // patched in place: the plot keeps animating
        for (const k of Object.keys(live)) live[k] = liveNode(live[k]);
        return;
      }
      if (!f.owned) return;
      const w = `${Math.round(f.progress * 100)}%`;
      if (live.bar.firstChild.style.width !== w) live.bar.firstChild.style.width = w;
      setText(live.status, fieldStatusText(f));
      setText(live.yield, yieldText(f));
      updatePlot(live.plot, f);
    },
  });
}
