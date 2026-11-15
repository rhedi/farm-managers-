// Money flows: fields, machines, products, loans; XP/levels; achievements.
import { round2 } from './rng.js';
import { fmtMoney, fmtNum, fieldUnlockLevel } from './defs.js';
import { newFieldState } from './fields.js';
import { conditionOf } from './wear.js';
import { upgradeSpent, emptyUpgrades, cfg as upgradeCfg } from './upgrades.js';
import { saleCategory } from './ledger.js';
import { perk } from './research.js';

export const FIELD_REFUND = 0.7;
export const MACHINE_REFUND = 0.6;
export const LOAN_CAP_PER_LEVEL = 25000;
/** Default daily loan rate; `BALANCE.loanDailyRate` overrides it. Research perk 'interest' lowers it. */
export const LOAN_DAILY_RATE = 0.002;
export const loanRate = (game) => (game.data.BALANCE.loanDailyRate ?? LOAN_DAILY_RATE) * (1 - perk(game, 'interest'));

/** Resale value (unrounded): (60% of price + resale share of upgrade spend) × condition. */
export function machineResale(game, m) {
  const price = game.idx.machines.get(m.defId)?.price ?? 0;
  return (price * MACHINE_REFUND + upgradeCfg(game).resale * upgradeSpent(game, m)) * conditionOf(m);
}

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (reason) => ({ ok: false, reason });

/** Recompute the derived count stats (fields, machines, models, animals, livestock, level). */
export function syncCounts(game) {
  const s = game.state;
  s.stats.fieldsOwned = Object.keys(s.fields).length;
  s.stats.machinesOwned = s.machines.length;
  s.stats.machineModels = new Set(s.machines.map((m) => m.defId)).size;
  let animals = 0, livestock = 0;
  for (const [id, h] of Object.entries(s.animals)) {
    animals += h.count;
    if (game.idx.animals.get(id)?.livestock) livestock += h.count;
  }
  s.stats.animalsOwned = animals;
  s.stats.livestockOwned = livestock;
  s.stats.regionsOwned = new Set(Object.keys(s.fields).map((id) => game.idx.fields.get(id)?.regionId)).size;
  s.stats.level = s.level;
}

export function buyField(game, fieldId) {
  const def = game.idx.fields.get(fieldId);
  if (!def) return fail('Ladang tidak ditemukan.');
  if (game.state.fields[fieldId]) return fail('Ladang sudah dimiliki.');
  const need = fieldUnlockLevel(game.data, def);
  if (game.state.level < need) return fail(`Ladang ini terkunci sampai level ${need}.`);
  if (!game.spend(def.price, 'beli_ladang')) return fail('Uang tidak cukup.');
  game.state.fields[fieldId] = newFieldState(def);
  game.emit('field_bought', `${def.name} dibeli (${fmtNum(def.sizeHa)} ha).`, { fieldId });
  syncCounts(game);
  game.checkAchievements();
  return ok();
}

export function sellField(game, fieldId) {
  const def = game.idx.fields.get(fieldId);
  const f = game.state.fields[fieldId];
  if (!def || !f) return fail('Kamu tidak memiliki ladang ini.');
  if (f.busy || f.state !== 'idle') return fail('Ladang hanya bisa dijual saat kosong.');
  if (Object.keys(game.state.fields).length <= 1) return fail('Tidak bisa menjual ladang terakhir.');
  const value = round2(def.price * FIELD_REFUND + (f.greenhouse?.cost ?? 0) * (game.data.BALANCE.greenhouse?.refund ?? 0.3)); // + rumah kaca refund
  delete game.state.fields[fieldId];
  game.earn(value, 'penjualan_aset', { stat: false });
  syncCounts(game);
  return ok({ refund: value });
}

export function buyMachine(game, machineDefId) {
  const def = game.idx.machines.get(machineDefId);
  if (!def) return fail('Mesin tidak ditemukan.');
  if (def.unlockLevel > game.state.level) return fail(`${def.name} terbuka di level ${def.unlockLevel}.`);
  if (!game.spend(def.price, 'beli_mesin')) return fail('Uang tidak cukup.');
  const uid = addMachine(game, machineDefId);
  game.emit('machine_bought', `${def.name} masuk garasi.`, { uid });
  game.checkAchievements();
  return ok({ uid });
}

