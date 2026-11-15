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

Cara memasang: ketuk ⚙️ di bilah atas (Pengaturan) dan tekan **📲 Pasang aplikasi** (muncul jika Chrome menawarkan pemasangan), atau buka menu browser → *Tambahkan ke layar utama* / *Instal aplikasi*. Di iPhone/iPad: Safari → tombol Bagikan → *Tambahkan ke Layar Utama*. Tombol dan petunjuknya disembunyikan bila game sudah berjalan sebagai aplikasi.

Data simpanan ada di `localStorage` dan terikat pada alamat asal, jadi `http://localhost:8000`, `http://192.168.1.10:8000`, dan alamat HTTPS masing-masing punya simpanan sendiri.

**Setelah mengubah file game**, perbarui daftar precache dan versi cache di `sw.js` (versinya adalah hash isi file, jadi browser mendeteksi versi baru):

```sh
node -e 'const fs=require("fs"),crypto=require("crypto");const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?walk(d+"/"+e.name):[d+"/"+e.name]);const files=["index.html","manifest.webmanifest",...["css","js","icons"].flatMap(walk).filter((f)=>/\.(css|js|png|svg)$/.test(f)).sort()];const hash=crypto.createHash("sha1");for(const f of files)hash.update(f).update(fs.readFileSync(f));const sw=fs.readFileSync("sw.js","utf8").replace(/const VERSION = ".*?";/,"const VERSION = \""+hash.digest("hex").slice(0,10)+"\";").replace(/\/\/ PRECACHE:start[\s\S]*?\/\/ PRECACHE:end/,"// PRECACHE:start\n"+files.map((f)=>"  \"./"+f+"\",\n").join("")+"  // PRECACHE:end");fs.writeFileSync("sw.js",sw);console.log(files.length+" file di-precache")'
```

Jalankan dari folder `farm-manager`. Pemain yang sudah memasang game akan melihat toast **Versi baru tersedia · Muat ulang** saat membuka game berikutnya; versi baru aktif setelah tombol itu ditekan. File yang lupa dimasukkan ke daftar tetap disimpan ke cache saat pertama kali dimuat secara online.

## Panduan bermain

### Panduan awal

Pemain baru disambut panduan langkah demi langkah di tab **Ladang**: Bajak → Pupuk → Tanam → percepat 5× → Panen → Jual. Tombol yang perlu diketuk diberi tanda 👆, dan panduan maju sendiri setiap kali satu langkah selesai. Panduan bisa ditutup dengan ✕. Kemajuannya disimpan di `localStorage` dengan kunci `farm-manager-tutorial`, terpisah dari data permainan, dan dimulai lagi dari awal setelah reset game.

### Navigasi

Enam tab di bawah: **🗺️ Ladang**, **🚜 Garasi**, **📈 Pasar**, **🐄 Ternak**, **🏚️ Gudang**, **🏆 Prestasi**. Setiap tab dibuka dengan hal yang perlu dikerjakan sekarang, dan bagian lainnya dipisah ke sub-tab di bilah yang tetap terlihat di bawah bar atas:

| Tab | Sub-tab |
|---|---|
| Ladang | 🌾 Ladangku · 🗺️ Peta |
| Garasi | 🚜 Mesin · 👷 Pekerja · 🛒 Toko (filter Traktor/Pemanen/Alat/Truk, mesin terkunci dilipat) |
| Pasar | 💰 Jual · 📋 Kontrak · 🚚 Kirim · 📊 Harga |
| Ternak | satu halaman: gudang dingin, kandangku, mulai beternak, ternak terkunci, cadangan pakan |
| Gudang | 🌾 Pertanian (silo) · 🐄 Peternakan (gudang dingin) · 🏭 Olahan (stok olahan + pabrik) |
| Prestasi | 🎯 Misi · 🔬 Riset · 🏆 Prestasi · 💰 Keuangan (laporan, pinjaman, kekayaan) |

Angka pada tab hanya muncul untuk hal yang bisa ditindaklanjuti: ladang yang perlu langkah, mesin yang hampir rusak, kontrak yang bisa dikirim, pakan hampir habis (⚠️), silo atau gudang dingin hampir penuh atau pabrik terhenti, dan hadiah misi (🔬 bila hanya ada poin riset). Bar atas: uang (ketuk → laporan keuangan), level dan XP (ketuk → riset), cuaca (ketuk → prakiraan), hari dan jam, kecepatan ⏸ 1× 2× 5×, dan ⚙️ Pengaturan (suara, simpan, ulangi panduan, pasang aplikasi, reset).

