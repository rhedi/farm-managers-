// 📰 Kabar Desa UI: the newspaper card on top of Ladang › Ladangku (open dilemma / Bencana Besar), the detail sheet
// with options (concrete cost/odds, the default marked, live countdown), the outcome "stamp", the disaster forecast
// sheet (opened once by itself), and the history list for Prestasi. Engine: game.kabarView/chooseDilemma/prepareDisaster.
import { h, mount, fmtMoney, fmtHours } from './dom.js';
import { app } from './app.js';
import { openModal, isModalOpen, toast } from './modal.js';

const SEEN_KEY = 'farm-manager-kabar-seen';
let seen = '';
try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }

const view = (game) => { try { return game.kabarView?.() ?? null; } catch { return null; } };
/** Real time left at the current speed (1 game day = 60 s at 1×). */
function realLeft(game, hours) {
  const sp = game.state.speed || 1, s = (hours * game.data.BALANCE.realSecondsPerGameHour) / sp;
  return s >= 90 ? `≈ ${Math.round(s / 60)} mnt nyata` : `≈ ${Math.max(1, Math.round(s))} dtk nyata`;
}
const countdown = (game, hours) => `⏳ ${fmtHours(hours)} lagi · ${realLeft(game, hours)}`;

/** Re-render key for the Ladang view. */
export function kabarSig(game) {
  const v = view(game);
  return v ? `${v.open?.id ?? ''}|${v.disaster ? `${v.disaster.id}:${v.disaster.phase}:${v.disaster.choice ?? ''}` : ''}` : '';
}

function disasterLine(game, d) {
  if (d.phase === 'forecast') return `Mulai hari ${d.startDay} · ${countdown(game, d.hoursToStart)}`;
  return `Berlangsung · ${d.daysLeft} hari lagi${d.choiceLabel ? ` · ${d.choiceLabel}` : ''}`;
}

/** Card(s) on top of Ladangku; null when there is no news. */
export function kabarCard(game) {
  const v = view(game);
  if (!v || (!v.open && !v.disaster)) return null;
  const items = [];
  if (v.disaster) {
    const d = v.disaster;
    items.push(h(`button.kabar-card.kabar-disaster.ph-${d.phase}`, { type: 'button', onclick: () => openDisasterSheet(), 'aria-label': `Bencana Besar: ${d.name}` },
      h('span.kabar-mast', '⚠️ BENCANA BESAR'),
      h('span.kabar-row', h('span.kabar-ico', d.emoji), h('span.kabar-main', h('b.kabar-title', d.name),
        h('span.kabar-sub', { dataset: { kabarCd: 'disaster' } }, disasterLine(game, d))),
      h('span.kabar-go', d.phase === 'forecast' && !d.choice ? 'Siapkan ›' : '›'))));
  }
  if (v.open) {
    const o = v.open;
    items.push(h('button.kabar-card.kabar-news', { type: 'button', onclick: () => openKabarSheet(), 'aria-label': `Kabar Desa: ${o.title}` },
      h('span.kabar-mast', '📰 KABAR DESA'),
      h('span.kabar-row', h('span.kabar-ico', o.emoji), h('span.kabar-main', h('b.kabar-title', o.title),
        h('span.kabar-sub', { dataset: { kabarCd: 'open' } }, countdown(game, o.hoursLeft))),
      h('span.kabar-go', 'Putuskan ›'))));
  }
  return h('div.kabar-wrap', items);
}

/** Live countdowns (called by the Ladang update loop). */
export function updateKabarCard(root, game) {
  const els = root?.querySelectorAll?.('[data-kabar-cd]');
  if (!els?.length) return;
  const v = view(game);
  for (const el of els) {
    const t = el.dataset.kabarCd === 'open' ? (v?.open ? countdown(game, v.open.hoursLeft) : '')
      : (v?.disaster ? disasterLine(game, v.disaster) : '');
    if (el.textContent !== t) el.textContent = t;
  }
}

function optionButton(o, onPick, chosen = null) {
  const costText = o.cost > 0 ? fmtMoney(o.cost) : 'Gratis';
  return h(`button.kabar-opt${o.default ? '.is-default' : ''}${chosen === o.id ? '.is-chosen' : ''}`, {
    type: 'button', disabled: !o.affordable || (chosen != null && chosen !== o.id), onclick: () => onPick(o),
  },
  h('span.kabar-opt-label', o.label),
  h('span.kabar-opt-desc', o.desc),
  h('span.kabar-opt-meta', h('span.kabar-cost', costText), o.default ? h('span.kabar-def', '⏱️ otomatis bila tidak memilih') : null,
    !o.affordable ? h('span.kabar-poor', 'uang kurang') : null));
}

function outcomeStamp(r) {
  const good = r.outcome?.good;
  return h(`div.kabar-result.${good === true ? 'good' : good === false ? 'bad' : 'meh'}`,
    h('div.kabar-stamp', good === true ? '✅ BERHASIL' : good === false ? '❌ RUGI' : '📝 TERCATAT'),
    h('p', r.outcome?.text ?? ''));
}

