# Farm Manager

Farm Manager adalah game simulasi bisnis pertanian untuk satu pemain yang berjalan di browser. Game ini terinspirasi dari Farm Manager karya Trophy Games. Kamu memulai dengan satu ladang kecil di Jawa Barat, sebuah traktor, dan beberapa alat. Dari situ kamu membajak, memupuk, menanam, memanen, lalu menjual hasilnya di pasar. Keuntungannya bisa dipakai untuk membeli ladang baru di tujuh wilayah (Jawa Barat, Bavaria, Iowa, Normandia, Hokkaido, lalu Mato Grosso di level 12 dan Queensland di level 19), membeli mesin yang lebih besar, dan beternak.

Proyek ini memakai HTML, CSS, dan JavaScript murni (ES modules). Tidak ada dependensi, tidak ada langkah build, dan tampilannya dirancang untuk ponsel lebih dulu.

## Cara menjalankan

Browser tidak mengizinkan ES modules dimuat dari `file://`, jadi game harus dibuka lewat server HTTP lokal.

```sh
cd farm-manager
python3 -m http.server 8000
```

Setelah itu buka <http://localhost:8000>. Sebagai alternatif, kamu bisa menjalankan `npx serve` di folder yang sama (butuh Node.js).

### Membuka di ponsel Android

Game bisa dimainkan di browser Android seperti Chrome atau Firefox. Caranya:

1. Jalankan server di PC seperti langkah di atas.
2. Pastikan ponsel dan PC tersambung ke jaringan Wi-Fi yang sama.
3. Cari alamat IP lokal PC: `ip addr` di Linux, `ipconfig` di Windows, atau `ipconfig getifaddr en0` di macOS.
4. Di ponsel, buka `http://<IP-PC>:8000`, misalnya `http://192.168.1.10:8000`.

Kalau halaman tidak terbuka, cek apakah firewall PC mengizinkan koneksi masuk ke port 8000.

### Pasang di HP (PWA)

Farm Manager bisa dipasang sebagai aplikasi (ikon di layar utama, layar penuh tanpa bilah alamat) dan tetap jalan tanpa internet. Setelah dibuka sekali secara online, *service worker* (`sw.js`) menyimpan semua file game di cache ponsel.

Service worker hanya aktif di *secure context*: alamat HTTPS atau `http://localhost` / `http://127.0.0.1`. Alamat LAN seperti `http://192.168.1.10:8000` dianggap tidak aman oleh Chrome, jadi di sana game tetap bisa dimainkan tetapi tidak bisa dipasang sebagai aplikasi dan tidak bisa dibuka offline (paling jauh menjadi pintasan biasa ke browser). Pilihan yang berfungsi:

- **Server di ponsel itu sendiri.** Misalnya lewat Termux: salin folder game ke ponsel, lalu jalankan `python -m http.server 8000` (paket `python`) atau `npx serve` (paket `nodejs`), dan buka `http://localhost:8000` di Chrome pada ponsel yang sama.
- **Penerusan port lewat USB.** Sambungkan ponsel ke PC dengan USB debugging, buka `chrome://inspect/#devices` di Chrome PC, aktifkan *Port forwarding* `8000 → localhost:8000`, lalu buka `http://localhost:8000` di Chrome ponsel.
- **Hosting statis gratis dengan HTTPS**, misalnya GitHub Pages atau Netlify. Unggah isi folder apa adanya; tidak ada langkah build.

Cara memasang: buka tab 🏆 Prestasi → ⚙️ Pengaturan dan tekan **📲 Pasang aplikasi** (muncul jika Chrome menawarkan pemasangan), atau buka menu browser → *Tambahkan ke layar utama* / *Instal aplikasi*. Di iPhone/iPad: Safari → tombol Bagikan → *Tambahkan ke Layar Utama*. Tombol dan petunjuknya disembunyikan bila game sudah berjalan sebagai aplikasi.

