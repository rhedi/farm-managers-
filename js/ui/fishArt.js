// Hand-drawn side-view art (facing right) for the Peternakan Ikan species: lele, nila, ikan mas, udang, salmon.
// Flat fills only (no gradient/clip ids, so copies inside hidden folds still paint), a thin dark outline plus a
// light halo in the dark theme (css/fish.css .fish-art). One 64×36 viewBox for all, readable from ~20 to 64 px.
// Text-only places (toasts, <option>) keep the product/pond `emoji` from data.js.
import { h } from './dom.js';

const LINE = 'stroke="#1e2529" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"';
const eye = (x, y, r, iris) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${iris}" ${LINE}/>`
  + `<circle cx="${x + r * 0.15}" cy="${y}" r="${(r * 0.55).toFixed(2)}" fill="#111"/>`
  + `<circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${(r * 0.22).toFixed(2)}" fill="#fff"/>`;

/** Carp scale hint: staggered arcs (free edge toward the tail) inside an ellipse cx,cy,rx,ry. */
function scales(cx, cy, rx, ry, color) {
  let d = '';
  for (let x = 22, col = 0; x <= 46; x += 4.2, col++) {
    for (let y = 11 + (col % 2) * 2.4; y <= 28; y += 4.8) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.62) continue;
      d += `M${x.toFixed(1)},${(y - 2.3).toFixed(1)}q-2.6,2.3 0,4.6`;
    }
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width=".8" stroke-linecap="round"/>`;
}

const ART = {
  // Lele: long dark grey-brown body, flat wide head, very long dorsal + anal fins, rounded tail, four long barbels.
  lele: `
<path d="M44,13.2C40,11.4 33,10.8 26,11.2C19,11.6 13,13.2 8.6,16.4L13,17Z" fill="#7a6a5b" ${LINE}/>
<path d="M40,25C34,27.4 24,27.8 16,26.2C12.8,25.4 10.2,23.6 8.6,21.4L13,20.6Z" fill="#7a6a5b" ${LINE}/>
<path d="M37.6,11.6l-.6,2.6M31.6,11.2l-.6,3.2M25.6,11.4l-.4,3.8M19.8,12.4l-.2,3.8M34,26.6l-.4,-2.4M27.6,27.2l-.3,-3M21.4,26.8l-.1,-3.4M15.8,25.6l0,-3.4" stroke="#54483d" stroke-width=".7" stroke-linecap="round"/>
<path d="M10,18.2C6.4,12.8 1,13.4 1,18.8C1,24.4 6.4,25 10,20.2Z" fill="#857463" ${LINE}/>
<path d="M60,19.4C60,14.4 55.4,12 48,12.2L22,15C15,16 11,17.1 9,18.1L9,20.3C12,21.3 17,22.6 23,23.6L48,25.6C55.4,25.8 60,23.8 60,19.4Z" fill="#5f544a" ${LINE}/>
<path d="M58.6,21.6C52,24.8 32,25.4 12,21C26,22.6 46,23.2 58.6,21.6Z" fill="#d6c8ae"/>
<path d="M44,15c3,-.4 4.6,.8 6.6,.6M33,16.2c2,-.6 4,0 5,.8M22,17.6c2,-.8 3,0 4,.4M27,19.4c1.6,-.4 2.6,0 3.4,.4" fill="none" stroke="#40372f" stroke-width="1.3" stroke-linecap="round"/>
<path d="M47.4,19C38,19.2 24,19.6 12.4,19.4" fill="none" stroke="#8e8070" stroke-width=".6" stroke-linecap="round"/>
<path d="M50.2,14.4C48.8,17 48.8,21.2 50.2,23.8" fill="none" stroke="#2e2722" stroke-width=".8" stroke-linecap="round"/>
<path d="M46,21.8C43,25.4 39.6,26.8 36.8,26.4C39,24.4 41.6,22.4 46,21.4Z" fill="#857463" ${LINE}/>
<path d="M59.6,20.6Q56,21.8 52.4,21.2" fill="none" ${LINE}/>
${eye(53.6, 16.8, 1.3, '#e9dcc0')}
<g fill="none" stroke="#2b2420" stroke-width="1.15" stroke-linecap="round">
<path d="M57,19.8C53.6,24.6 45.6,29.8 34.4,31.4"/><path d="M58.8,20C61.6,23.8 61.6,28.2 59.2,31.6"/>
<path d="M58.4,15.8C60.4,13.8 62,13.2 63.2,10.8"/><path d="M55.8,22.4C55,25.2 52.6,27.4 50,28.2"/></g>`,

  // Nila: deep grey-silver body, faint vertical bars, long spiny dorsal, striped tail, gill cover.
  nila: `