### Siklus ladang

1. **Bajak**: ladang yang kosong (idle) harus dibajak dulu.
2. **Pupuk** (opsional): menambah hasil panen sebesar 25%.
3. **Tanam**: pilih tanaman yang sudah terbuka di levelmu. Biaya benih dihitung per hektare.
4. **Tumbuh**: tanaman tumbuh selama beberapa hari game. Irigasi (opsional) menambah hasil dan menghapus penalti kekeringan.
5. **Panen**: memakai mesin panen milikmu. Kalau belum punya, kamu bisa menyewa dengan biaya per hektare, dengan kecepatan 1 ha per jam dan tanpa biaya bahan bakar.
6. **Gudang**: hasil panen otomatis masuk ke gudang (Gudang › 🌾 Pertanian, silo).
7. **Jual di Pasar**: Pasar › 💰 Jual menampilkan stok per kelompok dengan tren harga; satu ketukan **Jual $…** menjual satu produk. Harga bergerak setiap hari, jadi pilih waktu yang tepat untuk menjual.

Jangan biarkan tanaman yang siap panen terlalu lama. Setelah 72 jam, tanaman mulai layu dan hasilnya turun 10% per hari.

Hasil panen dipengaruhi oleh beberapa faktor:

- jenis tanah dan pH (setiap tanaman punya rentang pH ideal),
- kontaminasi tanah,
- pupuk dan irigasi,
- jumlah hari kering selama masa tumbuh.

Biaya tugas (bahan bakar, benih atau pupuk) dibayar saat tugas dimulai. Panen adalah pengecualian: bahan bakar dan sewa dibayar saat panen selesai. Kalau uangmu kurang, sebagian hasil panen otomatis dijual untuk menutup biayanya, jadi ladang yang siap panen selalu bisa dipanen. XP diberikan saat tugas selesai.

### Kerjakan sekaligus dan rencana ladang

- **Kerjakan sekaligus**: bilah "⚡ Kerjakan sekaligus" di atas daftar ladang menjalankan satu tugas di semua ladang yang bisa, misalnya *🌾 Panen ×3* atau *🪓 Bajak ×2*. Hasilnya dirangkum dalam satu notifikasi. Ladang yang dilewati (misalnya karena mesin sedang dipakai atau uang kurang) disebutkan alasannya.
- **Rencana (🔁)**: di detail ladang kamu bisa menyimpan rencana berisi tanaman, pupuk ya/tidak, irigasi ya/tidak, sewa pemanen, dan ulangi. Game lalu menjalankan langkah berikutnya sendiri setiap jam dan setiap kali tugas selesai, selama mesin dan uang mencukupi. Kalau rencana tertahan, kartu ladang menampilkan alasannya, misalnya "Menunggu traktor".
  - **💰 Jual otomatis saat panen** (aktif secara bawaan): hasil panen langsung dijual dengan harga pasar, kecuali cadangan pakan. Dengan begitu uang tidak habis untuk gaji dan bunga.
  - **🔄 Rotasi dengan**: tanaman kedua yang ditanam bergantian dengan tanaman utama setiap siklus, agar terhindar dari penalti tanam berulang (−10%).
  - Rencana menghindari mesin dengan kondisi di bawah 20% kalau ada mesin lain yang bebas. Di Garasi › 🚜 Mesin kamu bisa menyalakan **Perbaikan otomatis**: mesin yang selesai bekerja dengan kondisi di bawah 30% langsung diperbaiki kalau uangnya cukup.

### Ladang dan peta