Data simpanan ada di `localStorage` dan terikat pada alamat asal, jadi `http://localhost:8000`, `http://192.168.1.10:8000`, dan alamat HTTPS masing-masing punya simpanan sendiri.

**Setelah mengubah file game**, perbarui daftar precache dan versi cache di `sw.js` (versinya adalah hash isi file, jadi browser mendeteksi versi baru):

```sh
node -e 'const fs=require("fs"),crypto=require("crypto");const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?walk(d+"/"+e.name):[d+"/"+e.name]);const files=["index.html","manifest.webmanifest",...["css","js","icons"].flatMap(walk).filter((f)=>/\.(css|js|png|svg)$/.test(f)).sort()];const hash=crypto.createHash("sha1");for(const f of files)hash.update(f).update(fs.readFileSync(f));const sw=fs.readFileSync("sw.js","utf8").replace(/const VERSION = ".*?";/,"const VERSION = \""+hash.digest("hex").slice(0,10)+"\";").replace(/\/\/ PRECACHE:start[\s\S]*?\/\/ PRECACHE:end/,"// PRECACHE:start\n"+files.map((f)=>"  \"./"+f+"\",\n").join("")+"  // PRECACHE:end");fs.writeFileSync("sw.js",sw);console.log(files.length+" file di-precache")'
```

Jalankan dari folder `farm-manager`. Pemain yang sudah memasang game akan melihat toast **Versi baru tersedia · Muat ulang** saat membuka game berikutnya; versi baru aktif setelah tombol itu ditekan. File yang lupa dimasukkan ke daftar tetap disimpan ke cache saat pertama kali dimuat secara online.

## Panduan bermain

### Panduan awal

Pemain baru disambut panduan langkah demi langkah di tab **Ladang**: Bajak → Pupuk → Tanam → percepat 5× → Panen → Jual. Tombol yang perlu diketuk diberi tanda 👆, dan panduan maju sendiri setiap kali satu langkah selesai. Panduan bisa ditutup dengan ✕. Kemajuannya disimpan di `localStorage` dengan kunci `farm-manager-tutorial`, terpisah dari data permainan, dan dimulai lagi dari awal setelah reset game.

### Siklus ladang

1. **Bajak**: ladang yang kosong (idle) harus dibajak dulu.
2. **Pupuk** (opsional): menambah hasil panen sebesar 25%.
3. **Tanam**: pilih tanaman yang sudah terbuka di levelmu. Biaya benih dihitung per hektare.
4. **Tumbuh**: tanaman tumbuh selama beberapa hari game. Irigasi (opsional) menambah hasil dan menghapus penalti kekeringan.
5. **Panen**: memakai mesin panen milikmu. Kalau belum punya, kamu bisa menyewa dengan biaya per hektare, dengan kecepatan 1 ha per jam dan tanpa biaya bahan bakar.
6. **Gudang**: hasil panen otomatis masuk ke gudang (silo).
7. **Jual di Pasar**: harga bergerak setiap hari, jadi pilih waktu yang tepat untuk menjual.

Jangan biarkan tanaman yang siap panen terlalu lama. Setelah 72 jam, tanaman mulai layu dan hasilnya turun 10% per hari.

Hasil panen dipengaruhi oleh beberapa faktor:

- jenis tanah dan pH (setiap tanaman punya rentang pH ideal),
- kontaminasi tanah,
- pupuk dan irigasi,
- jumlah hari kering selama masa tumbuh.

Biaya tugas (bahan bakar, benih atau pupuk) dibayar saat tugas dimulai. Panen adalah pengecualian: bahan bakar dan sewa dibayar saat panen selesai. Kalau uangmu kurang, sebagian hasil panen otomatis dijual untuk menutup biayanya, jadi ladang yang siap panen selalu bisa dipanen. XP diberikan saat tugas selesai.

### Aksi massal dan rencana ladang

