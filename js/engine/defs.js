// Static-data lookups. Engine never hardcodes ids; everything goes through here.

export function indexData(data) {
  const byId = (arr) => new Map((arr || []).map((x) => [x.id, x]));
  return {
    crops: byId(data.CROPS),
    products: byId(data.PRODUCTS),
    machines: byId(data.MACHINES),
    animals: byId(data.ANIMALS),
    regions: byId(data.REGIONS),
    fields: byId(data.FIELDS),
    achievements: byId(data.ACHIEVEMENTS),
  };
}

/** Level a field opens at: max of its own and its region's `unlockLevel` (default 1). */
export function fieldUnlockLevel(data, def) {
  const region = (data.REGIONS || []).find((r) => r.id === def.regionId);
  return Math.max(def.unlockLevel ?? 1, region?.unlockLevel ?? 1);
}

export const TASKS = ['plow', 'fertilize', 'seed', 'irrigate', 'harvest', 'lime'];

export const TASK_NAMES = {
  plow: 'Membajak',
  fertilize: 'Memupuk',
  seed: 'Menanam',
  irrigate: 'Mengairi',
  harvest: 'Memanen',
  lime: 'Mengapur',
};

const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
/** Money for engine messages: "$1.234" (id-ID grouping, matches the UI). */
export const fmtMoney = (v) => `${v < 0 ? '-' : ''}$${nf0.format(Math.abs(Math.round(Number(v) || 0)))}`;
/** Plain number for engine messages: "38,91" (id-ID, ≤2 decimals). */
export const fmtNum = (v) => nf2.format(Number(v) || 0);