Tab **Ladang** punya dua sub-tab. **🌾 Ladangku** dibuka lebih dulu: ladang yang perlu langkah berikutnya (siap panen, kosong, dibajak tanpa rencana, terkena hama atau layu) tampil paling atas di "⚡ Perlu tindakan", ladang yang sedang dikerjakan atau tumbuh di "⏳ Sedang berjalan", lalu "🛒 Ladang dijual" berisi tiga ladang termurah yang sudah terbuka. Di setiap kartu, langkah berikutnya adalah satu-satunya tombol hijau. **🗺️ Peta** menampilkan peta semua wilayah; penanda ladang milikmu berbeda dengan ladang yang dijual. Ketuk sebuah ladang (di peta atau di daftar) untuk melihat luas, jenis tanah, pH, kontaminasi, dan harganya, lalu beli ladang tersebut. Di detail ladang, bagian sekunder (rencana, faktor hasil, rumah kaca, prakiraan, lahan) bisa dilipat. Ladang yang sedang kosong bisa dijual lagi dari detail ladang dengan nilai 70% dari harga beli. Ladang terakhir yang kamu miliki tidak bisa dijual. Angka pada ikon tab 🗺️ menunjukkan jumlah ladang yang perlu tindakan (merah jika ada hama atau tanaman layu).

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

### Kebun buah

Di ladang yang sudah dibajak, bagian **🌳 Pohon** pada dialog Tanam menawarkan jeruk (Lv 6), apel (8), mangga (12), alpukat (15), kelapa (18), ceri (22), dan durian (26). Pemilih menampilkan lama menuju dewasa, frekuensi panen, umur produktif, perkiraan hasil, dan pendapatan bersih per tahun. Bibit ditanam manual oleh pekerja, tanpa penabur; biayanya dihitung per hektare dan dicatat sebagai investasi **Bibit pohon**.

Pohon mulai berbuah setelah dewasa, lalu bisa dipanen berulang tanpa tanam ulang. Buah hanya tumbuh pada musim buah dan suhu yang cocok untuk wilayah itu. Kartu ladang menampilkan kemajuan dewasa/buah dan perkiraan panen berikutnya. Panen memakai **sewa pemetik** ($160/ha, tanpa pekerja atau BBM) atau traktor dengan **pengguncang pohon** dari Garasi. Setelah panen, siklus buah berikutnya dimulai di pohon yang sama.

Di detail ladang, **✂️ Pangkas** tersedia sekali per siklus pada pohon dewasa: biaya $70/ha dan hasil siklus itu +15%, tercatat sebagai **Pangkas & tebang kebun**. **🪓 Tebang** meminta konfirmasi, menghabiskan $150/ha, dan mengosongkan ladang; bibit tidak dikembalikan. Setelah melewati umur produktif, hasil pohon berangsur turun sampai 30%. Rencana ladang juga mendukung kebun (termasuk sewa pemetik dan jual otomatis); bar Aksi massal menyediakan panen dan ✂️ pangkas untuk 2+ kebun sekaligus.

### Rumah kaca

Mulai **level 9**, rumah kaca bisa dibangun dari detail ladang berukuran maksimal **12 ha** seharga **$18.000/ha**. Listriknya **$90/ha/hari**, dicatat sebagai **Listrik rumah kaca**; kekurangan uang ditambahkan ke pinjaman. Rumah kaca tidak bisa dibangun di kebun buah atau saat ladang sedang dikerjakan.

Tanaman semusim di dalamnya mendapat hasil **+20%**, tumbuh normal tanpa hambatan musim atau suhu minimum, dan tidak menerima penalti hari kering maupun kerusakan badai. Pemilih tanaman memberi badge **🏠 bebas musim**, sementara rincian hasil menampilkan faktor rumah kaca. **Bongkar** meminta konfirmasi dan mengembalikan **30% biaya bangun** sebagai penjualan aset; tanaman tetap tumbuh di luar ruangan.

### Mesin

Mesin dibeli dan dijual di tab **Garasi**. Ada tiga jenis:

- **Traktor**: punya tenaga (hp), kecepatan, dan konsumsi bahan bakar.
- **Alat**: bajak, penabur, penyebar pupuk, dan irigasi. Setiap alat punya syarat tenaga minimum (`hpRequired`). Alat hanya bisa dipakai dengan traktor yang tenaganya cukup.
- **Mesin panen**: memanen tanpa perlu traktor.

Durasi tugas sama dengan luas ladang dibagi kapasitas alat (ha/jam), dikali kecepatan traktor. Mesin yang sedang bekerja tidak bisa dipakai di ladang lain dan tidak bisa dijual. Mesin yang dijual dikembalikan dengan nilai 60% dari harganya, dikali kondisinya.