- **Aksi massal**: bilah "⚡ Aksi massal" di atas daftar ladang menjalankan satu tugas di semua ladang yang bisa, misalnya *Panen semua* atau *Bajak semua*. Hasilnya dirangkum dalam satu notifikasi. Ladang yang dilewati (misalnya karena mesin sedang dipakai atau uang kurang) disebutkan alasannya.
- **Rencana (🔁)**: di detail ladang kamu bisa menyimpan rencana berisi tanaman, pupuk ya/tidak, irigasi ya/tidak, sewa pemanen, dan ulangi. Game lalu menjalankan langkah berikutnya sendiri setiap jam dan setiap kali tugas selesai, selama mesin dan uang mencukupi. Kalau rencana tertahan, kartu ladang menampilkan alasannya, misalnya "Menunggu traktor".
  - **💰 Jual otomatis saat panen** (aktif secara bawaan): hasil panen langsung dijual dengan harga pasar, kecuali cadangan pakan. Dengan begitu uang tidak habis untuk gaji dan bunga.
  - **🔄 Rotasi dengan**: tanaman kedua yang ditanam bergantian dengan tanaman utama setiap siklus, agar terhindar dari penalti tanam berulang (−10%).
  - Rencana menghindari mesin dengan kondisi di bawah 20% kalau ada mesin lain yang bebas. Di Garasi kamu bisa menyalakan **Perbaiki otomatis**: mesin yang selesai bekerja dengan kondisi di bawah 30% langsung diperbaiki kalau uangnya cukup.

### Ladang dan peta

Tab **Ladang** menampilkan peta semua wilayah. Penanda ladang milikmu berbeda dengan ladang yang dijual. Ketuk sebuah ladang untuk melihat luas, jenis tanah, pH, kontaminasi, dan harganya, lalu beli ladang tersebut. Ladang yang sedang kosong bisa dijual lagi dengan nilai 70% dari harga beli. Ladang terakhir yang kamu miliki tidak bisa dijual. Angka pada ikon tab 🗺️ menunjukkan jumlah ladang yang siap panen atau masih kosong.

### Musim, prakiraan, dan kejadian

- Satu tahun game berlangsung 40 hari. Bavaria, Iowa, Normandia, dan Hokkaido melewati musim semi 🌱, panas ☀️, gugur 🍂, dan dingin ❄️ (masing-masing 10 hari). Jawa Barat punya musim hujan 🌧️ (peluang hujan lebih tinggi) dan kemarau 🌵.
- Tiap tanaman punya musim tanam yang cocok dan suhu minimum. Di luar musim, tanaman tumbuh ×0,6 dan hasilnya sedikit turun; di bawah suhu minimum (misalnya jagung di musim dingin Hokkaido) pertumbuhan berhenti. Pemilih tanaman menandai ✅ musimnya, ⏳ luar musim, atau ❄️ terlalu dingin, plus petunjuk dari prakiraan.
- Harga tanaman sedikit lebih murah saat musimnya dan lebih mahal di luar musim.
- Ketuk cuaca di bilah atas untuk melihat musim dan prakiraan 3 hari setiap wilayah. Prakiraan juga ada di detail ladang dan membantu memutuskan perlu mengairi atau tidak (prakiraan kadang meleset).
- Kira-kira sekali tiap 4 hari terjadi kejadian acak: 🐛 hama (hasil −25% sampai disemprot, biaya $40/ha), ⛈️ badai (tanaman rusak 5–15%, tapi hujan gratis), 🔥 gelombang panas (beberapa hari kering), 📈 harga melonjak / 📉 harga anjlok untuk satu produk, 💰 subsidi pemerintah, dan 🌈 cuaca ideal (tanaman tumbuh lebih cepat).

### Tanah