export function addMachine(game, defId) {
  const uid = `m${game.state.nextUid++}`;
  game.state.machines.push({ uid, defId, busy: false, condition: 1, upgrades: emptyUpgrades() });
  syncCounts(game);
  return uid;
}

export function sellMachine(game, uid) {
  const i = game.state.machines.findIndex((m) => m.uid === uid);
  if (i < 0) return fail('Mesin tidak ditemukan.');
  const m = game.state.machines[i];
  if (m.busy) return fail('Mesin sedang dipakai.');
  const value = round2(machineResale(game, m));
  game.state.machines.splice(i, 1);
  game.earn(value, 'penjualan_aset', { stat: false });
  syncCounts(game);
  return ok({ refund: value });
}

/** Stock that may be sold: silo minus the feed reserve (unless ignored). */
export function sellableStock(game, productId, ignoreReserve = false) {
  const stock = game.state.silo[productId] || 0;
  const reserve = ignoreReserve ? 0 : (game.state.feedReserve?.[productId] || 0);
  return Math.max(0, round2(stock - reserve));
}

/** Sell at market. `qty` omitted = all sellable stock. opts: { ignoreReserve, quiet } */
export function sellProduct(game, productId, qty, opts = {}) {
  const p = game.idx.products.get(productId);
  const stock = game.state.silo[productId] || 0;
  if (!p) return fail('Produk tidak ditemukan.');
  const avail = Math.min(stock, sellableStock(game, productId, opts.ignoreReserve));
  if (qty == null && stock > 0 && avail <= 0) return fail(`Stok ${p.name} dicadangkan untuk pakan.`);
  qty = qty == null ? avail : Number(qty);
  if (!(qty > 0)) return fail('Jumlah tidak valid.');
  if (qty > stock + 1e-9) return fail('Stok tidak cukup.');
  if (qty > avail + 1e-9) return fail(`Stok tidak cukup: ${fmtNum(stock - avail)} ${p.unit} dicadangkan untuk pakan.`);
  const value = round2(qty * game.state.market[productId]);
  game.state.silo[productId] = round2(stock - qty);
  if (game.state.silo[productId] <= 0) delete game.state.silo[productId];
  const st = game.state.stats;
  st.productsSold = round2(st.productsSold + qty);
  st.salesValue = round2((st.salesValue || 0) + value);
  game.earn(value, saleCategory(game, productId));
  if (!opts.quiet) game.emit('sale', `Terjual ${fmtNum(qty)} ${p.unit} ${p.name} seharga ${fmtMoney(value)}.`, { productId, qty, value });
  game.checkAchievements();
  return ok({ earned: value, qty });
}

/** Keep `tons` of a crop in the silo for animal feed (0 removes the reserve). */
export function setFeedReserve(game, cropId, tons) {
  if (!game.idx.crops.has(cropId)) return fail('Tanaman tidak ditemukan.');
  const t = round2(Number(tons));
  if (!(t >= 0)) return fail('Jumlah tidak valid.');
  const r = (game.state.feedReserve ||= {});
  if (t === 0) delete r[cropId];
  else r[cropId] = t;
  return ok({ reserve: t });
}

export const loanCap = (game) => game.state.level * LOAN_CAP_PER_LEVEL;

export function takeLoan(game, amount) {
  amount = round2(Number(amount));
  if (!(amount > 0)) return fail('Jumlah tidak valid.');
  if (game.state.loan + amount > loanCap(game)) return fail(`Batas pinjaman ${fmtMoney(loanCap(game))}.`);
  game.state.loan = round2(game.state.loan + amount);
  game.earn(amount, 'pinjaman_masuk');
  return ok({ loan: game.state.loan });
}

/** Repay `amount`; omitted = as much as possible (min of loan and money). */
export function repayLoan(game, amount) {
  const s = game.state;
  if (!(s.loan > 0)) return fail('Tidak ada pinjaman untuk dibayar.');
  amount = round2(Math.min(amount == null ? Math.min(s.loan, s.money) : Number(amount), s.loan));
  if (!(amount > 0)) return fail(s.money > 0 ? 'Jumlah tidak valid.' : 'Uang tidak cukup.');
  if (amount > s.money + 1e-9) return fail('Uang tidak cukup.');
  game.spend(amount, 'pelunasan_pinjaman');
  s.loan = round2(s.loan - amount);
  return ok({ loan: s.loan, paid: amount });
}