**Kondisi mesin.** Setiap jam kerja mengurangi kondisi mesin (100% → 0%). Di bawah 50% tugas berjalan 20% lebih lambat. Di bawah 20% mesin bisa mogok saat mulai bekerja, dan tugasnya jadi 50% lebih lama. Tombol **Perbaiki** di Garasi memulihkan kondisi ke 100% dengan biaya harga × kerusakan × 30%.

**Upgrade mesin.** Tombol **🔧 Upgrade** di setiap mesin milikmu membuka tiga jalur, masing-masing level 0–3: **Mesin** (traktor +15% HP per level sehingga bisa menarik alat yang lebih berat; pemanen +10% ha/jam), **Transmisi** (traktor +10% kecepatan; pemanen dan alat +10% ha/jam), dan **Efisiensi** (−10% BBM per level). Alat hanya punya Transmisi. Level 1/2/3 berharga 15%/25%/40% dari harga mesin, dan level 2 dan 3 butuh level pemain lebih tinggi (level buka mesin + 2 per tingkat). Mesin yang sedang dipakai tidak bisa di-upgrade. Saat dijual, 50% biaya upgrade ikut kembali (dikali kondisi). Warna cat bisa diganti gratis. Statistik di Garasi dan pemilih mesin di dialog tugas sudah memperhitungkan upgrade.

### Pekerja

Setiap tugas ladang butuh satu pekerja bebas. Pengecualiannya panen dengan pemanen sewaan, karena sopirnya sudah termasuk. Kamu mulai dengan satu pekerja, Pak Budi. Di **Garasi › 👷 Pekerja** ada tiga calon yang berganti setiap minggu; merekrut mereka gratis. Pekerja yang lebih ahli menyelesaikan tugas sampai 20% lebih cepat, dan keahliannya naik sedikit demi sedikit setiap kali menyelesaikan tugas. Gaji dibayar setiap pergantian hari. Kalau uang kurang, kekurangannya ditambahkan ke pinjaman. Rencana ladang yang menunggu pekerja menampilkan "Tidak ada pekerja bebas."

### Gudang: silo dan gudang dingin

Tab **Gudang** memisahkan stok menurut kelompok produk (`PRODUCTS[].category` di `js/data.js`): **🌾 Pertanian** (tanaman, buah, sawit), **🐄 Peternakan** (susu, telur, wol, daging, madu, keju kambing) dan **🏭 Olahan** (hasil pabrik). Setiap kelompok punya daftar, nilai total, dan tombol **Jual semua…** sendiri; tombol **Jual $…** di setiap baris langsung menjual produk itu (bertanya dulu bila produk itu pakan ternak tanpa cadangan). Hasil panen dan produk olahan bersatuan ton disimpan di **silo**; produk ternak di **❄️ Gudang Dingin**; produk olahan bersatuan kg (mentega, keju sapi, kain, benang) tidak memakai gudang.

Kedua gudang diukur dalam ton dan punya level (Lv 1 = awal). Kartu kapasitas di Gudang › 🌾 Pertanian (silo) dan Gudang › 🐄 Peternakan (gudang dingin) menampilkan level, isi/kapasitas, sisa ruang, dan tombol **🏗️ Perbesar ke Lv N** dengan tambahan, kapasitas baru, dan biayanya (misalnya "+800 t → 2.150 t · $14.600"). Setiap peningkatan menambah sekitar setengah kapasitas saat ini, dibulatkan ke angka rapi (minimal 200 t untuk silo, 10 t untuk gudang dingin), jadi gudang ikut tumbuh bersama ladang dan kandangmu. Biayanya $15 per ton tambahan untuk silo dan $500 per ton untuk gudang dingin, ×1,05 setiap level. Barang yang tidak muat langsung dijual paksa seharga 70% harga pasar (hasil panen saat panen, produk ternak saat produksi harian), dengan notifikasi. Kamu juga tidak bisa membeli tanaman melebihi sisa ruang silo, dan pabrik menunggu bila hasilnya tidak muat. Menjual, mengirim, memenuhi kontrak, atau mengolah di pabrik mengosongkan ruang. Riset **Gudang Rapi** memperbesar kedua gudang 10%. Tab Gudang (dan sub-tabnya) memberi tanda bila salah satu gudang terisi ≥ 90%.