- pH ladang bisa diubah: alat **penebar kapur** (Garasi, Lv 2) menggeser pH 0,5 ke arah 6,8 per pengapuran (bahan $90/ha).
- Nutrisi tanah (0–100%, awal 80%) memengaruhi hasil (×0,6 sampai ×1). Panen memakai nutrisi, pupuk menambah 40%, dan kedelai justru memulihkannya.
- Menanam tanaman yang sama dua kali berturut-turut mengurangi hasil 10%. Gilir tanamanmu.

### Mesin

Mesin dibeli dan dijual di tab **Garasi**. Ada tiga jenis:

- **Traktor**: punya tenaga (hp), kecepatan, dan konsumsi bahan bakar.
- **Alat**: bajak, penabur, penyebar pupuk, dan irigasi. Setiap alat punya syarat tenaga minimum (`hpRequired`). Alat hanya bisa dipakai dengan traktor yang tenaganya cukup.
- **Mesin panen**: memanen tanpa perlu traktor.

Durasi tugas sama dengan luas ladang dibagi kapasitas alat (ha/jam), dikali kecepatan traktor. Mesin yang sedang bekerja tidak bisa dipakai di ladang lain dan tidak bisa dijual. Mesin yang dijual dikembalikan dengan nilai 60% dari harganya, dikali kondisinya.

**Kondisi mesin.** Setiap jam kerja mengurangi kondisi mesin (100% → 0%). Di bawah 50% tugas berjalan 20% lebih lambat. Di bawah 20% mesin bisa mogok saat mulai bekerja, dan tugasnya jadi 50% lebih lama. Tombol **Perbaiki** di Garasi memulihkan kondisi ke 100% dengan biaya harga × kerusakan × 30%.

**Upgrade mesin.** Tombol **🔧 Upgrade** di setiap mesin milikmu membuka tiga jalur, masing-masing level 0–3: **Mesin** (traktor +15% HP per level sehingga bisa menarik alat yang lebih berat; pemanen +10% ha/jam), **Transmisi** (traktor +10% kecepatan; pemanen dan alat +10% ha/jam), dan **Efisiensi** (−10% BBM per level). Alat hanya punya Transmisi. Level 1/2/3 berharga 15%/25%/40% dari harga mesin, dan level 2 dan 3 butuh level pemain lebih tinggi (level buka mesin + 2 per tingkat). Mesin yang sedang dipakai tidak bisa di-upgrade. Saat dijual, 50% biaya upgrade ikut kembali (dikali kondisi). Warna cat bisa diganti gratis. Statistik di Garasi dan pemilih mesin di dialog tugas sudah memperhitungkan upgrade.

### Pekerja

Setiap tugas ladang butuh satu pekerja bebas. Pengecualiannya panen dengan pemanen sewaan, karena sopirnya sudah termasuk. Kamu mulai dengan satu pekerja, Pak Budi. Di bagian **Pekerja** di tab Garasi ada tiga calon yang berganti setiap minggu; merekrut mereka gratis. Pekerja yang lebih ahli menyelesaikan tugas sampai 20% lebih cepat, dan keahliannya naik sedikit demi sedikit setiap kali menyelesaikan tugas. Gaji dibayar setiap pergantian hari. Kalau uang kurang, kekurangannya ditambahkan ke pinjaman. Rencana ladang yang menunggu pekerja menampilkan "Tidak ada pekerja bebas."

### Silo

Silo awal menampung 150 t hasil panen (produk ternak tidak memakai ruang silo). Hasil panen yang tidak muat langsung dijual paksa seharga 70% harga pasar. Kamu juga tidak bisa membeli tanaman melebihi sisa ruang. Di tab Gudang, silo bisa diperbesar 200 t setiap kali, dengan biaya yang naik setiap peningkatan. Menjual hasil panen atau memenuhi kontrak mengosongkan ruang.

### Pabrik