/** Detail sheet of the open dilemma; after a choice it shows the outcome stamp. */
export function openKabarSheet() {
  const game = app.game, start = view(game)?.open;
  if (!start) return;
  let result = null;
  openModal({
    title: `📰 Kabar Desa`,
    render: (body, m) => {
      const o = view(game)?.open;
      if (result) { mount(body, h('div.kabar-paper.flip-in', h('h3.kabar-headline', `${start.emoji} ${start.title}`), outcomeStamp(result))); return; }
      if (!o || o.id !== start.id) { mount(body, h('p.muted', 'Kabar ini sudah diputuskan otomatis.')); return; }
      mount(body, h('div.kabar-paper.flip-in',
        h('div.kabar-dateline', `Hari ${o.day} · batas hari ${o.deadlineDay}`),
        h('h3.kabar-headline', `${o.emoji} ${o.title}`),
        h('p.kabar-lede', o.text),
        h('div.kabar-cd', { dataset: { kabarCd: 'open' } }, countdown(game, o.hoursLeft))),
      h('div.kabar-opts', o.options.map((x) => optionButton(x, (pick) => {
        const r = game.chooseDilemma(pick.id);
        if (!r.ok) { toast(r.reason, 'error'); return; }
        result = r;
        app.requestRender();
        m.rerender();
      }))));
    },
    refresh: (m) => {
      if (result) return;
      const o = view(game)?.open;
      if (!o || o.id !== start.id) { m.rerender(); return; }
      updateKabarCard(m.body, game);
    },
    actions: (m) => (result ? [h('button.btn.btn-primary', { onclick: () => m.close() }, 'Tutup')] : []),
  });
}

/** Bencana Besar sheet: forecast text, preparation options (once), status. */
export function openDisasterSheet() {
  const game = app.game, d0 = view(game)?.disaster;
  if (!d0) return;
  markSeen(d0.id);
  openModal({
    title: '⚠️ Bencana Besar',
    render: (body, m) => {
      const d = view(game)?.disaster;
      if (!d) { mount(body, h('p.muted', 'Bencana sudah berlalu. Lihat ringkasannya di Prestasi › Prestasi › 📰 Kabar Desa.')); return; }
      const canPick = d.phase === 'forecast' && !d.choice;
      mount(body, h(`div.kabar-paper.disaster.flip-in`,
        h('div.kabar-dateline', d.phase === 'forecast' ? `Prakiraan · mulai hari ${d.startDay}` : `Berlangsung sampai hari ${d.endDay}`),
        h('h3.kabar-headline', `${d.emoji} ${d.name}`),
        h('p.kabar-lede', d.text),
        h('div.kabar-cd', { dataset: { kabarCd: 'disaster' } }, disasterLine(game, d)),
        d.startText ? h('p.kabar-lede', d.startText) : null),
      h('div.section-title', canPick ? '🛡️ Pilih persiapan (sekali, dibayar sekarang)' : '🛡️ Persiapan'),
      h('div.kabar-opts', d.options.map((x) => optionButton({ ...x, affordable: canPick ? x.affordable : true }, (pick) => {
        if (!canPick) return;
        const r = game.prepareDisaster(pick.id);
        if (!r.ok) { toast(r.reason, 'error'); return; }
        toast(`🛡️ ${pick.label} disiapkan.`, 'success');
        app.requestRender();
        m.rerender();
      }, d.choice ?? (canPick ? null : d.def)))));
    },
    refresh: (m) => updateKabarCard(m.body, game),
    actions: (m) => [h('button.btn.btn-secondary', { onclick: () => m.close() }, 'Tutup')],
  });
}

function markSeen(id) {
  seen = id;
  try { localStorage.setItem(SEEN_KEY, id); } catch { /* ignore */ }
}

/** A forecast the player hasn't looked at yet (also after offline catch-up): open its sheet once. */
export function maybeShowDisaster(game) {
  const d = view(game)?.disaster;
  if (!d || d.phase !== 'forecast' || d.choice || seen === d.id || isModalOpen()) return;
  openDisasterSheet();
}

/** Prestasi: last 10 decisions + outcomes. */
export function kabarHistory(game) {
  const v = view(game);
  if (!v?.history.length) return h('div.empty.compact', v?.unlocked ? 'Belum ada kabar yang diputuskan.' : `📰 Kabar Desa mulai di level ${v?.unlockLevel ?? 3}.`);
  return h('div.list.kabar-history', v.history.map((x) => h(`div.list-item.kabar-hist.${x.good === true ? 'good' : x.good === false ? 'bad' : 'meh'}`,
    h('span.kabar-hist-ico', x.emoji),
    h('div.kabar-hist-main', h('b', x.title), h('div.small', `${x.optionLabel}${x.auto ? ' · otomatis' : ''}`), h('div.small.muted', x.text)),
    h('span.small.muted.kabar-hist-day', `H${x.day}`))));
}
export const kabarHistorySig = (game) => `${view(game)?.history?.[0]?.id ?? ''}`;
