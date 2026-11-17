// 📰 Kabar Desa dilemma types (part 1). make(game, r) → null when not relevant, else {ctx, text, options, def};
// options [{id, label, desc, cost}] are frozen at creation (concrete costs/odds); apply(game, ctx, optionId, r) →
// {text, good: true|false|null}. All numbers scale with S (kabarCore.scale) and recent XP; losses are capped.
import { round2 } from './rng.js';
import { fmt, draw, pctText, daysCash, xpReward, pay, herds, loseHeads, lossCap, growingIn, busiestRegion, damage,
  richestStock, takeStock, unitQty, effect } from './kabarCore.js';
import { projectPerk } from './projects.js';

const POULTRY = new Set(['chickens', 'ducks']);
const opt = (id, label, desc, cost = 0) => ({ id, label, desc, cost });

export const TYPES_A = [
  { id: 'flu_burung', emoji: '🐔', title: 'Flu burung di desa sebelah', weight: 3,
    make(game) {
      const x = herds(game, (d) => POULTRY.has(d.id) || d.product === 'eggs', 50)[0];
      if (!x) return null;
      const ctx = { animalId: x.id, full: daysCash(game, 0.25), part: daysCash(game, 0.08) };
      return { ctx, def: 'sebagian', text: `Dinas peternakan melaporkan flu burung dekat kandang ${x.def.name} (${x.h.count} ekor). Vaksinasi sekarang?`,
        options: [opt('vaksin', `💉 Vaksin semua (${fmt(ctx.full)})`, 'Aman 100%, unggas sehat: produksi ternak +5% selama 6 hari.', ctx.full),
          opt('sebagian', `🧴 Vaksin kandang terdekat (${fmt(ctx.part)})`, 'Aman, tanpa bonus.', ctx.part),
          opt('biarkan', '🤞 Biarkan', 'Gratis. Peluang 55% kehilangan 30% unggas dan produksi ternak −20% selama 5 hari.')] };
    },
    apply(game, ctx, o, r) {
      if (o === 'vaksin') {
        effect(game, 'flu', 'animalProd', 1.05, 6, 'Unggas Sehat', '💉', 'produksi ternak +5%');
        return { text: 'Semua unggas divaksin: produksi ternak +5% selama 6 hari.', good: true };
      }
      if (o === 'sebagian') return { text: 'Kandang terdekat divaksin. Flu tidak masuk.', good: null };
      if (draw(r) >= 0.55) return { text: 'Flu burung tidak sampai ke kandangmu. Untung!', good: true };
      const n = loseHeads(game, ctx.animalId, 0.3, lossCap(game) * 2);
      effect(game, 'flu', 'animalProd', 0.8, 5, 'Flu Burung', '🤒', 'produksi ternak −20%');
      return { text: `Flu burung masuk: ${n} ekor mati, produksi ternak −20% 5 hari.`, good: false };
    } },

  { id: 'pengepul', emoji: '🚛', title: 'Pengepul cari hasil panen', weight: 3,
    make(game) {
      const s = richestStock(game, (p) => p.category === 'crop');
      if (!s || s.value < 0.1 * daysCash(game, 1)) return null;
      const qty = unitQty(s.p, s.qty * 0.6), price = round2((game.state.market[s.id] ?? s.p.basePrice) * 1.3);
      const ctx = { productId: s.id, qty, price, xp: xpReward(game, 0.08) };
      return { ctx, def: 'tolak', text: `Pengepul dari kota mau borong ${qty} ${s.p.unit} ${s.p.emoji} ${s.p.name} hari ini, harga pasar +30%.`,
        options: [opt('jual', `🤝 Jual (${fmt(qty * price)})`, `Dibayar ${fmt(price)}/${s.p.unit} · +${ctx.xp} XP.`),
          opt('tolak', '🙅 Tolak', 'Stok tetap di gudang.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'jual') return { text: 'Pengepul pergi ke desa lain.', good: null };
      const q = takeStock(game, ctx.productId, ctx.qty);
      if (!q) return { text: 'Stok sudah habis, pengepul kecewa.', good: false };
      const v = round2(q * ctx.price);
      game.earn(v, 'penjualan_panen');
      game.addXp(ctx.xp);
      return { text: `Terjual ${q} ke pengepul: ${fmt(v)} (+${ctx.xp} XP).`, good: true };
    } },

  { id: 'banjir', emoji: '🌊', title: 'Banjir diprediksi', weight: 3,
    make(game) {
      const regionId = busiestRegion(game);
      if (!regionId) return null;
      const dam = projectPerk(game, 'damStage', regionId), odds = round2(0.55 * (1 - 0.25 * dam));
      const ctx = { regionId, odds, cost: daysCash(game, 0.35) };
      const name = game.idx.regions.get(regionId).name;
      return { ctx, def: 'panen_dini', text: `BMKG: hujan ekstrem minggu ini di ${name} (${growingIn(game, regionId).length} ladang sedang tumbuh)${dam ? ` — bendunganmu menahan sebagian air` : ''}.`,
        options: [opt('tanggul', `🧱 Tanggul darurat (${fmt(ctx.cost)})`, 'Ladang aman.', ctx.cost),
          opt('panen_dini', '🌾 Panen dini', 'Tanaman ≥ 50% tumbuh langsung siap panen (hasil −15%); yang muda rusak 10%.'),
          opt('nekat', '🎲 Nekat', `Peluang banjir ${pctText(odds)}: hasil −40% di wilayah ini.`)] };
    },
    apply(game, ctx, o, r) {
      const fields = growingIn(game, ctx.regionId);
      if (o === 'tanggul') return { text: 'Tanggul berdiri, air lewat tanpa merusak.', good: true };
      if (o === 'panen_dini') {
        let early = 0;
        for (const [id, f] of fields) {
          const crop = game.idx.crops.get(f.cropId), need = (crop?.growDays ?? 5) * 24;
          if (f.growHours >= 0.5 * need) { f.growHours = need; f.damage = round2((f.damage ?? 1) * 0.85); early++; } else damage([[id, f]], 0.9);
        }
        return { text: `${early} ladang dipanen dini (−15%), ${fields.length - early} ladang muda rusak 10%.`, good: null };
      }
      if (draw(r) >= ctx.odds) return { text: 'Banjir tidak datang. Taruhanmu berhasil!', good: true };
      return { text: `Banjir! ${damage(fields, 0.6)} ladang kehilangan 40% hasil.`, good: false };
    } },

  { id: 'pinjam_traktor', emoji: '🚜', title: 'Tetangga pinjam traktor', weight: 2, minLevel: 4,
    make(game) {
      const tr = game.state.machines.filter((m) => game.idx.machines.get(m.defId)?.type === 'tractor' && !m.busy);
      if (game.state.machines.filter((m) => game.idx.machines.get(m.defId)?.type === 'tractor').length < 2 || !tr.length) return null;
      const m = tr.sort((a, b) => (game.idx.machines.get(b.defId).hp ?? 0) - (game.idx.machines.get(a.defId).hp ?? 0))[0];
      const ctx = { uid: m.uid, wear: 0.15, n: 3, pct: 0.1, xp: xpReward(game, 0.05) };
      return { ctx, def: 'tolak', text: `Pak RT meminjam ${game.idx.machines.get(m.defId).name} untuk sawah warga beberapa hari.`,
        options: [opt('pinjamkan', '🤝 Pinjamkan', `Kondisi mesin −15%. Reputasi: ${ctx.n} kontrak berikutnya +10% · +${ctx.xp} XP.`),
          opt('tolak', '🙅 Tolak halus', 'Tidak ada perubahan.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'pinjamkan') return { text: 'Pak RT mengerti. Tidak ada yang berubah.', good: null };
      const m = game.state.machines.find((x) => x.uid === ctx.uid);
      if (m) m.condition = round2(Math.max(0.1, (m.condition ?? 1) - ctx.wear));
      const k = game.state.kabar;
      k.rep = { left: Math.max(k.rep?.left || 0, ctx.n), pct: Math.max(k.rep?.pct || 0, ctx.pct) };
      game.addXp(ctx.xp);
      return { text: `Warga berterima kasih: ${ctx.n} kontrak berikutnya +10% (+${ctx.xp} XP).`, good: true };
    } },
];