<path d="M47,10L45.2,4.4L43.4,8.6L41.4,3.6L39.6,8.2L37.6,3.2L35.8,8L33.8,3.2L32,8.2L30,3.6L28.2,8.6L26.4,4.4C21,4.4 15.6,7.6 12.6,14.6L20,12.6Z" fill="#6f777c" ${LINE}/>
<path d="M33,28.4L28.6,33.6C24,33.6 18.6,30.8 14.4,23.4Z" fill="#6f777c" ${LINE}/>
<path d="M13.4,15.6L3.6,10.2C1.8,15 1.8,23 3.6,27.8L13.4,22.4Z" fill="#7d858a" ${LINE}/>
<path d="M4.6,12.4v13.2M7.6,13.6v10.8M10.6,15.4v7.2" stroke="#3f464b" stroke-width="1.1" stroke-linecap="round"/>
<path d="M57.4,19.2C56.6,13 50,8.6 39,8.2C28,8 18.6,11.6 12.4,16.2L12.4,21.8C18.6,26.4 28,30 39,29.8C50,29.6 56.6,25.4 57.4,19.2Z" fill="#a3abaf" ${LINE}/>
<path d="M56.8,21.6C53,26.8 46,29.6 39,29.8C28,30 18.6,26.4 12.6,21.8C26,24.6 44,24.8 56.8,21.6Z" fill="#dfe3e2"/>
<path d="M57.2,17.4C54,11.6 46,8.4 39,8.2C28,8 18.6,11.6 12.6,16.2C26,13 44,12.6 57.2,17.4Z" fill="#7f888d"/>
<path d="M21,13.2v12.6M26.4,11v16.6M31.8,9.8v18.8M37.2,9.2v19.6M42.6,9.6v18.4" stroke="#4c5459" stroke-width="2.2" stroke-opacity=".38" stroke-linecap="round"/>
<path d="M47.6,11.8C44.6,16 44.6,22.6 47.6,27" fill="none" ${LINE}/>
<path d="M45,20.6C41,21.2 38,23.2 36.6,25.6C40.6,25.2 43.6,23.6 45.2,21.6Z" fill="#8a7d79" ${LINE}/>
<path d="M42,28.6L38.6,33.2L36.6,29.4Z" fill="#7d858a" ${LINE}/>
<path d="M57.4,19.4Q55.6,20.8 53.6,20.4" fill="none" ${LINE}/>
${eye(51.4, 15.8, 2.3, '#f2d98a')}`,

  // Ikan mas: deep golden-orange body, scale arcs, forked tail, tall dorsal, two short barbels.
  mas: `
