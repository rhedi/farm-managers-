// WP3 quantity formatter: tons below 1 t shown in kg so small stocks never read as "0 t".
const nf = (d) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d });
const nf0 = nf(0), nf1 = nf(1), nf2 = nf(2);

export function fmtAmt(v, unit = 't') {
  const n = Number(v) || 0;
  if (unit !== 't') return `${nf0.format(n)} ${unit}`;
  if (n > 0 && n < 1) return `${nf0.format(Math.max(1, Math.round(n * 1000)))} kg`;
  return `${(n < 10 ? nf2 : nf1).format(n)} t`;
}