Mulai level 11, pabrik bisa dibeli di tab Gudang (bagian 🏭 Pabrik): Penggilingan (Lv 11: gandum → tepung, barley → malt), Pabrik Susu (Lv 13: susu → mentega/keju sapi), Pabrik Gula (Lv 15: tebu → gula), Pabrik Minyak (Lv 18: kanola/bunga matahari → minyak), Pabrik Kelapa Sawit (Lv 19: TBS kelapa sawit → CPO + inti sawit, inti sawit → minyak inti sawit/PKO, CPO → minyak goreng), Toko Roti (Lv 21: tepung + telur + gula (+ mentega) → roti/kue), dan Pabrik Tekstil (Lv 24: kapas → kain, wol → benang). Pilih resep, tekan ▶ Proses atau nyalakan 🔁 Otomatis. Bahan diambil dari gudang saat batch dimulai (cadangan pakan tidak dipakai) dan produk olahan bernilai sekitar 30–55% lebih tinggi. Produk berat (t) butuh ruang silo; jika silo penuh, pabrik menunggu. Peningkatan level membuat proses 25% lebih cepat per level.

### Ternak

Ternak dikelola di tab **Ternak**. Ada empat jenis: sapi (susu), ayam (telur), domba (wol), dan babi (daging). Sebelum membeli hewan, kamu harus membangun kandang. Setiap kandang menambah kapasitas.

Setiap hari hewan makan tanaman pakan dari gudang. Misalnya sapi memakan gandum, jagung, barley, atau kedelai. Hewan memakan tanaman pakan yang harganya paling murah lebih dulu. Pakan bisa berasal dari panen sendiri, atau dibeli di pasar dengan harga 20% di atas harga jual. Di kartu ternak ada tombol untuk membeli pakan 3 atau 7 hari, dan game otomatis memilih tanaman pakan yang paling murah. Tanaman juga bisa dibeli langsung di tab **Pasar**. Kamu bisa menyisihkan cadangan pakan per tanaman. Stok cadangan tidak ikut terjual saat kamu menjual dari gudang atau pasar, tetapi tetap boleh dimakan ternak. Tanda ⚠️ di tab 🐄 muncul kalau pakan salah satu ternak tinggal kurang dari sehari. Hewan yang kurang makan akan turun kualitasnya, sehingga produksinya berkurang dan harga jualnya turun. Hasil ternak masuk ke gudang dan dijual di pasar.

**Pembiakan.** Setiap kawanan punya genetika ★ (×0,5–×1,5, ternak yang dibeli ×1,00) yang mengalikan produksi dan harga jual. Ternak lahir sendiri setiap siklus (ayam 4 hari, sapi 12 hari, dst.) kalau kawanan kenyang, kebahagiaannya di atas 70%, minimal 2 ekor, dan kandang masih ada tempat; anaknya mewarisi genetika kawanan ±0,02. **💞 Pembiakan intensif** membuat kelahiran ×4, tetapi pakan ×1,5 dan produksi ×0,75 selama kandang belum penuh. Mode ini berguna untuk mengisi kandang lebih murah daripada membeli, bukan untuk dijual. **🐂 Indukan unggul** (5 tingkat, harga × kapasitas kandang × 20% × tingkat) menaikkan genetika 0,01 per hari menuju ×1,1, ×1,2, … ×1,5. Kalau kandang penuh, kelahiran berhenti dan kamu diberi tahu sekali.

### Kontrak

Bagian "📋 Kontrak" di tab **Pasar** berisi tawaran pesanan yang diperbarui setiap hari. Setiap kontrak meminta sejumlah produk sampai hari tertentu, dengan harga di atas harga pasar dan hadiah XP. Saat harga pasar anjlok, harga kontrak dihitung dari minimal 90% harga dasar, dan persentasenya ditampilkan terhadap harga dasar. Kamu boleh menjalankan beberapa kontrak sekaligus. Kirim hasil panen dari gudang sampai jumlahnya terpenuhi untuk menerima bayaran. Kontrak yang lewat batas waktu gagal dan kamu dikenai denda. Angka di tab 📈 menunjukkan jumlah kontrak yang sedang berjalan.