<path d="M45,9.6L41.6,2.8C35,3.4 27,5.6 22.4,10.6L22.4,12.4Z" fill="#e8892a" ${LINE}/>
<path d="M14.4,16.8L4.4,8.6C6.8,13.4 7.4,15.8 8.8,19C7.4,22.2 6.8,24.6 4.4,29.4L14.4,21.4Z" fill="#ef9a35" ${LINE}/>
<path d="M27.6,27.8L24,32.8L20.6,25.2Z" fill="#e8892a" ${LINE}/>
<path d="M57.6,20.2C56.8,13.6 50.6,9 40.6,8.4C30.6,8 20.6,11 13.4,16.4L13.4,21.8C20.6,27 30.6,30.2 40.6,29.8C50.6,29.4 56.8,26 57.6,20.2Z" fill="#f6a928" ${LINE}/>
<path d="M57.2,22.6C53.4,27.4 47,29.6 40.6,29.8C30.6,30.2 20.6,27 13.6,21.8C27,25 45,25.4 57.2,22.6Z" fill="#ffd773"/>
<path d="M57.4,17.6C54.4,11.6 47,8.8 40.6,8.4C30.6,8 20.6,11 13.6,16.4C27,12.8 46,13 57.4,17.6Z" fill="#dc7a1c"/>
${scales(34, 19.2, 19, 10.4, '#a8530b')}
<path d="M48.2,11.6C45.2,15.8 45.2,23.2 48.2,27.6" fill="none" ${LINE}/>
<path d="M45.6,21.4C42,22 39,24 37.6,26.4C41.4,26 44.4,24.4 45.8,22.4Z" fill="#e8892a" ${LINE}/>
<path d="M42.6,28.8L39,33.4L37.2,29.6Z" fill="#e8892a" ${LINE}/>
<path d="M57.6,21Q56,22.4 54,22" fill="none" ${LINE}/>
<path d="M56.6,22C57.6,23.8 57.2,25.4 55.6,26.2M55,22.2C55.4,23.6 54.8,24.6 53.6,25" fill="none" stroke="#8a420a" stroke-width="1" stroke-linecap="round"/>
${eye(51.8, 16.6, 2.2, '#fff0b8')}`,

  // Udang: curled pink-orange abdomen with segments, carapace + serrated rostrum, tail fan, legs, long antennae.
  udang: `
<g fill="none" stroke="#b5432c" stroke-width=".9" stroke-linecap="round">
<path d="M53.4,12.2C44,2.4 24,0.8 4,6.2"/><path d="M53.8,12.8C46,5.4 34,4.4 22,9"/><path d="M56,13.6l6,-3.4M56.4,14.2l6.6,-.6"/></g>
<g stroke="#c4553a" stroke-width="1.2" stroke-linecap="round">
<path d="M42,20.4l-1,5.4M45,21l-.6,5.6M48,21l0,5.2M51,20.4l.6,4.8M26,18.8l-2.4,3.6M30.4,19.6l-1.6,3.8M34.6,20.2l-.8,3.8M21.6,21l-3,2.6"/></g>
<path d="M16.2,26.4L8.4,32.6L13.6,32L15.8,34.6L17.8,31.6L21.4,33.2L20,27.4Z" fill="#f47d5a" ${LINE}/>
<path d="M39.6,11C30,8.2 19,10.2 13.6,18C11.4,21.6 12.6,25.6 16,28.2L20.2,27.6C18.4,24.8 19.2,21 22.8,19.4C27.6,17.4 33.4,18.6 38,21Z" fill="#ff9a76" ${LINE}/>
<path d="M38.8,20.4C33.6,18 27.6,17.2 22.8,19.4C19.4,21 18.4,24.6 20.2,27.6L17.6,27.8C16,24.4 17.4,20.6 21.6,18.4C26.8,15.8 33,16.6 39,19Z" fill="#ffc6a6"/>
<path d="M33.8,9.6L31.6,18.2M27.6,9.4L26.6,17.6M21.8,11.2L22,18.2M16.8,15L18.6,20.4M14,20.2L17.6,23" fill="none" stroke="#c4553a" stroke-width="1.1" stroke-linecap="round"/>
<path d="M56.6,15.2C56,10.8 49,9 39.2,10.6L37.4,20.6C43.2,22.4 52,21.8 56.2,18Z" fill="#ff8a63" ${LINE}/>
<path d="M54.6,12.6L63.4,9.6L61,11.4L62.4,11.6L57,14.4Z" fill="#f47d5a" ${LINE}/>
<path d="M44.6,11.2C46,14.4 46,17.6 44.6,20.8" fill="none" stroke="#c4553a" stroke-width="1" stroke-linecap="round"/>
<path d="M53.4,13.6l1.4,-1.6" stroke="#1e2529" stroke-width="1.3" stroke-linecap="round"/>
<circle cx="55.2" cy="11.6" r="1.5" fill="#111"/><circle cx="55.6" cy="11.1" r=".45" fill="#fff"/>`,

  // Salmon: steel-blue spotted back, pink-orange flank, silver belly, adipose fin, forked tail.
  salmon: `