| Lv | Silo | Biaya ke Lv berikutnya | Gudang dingin | Biaya ke Lv berikutnya |
|---|---|---|---|---|
| 1 | 150 t | $3.000 | 10 t | $5.000 |
| 2 | 350 t | $3.150 | 20 t | $5.250 |
| 3 | 550 t | $4.960 | 30 t | $8.270 |
| 4 | 850 t | $8.680 | 45 t | $14.500 |
| 5 | 1.350 t | $14.600 | 70 t | $24.300 |
| 6 | 2.150 t | $23.000 | 110 t | $38.300 |
| 7 | 3.350 t | $40.200 | 170 t | $67.000 |
| 8 | 5.350 t | $63.300 | 270 t | $106.000 |
| 9 | 8.350 t | $111.000 | 420 t | $185.000 |
| 10 | 13.350 t | $186.000 | 670 t | $310.000 |
| 11 | 21.350 t | $293.000 | 1.070 t | $489.000 |
| 12 | 33.350 t | $513.000 | 1.670 t | $855.000 |
| 13 | 53.350 t | $808.000 | 2.670 t | … |
| 14 | 83.350 t | $1.410.000 | 4.170 t | … |

Gudang dingin menghitung berat: 1.000 L susu atau 1.000 kg wol/daging/madu/keju kambing = 1 t, 1.000 telur ≈ 0,06 t (telur bebek 0,07 t). Kapasitas awal 10 t cukup untuk ±17 hari produksi satu kandang sapi plus satu kandang ayam. Simpanan lama: silo mendapat level pertama yang sama besar atau lebih besar dari kapasitas lamanya (misalnya 950 t → Lv 5, 1.350 t), dan gudang dingin mendapat level pertama yang memuat stok produk ternak yang ada.

### Pabrik

Mulai level 11, pabrik bisa dibeli di **Gudang › 🏭 Olahan** (bagian 🏭 Pabrik; pabrik yang belum terbuka dilipat di "🔒 Pabrik terkunci"): Penggilingan (Lv 11: gandum → tepung, barley → malt), Pabrik Susu (Lv 13: susu → mentega/keju sapi), Pabrik Gula (Lv 15: tebu → gula), Pabrik Minyak (Lv 18: kanola/bunga matahari → minyak), Pabrik Kelapa Sawit (Lv 19: TBS kelapa sawit → CPO + inti sawit, inti sawit → minyak inti sawit/PKO, CPO → minyak goreng), Toko Roti (Lv 21: tepung + telur + gula (+ mentega) → roti/kue), dan Pabrik Tekstil (Lv 24: kapas → kain, wol → benang). Pilih resep, tekan ▶ Proses atau nyalakan 🔁 Otomatis. Bahan diambil dari gudang saat batch dimulai (cadangan pakan tidak dipakai) dan produk olahan bernilai sekitar 30–55% lebih tinggi. Produk berat (t) butuh ruang silo; jika silo penuh, pabrik menunggu. Peningkatan level membuat proses 25% lebih cepat per level.

### Ternak

Ternak dikelola di tab **Ternak**. Kartu **❄️ Gudang dingin** di atas menampilkan level, isi/kapasitas dengan bilah, dan produk ternak di gudang, lalu membuka Gudang › 🐄 Peternakan (tempat memperbesarnya). Setiap kawanan menampilkan produksi per hari, stok pakan dengan tombol beli pakan, kualitas, dan kebahagiaan; jual-beli ternak, kandang, dan pembiakan ada di bagian **⚙️ Kelola kawanan** dan **🧬 Pembiakan** yang bisa dibuka. Ada empat jenis: sapi (susu), ayam (telur), domba (wol), dan babi (daging). Sebelum membeli hewan, kamu harus membangun kandang. Setiap kandang menambah kapasitas.

Setiap hari hewan makan tanaman pakan dari gudang. Misalnya sapi memakan gandum, jagung, barley, atau kedelai. Hewan memakan tanaman pakan yang harganya paling murah lebih dulu. Pakan bisa berasal dari panen sendiri, atau dibeli di pasar dengan harga 20% di atas harga jual. Di kartu ternak ada tombol untuk membeli pakan 3 atau 7 hari, dan game otomatis memilih tanaman pakan yang paling murah. Tanaman juga bisa dibeli langsung di tab **Pasar**. Kamu bisa menyisihkan cadangan pakan per tanaman. Stok cadangan tidak ikut terjual saat kamu menjual dari gudang atau pasar, tetapi tetap boleh dimakan ternak. Tanda ⚠️ di tab 🐄 muncul kalau pakan salah satu ternak tinggal kurang dari sehari. Hewan yang kurang makan akan turun kualitasnya, sehingga produksinya berkurang dan harga jualnya turun. Hasil ternak masuk ke gudang dan dijual di pasar.