### Pinjaman

Kalau kekurangan modal, kamu bisa mengambil pinjaman. Batas pinjaman adalah `level × 25.000`. Bunga harian (diatur lewat `BALANCE.loanDailyRate`) dipotong otomatis dari uangmu. Kalau uangmu tidak cukup, bunga ditambahkan ke pokok pinjaman. Pinjaman bisa dilunasi kapan saja.

### Laporan keuangan

Ketuk angka uang di bar atas (atau kartu **📊 Laporan Keuangan** di tab **Prestasi**, atau tombol di Pasar › Keuangan) untuk melihat pemasukan dan pengeluaran. Pilih periode Hari ini, Kemarin, 7 hari, 30 hari, atau Semua. Laporan menampilkan pemasukan, biaya operasional (BBM, benih, pupuk/kapur/irigasi, sewa pemanen, gaji, pakan, perbaikan, semprot hama, bunga, denda kontrak, pembelian produk), laba operasional dan margin, investasi (ladang, mesin, upgrade, kandang, ternak, indukan, gudang, pabrik), serta arus kas bersih. Ada kesimpulan singkat ("✅ Untung…" atau "⚠️ Biaya operasional lebih besar…"), rincian per kategori, grafik harian, dan saran untuk biaya terbesar. Pinjaman yang diterima dan pelunasannya dicatat terpisah: bukan pemasukan dan bukan biaya. Rincian per hari disimpan untuk 60 hari terakhir; total sepanjang permainan tetap tersimpan. Simpanan lama mulai mencatat sejak dimuat.

### Level dan prestasi

XP didapat dari setiap tugas yang selesai, dari nilai hasil panen, dan dari produksi ternak. Jumlah XP saat ini dan target level berikutnya tampil di bar atas (misalnya "XP 514/1.500"). Saat naik level kamu mendapat hadiah uang sebesar `1.000 × level` (`BALANCE.levelReward`), dan sebuah jendela menampilkan hadiah itu beserta tanaman, mesin, hewan, pabrik, wilayah, dan ladang yang baru terbuka. Tab **Prestasi** berisi daftar target beserta hadiah uangnya, grafik kekayaan bersih (uang + nilai ladang, mesin, isi gudang, ternak, dan pabrik, dikurangi pinjaman), statistik, dan catatan kejadian.

**Level 11–30.** Level maksimal adalah 30 dan setiap level membuka sesuatu:

| Lv | Terbuka | Lv | Terbuka |
|---|---|---|---|
| 11 | 🏭 Penggilingan, 🍵 Teh | 21 | 🏭 Toko Roti, pemanen CR11 Twin |
| 12 | 🌍 Mato Grosso (2 ladang), penebar kapur 12t | 22 | traktor Steiger 715, ladang Emerald Station |
| 13 | 🏭 Pabrik Susu, penyemprot 12000L | 23 | 💜 Lavender |
| 14 | 🍫 Kakao, bajak 16-mata, ladang Fazenda Lucas | 24 | 🏭 Pabrik Tekstil, irigasi pivot raksasa |
| 15 | 🏭 Pabrik Gula, 🦆 Bebek | 25 | 🦙 Alpaka, ladang Bundaberg Flats |
| 16 | traktor Fendtt 1167, ladang Fazenda Sinop | 26 | traktor 9RX 830 |
| 17 | 🌴 Kelapa Sawit, pemanen Lexion TT | 27 | 🌺 Saffron, bajak 20-mata |
| 18 | 🏭 Pabrik Minyak, penabur 24m | 28 | pemanen X9 1100 |
| 19 | 🌍 Queensland (2 ladang) | 29 | ladang Fazenda Sorriso (300 ha) |
| 20 | 🍇 Anggur, 🐃 Kerbau | 30 | ladang Longreach Station (400 ha), penabur 36m |