<path d="M41,11.2L35.6,5.2C32.6,5.4 29.6,7.6 28.4,11.8Z" fill="#56778f" ${LINE}/>
<path d="M21.6,13.6C21,10.4 17.6,10.2 16.6,14.6Z" fill="#56778f" ${LINE}/>
<path d="M12.4,17.6L2.6,9.8C4.8,14.6 5.8,16.8 6.8,19.2C5.8,21.6 4.8,23.8 2.6,28.6L12.4,20.8Z" fill="#5f8199" ${LINE}/>
<path d="M25,26.2L20.4,30.6L18.6,24.8Z" fill="#c9cfd2" ${LINE}/>
<path d="M60.4,19.2C58.6,14 50.6,10.8 38.4,10.6C26.4,10.4 17.4,13.4 11.4,17.2L11.4,21.2C17.4,25 26.4,27.6 38.4,27.6C50.6,27.6 58.6,24.4 60.4,19.2Z" fill="#e9eef0" ${LINE}/>
<path d="M60.2,19.8C50,17.2 30,16.8 11.6,18.6L11.6,21.6C24,24.4 46,25 58.4,22.8Z" fill="#fbd3c3"/>
<path d="M60.2,19.6C50,18.4 30,17.6 11.6,19.4L11.6,21C24,22.6 46,23.2 58.8,21.8Z" fill="#f59b80"/>
<path d="M60.2,18.6C58.2,13.8 50.4,10.8 38.4,10.6C26.4,10.4 17.4,13.4 11.6,17.2L11.6,19C22,16.8 32,16.4 42,16.8C50,17.2 56,17.8 60.2,18.6Z" fill="#4d6f88"/>
<path d="M60.4,19.2C58.6,14 50.6,10.8 38.4,10.6C26.4,10.4 17.4,13.4 11.4,17.2L11.4,21.2C17.4,25 26.4,27.6 38.4,27.6C50.6,27.6 58.6,24.4 60.4,19.2Z" fill="none" ${LINE}/>
<path d="M49.6,12.8C46.8,16.4 46.8,21.6 49.6,25.2" fill="none" ${LINE}/>
<path d="M47,21.6C44,23.4 41.4,24.6 39.4,24.8C41.2,23 43.8,21.6 47,21Z" fill="#c9cfd2" ${LINE}/>
<path d="M35.2,27.4L32,31.4L30.2,27.2Z" fill="#c9cfd2" ${LINE}/>
<path d="M60.2,19.4Q57,20.8 53.6,20.2" fill="none" ${LINE}/>
<g fill="#1a2228"><circle cx="22" cy="15.4" r=".85"/><circle cx="26.6" cy="13.8" r=".85"/><circle cx="31.4" cy="13.6" r=".9"/>
<circle cx="36" cy="12.8" r=".9"/><circle cx="41" cy="13.4" r=".85"/><circle cx="45.6" cy="12.8" r=".8"/><circle cx="29" cy="16.2" r=".75"/>
<circle cx="38.6" cy="15.6" r=".75"/><circle cx="34.2" cy="8.6" r=".7"/><circle cx="6.4" cy="14" r=".75"/><circle cx="8.6" cy="17" r=".7"/>
<circle cx="6.2" cy="24.4" r=".75"/><circle cx="18.8" cy="12.8" r=".55"/></g>
${eye(54, 16.4, 1.7, '#dfe6ea')}`,
};

const KEY = { lele: 'lele', ikan_lele: 'lele', nila: 'nila', ikan_nila: 'nila', mas: 'mas', ikan_mas: 'mas', udang: 'udang', salmon: 'salmon' };

/** Species key of a pond def / fish product (object or id), or null. */
export const fishKey = (x) => KEY[typeof x === 'string' ? x : x?.id] ?? null;

/** <span class="fish-art fish-<key>"><svg…></span>; size it with CSS (width; height follows the 64:36 ratio). */
export function fishArt(key, label) {
  const svg = `<svg viewBox="0 0 64 36" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">${ART[key]}</svg>`;
  return h(`span.fish-art.fish-${key}`, label ? { role: 'img', 'aria-label': label, html: svg } : { html: svg });
}

/** Icon for any product / pond / item: fish art for the five species, otherwise its text emoji. */
export function iconOf(item) {
  const k = fishKey(item);
  return k ? fishArt(k, item?.name) : item?.emoji ?? '';
}
