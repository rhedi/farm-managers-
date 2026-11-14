// Field detail modal (owned and for-sale fields).
import { h, mount, fmtMoney, fmtTons, fmtPct, fmtPh, fmtWeather, progressBar,
  STATE_LABEL, TASK_LABEL, TASK_ICON, SOIL_LABEL, CONTAM_LABEL } from './dom.js';
import { openModal, closeModal, confirmModal } from './modal.js';
import { app, act } from './app.js';
import { FIELD_REFUND } from '../engine/economy.js';
import { openTaskModal } from './taskModal.js';
import { fieldStatusText, fieldSignature } from './fieldStatus.js';
import { yieldBreakdown, yieldFactorsSig } from './yieldBreakdown.js';
import { planSection, planDraft, nextStepText } from './planEditor.js';
import { seasonChip, forecastStrip, forecastHint } from './forecast.js';

/** Ask, then sell an owned field. */
export async function sellFieldFlow(f) {
  const ok = await confirmModal({
    title: 'Jual ladang?',
    message: `${f.name} akan dijual seharga ${fmtMoney(f.price * FIELD_REFUND)} (${fmtPct(FIELD_REFUND)} dari harga beli).`,
    confirmLabel: 'Jual', danger: true,
  });
  if (ok) act(app.game.sellField(f.id), `${f.name} terjual.`);
}

export function actionButton(f, a, small = true) {
  const cls = `button.btn${small ? '.btn-small' : ''}.${a === 'sell' ? 'btn-danger' : a === 'harvest' ? 'btn-primary' : 'btn-secondary'}`;
  const label = a === 'sell' ? '💸 Jual'
    : a === 'plow' && f.state === 'ready' ? `${TASK_ICON.plow} Bersihkan`
      : `${TASK_ICON[a] ?? ''} ${TASK_LABEL[a] ?? a}`;
  return h(cls, { onclick: (e) => { e.stopPropagation(); a === 'sell' ? sellFieldFlow(f) : openTaskModal(f.id, a); } }, label);
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

/** Season chip + 3-day forecast (+ irrigation hint) for the field's region (F5). */
function worldSection(game, f) {
  const strip = forecastStrip(game, f.regionId);
  if (!strip && !f.season) return null;
  const hint = forecastHint(game, f);
  return [h('div.section-title.row.between', h('span', '🌦️ Prakiraan 3 hari'), seasonChip(game, f.regionId)),
    strip, hint ? h('p.small.yf-hint', hint) : null];
}

/** Pest alert with the treat button (F5 events). */
function pestAlert(game, f) {
  if (!f.pest) return null;
  const cost = f.pestCost ?? game.treatPestCost?.(f.id) ?? 0;
  return h('div.pest-alert', h('span', '🐛 Hama menyerang! Hasil −25% sampai disemprot.'),
    h('button.btn.btn-small.btn-danger', {
      onclick: () => act(game.treatPest(f.id), `🐛 Hama disemprot (${fmtMoney(cost)}).`) }, `Semprot ${fmtMoney(cost)}`));
}

function growthText(f) {
  if (f.growthMult == null || f.growthMult === 1) return null;
  if (f.growthMult === 0) return ['Laju tumbuh', '❄️ Berhenti (terlalu dingin)'];
  return ['Laju tumbuh', `×${String(f.growthMult).replace('.', ',')}${f.growthMult > 1 ? ' 🌈' : ''}`];
}

const yieldText = (f) => (f.crop ? `±${fmtTons(f.predictedYield)}` : '—');

function renderOwned(body, footer, f, m, live, draft) {
  const st = f.state === 'busy' ? 'busy' : f.state;
  live.bar = progressBar(f.progress, f.state === 'busy' ? 'blue' : f.state === 'ready' ? 'gold' : '');
  live.status = h('div.small', fieldStatusText(f));
  live.yield = h('span', yieldText(f));
  const next = !f.plan ? nextStepText(f) : null;
  mount(body,
    h('div.row.between', h(`span.badge.st-${st}`, STATE_LABEL[st]), f.crop ? h('span', `${f.crop.emoji} ${f.crop.name}`) : null),
    h(`div.field-plot.st-${st}`),
    live.bar, live.status,
    next ? h('div.small.muted', next) : null,
    pestAlert(app.game, f),
    kv([
      ['Perkiraan hasil', live.yield],
      ['Dipupuk', f.fertilized ? '✅ Ya' : '— Belum'],
      ['Diairi', f.irrigated ? '✅ Ya' : '— Belum'],
      ['Hari kering / basah', `${f.dryDays ?? 0} / ${f.wetDays ?? 0}`],
      f.withering ? ['Layu', `hasil tinggal ${fmtPct(f.witherFactor)}`] : null,
      growthText(f),
    ]),
    f.crop ? yieldBreakdown(f) : null,
    worldSection(app.game, f),
    planSection(app.game, f, draft),
    h('div.section-title', '📍 Lahan'),
    kv(landInfo(f)));
  const acts = f.actions.filter((a) => a !== 'sell').map((a) => actionButton(f, a, false));
  mount(footer,
    f.actions.includes('sell') ? actionButton(f, 'sell', false) : null,
    ...acts,
    acts.length ? null : h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Tutup'));
}

export function openFieldModal(fieldId) {
  const game = app.game;
  const worldSig = (f) => `:${game.day}:${f.pest}:${f.growthMult}:${f.ph}:${f.soilState?.nutrients}`;
  const modalSig = (f) => fieldSignature(f) + worldSig(f) + (f.owned ? `:${yieldFactorsSig(f)}` : `:${f.price <= game.state.money}:${f.locked}`);
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
      if (modalSig(f) !== sig) { m.rerender(); return; }
      if (!f.owned) return;
      live.bar.firstChild.style.width = `${Math.round(f.progress * 100)}%`;
      live.status.textContent = fieldStatusText(f);
      live.yield.textContent = yieldText(f);
    },
  });
}