Ladang di wilayah baru terkunci sampai levelnya tercapai (pin 🔒 Lv N di peta); level buka sebuah ladang adalah yang lebih tinggi antara `unlockLevel` ladang dan wilayahnya. Ke-20 ladang lama tetap bisa dibeli sejak level 1. Kurva XP diuji dengan bot rakus (rencana ladang, beli ladang/mesin, misi harian): level 20 sekitar hari ke-430 dan level 30 sekitar hari ke-830–920 (±21–23 tahun game, ±14–15 jam pada kecepatan 1×); tanpa misi sekitar hari ke-1.260.

### Misi harian dan papan peringkat

- **🎯 Misi harian** (paling atas di tab **Prestasi**): setiap hari game ada 3 misi baru yang disesuaikan dengan level dan ladangmu, misalnya "Panen 30 t Jagung", "Jual hasil sendiri senilai .000" (barang yang dibeli dari pasar lalu dijual lagi tidak dihitung), "Selesaikan 2 tugas bajak", "Beli 2 t pakan ternak", "Selesaikan 1 kontrak", atau "Produksi 2 batch di pabrik". Misi yang selesai memberi uang dan XP lewat tombol **Ambil**; angka di ikon tab 🏆 menunjukkan hadiah yang siap diambil. Hadiah yang lupa diambil tetap dibayar saat pergantian hari.
- **🔥 Beruntun**: selesaikan ketiga misi beberapa hari berturut-turut. Setiap 7 hari beruntun ada bonus besar; satu hari terlewat membuat hitungan kembali ke 0.
- **🏆 Papan peringkat**: 7 pertanian pesaing (misalnya Koperasi Sido Rukun, Hoeness Agrar, PT Tani Makmur, Iowa Golden Acres) yang kekayaannya tumbuh setiap hari dengan gaya masing-masing (stabil, agresif, fluktuatif). Baris pertanianmu disorot, dan ▲/▼ menunjukkan perubahan peringkat sejak kemarin. Pesaing terlemah bisa disalip dalam beberapa minggu dan peringkat #2 sekitar hari 120–180. Agro Nusantara Group terus tumbuh pesat, baru bisa disalip sekitar level 20–23, dan tetap membayangi sesudahnya.

### Waktu dan penyimpanan

- Tombol kecepatan di bagian atas: ⏸ (jeda), 1×, 2×, 5×. Pada kecepatan 1×, satu jam game berlangsung 2,5 detik.
- Cuaca setiap wilayah berganti setiap hari, mengikuti musim dan prakiraan 3 hari.
- Permainan tersimpan otomatis di `localStorage` browser.
- Saat game dibuka kembali, atau saat kamu kembali ke tab yang sempat tersembunyi, waktu yang berlalu ikut disimulasikan, maksimal 48 jam game. Kalau game sedang dijeda (⏸), waktu tidak berjalan.
- Kalau data simpanan rusak, salinannya disimpan di `localStorage` dengan kunci `farm-manager-save.bak-<waktu>` sebelum permainan baru dimulai.
- Tab yang terakhir dibuka diingat setelah halaman dimuat ulang.

### Notifikasi

Notifikasi muncul di bagian atas, di bawah bar atas, sehingga tidak menutupi tombol di jendela aksi. Saat sebuah jendela terbuka, notifikasi pindah ke atas bar atas agar judul dan tombol ✕ jendela tetap terlihat. Paling banyak dua notifikasi tampil sekaligus. Kejadian yang sama digabung, misalnya "🌾 3 ladang siap panen.", dan setiap notifikasi bisa ditutup dengan ✕. Notifikasi muncul untuk tanaman siap panen, tanaman layu, prestasi, peringatan pakan, dan kontrak. Naik level ditampilkan dalam jendela tersendiri. Kejadian rutin seperti tugas selesai, penjualan, dan pembelian hanya dicatat di tab **Prestasi**.