**Pembiakan.** Setiap kawanan punya genetika ★ (×0,5–×1,5, ternak yang dibeli ×1,00) yang mengalikan produksi dan harga jual. Ternak lahir sendiri setiap siklus (ayam 4 hari, sapi 12 hari, dst.) kalau kawanan kenyang, kebahagiaannya di atas 70%, minimal 2 ekor, dan kandang masih ada tempat; anaknya mewarisi genetika kawanan ±0,02. **💞 Pembiakan intensif** membuat kelahiran ×4, tetapi pakan ×1,5 dan produksi ×0,75 selama kandang belum penuh. Mode ini berguna untuk mengisi kandang lebih murah daripada membeli, bukan untuk dijual. **🐂 Indukan unggul** (5 tingkat, harga × kapasitas kandang × 20% × tingkat) menaikkan genetika 0,01 per hari menuju ×1,1, ×1,2, … ×1,5. Kalau kandang penuh, kelahiran berhenti dan kamu diberi tahu sekali.

### Kontrak

**Pasar › 📋 Kontrak** berisi tawaran pesanan yang diperbarui setiap hari. Setiap kontrak meminta sejumlah produk sampai hari tertentu, dengan harga di atas harga pasar dan hadiah XP. Saat harga pasar anjlok, harga kontrak dihitung dari minimal 90% harga dasar, dan persentasenya ditampilkan terhadap harga dasar. Kamu boleh menjalankan beberapa kontrak sekaligus. Kirim hasil panen dari gudang sampai jumlahnya terpenuhi untuk menerima bayaran. Kontrak yang lewat batas waktu gagal dan kamu dikenai denda. Angka di tab 📈 menunjukkan jumlah kontrak berjalan yang bisa dikirim sekarang.

### Pengiriman ke kota (truk)

Beli truk di **Garasi** (5 tingkat, mulai level 2: Isuzi Elf 4 t sampai Volvu 60 t). **Pasar › 🚚 Kirim**: pilih truk, kota tujuan, dan muatan dari gudang (cadangan pakan tidak ikut). Ada 8 kota (Bandung, Jakarta, Des Moines, München, Sapporo, Paris, Chicago, Cuiabá); kota hanya bisa dituju dari wilayah tempat kamu punya ladang dan terbuka di level tertentu. Tiap kota membayar harga pasar × pengali permintaan (badge kuning), tanaman maksimal +15%. BBM dibayar saat berangkat; truk dan satu pekerja bebas sibuk selama perjalanan pulang-pergi (`2 × km ÷ kecepatan`); muatan terjual saat tiba di kota. Kapasitas hanya dihitung dari produk bersatuan ton; susu, telur, dan barang kg ikut tanpa memakan kapasitas. Perkiraan menampilkan hasil di kota vs jual lokal, BBM, gaji sopir + aus truk, dan untung bersih. Upgrade mesin berlaku: Mesin = muatan, Transmisi = kecepatan, Efisiensi = BBM.

### Riset

Setiap naik level memberi 1 poin riset (simpanan lama langsung mendapat poin sesuai levelnya). Buka **Prestasi › 🔬 Riset** (angkanya menunjukkan poin yang tersedia) atau ketuk level di bar atas. Cabang yang masih punya riset siap diteliti terbuka otomatis. Empat cabang (🌾 Pertanian, 🐄 Peternakan, 💼 Bisnis, 🚜 Mekanik), masing-masing 5 riset dengan prasyarat; beberapa butuh 2–3 poin. Efeknya: hasil panen, biaya benih/pupuk, pakan, produksi dan kelahiran ternak, gaji, bunga pinjaman, harga kontrak dan kota, BBM, keausan, kecepatan tugas, kapasitas silo, gudang dingin, dan truk. Reset riset mengembalikan semua poin dengan biaya `1.500 × level`.

