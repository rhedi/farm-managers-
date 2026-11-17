// 📰 Kabar Desa dilemma types (part 2): ponds, investor, festival, theft, drought, fertilizer price, wages.
import { round2 } from './rng.js';
import { fmt, draw, pctText, daysCash, xpReward, herds, loseHeads, lossCap, growingIn, damage,
  richestStock, takeStock, unitQty, effect } from './kabarCore.js';
import { projectPerk } from './projects.js';

const opt = (id, label, desc, cost = 0) => ({ id, label, desc, cost });

export const TYPES_B = [
  { id: 'wabah_ikan', emoji: '🐟', title: 'Ikan mati mendadak', weight: 2,
    make(game) {
      const p = (game.state.ponds || []).filter((x) => x.count > 0).sort((a, b) => b.count - a.count)[0];
      if (!p) return null;
      const def = game.idx.ponds.get(p.pondId), ctx = { uid: p.uid, kuras: daysCash(game, 0.15), obat: daysCash(game, 0.05) };
      return { ctx, def: 'obat', text: `Beberapa ikan di ${def?.name ?? 'kolam'} (${p.count} ekor) mengambang. Ada wabah di kolam?`,
        options: [opt('kuras', `🚿 Kuras kolam (${fmt(ctx.kuras)})`, 'Tidak ada ikan mati dan air kolam jernih 100%.', ctx.kuras),
          opt('obat', `💊 Beri obat (${fmt(ctx.obat)})`, 'Tidak ada ikan mati.', ctx.obat),
          opt('biarkan', '🤞 Biarkan', 'Gratis. Peluang 50% kehilangan 40% ikan.')] };
    },
    apply(game, ctx, o, r) {
      const p = (game.state.ponds || []).find((x) => x.uid === ctx.uid);
      if (!p || !p.count) return { text: 'Kolam sudah kosong.', good: null };
      if (o === 'kuras') { p.water = 100; return { text: 'Kolam dikuras: ikan selamat, air jernih kembali.', good: true }; }
      if (o === 'obat') return { text: 'Obat bekerja, ikan selamat.', good: null };
      if (draw(r) >= 0.5) return { text: 'Kolam pulih sendiri, tidak ada ikan yang mati.', good: true };
      const n = Math.floor(p.count * 0.4);
      p.count -= n;
      return { text: `${n} ikan mati.`, good: false };
    } },

  { id: 'investor', emoji: '💼', title: 'Investor tawarkan modal', weight: 2, minLevel: 8,
    make(game) {
      const ctx = { cash: daysCash(game, 2.5), pct: 0.08, days: 10 };
      return { ctx, def: 'tolak', text: `Investor kota menawarkan ${fmt(ctx.cash)} tunai, ditukar 8% pendapatan harianmu selama ${ctx.days} hari.`,
        options: [opt('terima', `✍️ Terima (${fmt(ctx.cash)})`, `Bagi hasil 8% pendapatan selama ${ctx.days} hari.`),
          opt('tolak', '🙅 Tolak', 'Tetap mandiri.')] };
    },
    apply(game, ctx, o) {
      if (o !== 'terima') return { text: 'Investor mencari peluang lain.', good: null };
      game.earn(ctx.cash, 'lainnya_masuk');
      game.state.kabar.share = { pct: ctx.pct, untilDay: game.day + ctx.days, paid: 0 };
      return { text: `Modal ${fmt(ctx.cash)} masuk. Bagi hasil 8% berjalan ${ctx.days} hari.`, good: true };
    } },

  { id: 'festival', emoji: '🎪', title: 'Festival panen kota', weight: 3,
    make(game) {
      const s = richestStock(game);
      if (!s || s.value < 0.05 * daysCash(game, 1)) return null;
      const price = game.state.market[s.id] ?? s.p.basePrice;
      const big = unitQty(s.p, Math.min(s.qty * 0.5, daysCash(game, 0.5) / Math.max(1e-9, price)));
      if (!(big > 0)) return null;
      const small = unitQty(s.p, big / 3);
      const ctx = { productId: s.id, big, small, xpBig: xpReward(game, 0.4), xpSmall: xpReward(game, 0.12) };
      return { ctx, def: 'tolak', text: `Panitia festival meminta ${s.p.emoji} ${s.p.name} untuk dipamerkan. Makin banyak, makin harum namamu.`,
        options: [opt('besar', `🏆 Kirim ${big} ${s.p.unit}`, `Senilai ${fmt(big * price)} · +${ctx.xpBig} XP.`),
          opt('kecil', `🎁 Kirim ${small} ${s.p.unit}`, `Senilai ${fmt(small * price)} · +${ctx.xpSmall} XP.`),
          opt('tolak', '🙅 Tidak ikut', 'Stok tetap utuh.')] };
    },
    apply(game, ctx, o) {
      if (o === 'tolak') return { text: 'Festival berjalan tanpa stanmu.', good: null };
      const want = o === 'besar' ? ctx.big : ctx.small, q = takeStock(game, ctx.productId, want);
      if (!q) return { text: 'Stok sudah habis, stanmu kosong.', good: false };
      const xp = Math.round((o === 'besar' ? ctx.xpBig : ctx.xpSmall) * Math.min(1, q / want));
      game.addXp(xp);
      return { text: `Stanmu jadi bintang festival! +${xp} XP.`, good: true };
    } },

  { id: 'pencurian', emoji: '🦹', title: 'Maling ternak berkeliaran', weight: 2,
    make(game) {
      const x = herds(game, (d) => !!d.livestock, 10)[0];
      if (!x) return null;
      const ctx = { animalId: x.id, pagar: daysCash(game, 0.3), ronda: daysCash(game, 0.08) };
      return { ctx, def: 'ronda', text: `Warga melapor maling ternak mengincar ${x.def.name} (${x.h.count} ekor).`,
        options: [opt('pagar', `🔒 Pasang pagar (${fmt(ctx.pagar)})`, 'Aman, ternak tenang: produksi ternak +5% selama 5 hari.', ctx.pagar),
          opt('ronda', `🔦 Ronda malam (${fmt(ctx.ronda)})`, 'Aman, tanpa bonus.', ctx.ronda),
          opt('biarkan', '🤞 Biarkan', 'Gratis. Peluang 50% kehilangan 15% ternak.')] };
    },
    apply(game, ctx, o, r) {
      if (o === 'pagar') {
        effect(game, 'maling', 'animalProd', 1.05, 5, 'Ternak Tenang', '🔒', 'produksi ternak +5%');
        return { text: 'Pagar baru berdiri, ternak tenang: produksi +5% selama 5 hari.', good: true };
      }
      if (o === 'ronda') return { text: 'Ronda malam berhasil, maling kabur.', good: null };
      if (draw(r) >= 0.5) return { text: 'Maling tidak datang ke kandangmu.', good: true };
      const n = loseHeads(game, ctx.animalId, 0.15, lossCap(game) * 2);
      return { text: `Maling beraksi: ${n} ekor hilang.`, good: false };
    } },

  { id: 'kekeringan', emoji: '🏜️', title: 'Kemarau mengancam', weight: 3,
    make(game) {
      let best = null;
      for (const r of game.data.REGIONS) {
        const fields = growingIn(game, r.id).filter(([, f]) => !f.irrigated);
        const dry = (game.forecast?.(r.id) || []).filter((d) => !d.rain).length;
        if (fields.length && (dry >= 2 || r.climate.rainChance <= 0.3) && (!best || fields.length > best.n)) best = { r, n: fields.length };
      }
      if (!best) return null;
      const soften = 0.25 * projectPerk(game, 'damStage', best.r.id), odds = round2(0.6 * (1 - soften));
      const ctx = { regionId: best.r.id, odds, cost: daysCash(game, 0.3), loss: round2(0.12 * (1 - soften)) };
      return { ctx, def: 'tunggu', text: `Sumur warga di ${best.r.name} mulai surut; ${best.n} ladang tanpa irigasi${soften ? ' (bendungan membantu)' : ''}.`,
        options: [opt('beli_air', `💧 Beli air irigasi (${fmt(ctx.cost)})`, 'Ladang tumbuh di wilayah ini langsung teririgasi (+15% hasil, bebas kering).', ctx.cost),
          opt('tunggu', '⏳ Tunggu hujan', `Peluang ${pctText(odds)}: hasil −${pctText(ctx.loss)} di wilayah ini.`)] };
    },
    apply(game, ctx, o, r) {
      const fields = growingIn(game, ctx.regionId);
      if (o === 'beli_air') { for (const [, f] of fields) f.irrigated = true; return { text: `${fields.length} ladang teririgasi.`, good: true }; }
      if (draw(r) >= ctx.odds) return { text: 'Hujan turun tepat waktu!', good: true };
      return { text: `Kemarau: ${damage(fields.filter(([, f]) => !f.irrigated), 1 - ctx.loss)} ladang kehilangan ${pctText(ctx.loss)} hasil.`, good: false };
    } },
];