Di layar lebar (≥ 1000 px), tab **Ladang** memakai dua kolom: peta di kiri (tetap terlihat saat menggulir) dan kartu ladang di kanan.

## Struktur proyek

```
index.html          Kerangka halaman: top bar, area tampilan, tab bawah
manifest.webmanifest Manifest PWA (nama, warna, ikon)
sw.js               Service worker: cache app shell untuk mode offline
icons/              Ikon aplikasi (PNG 192/512, maskable, apple-touch-icon; sumber icon.svg)
css/style.css       Gaya dasar dan kerangka aplikasi (mobile-first)
css/fields.css      Gaya tampilan ladang dan tugas
css/economy.css     Gaya tampilan pasar, garasi, ternak, dan gudang
css/ops.css         Gaya silo, pekerja, dan kondisi mesin
css/factories.css   Gaya bagian Pabrik di tab Gudang
css/missions.css    Gaya misi harian dan papan peringkat (tab Prestasi)
css/breeding.css    Gaya panel pembiakan ternak dan dialog upgrade mesin
css/finance.css     Gaya laporan keuangan
js/data.js          Data game: tanaman, produk, mesin, hewan, wilayah, ladang, level, prestasi, BALANCE
js/engine.js        Mesin game (tanpa DOM): state, waktu, aksi pemain, view, simpan/muat
js/engine/*         Modul engine: rng, defs, weather, market, fields, tasks, taskrun,
                    animals, economy, purchase, contracts, plans, views, persist,
                    silo, workers, wear, seasons, events, soil, factories, factoryView,
                    missions, rivals, breeding, upgrades, ledger
js/ui/*             Komponen antarmuka per tab
js/main.js          Titik masuk: memuat/membuat game, game loop, autosave, navigasi tab
tests/              Tes engine (node:test)
docs/ENGINE_API.md  Dokumentasi API engine
```

Antarmuka hanya berkomunikasi dengan `js/engine.js`. Detail lengkapnya ada di `docs/ENGINE_API.md`.

## Tes

Butuh Node.js 18 atau lebih baru. Tidak ada dependensi yang perlu dipasang.

```sh
npm test
# atau
node --test tests/
```

## Mengubah keseimbangan game

Semua angka keseimbangan ada di `js/data.js`. Objek `BALANCE` mengatur:

| Kunci | Arti |
|---|---|
| `realSecondsPerGameHour` | Detik nyata per jam game pada kecepatan 1× |
| `fuelPrice` | Harga bahan bakar per liter |
| `fertilizerCostPerHa`, `irrigateCostPerHa` | Biaya bahan pupuk dan irigasi per hektare |
| `yieldPhPenaltyPerUnit` | Penalti hasil per satuan pH di luar rentang ideal |
| `fertilizerBonus`, `irrigationBonus` | Bonus hasil dari pupuk dan irigasi |
| `dryPenalty` | Penalti hasil karena terlalu banyak hari kering |
| `contaminationPenalty` | Penalti hasil per tingkat kontaminasi |
| `soilYield` | Pengali hasil per jenis tanah |
| `xpPerTask`, `xpPerHarvestValue` | XP per tugas, dan XP per $ nilai hasil panen dan produksi ternak (dihitung dengan harga dasar) |
| `loanDailyRate` | Bunga pinjaman per hari |

Harga ladang, mesin, benih, harga dasar produk, volatilitas pasar, dan level buka bisa diubah langsung di array masing-masing (`FIELDS`, `MACHINES`, `CROPS`, `PRODUCTS`, `ANIMALS`). Modal awal dan biaya sewa mesin panen ada di `STARTING`.

Setelah mengubah angka, jalankan `npm test` untuk memastikan engine masih berjalan dengan benar. Simpanan lama tetap bisa dimuat. Jika ingin mulai dari awal, hapus kunci `farm-manager-save` dari `localStorage`.