### Pinjaman

Kalau kekurangan modal, kamu bisa mengambil pinjaman di **Prestasi › 💰 Keuangan** (bagian 🏦 Pinjaman). Batas pinjaman adalah `level × 25.000`. Bunga harian (diatur lewat `BALANCE.loanDailyRate`) dipotong otomatis dari uangmu. Kalau uangmu tidak cukup, bunga ditambahkan ke pokok pinjaman. Pinjaman bisa dilunasi kapan saja.

### Laporan keuangan

Ketuk angka uang di bar atas (atau kartu **📊 Laporan keuangan** di **Prestasi › 💰 Keuangan**) untuk melihat pemasukan dan pengeluaran. Pilih periode Hari ini, Kemarin, 7 hari, 30 hari, atau Semua. Laporan menampilkan pemasukan, biaya operasional (BBM, benih, pupuk/kapur/irigasi, sewa pemanen, gaji, pakan, perbaikan, semprot hama, bunga, denda kontrak, pembelian produk), laba operasional dan margin, investasi (ladang, mesin, upgrade, kandang, ternak, indukan, gudang, pabrik), serta arus kas bersih. Ada kesimpulan singkat ("✅ Untung…" atau "⚠️ Biaya operasional lebih besar…"), rincian per kategori, grafik harian, dan saran untuk biaya terbesar. Pinjaman yang diterima dan pelunasannya dicatat terpisah: bukan pemasukan dan bukan biaya. Rincian per hari disimpan untuk 60 hari terakhir; total sepanjang permainan tetap tersimpan. Simpanan lama mulai mencatat sejak dimuat.

### Level dan prestasi

XP didapat dari setiap tugas yang selesai, dari nilai hasil panen, dan dari produksi ternak. Jumlah XP saat ini dan target level berikutnya tampil di bar atas (misalnya "XP 514/1.500"). Saat naik level kamu mendapat hadiah uang sebesar `1.000 × level` (`BALANCE.levelReward`), dan sebuah jendela menampilkan hadiah itu beserta tanaman, mesin, hewan, pabrik, wilayah, dan ladang yang baru terbuka. Tab **Prestasi** berisi misi harian dan papan peringkat (🎯 Misi), pohon riset (🔬 Riset), daftar target dengan hadiah uangnya, mulai dari yang paling dekat tercapai, beserta statistik dan catatan kejadian (🏆 Prestasi), serta laporan keuangan, pinjaman, dan grafik kekayaan bersih (uang + nilai ladang, mesin, isi gudang, ternak, dan pabrik, dikurangi pinjaman) (💰 Keuangan).

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

- **🎯 Misi harian** (**Prestasi › 🎯 Misi**): setiap hari game ada 3 misi baru yang disesuaikan dengan level dan ladangmu, misalnya "Panen 30 t Jagung", "Jual hasil sendiri senilai .000" (barang yang dibeli dari pasar lalu dijual lagi tidak dihitung), "Selesaikan 2 tugas bajak", "Beli 2 t pakan ternak", "Selesaikan 1 kontrak", atau "Produksi 2 batch di pabrik". Misi yang selesai memberi uang dan XP lewat tombol **Ambil**; angka di ikon tab 🏆 menunjukkan hadiah yang siap diambil. Hadiah yang lupa diambil tetap dibayar saat pergantian hari.
- **🔥 Beruntun**: selesaikan ketiga misi beberapa hari berturut-turut. Setiap 7 hari beruntun ada bonus besar; satu hari terlewat membuat hitungan kembali ke 0.
- **🏆 Papan peringkat**: 7 pertanian pesaing (misalnya Koperasi Sido Rukun, Hoeness Agrar, PT Tani Makmur, Iowa Golden Acres) yang kekayaannya tumbuh setiap hari dengan gaya masing-masing (stabil, agresif, fluktuatif). Baris pertanianmu disorot, dan ▲/▼ menunjukkan perubahan peringkat sejak kemarin. Pesaing terlemah bisa disalip dalam beberapa minggu dan peringkat #2 sekitar hari 120–180. Agro Nusantara Group terus tumbuh pesat, baru bisa disalip sekitar level 20–23, dan tetap membayangi sesudahnya.

### Waktu dan penyimpanan

