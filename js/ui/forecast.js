// Season + 3-day forecast widgets (F5): a strip for the field modal and a modal from the top bar.
import { h, fmtWeather, weatherEmoji } from './dom.js';
import { openModal, closeModal } from './modal.js';

const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Season chip "🌱 Musim Semi", or null without engine support. */
export function seasonChip(game, regionId) {
  const s = game.seasonOf?.(regionId);
  return s ? h('span.season-chip', { title: s.growthMult < 1 ? `Tanaman tumbuh ×${s.growthMult}` : null }, `${s.emoji} ${s.name}`) : null;
}

/** Three small day cards (day, rain/sun, temp), or null when there is no forecast. */
export function forecastStrip(game, regionId) {
  const days = game.forecast?.(regionId) || [];
  if (!days.length) return null;
  return h('div.fc-strip', days.map((d) => h(`div.fc-day${d.rain ? '.rain' : ''}`,
    h('span.fc-d', `Hari ${d.day}`),
    h('span.fc-ico', weatherEmoji(d)),
    h('span.fc-t', `${nf0.format(d.temp)}°C`))));
}

/** Irrigation hint for a growing, unirrigated field from the coming days. */
export function forecastHint(game, f) {
  if (f.baseState !== 'growing' || f.irrigated) return null;
  const days = game.forecast?.(f.regionId) || [];
  const dry = days.filter((d) => !d.rain).length;
  if (!days.length) return null;
  if (dry >= 2) return `💡 ${dry} dari ${days.length} hari ke depan kering. Pertimbangkan mengairi.`;
  if (dry === 0) return '🌧️ Hujan beberapa hari ke depan: irigasi bisa ditunda.';
  return null;
}

function regionCard(game, r, owned, events) {
  const ev = events.filter((e) => e.regionId === r.regionId && e.type !== 'pest');
  return h(`div.fc-region${owned ? '.owned' : ''}`,
    h('div.row.between', h('strong', `${owned ? '📍 ' : ''}${r.name}`), seasonChip(game, r.regionId)),
    h('div.small.muted', `Hari ini: ${fmtWeather(r)}`),
    forecastStrip(game, r.regionId),
    ev.map((e) => h('div.small.fc-event', `${e.emoji} ${e.name}${e.endsDay ? ` (s/d hari ${e.endsDay})` : ''}`)));
}

/** Modal with every region's season and forecast; regions with owned fields first. */
export function openForecastModal(game) {
  let shownDay = 0;
  openModal({
    title: '🌦️ Musim & Prakiraan',
    refresh: (m) => { if (game.day !== shownDay) m.rerender(); },
    render: (body, m) => {
      shownDay = game.day;
      const ownedRegions = new Set(Object.keys(game.state.fields)
        .map((id) => game.data.FIELDS.find((f) => f.id === id)?.regionId));
      const regions = game.weatherView().slice()
        .sort((a, b) => Number(ownedRegions.has(b.regionId)) - Number(ownedRegions.has(a.regionId)));
      const events = game.activeEvents?.() || [];
      body.replaceChildren(h('div.fc-list', regions.map((r) => regionCard(game, r, ownedRegions.has(r.regionId), events))));
      m.footer.replaceChildren(h('button.btn.btn-secondary', { onclick: () => closeModal(m) }, 'Tutup'));
      m.footer.hidden = false;
    },
  });
}
