// 📰 Kabar Desa dilemma types (part 3): fertilizer price, wages, export order (Pelabuhan), extension officer, agro-tourism.
import { round2 } from './rng.js';
import { fmt, daysCash, xpReward, richestStock, takeStock, unitQty, effect } from './kabarCore.js';
import { projectPerk } from './projects.js';
import { totalWages } from './workers.js';

const opt = (id, label, desc, cost = 0) => ({ id, label, desc, cost });

export const TYPES_C = [
  { id: 'pupuk', emoji: '🧪', title: 'Harga benih & pupuk akan naik', weight: 2,
    make(game) {
      if (Object.keys(game.state.fields).length < 3) return null;
      const ctx = { cost: daysCash(game, 0.3) };
      return { ctx, def: 'nanti', text: 'Distributor bilang harga benih naik pekan depan. Borong stok sekarang?',
        options: [opt('stok', `📦 Borong sekarang (${fmt(ctx.cost)})`, 'Biaya benih −20% selama 10 hari.', ctx.cost),
          opt('nanti', '⏳ Beli nanti', 'Gratis sekarang, biaya benih +25% selama 6 hari.')] };
    },
    apply(game, ctx, o) {
      if (o === 'stok') { effect(game, 'pupuk', 'seedCost', 0.8, 10, 'Stok Benih', '📦', 'benih −20%'); return { text: 'Gudang penuh benih murah: −20% selama 10 hari.', good: true }; }
      effect(game, 'pupuk', 'seedCost', 1.25, 6, 'Benih Mahal', '💸', 'benih +25%');
      return { text: 'Harga naik: benih +25% selama 6 hari.', good: false };
    } },

  { id: 'gaji', emoji: '👷', title: 'Pekerja minta naik gaji', weight: 2,
    make(game) {
      if ((game.state.workers || []).length < 4) return null;
      const bill = totalWages(game), ctx = { raise: 0.06, bonus: round2(bill * 2) };
      return { ctx, def: 'bonus', text: `${game.state.workers.length} pekerja minta gaji naik 6% (tagihan sekarang ${fmt(bill)}/hari).`,
        options: [opt('naik', '✅ Naikkan 6%', 'Gaji naik permanen. Semangat: tugas ladang +15% lebih cepat 10 hari.'),
          opt('bonus', `🎁 Bonus sekali (${fmt(ctx.bonus)})`, 'Dua hari gaji sebagai bonus, tidak ada efek lain.', ctx.bonus),
          opt('tolak', '🙅 Tolak', 'Pekerja kecewa: tugas ladang 15% lebih lambat selama 8 hari.')] };
    },
    apply(game, ctx, o) {
      if (o === 'naik') {
        for (const w of game.state.workers) w.wage = round2(w.wage * (1 + ctx.raise));
        effect(game, 'gaji', 'taskSpeed', 1.15, 10, 'Pekerja Semangat', '💪', 'tugas ladang 15% lebih cepat');
        return { text: 'Gaji naik 6%. Pekerja semangat: tugas +15% lebih cepat 10 hari.', good: true };
      }
      if (o === 'bonus') return { text: 'Bonus dibagikan. Pekerja cukup puas.', good: null };
      effect(game, 'gaji', 'taskSpeed', 0.85, 8, 'Pekerja Kecewa', '😒', 'tugas ladang 15% lebih lambat');
      return { text: 'Pekerja kecewa: tugas ladang 15% lebih lambat 8 hari.', good: false };
    } },

  { id: 'ekspor', emoji: '⚓', title: 'Pesanan ekspor besar', weight: 3,
    make(game) {
      const owned = new Set(Object.keys(game.state.fields).map((id) => game.idx.regions.get(game.idx.fields.get(id)?.regionId)?.continent));
      if (![...owned].some((c) => c && projectPerk(game, 'portStage', c) >= 2)) return null;
      const s = richestStock(game);
      if (!s) return null;
      const qty = unitQty(s.p, s.qty * 0.8), price = round2((game.state.market[s.id] ?? s.p.basePrice) * 1.4);
      if (!(qty > 0)) return null;
      const ctx = { productId: s.id, qty, price, xp: xpReward(game, 0.15) };
      return { ctx, def: 'tolak', text: `Kapal di Pelabuhan Ekspormu mencari ${qty} ${s.p.unit} ${s.p.emoji} ${s.p.name}, harga pasar +40%.`,
        options: [opt('kirim', `🚢 Kirim (${fmt(qty * price)})`, `+${ctx.xp} XP.`), opt('tolak', '🙅 Tolak', 'Stok tetap di gudang.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'kirim') return { text: 'Kapal berlayar tanpa muatanmu.', good: null };
      const q = takeStock(game, ctx.productId, ctx.qty);
      if (!q) return { text: 'Stok sudah habis.', good: false };
      const v = round2(q * ctx.price), cat = game.idx.products.get(ctx.productId)?.category;
      game.earn(v, cat === 'animal' ? 'penjualan_ternak_produk' : cat === 'processed' ? 'penjualan_olahan' : 'penjualan_panen');
      game.addXp(ctx.xp);
      return { text: `Ekspor berangkat: ${fmt(v)} (+${ctx.xp} XP).`, good: true };
    } },

  { id: 'penyuluh', emoji: '👩‍🏫', title: 'Penyuluh pertanian datang', weight: 2, minLevel: 5,
    make(game) {
      if (Object.keys(game.state.fields).length < 5) return null;
      const ctx = { cost: daysCash(game, 0.2) };
      return { ctx, def: 'lewati', text: 'Dinas pertanian menawarkan pelatihan pupuk berimbang untuk pekerjamu.',
        options: [opt('ikut', `📚 Ikut pelatihan (${fmt(ctx.cost)})`, 'Hasil panen +8% selama 8 hari.', ctx.cost),
          opt('lewati', '🙅 Lewati', 'Tidak ada perubahan.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'ikut') return { text: 'Pelatihan dilewatkan.', good: null };
      effect(game, 'penyuluh', 'yield', 1.08, 8, 'Ilmu Penyuluh', '📚', 'hasil panen +8%');
      return { text: 'Pekerja lebih paham pupuk: hasil panen +8% selama 8 hari.', good: true };
    } },

  { id: 'wisata', emoji: '📸', title: 'Rombongan agrowisata', weight: 2, minLevel: 6,
    make(game) {
      const orchards = Object.values(game.state.fields).some((f) => f.state === 'orchard' || f.orchard);
      const animals = Object.values(game.state.animals || {}).some((h) => h.count >= 10);
      if (!orchards && !animals) return null;
      const ctx = { cash: daysCash(game, 0.4), xp: xpReward(game, 0.1) };
      return { ctx, def: 'tolak', text: `Sekolah kota ingin karyawisata ke ${orchards ? 'kebun buahmu' : 'kandangmu'}.`,
        options: [opt('buka', `🎟️ Terima (${fmt(ctx.cash)})`, `+${ctx.xp} XP, tapi tugas ladang 8% lebih lambat 3 hari.`),
          opt('tolak', '🙅 Tolak', 'Ladang tetap tenang.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'buka') return { text: 'Rombongan pergi ke peternakan lain.', good: null };
      game.earn(ctx.cash, 'lainnya_masuk');
      game.addXp(ctx.xp);
      effect(game, 'wisata', 'taskSpeed', 0.92, 3, 'Ramai Pengunjung', '📸', 'tugas ladang 8% lebih lambat');
      return { text: `Tiket terjual ${fmt(ctx.cash)} (+${ctx.xp} XP).`, good: true };
    } },
];