- Tombol kecepatan di bagian atas: ⏸ (jeda), 1×, 2×, 5×. Pada kecepatan 1×, satu jam game berlangsung 2,5 detik.
- Cuaca setiap wilayah berganti setiap hari, mengikuti musim dan prakiraan 3 hari.
- Permainan tersimpan otomatis di `localStorage` browser.
- Saat game dibuka kembali, atau saat kamu kembali ke tab yang sempat tersembunyi, waktu yang berlalu ikut disimulasikan, maksimal 48 jam game. Kalau game sedang dijeda (⏸), waktu tidak berjalan.
- Kalau data simpanan rusak, salinannya disimpan di `localStorage` dengan kunci `farm-manager-save.bak-<waktu>` sebelum permainan baru dimulai.
- Tab dan sub-tab yang terakhir dibuka, serta bagian yang dilipat/dibuka, diingat setelah halaman dimuat ulang (`localStorage` kunci `farm-manager-tab` dan `farm-manager-ui`).

### Notifikasi

Notifikasi muncul di bagian atas, di bawah bar atas dan bilah sub-tab, sehingga tidak menutupi tombol sub-tab maupun tombol di jendela aksi. Saat sebuah jendela terbuka, notifikasi pindah ke atas bar atas agar judul dan tombol ✕ jendela tetap terlihat. Paling banyak dua notifikasi tampil sekaligus. Kejadian yang sama digabung, misalnya "🌾 3 ladang siap panen.", dan setiap notifikasi bisa ditutup dengan ✕. Notifikasi muncul untuk tanaman siap panen, tanaman layu, prestasi, peringatan pakan, dan kontrak. Naik level ditampilkan dalam jendela tersendiri. Kejadian rutin seperti tugas selesai, penjualan, dan pembelian hanya dicatat di **Prestasi › 🏆 Prestasi** (📜 Catatan kejadian).

Di layar lebar (≥ 1000 px), tab **Ladang** menampilkan Ladangku dan Peta berdampingan: kartu ladang di kiri, peta di kanan (tetap terlihat saat menggulir). Di ponsel mendatar, bar atas menjadi satu baris.

## Struktur proyek

```
index.html          Kerangka halaman: top bar, area tampilan, tab bawah
manifest.webmanifest Manifest PWA (nama, warna, ikon)
sw.js               Service worker: cache app shell untuk mode offline
icons/              Ikon aplikasi (PNG 192/512, maskable, apple-touch-icon; sumber icon.svg)
css/style.css       Gaya dasar dan kerangka aplikasi (mobile-first)
css/fields.css      Gaya tampilan ladang dan tugas
css/economy.css     Gaya tampilan pasar, garasi, ternak, dan gudang
css/ops.css         Gaya silo & gudang dingin, pekerja, dan kondisi mesin
css/factories.css   Gaya bagian Pabrik (Gudang › Olahan)
css/missions.css    Gaya misi harian dan papan peringkat (Prestasi › Misi)
css/breeding.css    Gaya panel pembiakan ternak dan dialog upgrade mesin
css/finance.css     Gaya laporan keuangan
css/logistics.css   Gaya pengiriman truk ke kota
css/orchard.css     Gaya kebun buah dan rumah kaca
css/layout.css      Sub-tab, bagian yang bisa dilipat, daftar stok, tata letak layar lebar/mendatar
js/data.js          Data game: tanaman, produk, mesin, hewan, wilayah, ladang, level, prestasi, BALANCE
js/engine.js        Mesin game (tanpa DOM): state, waktu, aksi pemain, view, simpan/muat
js/engine/*         Modul engine: rng, defs, weather, market, fields, tasks, taskrun,
                    animals, economy, purchase, contracts, plans, views, persist,
                    storage, workers, wear, seasons, events, soil, factories, factoryView,
                    missions, rivals, breeding, upgrades, ledger, orchard, greenhouse,
                    logistics, logisticsView, research
js/ui/*             Komponen antarmuka per tab
js/main.js          Titik masuk: memuat/membuat game, game loop, autosave, navigasi tab
tests/              Tes engine (node:test)
docs/ENGINE_API.md  Dokumentasi API engine
docs/UX_AUDIT.md    Audit tata letak v9 (ukuran sebelum/sesudah, tangkapan layar di docs/shots/)
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