export function chargeInterest(game) {
  const s = game.state;
  if (s.loan <= 0) return;
  const interest = round2(s.loan * loanRate(game));
  // Unpaid interest is capitalised: booked as borrowed (pinjaman_masuk) and paid, so money is unchanged.
  if (s.money < interest) {
    s.loan = round2(s.loan + interest);
    game.earn(interest, 'pinjaman_masuk');
  }
  game.spend(interest, 'bunga_pinjaman', { stat: false });
}

/** money + 0.7·land + machine resale (0.6·price + 0.5·upgrades)·condition + silo at market + 0.6·animals + 0.6·factories (price + upgrades paid) − loan. */
export function netWorth(game) {
  const s = game.state, idx = game.idx;
  let v = s.money - s.loan;
  for (const id of Object.keys(s.fields)) v += FIELD_REFUND * (idx.fields.get(id)?.price ?? 0)
    + (s.fields[id].greenhouse?.cost ?? 0) * (game.data.BALANCE.greenhouse?.refund ?? 0.3); // rumah kaca at removal value
  for (const m of s.machines) v += machineResale(game, m);
  for (const [id, q] of Object.entries(s.silo)) v += q * (s.market[id] ?? 0);
  for (const t of s.shipments || []) { // truck cargo on its way to a city (logistics.js), at market
    if (!t.sold) for (const [id, q] of Object.entries(t.cargo)) v += q * (s.market[id] ?? 0);
  }
  for (const [id, h] of Object.entries(s.animals)) v += 0.6 * h.count * (idx.animals.get(id)?.price ?? 0);
  for (const [id, f] of Object.entries(s.factories || {})) {
    const def = (game.data.FACTORIES || []).find((x) => x.id === id);
    const lvl = f?.level || 0;
    if (def && lvl > 0) v += 0.6 * ((def.price || 0) + (def.upgradeCost || 0) * (lvl * (lvl - 1)) / 2);
  }
  return round2(v);
}

export function levelForXp(levels, xp) {
  let lvl = 1;
  for (let i = 0; i < levels.length; i++) if (xp >= levels[i]) lvl = i + 1;
  return lvl;
}

/** Content whose unlockLevel lies in (from, to]. Fields use their effective level (own or region). */
export function unlocksBetween(data, from, to) {
  const inRange = (lvl) => lvl > from && lvl <= to;
  const pick = (arr) => (arr || []).filter((x) => inRange(x.unlockLevel)).map((x) => x.id);
  return { crops: [...pick(data.CROPS), ...pick(data.TREES)], machines: pick(data.MACHINES), animals: pick(data.ANIMALS),
    fields: (data.FIELDS || []).filter((f) => inRange(fieldUnlockLevel(data, f))).map((f) => f.id),
    regions: pick(data.REGIONS), factories: pick(data.FACTORIES ?? []) };
}

/** Money paid for reaching `level`: `BALANCE.levelReward` × level. */
export const levelReward = (data, level) => (data.BALANCE.levelReward ?? 1000) * level;

export function addXp(game, n) {
  const s = game.state;
  s.xp = round2(s.xp + n);
  const lvl = levelForXp(game.data.LEVELS, s.xp);
  if (lvl > s.level) {
    const unlocks = unlocksBetween(game.data, s.level, lvl);
    let reward = 0;
    for (let l = s.level + 1; l <= lvl; l++) reward += levelReward(game.data, l);
    const researchPoints = lvl - s.level; // 1 research point per level-up (research.js)
    s.level = lvl;
    game.earn(reward, 'hadiah', { stat: false });
    const n = Object.values(unlocks).reduce((sum, ids) => sum + ids.length, 0);
    const msg = `⭐ Naik ke level ${lvl}! Hadiah ${fmtMoney(reward)}, +${researchPoints} poin riset${n ? `, ${n} konten baru terbuka` : ''}.`;
    game.emit('level_up', msg, { level: lvl, unlocks, reward, researchPoints });
  }
  syncCounts(game);
  game.checkAchievements();
}

export function checkAchievements(game) {
  const s = game.state;
  const unlocked = [];
  for (const a of game.data.ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    if ((s.stats[a.condition.stat] ?? 0) < a.condition.gte) continue;
    s.achievements.push(a.id);
    game.earn(a.reward || 0, 'hadiah', { stat: false });
    unlocked.push(a.id);
    game.emit('achievement', `🏆 Pencapaian: ${a.name}! Hadiah ${fmtMoney(a.reward || 0)}.`, { achievementId: a.id });
  }
  return unlocked;
}
