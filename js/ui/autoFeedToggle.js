// "🛒 Beli pakan otomatis" / "Beli pelet otomatis" switch (engine js/engine/autoFeed.js): one global setting per group
// (herds, fish ponds) plus a shared number of days kept in stock. Big label = tap target; state shown as text too.
import { h } from './dom.js';
import { app, act } from './app.js';

const LABEL = { animals: '🛒 Beli pakan otomatis', fish: '🛒 Beli pelet otomatis' };
const WHAT = { animals: 'pakan', fish: 'pelet' };

/** `group`: 'animals' | 'fish'. */
export function autoFeedToggle(group) {
  const game = app.game, v = game.autoFeedView(), on = !!v[group];
  return h(`div.autofeed${on ? '.on' : ''}`,
    h('label.autofeed-switch',
      h('input', { type: 'checkbox', role: 'switch', checked: on, 'aria-checked': String(on),
        onchange: (e) => act(game.setAutoFeed({ [group]: e.target.checked }),
          e.target.checked ? `Beli ${WHAT[group]} otomatis aktif.` : `Beli ${WHAT[group]} otomatis mati.`) }),
      h('span.autofeed-track', h('span.autofeed-knob')),
      h('span.autofeed-text', h('b', LABEL[group]), h('span.small.muted', on
        ? `Stok dijaga ≥ ${v.days} hari: kekurangan dibeli tiap tengah malam (harga pasar +20%).`
        : `Mati — ${WHAT[group]} habis = ${group === 'fish' ? 'ikan berhenti tumbuh dan mati' : 'kualitas & produksi turun'}.`))),
    on ? h('label.autofeed-days', h('span.small', 'Jaga stok'),
      h('select', { 'aria-label': 'Hari stok pakan', onchange: (e) => act(game.setAutoFeed({ days: Number(e.target.value) })) },
        v.steps.map((d) => h('option', { value: String(d), selected: d === v.days }, `${d} hari`)))) : null);
}
