# Farm Manager

Farm Manager adalah game simulasi bisnis pertanian untuk satu pemain yang berjalan di browser. Game ini terinspirasi dari Farm Manager karya Trophy Games. Kamu memulai dengan satu ladang kecil di Jawa Barat, sebuah traktor, dan beberapa alat. Dari situ kamu membajak, memupuk, menanam, memanen, lalu menjual hasilnya di pasar. Keuntungannya bisa dipakai untuk membeli ladang baru di 13 wilayah di tiga benua (Jawa Barat, Bavaria, Iowa, Normandia, Hokkaido, lalu Kalimantan, Mato Grosso, Queensland, Ukraina, Delta Mekong, Pampas, Kenya, dan Alberta dari level 10 sampai 43; lihat [Wilayah](#wilayah)), membeli mesin yang lebih besar, dan beternak sampai level 50.

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

**Setelah mengubah file game**, perbarui daftar precache di `sw.js` dan versi build di `sw.js` serta `index.html` (versinya adalah hash isi file, jadi browser mendeteksi versi baru; kedua nilai harus sama):

```sh
node -e 'const fs=require("fs"),crypto=require("crypto");const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.isDirectory()?walk(d+"/"+e.name):[d+"/"+e.name]);const files=["index.html","manifest.webmanifest",...["css","js","icons"].flatMap(walk).filter((f)=>/\.(css|js|png|svg)$/.test(f)).sort()];const re=/((?:const|var) VERSION = )".*?";/;const hash=crypto.createHash("sha1");for(const f of files)hash.update(f).update(f==="index.html"?fs.readFileSync(f,"utf8").replace(re,"$1\"\";"):fs.readFileSync(f));const v=hash.digest("hex").slice(0,10);const set=(f,s)=>fs.writeFileSync(f,s.replace(re,"$1\""+v+"\";"));set("index.html",fs.readFileSync("index.html","utf8"));set("sw.js",fs.readFileSync("sw.js","utf8").replace(/\/\/ PRECACHE:start[\s\S]*?\/\/ PRECACHE:end/,"// PRECACHE:start\n"+files.map((f)=>"  \"./"+f+"\",\n").join("")+"  // PRECACHE:end"));console.log("Versi "+v+", "+files.length+" file di-precache")'
```

Jalankan dari folder `farm-manager`. Versi baru terpasang otomatis tanpa perlu mengetuk apa pun: `sw.js` mengecek pembaruan saat game dibuka dan setiap kali game kembali ke layar, menyimpan file versi baru ke cache, lalu langsung aktif dan menghapus cache lama. Game menyimpan permainan, menampilkan toast **Memperbarui ke versi baru…**, dan memuat ulang sekali. File diunduh satu per satu: koneksi yang putus sebentar dicoba lagi, dan file yang ditolak server (mis. 404) dilewati lalu diambil saat pertama kali dipakai, jadi satu file bermasalah tidak lagi menahan pembaruan. Bila internet benar-benar mati, versi lama tetap dipakai dan pembaruan dicoba lagi saat game dibuka berikutnya.

Jalan keluar bila pembaruan tetap macet: `index.html` selalu diambil dari jaringan, dan skrip kecil di `<head>` membawa versi build. Bila halaman masih dikendalikan *service worker* yang cache-nya tidak berisi versi itu setelah pengecekan pembaruan selesai, skrip itu melepas semua *service worker*, menghapus cache `farm-manager-*` (simpanan di `localStorage` tidak disentuh), lalu memuat ulang dari jaringan, paling banyak sekali per sesi. Ini juga menolong versi lama yang sudah terpasang, termasuk yang masih memakai toast **Versi baru tersedia**. Di ⚙️ Pengaturan tertulis **Versi: …** (sama dengan `VERSION` di `sw.js`), dan tombol **🔄 Periksa pembaruan** mencari versi baru; bila tidak ada, game menyimpan permainan lalu memuat ulang semua file dari jaringan. Saat offline tombol ini tidak menghapus apa pun.

## Panduan bermain

### Panduan awal

Pemain baru disambut panduan langkah demi langkah di tab **Ladang**: Bajak → Pupuk → Tanam → percepat 5× → Panen → Jual. Tombol yang perlu diketuk diberi tanda 👆, dan panduan maju sendiri setiap kali satu langkah selesai. Langkah Panen baru berbunyi "Tanaman siap!" kalau ada ladang yang benar-benar siap; sebelum itu panduan menampilkan persentase tumbuh ("Tanaman sedang tumbuh (83%)…"). Panduan bisa ditutup dengan ✕. Kemajuannya disimpan di `localStorage` dengan kunci `farm-manager-tutorial`, terpisah dari data permainan, dan dimulai lagi dari awal setelah reset game. Setelah penjualan pertama, **📖 Bab Petani** melanjutkan arahan (lihat [Bab Petani, misi, dan papan peringkat](#bab-petani-misi-dan-papan-peringkat)).

### Navigasi

Enam tab di bawah: **🗺️ Ladang**, **🚜 Garasi**, **📈 Pasar**, **🐄 Ternak**, **🏚️ Gudang**, **🏆 Prestasi**. Setiap tab dibuka dengan hal yang perlu dikerjakan sekarang, dan bagian lainnya dipisah ke sub-tab di bilah yang tetap terlihat di bawah bar atas:

| Tab | Sub-tab |
|---|---|
| Ladang | 🌾 Ladangku · 🗺️ Peta |
| Garasi | 🚜 Mesin · 👷 Pekerja · 🛒 Toko (filter Traktor/Pemanen/Alat/Truk, mesin terkunci dilipat) |
| Pasar | 💰 Jual · 📋 Kontrak · 🚚 Kirim (🧑‍💼 Manajer Logistik + kirim manual) · 📊 Harga |
| Ternak | satu halaman: gudang dingin, kandangku, mulai beternak, ternak terkunci, cadangan pakan |
| Gudang | 🌾 Pertanian (silo) · 🐄 Peternakan (gudang dingin) · 🏭 Olahan (stok olahan + pabrik) |
| Prestasi | 🎯 Misi (misi harian, 🏆 Liga Musiman) · 🔬 Riset · 🏆 Prestasi · 📖 Ensiklopedia (prangko, 📒 Buku Rekor, kosmetik, piala ekspor) · 🌳 Warisan · 💰 Keuangan (laporan, pinjaman, kekayaan) |

Pindah sub-tab dengan mengetuk bilahnya atau **menggeser layar ke kiri/kanan** (minimal sekitar 60 px dan lebih mendatar daripada tegak); isi baru masuk dari arah geseran, dan penanda di bilah ikut bergeser. Menggulir ke atas/bawah tidak terganggu. Geseran yang dimulai di peta, grafik, kolom isian, atau deretan yang bisa digulir ke samping (misalnya filter Toko) tidak mengganti sub-tab, dan di sub-tab pertama/terakhir isi hanya memantul sedikit. Bila bilah sub-tab tidak muat (layar sempit atau huruf besar), bilahnya bisa digulir ke samping dan sub-tab aktif selalu terlihat. Petunjuk "← geser untuk pindah →" muncul sekali saat pertama kali mengetuk sub-tab di layar sentuh. Sub-tab terakhir tiap tab tetap diingat.

Angka pada tab hanya muncul untuk hal yang bisa ditindaklanjuti: ladang yang perlu langkah, mesin yang hampir rusak, kontrak yang bisa dikirim, pakan hampir habis (⚠️), silo atau gudang dingin hampir penuh atau pabrik terhenti, dan hadiah misi (🔬 bila hanya ada poin riset). Bar atas: uang (ketuk → laporan keuangan), level dan XP (ketuk → riset), cuaca (ketuk → prakiraan), hari dan jam, kecepatan ⏸ 1× 2× 5×, dan ⚙️ Pengaturan (tema, suara, simpan, ulangi panduan, periksa pembaruan, pasang aplikasi, versi, reset).

### Tema

Di ⚙️ Pengaturan ada pilihan **Tema: 📱 Otomatis (ikut HP) · ☀️ Terang · 🌙 Gelap**. Otomatis (bawaan) mengikuti mode gelap/terang ponsel (`prefers-color-scheme`) dan langsung berganti saat mode ponsel berubah; Terang dan Gelap mengabaikan mode ponsel. Pilihan disimpan di `localStorage` dengan kunci `farm-manager-theme`, terpisah dari data permainan.

Tema gelap memakai permukaan hijau-arang yang tidak hitam pekat, teks putih gading, dan aksen tanah yang diredam; tombol utama tetap hijau, dan teks memenuhi kontras WCAG AA (≥ 4,5:1). Peta dan tekstur ladang sedikit diredupkan, semua animasi tetap ada. Bilah status Android (`<meta name="theme-color">`) dan kontrol bawaan (`color-scheme`) ikut tema.

Cara kerjanya: semua warna ada di variabel CSS. `:root` di `css/style.css` berisi tema terang dan `:root[data-theme="dark"]` menimpanya. Skrip kecil di `<head>` `index.html` memasang `data-theme` sebelum halaman pertama kali digambar (tanpa kilatan putih), lalu `js/ui/theme.js` mengurus pilihan di Pengaturan, perubahan mode ponsel, dan warna `theme-color`. Warna baru selalu ditambahkan sebagai variabel di kedua blok, bukan ditulis langsung di aturan CSS atau di JavaScript.

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
  - **💰 Jual otomatis saat panen** (aktif secara bawaan): hasil panen langsung dijual dengan harga pasar sebelum masuk silo, kecuali stok yang disisakan (pakan, sisa kontrak aktif, bahan Manajer Pabrik; lihat [Gudang](#gudang-silo-dan-gudang-dingin)). Dengan begitu uang tidak habis untuk gaji dan bunga.
  - **🔄 Rotasi dengan**: tanaman kedua yang ditanam bergantian dengan tanaman utama setiap siklus, agar terhindar dari penalti tanam berulang (−10%).
  - Rencana menghindari mesin dengan kondisi di bawah 20% kalau ada mesin lain yang bebas. Di Garasi › 🚜 Mesin kamu bisa menyalakan **Perbaikan otomatis**: mesin yang selesai bekerja dengan kondisi di bawah 30% langsung diperbaiki kalau uangnya cukup.

### 👷 Mandor Ladang

🔁 Rencana jalan gratis di **2 ladang**. Untuk lebih banyak ladang kamu perlu satu **Mandor** (Garasi › 👷 Pekerja; ringkasannya juga ada di atas Ladang › Ladangku). Rekrut, 🔄 ganti/promosikan (harga = biaya rekrut baru − 50% biaya rekrut mandor sekarang, turun tingkat gratis), dan berhentikan bekerja seperti Manajer Logistik/Pabrik; biaya dan gaji masuk **Gaji pekerja**.

| Calon | Lv | Biaya rekrut | Gaji/hari | Ladang berencana | Bonus |
|---|---|---|---|---|---|
| Pak Darto, Mandor ★ | 4 | $2.000 | $25 | ≤ 12 | — |
| Bu Sumi, Mandor Senior ★★ | 12 | $25.000 | $800 | ≤ 30 | — |
| Pak Gatot, Kepala Mandor ★★★ | 20 | $120.000 | $5.000 | semua | tugas ladang berencana +5% lebih cepat |

**Keseimbangan.** Bot rencana (ladang + mesin, 2 seed): pendapatan panen rencana per hari di level buka tiap tingkat ≈ $600–2.500 (Lv 4), $53.000–83.000 (Lv 12) dan $230.000–580.000 (Lv 20), jadi gajinya ≈ 1–4%, 1–1,5%, dan 0,9–2,2% dari pendapatan ladang yang dijalankan.

Rencana di luar batas tetap tersimpan tetapi dijeda dengan label **⏸ Butuh Mandor (2/2 ladang gratis)** dan tombol **👷 Rekrut Mandor**. Rencana yang sudah jalan tidak pernah dijeda oleh ladang baru atau ladang yang lebih luas: urutannya ladang yang kamu **📌 Utamakan / Jalankan di sini**, lalu rencana yang lebih dulu aktif, lalu ladang terluas; rencana baru di luar batas yang menunggu. "⚡ Kerjakan sekaligus" tetap bisa dipakai, dan mode hemat offline juga hanya menjalankan rencana yang tidak dijeda. **Simpanan lama** dengan lebih dari 2 ladang berencana langsung mendapat mandor gratis yang menutup semuanya (Kepala Mandor bila > 30 ladang atau Lv ≥ 20) dan satu notifikasi "👷 Mandor otomatis dipekerjakan untuk save lama"; tidak ada rencana lama yang dijeda.

Batas 12 / 30 ladang dipilih dengan bot tanam saja (2 seed): dengan batas awal 6 / 20, Lv 20 baru tercapai sekitar hari 540 (v16: hari ≈ 330) karena ladang tertahan di 6 sampai Lv 12; dengan 12 / 30 Lv 20 dan Lv 40 kembali sekitar 2% dari v16.

### Ladang dan peta

Tab **Ladang** punya dua sub-tab. **🌾 Ladangku** dibuka lebih dulu: ladang yang perlu langkah berikutnya (siap panen, kosong, dibajak tanpa rencana, terkena hama atau layu) tampil paling atas di "⚡ Perlu tindakan", ladang yang sedang dikerjakan atau tumbuh di "⏳ Sedang berjalan", lalu "🛒 Ladang dijual" berisi tiga ladang termurah yang sudah terbuka. Di setiap kartu, langkah berikutnya adalah satu-satunya tombol hijau. **🗺️ Peta** menampilkan peta semua wilayah; penanda ladang milikmu berbeda dengan ladang yang dijual. Ketuk sebuah ladang (di peta atau di daftar) untuk melihat luas, jenis tanah, pH, kontaminasi, dan harganya, lalu beli ladang tersebut. Di detail ladang, bagian sekunder (rencana, faktor hasil, rumah kaca, prakiraan, lahan) bisa dilipat. Ladang yang sedang kosong bisa dijual lagi dari detail ladang dengan nilai 70% dari harga beli. Ladang terakhir yang kamu miliki tidak bisa dijual. Angka pada ikon tab 🗺️ menunjukkan jumlah ladang yang perlu tindakan (merah jika ada hama atau tanaman layu).

### Musim, prakiraan, dan kejadian

- Satu tahun game berlangsung 40 hari. Bavaria, Iowa, Normandia, dan Hokkaido melewati musim semi 🌱, panas ☀️, gugur 🍂, dan dingin ❄️ (masing-masing 10 hari). Jawa Barat punya musim hujan 🌧️ (peluang hujan lebih tinggi) dan kemarau 🌵.
- Tiap tanaman punya musim tanam yang cocok dan suhu minimum. Di luar musim, tanaman tumbuh ×0,6 dan hasilnya sedikit turun; di bawah suhu minimum (misalnya jagung di musim dingin Hokkaido) pertumbuhan berhenti. Pemilih tanaman menandai ✅ musimnya, ⏳ luar musim, atau ❄️ terlalu dingin, plus petunjuk dari prakiraan.
- Harga tanaman sedikit lebih murah saat musimnya dan lebih mahal di luar musim.
- Ketuk cuaca di bilah atas untuk melihat musim dan prakiraan 3 hari setiap wilayah. Prakiraan juga ada di detail ladang dan membantu memutuskan perlu mengairi atau tidak (prakiraan kadang meleset).
- Kira-kira sekali tiap 4 hari terjadi kejadian acak: 🐛 hama (hasil −25% sampai disemprot, biaya $40/ha), ⛈️ badai (tanaman rusak 5–15%, tapi hujan gratis), 🔥 gelombang panas (beberapa hari kering), 📈 harga melonjak / 📉 harga anjlok untuk satu produk, 💰 subsidi pemerintah, dan 🌈 cuaca ideal (tanaman tumbuh lebih cepat).

### 📰 Kabar Desa dan ⚠️ Bencana Besar (v17)

- Mulai level 3, kira-kira sekali tiap 3 hari game muncul **Kabar Desa**: kartu koran di atas Ladang › Ladangku (tidak menghentikan permainan). Hanya satu kabar terbuka pada satu waktu, dan hanya kabar yang relevan dengan milikmu (flu burung bila punya unggas, ikan mati bila punya kolam, maling bila punya ternak, gaji bila pekerja ≥ 4, pesanan ekspor bila punya Pelabuhan, dll.; 14 jenis).
- Ketuk kartunya untuk membaca detail: 2–3 pilihan dengan biaya dan peluang yang jelas, dan batas waktu 24–48 jam game. Bila tidak memilih, pilihan **⏱️ otomatis** (yang paling hati-hati) dijalankan saat batas waktu, juga saat offline. Pilihan otomatis tidak pernah mengorbankan ternak.
- Biaya ikut besar penghasilanmu (dalam "hari pendapatan"), dan kerugian dibatasi (maks. 1,5 hari pendapatan dan 20% kas).
- **⚠️ Bencana Besar** (mulai level 10, sekitar 1–2 kali setahun game): 🔥 El Niño (satu wilayah tanpa hujan 10 hari), 🌾 Krisis Pangan (harga tanaman ×1,5 dan banyak tawaran kontrak), 🦠 Wabah Ternak. Bencana diumumkan 3 hari sebelumnya; pilih persiapan sekali (dibayar saat itu). Tanpa pilihan, persiapan otomatis yang hati-hati dipakai.
- 10 keputusan terakhir ada di Prestasi › 🏆 Prestasi › 📰 Kabar Desa.

### 🏛️ Proyek Warisan (v17)

Mulai level 15, sub-tab **Ladang › 🏛️ Proyek**. Tiap wilayah punya 4 dari 5 proyek: 🏞️ Bendungan (peluang hujan minimum, El Niño lebih ringan), ⚓ Pelabuhan Ekspor (harga kota di benua itu naik), 🔭 Pusat Riset (+1 poin riset per tahap), 🤝 Koperasi Petani (benih, pupuk, dan gaji lebih hemat) dan 🏪 Pasar Induk (bonus kontrak selesai). Tiap proyek punya 3 tahap: sekitar $1 jt (4 hari, Lv 15) → $50 jt (10 hari, Lv 25) → $1 M (25 hari, Lv 35); wilayah yang lebih jauh sedikit lebih mahal. Butuh minimal 1 ladang di wilayah itu, maksimal 3 proyek dibangun bersamaan. Bila setiap wilayah satu benua punya proyek tahap 3, **Monumen** benua itu bisa dibangun ($2 M, 30 hari, Lv 40, +3 poin riset). Proyek tampil di 🗺️ Peta dengan derek yang bergoyang selama dibangun dan kilau saat selesai.

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

Setiap tugas ladang butuh satu pekerja bebas. Pengecualiannya panen dengan pemanen sewaan, karena sopirnya sudah termasuk. Kamu mulai dengan satu pekerja, Pak Budi. Di **Garasi › 👷 Pekerja** ada tiga calon yang berganti setiap minggu; merekrut mereka gratis. Pekerja yang lebih ahli menyelesaikan tugas sampai 20% lebih cepat, dan keahliannya naik sedikit demi sedikit setiap kali menyelesaikan tugas. Gaji dibayar setiap pergantian hari. Kalau uang kurang, kekurangannya ditambahkan ke pinjaman. Rencana ladang yang menunggu pekerja menampilkan "Tidak ada pekerja bebas." Di bawah daftar pekerja ada **🧑‍💼 Manajer Logistik** (lihat [Manajer Logistik](#manajer-logistik)).

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

**🏚️ Gudang penuh**: setiap penjualan paksa dicatat per hari (ton, uang diterima, rugi dibanding harga pasar). Di Gudang › Pertanian / Peternakan muncul kartu merah "Gudang penuh — kemarin $X dijual paksa (rugi $Y)" dengan tombol **Perbesar silo ($…)** / **Perbesar gudang dingin ($…)**; kartu hilang setelah sehari tanpa luapan.

**Stok yang disisakan** (satu aturan untuk 💰 Jual otomatis rencana, Manajer Logistik, dan **Jual semua…**): cadangan pakan / stok pakan otomatis, sisa jumlah kontrak aktif, dan bahan yang direncanakan Manajer Pabrik (antrean + rencana 24 jam ke depan; Manajer Logistik: satu interval rencana). Jual otomatis rencana menjual hasil panen **sebelum** masuk silo, sehingga silo penuh tidak menjual paksa 70% bagian yang memang akan dijual 100%.

**🛒 Beli pakan otomatis** (Ternak › Kandangku; **Beli pelet otomatis** di Ternak › Ikan): aktif secara bawaan, juga di simpanan lama, karena hanya mencegah ternak/ikan kelaparan. Setiap tengah malam, sebelum hewan makan, kekurangan pakan untuk hari ini + N hari (bawaan 3, bisa 1–14) dibeli di pasar dengan harga beli (+20%), tanaman pakan termurah, dicatat sebagai **Pakan**. Hanya memakai uang tunai (tidak pernah meminjam) dan ruang silo yang ada.

### Pabrik

Mulai level 11, pabrik bisa dibeli di **Gudang › 🏭 Olahan** (bagian 🏭 Pabrik; pabrik yang belum terbuka dilipat di "🔒 Pabrik terkunci"): Penggilingan (Lv 11: gandum → tepung, barley → malt), Pabrik Susu (Lv 13: susu → mentega/keju sapi), Pabrik Gula (Lv 15: tebu → gula), Pabrik Minyak (Lv 18: kanola/bunga matahari → minyak), Pabrik Kelapa Sawit (Lv 19: TBS kelapa sawit → CPO + inti sawit, inti sawit → minyak inti sawit/PKO, CPO → minyak goreng), Toko Roti (Lv 21: tepung + telur + gula (+ mentega) → roti/kue), dan Pabrik Tekstil (Lv 24: kapas → kain, wol → benang). Pilih resep, tekan ▶ Proses atau nyalakan 🔁 Otomatis. Bahan diambil dari gudang saat batch dimulai (cadangan pakan tidak dipakai) dan produk olahan bernilai sekitar 30–55% lebih tinggi. Produk berat (t) butuh ruang silo; jika silo penuh, pabrik menunggu. Peningkatan level membuat proses 25% lebih cepat per level.

### Manajer Pabrik

Kartu **🏭 Manajer Pabrik** ada paling atas di bagian 🏭 Pabrik (**Gudang › 🏭 Olahan**), dan ringkasannya juga muncul di **Garasi › 👷 Pekerja**. Manajer menjalankan pabrikmu sendiri: ia memakai bahan baku di gudang untuk memproduksi barang jadi dengan resep yang paling untung. Hanya ada satu Manajer Pabrik, dan rekrut, ganti/promosikan, serta berhentikan bekerja persis seperti di Manajer Logistik.

| Calon | Lv | Biaya rekrut | Gaji/hari | Pabrik dikelola | Rencana tiap | Bonus |
|---|---|---|---|---|---|---|
| Mbak Sari, Supervisor ★ | 11 | $4.000 | $100 | ≤ 2 | 6 jam | — |
| Pak Joko, Kepala Produksi ★★ | 15 | $14.000 | $480 | ≤ 5 | 2 jam | bahan −5% |
| Bu Lestari, Direktur Pabrik ★★★ | 25 | $32.000 | $950 | semua | 1 jam | bahan −5%, hasil +6%, boleh membeli bahan yang kurang |

Supervisor terbuka di level 11, saat pabrik sudah bisa dibeli (Pabrik Pakan Ikan Lv 10, Penggilingan Lv 11), jadi manajer tidak pernah bisa direkrut tanpa pabrik yang bisa dikelola. Biaya rekrut dan gaji masuk laporan sebagai **Gaji pekerja**. Gaji yang tak terbayar ditambahkan ke pinjaman. **🔄 Ganti / promosikan**: harga = biaya rekrut tingkat baru − 50% biaya rekrut manajer sekarang (Supervisor → Kepala $12.000, Kepala → Direktur $25.000, Supervisor → Direktur $30.000), dan turun tingkat gratis. Pengaturan, statistik, batch terakhir, dan sakelar Aktif/Jeda tetap tersimpan setelah ganti.

**Keseimbangan.** Simulasi 30 hari (3 seed pasar, pabrik level 1, silo/gudang dingin Lv 3, stok bahan baku masuk tiap hari, produk dijual tiap hari). Angkanya tambahan bersih per hari setelah gaji dan biaya rekrut dibagi 30 hari:

| Tingkat | Lv | Pabrik | Bahan masuk/hari | vs jual mentah | vs 🔁 Otomatis sendiri |
|---|---|---|---|---|---|
| Supervisor | 11 | Penggilingan | 30 t gandum, 8 t barley | +$9.350 … +$13.550 | −$1.690 … +$570 (rata-rata ≈ −$230) |
| Kepala Produksi | 15 | + Pabrik Susu, Pabrik Gula | + 2.000 L susu, 60 t tebu | +$13.400 … +$15.600 | +$1.640 … +$2.680 |
| Direktur Pabrik | 25 | + Pabrik Minyak, Kelapa Sawit, Toko Roti | + 10 t kanola, 20 t TBS, 3.000 telur | +$18.600 … +$29.000 | +$3.980 … +$9.090 |

Semua tingkat jauh lebih untung daripada menjual bahan mentah. Dibanding menyalakan 🔁 Otomatis sendiri, produksi Supervisor kira-kira sama, jadi selisihnya hanya gaji $100/hari plus biaya rekrut ($4.000, ≈ $133/hari dalam 30 hari pertama): nilainya ada di pemilihan resep, aturan tahan bahan, dan tidak perlu diurus. Kepala Produksi dan Direktur membayar dirinya berkat bahan −5%, hasil +6%, dan rencana yang lebih sering.

**Cara kerja.** Setiap *rencana tiap* jam game, manajer menilai semua resep di pabrik yang ia kelola menurut untung per jam: hasil × harga pasar − bahan × harga pasar − bagian gaji. Resep untuk kontrak aktif yang stoknya belum cukup didahulukan. Ia hanya memakai stok yang bisa dijual: cadangan pakan, sisa kontrak aktif, bahan yang disisakan Manajer Logistik, dan "Sisakan %" per bahan tidak disentuh. Antrean diisi sebanyak yang selesai sebelum rencana berikutnya. Manajer juga tidak memproduksi ke gudang yang sudah melewati batas **Isi gudang maks.**, tetapi batch yang justru mengecilkan isi gudang (10 t gandum → 7,5 t tepung) tetap jalan. Direktur dengan **🛒 Beli bahan kurang** menyala membeli tanaman bahan yang kurang di pasar (harga beli = harga jual +20%), asalkan batch itu masih di atas margin minimum dan uangnya cukup.

Pabrik yang dikelola memperlihatkan **🔒 Dikelola Manajer Pabrik**: pilihan resep, 🔁 Otomatis, dan ▶ Proses dikunci, sedangkan upgrade pabrik tetap bisa. Pabrik di luar batas tingkat manajer (urutan data: Penggilingan, Pabrik Susu, …) atau yang kamu lepas dengan tombol **✓ Kelola** kembali kamu atur sendiri. **Bahan yang direncanakan manajer pabrik**, yaitu bahan untuk batch yang masih antre ditambah rencana berikutnya, **tidak dimuat truk Manajer Logistik**.

Kartu menampilkan sakelar **Aktif/Jeda**, batch hari ini dan total, perkiraan untung, **Terakhir** (mis. "2× Tepung, 1× Gula") dan **Rencana berikutnya** (hitung mundur), daftar pabrik beserta keadaannya (⚙️ resep yang sedang jalan, 💤 alasan menunggu: "bahan kurang", "gudang hampir penuh", "margin terlalu kecil"), empat batch terakhir, dan **⚙️ Pengaturan manajer**: margin minimum (bawaan 5%), isi gudang maks. (bawaan 90%), sisakan stok kontrak, beli bahan (khusus Direktur), dan "Sisakan %" per bahan baku. Bila pabrik yang dikelola menganggur ≥ 1 hari game, kotak merah **⛔ … menganggur** menyebut alasannya dan satu tombol perbaikan: **Aktifkan beli bahan** (Direktur dengan beli bahan mati), **Perbesar silo**, **Turunkan margin min. ke 0%**, atau **Beli bahan di Pasar**. Beli bahan menyala sendiri saat Direktur baru direkrut atau dipromosikan (kecuali kamu pernah mengaturnya); manajer hanya membeli bila resepnya tetap untung di atas margin minimum dengan harga beli +20%. Saat game ditinggal, manajer mengejar 48 jam penuh, lalu bekerja 50% dalam mode hemat.

### Diversifikasi (v17)

Ternak, ikan, dan pabrik kini tetap berarti di akhir permainan:

- **Konten baru**: 🏭 **Pabrik Kopi** (Lv 30, $220.000: 20 t kopi → 16 t ☕ kopi bubuk, +45%), 🐦 **Rumah Walet** (Lv 36, bangunan $300.000 untuk 2.000 walet; 🪹 sarang walet $1.200/kg, hampir tanpa pakan dan ringan untuk gudang dingin), 🐂 **Sapi Wagyu** (Lv 42, $9.000/ekor, 🥩 daging wagyu $120/kg) dan 🏭 **Pabrik Cokelat** (Lv 48: kakao + susu + gula → cokelat batangan, +55%; atau kakao + gula, +26%). Semuanya balik modal ±35–40 hari, dan tiap rentang 3 level dari Lv 25 sampai 50 kini membuka sesuatu yang berarti.
- **Harga kota untuk barang non-tani naik dengan levelmu**: +0,5% per level di atas Lv 20 (maks. +15% di Lv 50), di atas pengali permintaan kota. Tanaman dan barang yang bisa dibeli (pelet) tidak ikut, jadi beli-lalu-kirim tetap tidak untung. Kota akhir juga meminta kopi bubuk, sarang walet, daging wagyu, dan cokelat.
- **⭐ Kontrak premium** (mulai Lv 15): satu tawaran tambahan khusus produk ternak, ikan, atau olahan yang benar-benar kamu hasilkan, jumlahnya 2–4 hari produksi dengan harga 22–35% di atas pasar (+0,6% per level di atas 15, maks. ×1,6). Kontrak ini punya slot aktif sendiri di samping 3 kontrak biasa.
- **Manajer Pabrik Direktur** yang baru direkrut atau dipromosikan langsung menyalakan **🛒 Beli bahan kurang**, kecuali kamu pernah mengatur sakelarnya sendiri. Manajer hanya membeli bila resepnya tetap di atas margin minimum dengan harga beli ×1,2, jadi tidak pernah membeli dengan rugi; pabrik tidak lagi menganggur karena "bahan kurang".

### 📉 Pasar jenuh dan kandang yang makin mahal (v17)

Ternak, ikan, dan pabrik kini jadi pilar yang kuat, tetapi tidak lagi menelan seluruh pertanian:

- **📉 Pasar jenuh.** Menjual banyak produk ternak, ikan, atau olahan yang sama dalam waktu singkat menurunkan harganya di pasar lokal. Di Gudang dan Pasar baris produk itu menampilkan **📉 Harga turun 8% karena banyak dijual hari ini** (atau "beberapa hari terakhir"), dan tombol **Jual $…** sudah memakai harga yang turun. Tanaman, buah, dan barang yang bisa dibeli (pelet ikan) tidak pernah jenuh.
  - Setiap pergantian hari 45% "tekanan" penjualan tersisa, jadi harga pulih dalam ±3–5 hari. Penurunan paling banyak 60%.
  - Pasar tumbuh bersama levelmu. Kedalaman pasar per produk (nilai harga dasar per hari): ±$10.000 di Lv 1, $200.000 di Lv 10, $5 jt di Lv 20, $15 jt di Lv 30, $30 jt di Lv 40, dan $60 jt di Lv 50. Menjual 10% dari kedalaman itu dalam sehari membuat harga turun ±10% di akhir penjualan (rata-rata ±5%).
  - Satu kali jual besar sama hasilnya dengan beberapa kali jual kecil di hari yang sama; menyebar penjualan ke beberapa hari lebih untung. Gudang dingin yang meluap (jual paksa 70%) dan muatan truk yang dijual di kota juga ikut menekan harga. **Kontrak** dibayar dengan harga kontrak dan tidak terpengaruh, jadi ⭐ kontrak premium adalah jalan keluar untuk produksi besar.
- **🏗️ Kandang dan kolam makin mahal.** Kandang pertama setiap hewan tetap seharga dasarnya; setiap kandang hewan yang sama yang sudah kamu punya menambah 0,7% harga dasar (kandang ke-51 ×1,35, ke-151 ×2,05). Kolam ikan juga begitu, dihitung per jenis kolam. Kartu ternak dan daftar kolam selalu menampilkan harga kandang/kolam berikutnya, dan balik modal kolam memakai harga itu.
- **Data ternak disetel ulang**: pakan sekitar 15% dari nilai produk, dan satu kandang penuh balik modal ±33–43 hari pada harga dasar (termasuk kandang). Dengan kandang yang makin mahal dan pasar jenuh, kawanan yang terus diperbesar balik modal ±45–70 hari.

**Sebelum/sesudah** (bot tanpa layar, `createGame({seed})` + `advance`, seed 1–2, sampai Lv 50 atau 2.000 hari). *Investor* membeli ladang, kandang, kolam, dan pabrik bila balik modal ≤ 40 hari serta membangun proyek bila kas ≥ 2× biaya tahap; *tanam saja* hanya membeli ladang dan mesin. Angka = rata-rata dua seed, bagian pendapatan tanaman / ternak / ikan / pabrik / lain (kontrak, hadiah):

| Bot | Lv 1–9 | Lv 10–19 | Lv 20–29 | Lv 30–39 | Lv 40–50 | Hari Lv 50 | Kas Lv 30 / 40 / 50 |
|---|---|---|---|---|---|---|---|
| Investor v16 | 12/76/0/0/13 | 32/43/19/0/7 | 48/22/24/0/7 | 35/23/37/0/6 | 31/27/35/0/7 | 1.431–1.535 | $0,26–0,29 M / $1,7–1,8 M / $6,6 M |
| Investor v17 | 33/41/11/0/17 | 38/41/10/2/10 | 54/29/8/1/9 | 49/34/11/0/7 | 48/38/7/0/7 | 1.891–1.896 | $45–51 jt / $75–105 jt / $0,68–0,73 M |
| Tanam saja v16 | 80/0/0/0/21 | 92/0/0/0/8 | 93/0/0/0/7 | 95/0/0/0/6 | 94/0/0/0/6 | 2.944 (seed 1, Lv 42 di hari 2.000) | $0,31–0,32 M / $1,5 M / — |
| Tanam saja v17 | 78/0/0/0/23 | 92/0/0/0/9 | 93/0/0/0/7 | 95/0/0/0/6 | 94/0/0/0/6 | 2.956 (seed 1, Lv 42 di hari 2.000) | $0,29–0,34 M / $1,5–1,6 M / — |

Investor v16 menumpuk 1,7 juta ayam dan 11.700 kolam; v17 berhenti di ±36.000 ayam dan ±790 kolam dengan pendapatan ternak 29–41% di setiap rentang level, sedangkan tanaman tetap ≥ 33%. Investor v17 mencapai Lv 50 ±20–30% lebih lambat, dan kasnya lebih kecil karena ia juga membangun ±108 tahap Proyek Warisan (v16 belum punya proyek). Bot tanam saja mencapai Lv 40 di hari ±1.710–1.740 (v16 ±1.665–1.700) dan Lv 50 di hari 2.956 (v16 2.944, seed 1 dijalankan sampai 3.500 hari).

### Ternak

Ternak dikelola di tab **Ternak**. Kartu **❄️ Gudang dingin** di atas menampilkan level, isi/kapasitas dengan bilah, dan produk ternak di gudang, lalu membuka Gudang › 🐄 Peternakan (tempat memperbesarnya). Setiap kawanan menampilkan produksi per hari, **kandang hidup** (hingga 6 hewan yang berjalan, merumput, mematuk, atau berdengung, sesekali berseru "Mooo!"/"Petok!" dan memunculkan produknya 🥚🥛; animasi CSS ringan yang berhenti saat tab tersembunyi dan hanya diperlambat bila HP meminta gerak dikurangi), stok pakan dengan tombol beli pakan, kualitas, dan kebahagiaan; jual-beli ternak, kandang, dan pembiakan ada di bagian **⚙️ Kelola kawanan** dan **🧬 Pembiakan** yang bisa dibuka. Ada empat jenis: sapi (susu), ayam (telur), domba (wol), dan babi (daging). Sebelum membeli hewan, kamu harus membangun kandang. Setiap kandang menambah kapasitas.

Setiap hari hewan makan tanaman pakan dari gudang. Misalnya sapi memakan gandum, jagung, barley, atau kedelai. Hewan memakan tanaman pakan yang harganya paling murah lebih dulu. Pakan bisa berasal dari panen sendiri, atau dibeli di pasar dengan harga 20% di atas harga jual. Di kartu ternak ada tombol untuk membeli pakan 3 atau 7 hari, dan game otomatis memilih tanaman pakan yang paling murah. Tanaman juga bisa dibeli langsung di tab **Pasar**. Kamu bisa menyisihkan cadangan pakan per tanaman. Stok cadangan tidak ikut terjual saat kamu menjual dari gudang atau pasar, tetapi tetap boleh dimakan ternak. Tanda ⚠️ di tab 🐄 muncul kalau pakan salah satu ternak tinggal kurang dari sehari. Hewan yang kurang makan akan turun kualitasnya, sehingga produksinya berkurang dan harga jualnya turun. Hasil ternak masuk ke gudang dan dijual di pasar.

**Pembiakan.** Setiap kawanan punya genetika ★ (×0,5–×1,5, ternak yang dibeli ×1,00) yang mengalikan produksi dan harga jual. Ternak lahir sendiri setiap siklus (ayam 4 hari, sapi 12 hari, dst.) kalau kawanan kenyang, kebahagiaannya di atas 70%, minimal 2 ekor, dan kandang masih ada tempat; anaknya mewarisi genetika kawanan ±0,02. **💞 Pembiakan intensif** membuat kelahiran ×4, tetapi pakan ×1,5 dan produksi ×0,75 selama kandang belum penuh. Mode ini berguna untuk mengisi kandang lebih murah daripada membeli, bukan untuk dijual. **🐂 Indukan unggul** (5 tingkat, harga × kapasitas kandang × 20% × tingkat) menaikkan genetika 0,01 per hari menuju ×1,1, ×1,2, … ×1,5. Kalau kandang penuh, kelahiran berhenti dan kamu diberi tahu sekali.

### Kontrak

**Pasar › 📋 Kontrak** berisi tawaran pesanan yang diperbarui setiap hari. Setiap kontrak meminta sejumlah produk sampai hari tertentu, dengan harga di atas harga pasar dan hadiah XP. Saat harga pasar anjlok, harga kontrak dihitung dari minimal 90% harga dasar, dan persentasenya ditampilkan terhadap harga dasar. Kamu boleh menjalankan beberapa kontrak sekaligus. Kirim hasil panen dari gudang sampai jumlahnya terpenuhi untuk menerima bayaran. Kontrak yang lewat batas waktu gagal dan kamu dikenai denda. Angka di tab 📈 menunjukkan jumlah kontrak berjalan yang bisa dikirim sekarang.

### Pengiriman ke kota (truk)

Beli truk di **Garasi** (6 tingkat, mulai level 2: Isuzi Elf 4 t sampai Scanya road train 90 t di level 35). **Pasar › 🚚 Kirim**: pilih truk, kota tujuan, dan muatan dari gudang (cadangan pakan tidak ikut). Ada 19 kota (Bandung, Jakarta, Des Moines, München, Sapporo, Paris, Chicago, Cuiabá, Brisbane, dan kota wilayah baru, lihat [Wilayah](#wilayah)); kota hanya bisa dituju dari wilayah tempat kamu punya ladang dan terbuka di level tertentu. Tiap kota membayar harga pasar × pengali permintaan (badge kuning), tanaman maksimal +15%. BBM dibayar saat berangkat; truk dan satu pekerja bebas sibuk selama perjalanan pulang-pergi (`2 × km ÷ kecepatan`); muatan terjual saat tiba di kota. Kapasitas hanya dihitung dari produk bersatuan ton; susu, telur, dan barang kg ikut tanpa memakan kapasitas. Perkiraan menampilkan hasil di kota vs jual lokal, BBM, gaji sopir + aus truk, dan untung bersih. Upgrade mesin berlaku: Mesin = muatan, Transmisi = kecepatan, Efisiensi = BBM.

### Manajer Logistik

Mulai **level 6** kamu bisa merekrut **🧑‍💼 Manajer Logistik** di **Pasar › 🚚 Kirim** (kartu paling atas; pengiriman manual tetap ada di bawahnya). Manajer bukan pekerja ladang: ia tidak menyetir sendiri, tetapi memakai truk yang menganggur dan pekerja bebas sebagai sopir untuk menjual stok gudang di kota yang paling untung. Ada tiga calon:

| Calon | Lv | Biaya rekrut | Gaji/hari | Truk sekaligus | Radius | Negosiasi |
|---|---|---|---|---|---|---|
| Dimas, Manajer Magang ★ | 6 | $3.000 | $150 | 1 | 100 km | +0% |
| Bu Ratna, Manajer Senior ★★ | 9 | $12.000 | $450 | 3 | 300 km | +2% |
| Pak Hartono, Direktur Logistik ★★★ | 14 | $30.000 | $900 | 6 | 1.000 km | +4% |

Biaya rekrut dan gaji harian masuk laporan keuangan sebagai **Gaji pekerja** (riset Bisnis yang memotong gaji juga berlaku); gaji yang tak terbayar ditambahkan ke pinjaman seperti gaji pekerja. **Radius** adalah kota terjauh yang direncanakan, dan **negosiasi** menaikkan harga kota pada kiriman manajer (tanaman tetap maksimal ×1,15, jadi beli-lalu-kirim tidak pernah untung). Hanya satu manajer sekaligus: satu manajer mengatur semua truk; **Berhentikan** menghentikan gaji, truk yang sedang jalan tetap pulang, dan pengaturan disimpan untuk manajer berikutnya. Garasi › 👷 Pekerja juga menampilkan manajer (nama, tingkat, status, gaji, jumlah trip) dengan tombol ke Pasar › Kirim.

**🔄 Ganti / promosikan manajer.** Setelah direkrut, kartu manajer punya bagian lipat **🔄 Ganti / promosikan manajer** di bawah status, berisi tingkat lain (truk, radius, negosiasi, selisih gaji per hari, level buka, dan harga setelah tukar). Harga ganti = biaya rekrut tingkat baru − **50%** biaya rekrut manajer sekarang (potongan tukar), tidak pernah di bawah $0, dan masuk laporan sebagai **Gaji pekerja**:

| Dari → ke | Harga |
|---|---|
| Magang → Senior | $12.000 − $1.500 = **$10.500** |
| Magang → Direktur | $30.000 − $1.500 = **$28.500** |
| Senior → Direktur | $30.000 − $6.000 = **$24.000** |
| Turun tingkat (mis. Direktur → Senior) | **$0** (gaji lebih murah mulai pergantian hari berikutnya) |

Tombol **Promosikan** (naik) atau **Ganti** (turun) membuka konfirmasi yang menampilkan perubahan truk, radius, negosiasi, gaji, dan harga. Level buka tetap berlaku ("Terbuka di Lv N"), dan memilih tingkat yang sama ditolak. Pengaturan, statistik (trip, untung ekstra, kiriman terakhir), sakelar Aktif/Jeda, dan truk yang sedang jalan tetap; jatah truk, radius, dan negosiasi baru berlaku mulai perencanaan berikutnya (langsung bila Aktif). Truk yang sudah berangkat tetap memakai negosiasi saat berangkat. Turun ke tingkat dengan jatah truk lebih kecil tidak memanggil truk pulang; manajer hanya menunggu sampai jumlah truk di jalan di bawah jatahnya.

Setelah direkrut, kartu menampilkan sakelar **Aktif/Jeda**, trip hari ini, total trip, **untung ekstra** (perkiraan untung semua kiriman otomatis dibanding jual lokal), alasan bila manajer sedang menunggu (misalnya "Menunggu sopir" atau "Belum ada kiriman yang memenuhi untung minimum"), dan empat kiriman terakhir (kota, muatan, truk, jam, perkiraan untung). Kalau ada rencana ladang dengan **💰 Jual otomatis**, kartu mengingatkan bahwa hasil panen itu langsung terjual dan tidak sempat dikirim.

**🚚 Dikirim Manajer Logistik.** Produk ternak dibuat tengah malam, dan manajer bisa memuatnya ke truk pada jam yang sama, jadi stoknya tidak pernah terlihat di gudang (misalnya 🪹 sarang walet dan 🥩 daging wagyu yang dijual ke Jakarta / TP Ho Chi Minh). Karena itu Gudang (tiap sub-tab) dan Pasar › 💰 Jual menampilkan kartu **🚚 Dikirim Manajer Logistik** untuk produk yang dimuat manajer dalam 48 jam game terakhir: jumlah hari itu, kota tujuan, perkiraan nilai di kota, dan jamnya. Tombol **📦 Simpan di gudang** di setiap baris berarti "jangan dikirim otomatis" (sama dengan 🚫 Tidak di pengaturan): produksi berikutnya tetap di Gudang dingin dan bisa dijual dengan **Jual $…**. **🚚 Kirim lagi** membatalkannya. Daftar produk di ⚙️ Pengaturan manajer juga memuat produk yang dikirim dalam 10 hari terakhir walau stoknya 0.

**⚙️ Pengaturan manajer** (bisa dilipat, tersimpan di simpanan game):

- **Kelompok produk**: 🌾 Pertanian, 🐄 Peternakan, 🏭 Olahan (semua aktif secara bawaan).
- **Kota tujuan**: semua kota yang sudah terbuka dan terjangkau aktif secara bawaan; kota di luar radius manajer ditandai "(jauh)".
- **Untung minimum per trip** ($0–$5.000, bawaan $100) dan **minimal di atas jual lokal** (0–30%, bawaan 3%): keduanya harus terpenuhi.
- **Sisakan pekerja bebas** (bawaan 1): manajer hanya mengambil sopir bila masih ada lebih dari N pekerja bebas, jadi tugas ladang tidak kehabisan pekerja. Rencana ladang selalu dijalankan lebih dulu tiap jam.
- **Maks. truk dipakai**: batas tambahan di bawah jatah truk manajer ("Semua" = jatahnya).
- **Produk**: per produk ✓ Kirim / 🚫 Tidak dan **Sisakan 0–90%**. "Sisakan X%" berlaku untuk setiap stok baru yang masuk: dari 40 t padi dengan sisakan 50%, 20 t tetap di gudang; panen 20 t berikutnya menambah 10 t yang disisakan.
- Cadangan pakan dan sisa jumlah kontrak aktif selalu disisakan.

**Cara manajer memilih.** Setiap jam game (dan setiap kali tugas ladang selesai atau truk pulang), untuk setiap truk yang bebas dan kondisinya ≥ 20%, mulai dari yang terbesar: untuk setiap kota yang boleh dan terjangkau, muatan diisi rakus — produk ton dengan selisih harga per ton terbesar dulu sampai truk penuh, produk kg/L/butir ikut seluruhnya karena tidak memakan kapasitas, dan hanya produk yang di kota itu lebih mahal dari pasar lokal. Untung = harga kota − nilai jual lokal − BBM − upah sopir selama perjalanan − aus truk (perkiraan yang sama dengan pengiriman manual). Kota dengan untung terbesar dipilih, dan truk berangkat lewat jalur pengiriman biasa bila untungnya memenuhi minimum. Muatan langsung keluar dari gudang saat berangkat, sehingga truk berikutnya tidak pernah merencanakan stok yang sama. Tidak ada unsur acak; waktu offline (maksimal 48 jam) disimulasikan dengan cara yang sama. Setiap kiriman memunculkan notifikasi gabungan "🧑‍💼 Manajer logistik mengirim N truk.", bunyi klakson, dan animasi truk yang melaju ke kota di atas bilah tab (dimatikan bila HP meminta gerak dikurangi).

**Keseimbangan.** Simulasi 30 hari (rencana ladang dengan pupuk dan sewa pemanen; tanpa manajer semua hasil dijual lokal saat panen, dengan manajer sisa stok dijual manual tiap sore; angka bersih setelah gaji dan biaya rekrut):

| Pertanian | Manajer | Pendapatan tanpa manajer | Tambahan bersih/hari | Biaya/hari |
|---|---|---|---|---|
| Lv 7, 36 ha (Jawa Barat + Bavaria), 1 Hinu 20 t | Magang | ≈ $6.800–8.000 | +$160–300 | $250 |
| Lv 7, sama, 1 Canter 8 t | Magang | ≈ $6.800–8.000 | −$280 … +$150 | $250 |
| Lv 14, 144 ha di 4 wilayah, Hinu + Canter | Senior | ≈ $29.600 | +$780–1.290 | $850 |
| Lv 14, sama, Scanya + 2 Hinu | Magang | ≈ $29.800 | +$1.200–1.700 | $250 |
| Lv 14, sama, Scanya + 2 Hinu | Senior | ≈ $29.800 | +$1.730–1.870 | $850 |
| Lv 14, sama, Scanya + 2 Hinu | Direktur | ≈ $29.800 | +$1.770–2.260 | $1.900 |

Manajer membayar dirinya sekitar 1,5–3× bila truknya cukup besar (keuntungan bersih ±2–7% dari pendapatan), tetapi dengan truk kecil atau ladang sedikit ia nyaris impas atau rugi. Biaya per hari di tabel = gaji + biaya rekrut dibagi 30 hari.

### Riset

Setiap naik level memberi 1 poin riset (simpanan lama langsung mendapat poin sesuai levelnya; 49 poin di level 50). Buka **Prestasi › 🔬 Riset** (angkanya menunjukkan poin yang tersedia) atau ketuk level di bar atas. Cabang yang masih punya riset siap diteliti terbuka otomatis. Empat cabang (🌾 Pertanian, 🐄 Peternakan, 💼 Bisnis, 🚜 Mekanik), masing-masing 7 riset dengan prasyarat; beberapa butuh 2–3 poin. Tingkat 5 (2 riset per cabang, label "Lv N") terbuka di level 32–47: Pertanian Presisi (Lv 32), Genetika Unggul (33), Jalur Ekspor (35), Autopilot GPS (37), Benih Unggul IV (40), Peternakan Pintar (42), Korporasi Agribisnis (45), Armada Modern (47). Seluruh pohon butuh 52 poin, jadi satu riset tetap harus dipilih. Tiap efek dibatasi maksimal 50%. Efeknya: hasil panen, biaya benih/pupuk, pakan, produksi dan kelahiran ternak, gaji, bunga pinjaman, harga kontrak dan kota, BBM, keausan, kecepatan tugas, kapasitas silo, gudang dingin, dan truk. Reset riset mengembalikan semua poin dengan biaya `1.500 × level`.

### Pinjaman

Kalau kekurangan modal, kamu bisa mengambil pinjaman di **Prestasi › 💰 Keuangan** (bagian 🏦 Pinjaman). Batas pinjaman adalah `level × 25.000`. Bunga harian (diatur lewat `BALANCE.loanDailyRate`) dipotong otomatis dari uangmu. Kalau uangmu tidak cukup, bunga ditambahkan ke pokok pinjaman. Pinjaman bisa dilunasi kapan saja.

### Laporan keuangan

Ketuk angka uang di bar atas (atau kartu **📊 Laporan keuangan** di **Prestasi › 💰 Keuangan**) untuk melihat pemasukan dan pengeluaran. Pilih periode Hari ini, Kemarin, 7 hari, 30 hari, atau Semua. Laporan menampilkan pemasukan, biaya operasional (BBM, benih, pupuk/kapur/irigasi, sewa pemanen, gaji, pakan, perbaikan, semprot hama, bunga, denda kontrak, pembelian produk), laba operasional dan margin, investasi (ladang, mesin, upgrade, kandang, ternak, indukan, gudang, pabrik), serta arus kas bersih. Ada kesimpulan singkat ("✅ Untung…" atau "⚠️ Biaya operasional lebih besar…"), rincian per kategori, grafik harian, dan saran untuk biaya terbesar. Pinjaman yang diterima dan pelunasannya dicatat terpisah: bukan pemasukan dan bukan biaya. Rincian per hari disimpan untuk 60 hari terakhir; total sepanjang permainan tetap tersimpan. Simpanan lama mulai mencatat sejak dimuat.

### Level dan prestasi

XP didapat dari setiap tugas yang selesai, dari nilai hasil panen, dan dari produksi ternak. Jumlah XP saat ini dan target level berikutnya tampil di bar atas (misalnya "XP 514/1.500"). Saat naik level kamu mendapat hadiah uang sebesar `1.000 × level` (`BALANCE.levelReward`), dan sebuah jendela menampilkan hadiah itu beserta tanaman, mesin, hewan, pabrik, wilayah, dan ladang yang baru terbuka. Tab **Prestasi** berisi misi harian dan papan peringkat (🎯 Misi), pohon riset (🔬 Riset), daftar target dengan hadiah uangnya, mulai dari yang paling dekat tercapai, beserta statistik dan catatan kejadian (🏆 Prestasi), serta laporan keuangan, pinjaman, dan grafik kekayaan bersih (uang + nilai ladang, mesin, isi gudang, ternak, dan pabrik, dikurangi pinjaman) (💰 Keuangan).

**Level 11–50.** Level maksimal adalah 50 dan setiap level membuka sesuatu:

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
| 20 | 🍇 Anggur, 🐃 Kerbau | 30 | 🏭 Pabrik Kopi, ladang Longreach Station (400 ha), penabur 36m |

**Level 31–50:**

| Lv | Terbuka | Lv | Terbuka |
|---|---|---|---|
| 31 | 🌍 Delta Mekong, penyemprot 24000L | 41 | ladang Lan Kharkiv, kota Mombasa |
| 32 | 🌶️ Lada | 42 | 🐂 Sapi Wagyu, traktor 9RX 1050, ladang An Giang |
| 33 | traktor Xerion 12.650, ladang Berau, Long An | 43 | 🌍 Alberta, ladang Naivasha, kota Calgary |
| 34 | 🌍 Pampas, irigasi pivot ganda | 44 | pemanen CR12, ladang Lethbridge, Tandil |
| 35 | pemanen Lexion Terra, truk Scanya 90t | 45 | 🫐 Bluberi, ladang Kiambu, kota Vancouver |
| 36 | 🐦 Rumah Walet, penebar kapur 24t, ladang Cherkasy | 46 | penyemprot drone, ladang Đồng Tháp Mười, Peace River |
| 37 | ladang Bến Tre | 47 | ladang Camrose, Pehuajó |
| 38 | 🌍 Kenya, bajak 24-mata | 48 | 🏭 Pabrik Cokelat, bajak 32-mata, ladang Nakuru, Vulcan Plains |
| 39 | 🌹 Mawar, pemetik buah robotik | 49 | penabur 60m |
| 40 | penabur 48m, ladang Nyeri | 50 | pemanen Trion X Otonom |

Ladang di wilayah baru terkunci sampai levelnya tercapai (pin 🔒 Lv N di peta); level buka sebuah ladang adalah yang lebih tinggi antara `unlockLevel` ladang dan wilayahnya. Ke-20 ladang lama tetap bisa dibeli sejak level 1. v16 meratakan Lv 5–12 (ambang XP 4.200 / 7.200 / 11.500 / 17.500 / 24.000 / 35.000 / 48.000 / 70.000, sebelumnya 4.500 / 8.000 / 13.000 / 20.000 / 30.000 / 45.000 / 57.000 / 73.000): dengan bot rencana+ladang, setiap level Lv 4→13 kini ±15–24 hari game (sebelumnya 16–39, dengan punuk di Lv 7→10), Lv 13→15 ±12–23. Semua ambang baru lebih rendah dari yang lama, jadi simpanan lama tidak pernah turun level atau kehilangan XP. Kurva XP diuji dengan bot rakus (rencana ladang, beli ladang/mesin, misi harian, 2 seed): level 20 sekitar hari ke-425–435, level 30 sekitar hari ke-800–820, level 40 sekitar hari ke-1.325–1.350, dan level 50 sekitar hari ke-1.985–2.000 (Lv 30→50 ±1.180 hari, ±20 jam pada kecepatan 1×). Simpanan lama di level 30 melanjutkan: XP yang tertabung dipotong ke ambang level 31 sehingga XP berikutnya menaikkan tepat satu level. Jendela naik level menjeda permainan, tetapi jeda itu tidak pernah ikut tersimpan (simpanan memakai kecepatan sebelum jendela dibuka).

### Wilayah

Peta di **Ladang › Peta** menampilkan satu benua sekaligus (chip 🌏 Asia & Oseania, 🌍 Eropa & Afrika, 🌎 Amerika; angka = ladang milikmu, 🌾 = ada yang siap panen). Harga ladang baru diatur agar balik modal mirip ladang lama di level yang sama (±15–26 hari game dengan tanaman terbaik).

| Wilayah | Benua | Lv | Iklim | Ladang (ha) | Kota |
|---|---|---|---|---|---|
| Jawa Barat, Bavaria, Iowa, Normandia, Hokkaido | – | 1 | campuran | 6–60 | Bandung, Jakarta, München, Des Moines, Chicago, Paris, Sapporo |
| Mato Grosso | Amerika | 12 | tropis | 80–300 | Cuiabá |
| Kalimantan | Asia | 10 | tropis basah, gambut asam | 40–350 (Lv 10–33) | Banjarmasin |
| Queensland | Asia | 19 | kering | 120–400 | Brisbane |
| Ukraina | Eropa | 22 | kontinental, chernozem | 160–600 (Lv 22–41) | Kyiv, Odesa |
| Delta Mekong | Asia | 31 | tropis delta | 250–700 (Lv 31–46) | TP Ho Chi Minh |
| Pampas | Amerika | 34 | sedang, belahan selatan (musim bergeser ½ tahun) | 400–1.000 (Lv 34–47) | Rosario, Buenos Aires |
| Kenya | Eropa & Afrika | 38 | dataran tinggi tropis | 300–800 (Lv 38–48) | Nairobi, Mombasa |
| Alberta | Amerika | 43 | prairi dingin | 600–1.600 (Lv 43–48) | Calgary, Vancouver |

Penanda iklim di `REGIONS[].climate`: `tropical` (musim basah/kering) dan `southern` (musim sedang bergeser setengah tahun).

### Bab Petani, misi, dan papan peringkat

- **📖 Bab Petani** (di atas **Prestasi › 🎯 Misi**, muncul setelah penjualan pertama di panduan): rangkaian langkah yang menuntun dari petani pemula ke raja industri. Bab 1 *Petani Mandiri*: beli ladang ke-2 → aktifkan 🔁 Rencana di 1 ladang → rekrut pekerja → selesaikan 1 kontrak. Bab 2 *Juragan Desa*: bangun kolam ikan (Lv 3) → rekrut Manajer Logistik (Lv 6) → bangun rumah kaca (Lv 9). Bab 3 *Raja Industri*: bangun pabrik (Lv 11) → rekrut Manajer Pabrik (Lv 11) → 10 kontrak → ladang di 5 wilayah. Bab 4 *Taipan Dunia*: 3 kolam → 25 ladang → 50 kontrak → ke-13 wilayah. Tiap langkah punya tujuan, kemajuan, hadiah, dan tombol **🧭 Tunjukkan** yang membuka tab/sub-tab yang tepat; **🎁 Ambil hadiah** muncul saat tujuan tercapai (kartu berpendar, angka di sub-tab Misi, dan pil kuning "📖 Bab: … — hadiah siap!" di atas Ladangku). Langkah terakhir tiap bab memberi +1 poin riset. Simpanan lama: langkah yang sudah tercapai langsung selesai tanpa hadiah, dengan satu notifikasi ringkas.
- **🎯 Misi hari ini (hari game)**: setiap hari game (±1 menit nyata pada 1×; hitung mundurnya menampilkan jam game dan detik nyata) ada 3 misi baru yang disesuaikan dengan level, ladang, dan tempo bermainmu, misalnya "Panen 30 t Jagung", "Jual hasil sendiri senilai $8.000" (barang yang dibeli dari pasar lalu dijual lagi tidak dihitung), "Selesaikan 2 tugas bajak", "Sediakan 2 t pakan ternak (panen/beli)", "Kumpulkan 1.200 XP", "Selesaikan 1 kontrak", atau "Produksi 2 batch di pabrik". Semua bisa diselesaikan dengan otomatisasi: tugas dari 🔁 Rencana, jual otomatis, Manajer Logistik, dan Manajer Pabrik ikut dihitung (baris 🤖 di tiap misi). Target XP = 60–90% XP rata-rata 3 hari game terakhir. Misi yang selesai diambil lewat **Ambil** (dengan konfeti); hadiah yang lupa diambil tetap dibayar saat pergantian hari.
- **Hadiah Berskala**: uang hadiah ikut naik dengan pendapatan produksi rata-rata 3 hari game terakhir (penjualan panen, ternak, olahan, dan kontrak dikurangi pembelian di pasar), dengan jumlah tetap lama sebagai batas bawah. Misi: 5–12% per misi (ketiganya ≤ ±30% pendapatan sehari); bonus beruntun: setengah hari; prestasi: ¼–1 hari; langkah Bab: 15%. Karena uang di akhir permainan melimpah, hadiah "besar" untuk yang sulit berupa XP dan **poin riset** (misi panen/kontrak/pabrik kadang +1 🔬, prestasi besar +1–3 🔬).
- **🔥 Beruntun**: selesaikan ketiga misi beberapa hari berturut-turut. Setiap 7 hari beruntun ada bonus besar; satu hari terlewat membuat hitungan kembali ke 0.
- **🏆 Papan peringkat** (v18: dilipat di bawah kartu 🏆 Liga Musiman sebagai **💰 Peringkat kekayaan (lama)**): 7 pertanian pesaing (misalnya Koperasi Sido Rukun, Hoeness Agrar, PT Tani Makmur, Iowa Golden Acres) yang kekayaannya tumbuh setiap hari dengan gaya masing-masing (stabil, agresif, fluktuatif). Baris pertanianmu disorot, dan ▲/▼ menunjukkan perubahan peringkat sejak kemarin. Pesaing terlemah bisa disalip dalam beberapa minggu dan peringkat #2 sekitar hari 120–180. Agro Nusantara Group terus tumbuh pesat, baru bisa disalip sekitar level 20–23, dan tetap membayangi sesudahnya.
- **📅 Kalender Panen** (Prestasi › 🎯 Misi, juga di Laporan Pagi): satu hadiah per hari kalender nyata (jam lokal HP), siklus 7 hari, bukan uang tunai: H1 🌱 Benih Hemat (benih −50%, 5 hari game), H2 🧪 Pupuk Super (hasil panen +10%, 10 hari game), H3 🔬 +1 poin riset, H4 🐄 Ternak Ceria (produksi ternak +15%), H5 ⚡ Kerja Kilat (tugas ladang 25% lebih cepat), H6 🧺 Paket Tanam (benih −50% + hasil +10%), H7 🏆 Panen Raya (+1 poin riset, 🏅 lencana, hasil +20% dan ternak +15%). Booster dihitung dalam jam game (1 hari game = 1 menit nyata pada 1×) dan tampil sebagai chip "⚡ Booster aktif" di kartu kalender. Booster sejenis memperpanjang waktu dan memakai pengali terkuat. Satu hari terlewat membuat kalender mulai lagi dari H1; "terpanjang" tetap disimpan. Jam HP yang dimundurkan dari klaim terakhir ditolak.

### 🏆 Liga Musiman (v18)

Papan kekayaan sudah tidak seru di akhir permainan (kamu bisa 6× lebih kaya dari pesaing), jadi **Prestasi › 🎯 Misi** kini dibuka dengan liga keahlian. Mulai **Lv 5**, setiap **tahun game (40 hari) adalah satu musim**, dan tiap musim menilai **satu** keahlian yang dinormalkan dengan ukuran pertanian, sehingga pertanian kecil pun bisa juara:

| Metrik | Arti |
|---|---|
| 💰 Untung per hektare | laba operasional musim ini (penjualan panen, ternak, olahan, kontrak − biaya operasional) ÷ luas ladang rata-rata ÷ hari |
| 🌾 Panen terbaik per hektare | t/ha tanaman terbaikmu dibanding hasil dasar tanaman itu (min. 5 ha dipanen) |
| 📋 Kontrak selesai | jumlah kontrak selesai musim ini (slot kontrak sama untuk semua ukuran) |
| ⛽ Hemat BBM | liter BBM ladang per ton panen (min. 10 t), makin kecil makin baik |
| 🐄 Produktivitas ternak | produk per ekor dibanding standar jenisnya (hanya bila punya ≥ 10 ekor saat musim dimulai) |

- Kamu bertanding melawan 7 pesaing yang sama (Koperasi Sido Rukun … Agro Nusantara Group). Di awal tiap musim target mereka **disesuaikan dengan formmu** (rata-rata nilaimu di musim-musim sebelumnya) × kekuatan divisi ± sebaran per pesaing (stabil sempit, fluktuatif lebar). Jadi yang menentukan adalah apakah kamu lebih baik dari dirimu sendiri, bukan seberapa besar pertanianmu.
- **Divisi** 🥉 Perunggu (pesaing ±0,90× formmu) → 🥈 Perak (0,97×) → 🥇 Emas (1,03×) → 💎 Berlian (1,09×). 2 teratas naik (▲, baris hijau), 2 terbawah turun (▼, baris merah).
- **Hadiah** juara 1–3: piala di **🏆 Rak piala** (tetap ada lintas generasi), poin riset (juara 1: 1/2/2/3 🔬 per divisi) dan booster bertema metrik (mis. ⛽ → tugas ladang 15% lebih cepat 10 hari). Tidak pernah uang tunai.
- Kartu liga: divisi, hitung mundur musim, penjelasan metrik, klasemen langsung, hadiah, rak piala, dan riwayat 12 musim. Saat musim berakhir muncul jendela dengan piala, peringkat, naik/turun divisi, dan konfeti; musim yang selesai saat offline (mode hemat tetap menjalankan liga, panen kasar ikut dihitung) dirangkum di jendela yang sama.
- **Simpanan lama**: mulai di Perunggu. Bila dimuat lebih dari 3 hari setelah musim dimulai, sisa musim menjadi **🔥 Pemanasan** (formmu diukur, tanpa klasemen); musim pertama yang dinilai dimulai di awal tahun game berikutnya.

### 🌳 Generasi Baru (v18)

Mulai **Lv 30**, **Prestasi › 🌳 Warisan** menawarkan **Wariskan pertanian** (tidak wajib). Permainan dimulai lagi dari Lv 1 (hari 1, modal awal) dan kamu mendapat **⭐ Bintang Warisan**:

`⭐ = bulat ke bawah[(level − 27) + √(kekayaan bersih ÷ $25 jt) + √prestasi + √(tahap Proyek Warisan + 3 × Monumen)] × pengali tantangan`

Contoh: Lv 33, kekayaan $1 M, 30 prestasi, 12 tahap proyek → 6 + 6,3 + 5,5 + 3,5 = **21 ⭐**. Rinciannya selalu terlihat sebelum konfirmasi, dan jumlah itulah yang diberikan.

- **Konfirmasi 2 langkah**: (1) peringatan apa yang hilang dan yang tetap, rincian bintang, beli perk dengan bintang yang akan didapat, pilih tantangan dan wilayah awal; (2) layar terakhir dengan tombol merah yang baru aktif setelah 2 detik. Sebelum mewariskan, simpanan lama dicadangkan ke `farm-manager-save.bak-<waktu>`.
- **Yang tetap**: bintang, perk, lambang, rak piala liga, dan **🏛️ Museum** (ringkasan tiap generasi: nama, hari, level, kekayaan, lambang, bintang). Blok warisan disimpan di luar data permainan (kunci `legacy` di simpanan dan salinan di `localStorage` `farm-manager-legacy`), jadi juga bertahan setelah ⚙️ Reset game.
- **Pohon perk** (12 perk, total 32 ⭐): 🌱 Akar Keluarga (modal +$15.000, 1⭐) → 🏚️ Lumbung Tua (silo +1 tingkat, 2⭐) → 🗺️ Tanah Leluhur (pilih wilayah awal Lv 1, 4⭐); 💰 Celengan Warisan (modal +$50.000, 3⭐); 📜 Catatan Kakek (+1 poin riset, 2⭐) → 📚 Perpustakaan Keluarga (+1 lagi, 4⭐); ⭐ Pengalaman Turun-temurun (XP +5%, 3⭐) → 🌟 Kebijaksanaan Leluhur (XP +5% lagi, 6⭐); 🎯 Daftar Tugas Ayah (+1 misi harian, 3⭐) → 👷 Mandor Keluarga (Mandor pertama −50%, 2⭐); 🛡️ Lambang Keluarga (pilih lambang & warna, 1⭐) → 🎨 Cat Traktor Warisan (cat mesin emas/ungu, 1⭐). Efek awal berlaku di awal setiap generasi, dan langsung sekali bila dibeli di tengah generasi; XP, misi, Mandor, dan kosmetik langsung berlaku.
- **Tantangan** (opsional, dipilih saat mewariskan; selesai bila Lv 30 tercapai dengan aturannya): 🌴 *Hanya wilayah tropis* ×1,5 (ladang hanya di Jawa Barat, Kalimantan, Mato Grosso, Delta Mekong, Kenya), 🚫 *Tanpa sewa panen* ×1,3 (mulai dengan satu pemanen bekas; sewa pemanen/pemetik ditolak, juga di mode hemat), 🧑‍💼 *Tanpa Manajer* ×1,3 (tanpa Manajer Logistik/Pabrik; Mandor boleh). Langkah Bab Petani yang mustahil di bawah aturan itu dilewati. Tantangan bisa dilepas kapan saja (aturan dan bonusnya hilang).
- Animasi: pohon keluarga tumbuh (satu daun per perk, satu buah per generasi di museum), bintang terbang saat membeli perk dan saat mewariskan, lambang dengan bingkai divisi liga tertinggi.

### ⭐ Kualitas & Rekor (v18)

Setiap panen tanaman dan buah mendapat nilai **A★ / A / B / C** dari 0–100 poin. Poin dipotong oleh faktor hasil yang sama dengan **📈 Faktor hasil**: pH di luar rentang ideal (maks. −30), nutrisi tanah rendah (maks. −25), tanaman sama dua kali (−15), tanpa pupuk (−12), hama (−8), hari kering (maks. −15), dan **panen terlambat** (lewat 12 jam setelah siap mulai turun, −12 di jam ke-72, lalu kerugian layu). Pengapuran di siklus itu memberi +4. ≥ 92 = A★, ≥ 78 = A, ≥ 55 = B, sisanya C.

- **Harga jual**: A★ +15%, A +8%, B ±0, C −10%. Silo menyimpan satu kualitas rata-rata per tanaman (ditimbang per ton); stok yang dibeli di pasar dihitung B. Semua penjualan pasar (Jual, Jual semua, jual otomatis rencana, truk ke kota) memakai rata-rata itu; jual paksa gudang penuh tetap 70% harga pasar. Gudang/Pasar menampilkan lencana A★/A/C di baris produk (B tidak ditandai).
- **⭐ Kontrak kualitas** (mulai Lv 5): satu tawaran tambahan untuk tanaman yang pernah kamu panen, harga 22–30% di atas pasar, hanya bisa dikirim bila stok rata-rata ≥ A. Memakai slot kontrak biasa.
- **Kartu ladang**: perkiraan nilai tanaman yang sedang tumbuh, nilai dan t/ha panen terakhir, dan rekor pribadi tanaman itu (🏅). Panen yang memecahkan rekor menampilkan pita **🏅 Rekor baru!** yang bergoyang (48 jam game), toast, konfeti, dan pita besar di tengah layar. Detail ladang punya lipatan **⭐ Kualitas panen** dengan meter poin, rincian potongan, dan saran.
- **📒 Buku Rekor** (Prestasi › 📖 Ensiklopedia): per tanaman/pohon t/ha terbaik, nilai terbaik, ladang, hari, dan jumlah panen. Mode hemat offline memberi nilai panen tepat waktu tanpa memecahkan rekor.

### 📖 Ensiklopedia Tani (v18)

Sub-tab **Prestasi › 📖 Ensiklopedia** berisi prangko untuk setiap tanaman, pohon buah, ternak, jenis ikan, produk olahan pabrik, wilayah, dan kota. Tiap prangko punya 3 tingkat (perunggu/perak/emas):

| Baris | ★ | ★★ | ★★★ |
|---|---|---|---|
| Tanaman, pohon | panen pertama | 100 t dipanen | panen A★ |
| Ternak | ternak pertama | 100 ekor sekaligus | genetika ★4 |
| Ikan | panen pertama | 10× panen | 25× panen |
| Produk olahan | produksi pertama | 10 batch | 100 batch |
| Wilayah | ladang pertama | Proyek Warisan | proyek tahap 3 |
| Kota | kiriman pertama | 10 kiriman | 50 kiriman |

Prangko baru dicap dengan animasi; prangko tidak pernah turun. Melengkapi satu baris membuka **kosmetik**: 🎨 cat traktor (Emas Panen, Biru Laut, Perak Ekspor, Ungu Juara, Biru Rotterdam; dipakai di Garasi › 🔧 Upgrade), 🚩 **panji** yang berkibar di depan nama wilayahmu di 🗺️ Peta (Raja Kebun, Petani Bintang, Industri Tani, Penjelajah, Eksportir Dunia), dan 🏠 **gaya kandang** di Ternak (Lumbung Merah Klasik, Kandang Kayu Jati, Gudang Kontainer). Panji dan kandang dipilih di kartu 🎁 Kosmetik. **Simpanan lama** langsung mendapat prangko ★ yang terbukti dari simpanannya (tanaman terakhir tiap ladang, kebun yang pernah berbuah, kawanan, kolam, pabrik, wilayah, kota tujuan truk) tanpa banjir notifikasi.

### 🚢 Tender Ekspor (v18)

Mulai **level 35**, kira-kira tiap 40 hari muncul satu tawaran tender di atas **Pasar › 📋 Kontrak**: ribuan ton satu tanaman (mis. 26.000 t kedelai) ke pelabuhan dunia (Rotterdam, Shanghai, Dubai, Tokyo, …) dalam **30 hari**, lewat kota pelabuhan yang bisa dicapai truk (Jakarta, Odesa, Chicago, …). Besarnya dihitung dari luas ladangmu dan armada truk (±45% produksi seandainya semua ladang menanamnya, ±50% daya angkut truk), jadi tidak bisa dibeli dengan uang saja. Hanya satu tender aktif.

- Kiriman berangkat dengan truk (tombol **🚚 Kirim truk**, atau **Kirim otomatis** yang mengirim truk bebas tiap jam sebelum Manajer Logistik, menyisakan 1 pekerja). Muatan dibayar saat tiba di pelabuhan (harga terkunci = pasar × 1,1). Stok tanaman tender tidak ikut dijual otomatis.
- **⚓ Pelabuhan Ekspor** di benua pelabuhan itu memuat 0,5% tender per tahap langsung dari silo tiap malam dan menambah bonus 5% per tahap.
- **Selesai**: bonus 25% nilai tender, +3 🔬, piala unik per tujuan (🏆 Lemari Piala di Ensiklopedia), dan kosmetik (tender pertama: Panji Eksportir Dunia + Cat Biru Rotterdam; tender ketiga: Gudang Kontainer). **Gagal**: denda kecil 3% dari sisa yang belum terkirim; kiriman yang sudah dibayar tetap milikmu.
- Kartu tender: kapal berlayar di atas ombak, bilah kemajuan (terkirim + di jalan), kebutuhan per hari vs kapasitas armada, riwayat. Mode hemat offline tetap mengirim dengan Kirim otomatis (kapasitas armada × 50%).

### Waktu dan penyimpanan

- Tombol kecepatan di bagian atas: ⏸ (jeda), 1×, 2×, 5×. Pada kecepatan 1×, satu jam game berlangsung 2,5 detik.
- Cuaca setiap wilayah berganti setiap hari, mengikuti musim dan prakiraan 3 hari.
- Permainan tersimpan otomatis di `localStorage` browser.
- Saat game dibuka kembali, atau saat kamu kembali ke tab yang sempat tersembunyi, waktu yang berlalu ikut disimulasikan: 48 jam game pertama (± 2 menit nyata pada 1×) dihitung penuh, sisanya dalam **🌙 mode hemat** sampai total 8 jam nyata. Mode hemat melangkah per hari: rencana ladang menghasilkan 50% dari laju siklusnya (dengan musim dan jumlah mesin/pekerja; panen dijual/disimpan sesuai rencana, biaya benih/pupuk/sewa/BBM dibayar tunai, ladang menunggu kalau uang kurang), pabrik yang dikelola Manajer Pabrik atau 🔁 Otomatis memproses dengan 50% kecepatan, kontrak aktif dikirim dari stok bila cukup, dan semua sistem harian (pasar, cuaca, pakan otomatis, ternak, ikan, gaji, bunga, kontrak, gudang penuh) berjalan seperti biasa. Tugas ladang yang sedang jalan, truk, dan batch berjalan berhenti sementara selama hari-hari hemat. Hasilnya deterministik dan cepat (8 jam pergi di simpanan Lv 50 ≈ 0,3–0,9 detik). Kalau game sedang dijeda (⏸), waktu tidak berjalan.
- **☀️ Laporan Pagi**: setelah pergi ≥ 10 menit nyata, jendela merangkum panen (t), penjualan, produk ternak & ikan, kontrak selesai/gagal, rugi gudang penuh, gaji, pakan otomatis, naik level, dan perubahan kekayaan bersih, dengan angka yang berhitung naik. Hadiah Kalender Panen hari ini bisa langsung diambil di sana. Tombol **🌅 Mulai hari ini** menutupnya.
- Kalau data simpanan rusak, salinannya disimpan di `localStorage` dengan kunci `farm-manager-save.bak-<waktu>` sebelum permainan baru dimulai.
- Tab dan sub-tab yang terakhir dibuka, serta bagian yang dilipat/dibuka, diingat setelah halaman dimuat ulang (`localStorage` kunci `farm-manager-tab` dan `farm-manager-ui`).

### Notifikasi

Notifikasi menumpuk dari bawah, tepat di atas bilah tab (dan di atas lintasan animasi truk), sehingga tidak menutupi bar atas, sub-tab, judul kartu, atau sakelar seperti Aktif/Jeda Manajer Logistik. Saat sebuah jendela terbuka, notifikasi pindah ke atas bar atas agar judul dan tombol ✕ jendela tetap terlihat. Angka uang dan XP yang melayang muncul di bar atas tepat di bawah saldo, tidak di atas isi halaman. Paling banyak dua notifikasi tampil sekaligus. Kejadian yang sama digabung, misalnya "🌾 3 ladang siap panen.", dan setiap notifikasi bisa ditutup dengan ✕. Notifikasi muncul untuk tanaman siap panen, tanaman layu, prestasi, peringatan pakan, kontrak, muatan yang terjual di kota, dan kiriman otomatis Manajer Logistik. Naik level ditampilkan dalam jendela tersendiri. Kejadian rutin seperti tugas selesai, penjualan, dan pembelian hanya dicatat di **Prestasi › 🏆 Prestasi** (📜 Catatan kejadian).

v16: angka uang yang melayang (+$1,2 jt) naik dari angka saldo itu sendiri, dan XP (+20 XP) muncul kecil di atas bilah XP, di kanan angka level; keduanya tidak menutupi angka level, tanggal, atau tombol kecepatan (diperiksa di lebar 360/390/412). Chip cuaca: baris 1 ikon cuaca + suhu, baris 2 musimnya ("Musim hujan"), jadi ☀️ di musim hujan tidak lagi terbaca bertentangan. Notifikasi yang teksnya sama persis dalam 60 detik nyata digabung menjadi satu dengan hitungan (×N) walau notifikasi pertama sudah hilang; pesan berbeda dari jenis yang sama tetap tampil masing-masing. Hanya jenis yang punya ringkasan digabung per jenis: "🌾 3 ladang siap panen", satu peringatan pakan ternak, dan beberapa prestasi yang terbuka bersamaan (misalnya saat simpanan lama dimuat) menjadi satu "🏆 5 prestasi baru terbuka (+$X)". "Siap dipanen" tidak muncul untuk ladang dengan 🔁 Rencana (rencananya yang memanen). Jendela **naik level** menjeda permainan selama terbuka (kecepatan sebelumnya kembali saat ditutup, dan jeda itu tidak ikut tersimpan), lalu hadiah, poin riset, dan kartu konten baru muncul satu per satu dengan konfeti.

Di layar lebar (≥ 1000 px), tab **Ladang** menampilkan Ladangku dan Peta berdampingan: kartu ladang di kiri, peta di kanan (tetap terlihat saat menggulir). Di ponsel mendatar, bar atas menjadi satu baris.

### Layar tanpa kedip

Tampilan diperbarui di tempat. Setiap render membangun pohon baru, lalu `patch()` (`js/ui/dom.js`) hanya menulis atribut, teks, dan anak yang berubah ke node yang sudah tampil (baris daftar dikenali lewat `data-key` / `data-field-id` / `data-product-id` …). Animasi (tanaman bergoyang, traktor, ikan berenang, ternak berjalan, awan peta) tidak mengulang dari awal, bilah kemajuan bergeser halus, dan posisi gulir serta fokus tetap. Halaman dibangun ulang penuh hanya saat ganti tab atau sub-tab (isi masuk dengan animasinya). Jendela Detail ladang dan Laporan Keuangan juga diperbarui di tempat (`modal.update()`).

- Notifikasi yang digabung (×N) tetap di tempatnya; tumpukannya digeser dengan `translate`, jadi notifikasi baru tidak membuat yang lain melompat. Pada 2×/5× kiriman Manajer Logistik, resep Manajer Pabrik, muatan terjual, kiriman tender, dan panen kolam otomatis digabung dalam satu notifikasi 🤖.
- Angka uang/XP yang melayang digabung per 0,25 dtk (1×), 0,5 dtk (2×), atau 1 dtk (5×).
- Kartu, barisnya, dan daftar di tab yang terbuka hanya bisa membesar (`holdHeights` di `js/ui/dom.js`); elemen yang hilang meninggalkan ruang kosong setinggi dirinya. Angka yang berganti satu/dua baris atau truk yang datang dan pergi tidak menggeser isi di bawahnya. Ketukan atau membuka/menutup lipatan melepas tahanan itu; ganti tab/sub-tab mulai dari awal. Angka di tampilan memakai digit sama lebar. Pasar › 🚚 Kirim punya slot tetap untuk truk di jalan (maks. 3, sisanya "+N truk lainnya di jalan") dan kartu Manajer Logistik bertinggi tetap (baris status 2 baris, 4 slot kiriman terakhir). Di Ladang pada 2×/5×, kartu tetap di bagiannya ("⚡ Perlu tindakan" / "⏳ Sedang berjalan") sampai kamu mengetuk tampilan atau ganti tab/sub-tab (1×: langsung pindah); baris status menyimpan tinggi tertingginya selama satu langkah.
- Ikan, awan peta, dan kapal tender bergerak dengan `translate` (satuan `cqw`), tanpa layout ulang.

Diukur dengan simpanan Lv 35, hari 1.070, 30 ladang berencana, pada 5×: rata-rata 21 sub-tab turun dari ±1,8 bangun ulang isi per detik menjadi 0, dan animasi yang mulai ulang dari puluhan per detik menjadi ±0.

## Struktur proyek

```
index.html          Kerangka halaman: top bar, area tampilan, tab bawah
manifest.webmanifest Manifest PWA (nama, warna, ikon)
sw.js               Service worker: cache app shell untuk mode offline
icons/              Ikon aplikasi (PNG 192/512, maskable, apple-touch-icon; sumber icon.svg)
css/style.css       Gaya dasar, kerangka aplikasi, dan variabel warna tema terang/gelap (mobile-first)
css/fields.css      Gaya tampilan ladang dan tugas
css/economy.css     Gaya tampilan pasar, garasi, ternak, dan gudang
css/ops.css         Gaya silo & gudang dingin, pekerja, dan kondisi mesin
css/factories.css   Gaya bagian Pabrik dan kartu Manajer Pabrik (Gudang › Olahan)
css/missions.css    Gaya misi harian dan papan peringkat (Prestasi › Misi)
css/breeding.css    Gaya panel pembiakan ternak dan dialog upgrade mesin
css/finance.css     Gaya laporan keuangan
css/logistics.css   Gaya pengiriman truk ke kota, Manajer Logistik, dan riset
css/orchard.css     Gaya kebun buah dan rumah kaca
css/v18.css         Gaya v18: lencana kualitas, Buku Rekor, Ensiklopedia, Tender Ekspor, panji peta, gaya kandang
css/layout.css      Sub-tab, bagian yang bisa dilipat, daftar stok, tata letak layar lebar/mendatar
js/data.js          Data game: tanaman, produk, mesin, hewan, wilayah, ladang, level, prestasi, BALANCE
js/engine.js        Mesin game (tanpa DOM): state, waktu, aksi pemain, view, simpan/muat
js/engine/*         Modul engine: rng, defs, weather, market, fields, tasks, taskrun,
                    animals, economy, purchase, contracts, plans, views, persist,
                    storage, workers, wear, seasons, events, soil, factories, factoryView,
                    missions, rivals, breeding, upgrades, ledger, orchard, greenhouse,
                    logistics, logisticsView, dispatcher, research, staff,
                    factoryManager, factoryPlanner, rewards (Hadiah Berskala), chapters (Bab Petani),
                    stockKeep (stok disisakan), autoFeed, overflow (gudang penuh), offline (mode hemat),
                    report (Laporan Pagi), calendar (Kalender Panen + booster),
                    mandor (Mandor Ladang), saturation (pasar jenuh), kabar* (Kabar Desa + Bencana Besar),
                    projects + projectsView (Proyek Warisan), quality (Kualitas & Rekor),
                    encyclopedia (Ensiklopedia Tani + kosmetik), tenders (Tender Ekspor)
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
| `logistics`, `dispatcher` | Truk (aus, batas harga tanaman di kota) dan tingkat Manajer Logistik (`tiers`: level buka, biaya rekrut, gaji, jumlah truk, radius, negosiasi) |
| `factoryManager` | Tingkat Manajer Pabrik (`tiers`: level buka, biaya rekrut, gaji, `factories` = jumlah pabrik dikelola (`null` = semua), `intervalHours`, `inputMult`, `outputMult`, `buyInputs`) dan `tradeIn` (potongan ganti 50%) |
| `mandor` | Mandor Ladang: `freeFields` (ladang berencana gratis, 2) dan `tiers` (level buka, biaya rekrut, gaji, `fields` = ladang berencana yang jalan (`null` = semua), `speed`) |
| `expansion` | Kenaikan harga kandang (`barn`) dan kolam (`pond`) per kandang/kolam sejenis yang sudah dimiliki (0,007 = +0,7% harga dasar) |
| `market.saturation` | Pasar jenuh: `carry` (bagian tekanan yang tersisa tiap hari, 0,45), `maxDip` (penurunan maks., 0,6), `depth` (kedalaman pasar `[level, $ per hari]`, diinterpolasi log) |

Harga ladang, mesin, benih, harga dasar produk, volatilitas pasar, dan level buka bisa diubah langsung di array masing-masing (`FIELDS`, `MACHINES`, `CROPS`, `PRODUCTS`, `ANIMALS`). Modal awal dan biaya sewa mesin panen ada di `STARTING`.

Setelah mengubah angka, jalankan `npm test` untuk memastikan engine masih berjalan dengan benar. Simpanan lama tetap bisa dimuat. Jika ingin mulai dari awal, hapus kunci `farm-manager-save` dari `localStorage`.

## 🐟 Peternakan Ikan

Bagian baru di tab **Ternak**. Bangun kolam (data `PONDS` + `FISH_BALANCE` di `js/data.js`, engine `js/engine/fish.js` + `fishView.js`), tebar benih, beri pelet ikan, jaga kualitas air, lalu panen. Hasil panen (kg) masuk **Gudang dingin**; kalau penuh, sisanya dijual paksa 70% seperti produk ternak lain. Ikan dijual di Pasar dan tercatat sebagai pendapatan *Produk ternak*.

| Kolam | Level | Syarat | Bangun | Kapasitas | Hari | Panen | Untung/hari* | Balik modal* |
|---|---|---|---|---|---|---|---|---|
| 🐟 Kolam Lele | 3 | — | $5.000 | 4.000 ekor | 12 | 800 kg | ≈ $156 | ±36 hari |
| 🐟 Kolam Nila | 8 | — | $10.000 | 4.000 ekor | 16 | 1.400 kg | ≈ $322 | ±34 hari |
| 🦐 Tambak Udang | 12 | ladang tropis (atau Lv 30) | $25.000 | 50.000 ekor | 14 | 1.000 kg | ≈ $778 | ±36 hari |
| 🐟 Kolam Ikan Mas | 14 | — | $12.000 | 3.000 ekor | 18 | 1.500 kg | ≈ $368 | ±36 hari |
| 🐟 Keramba Salmon | 22 | ladang dingin ≤12 °C (atau Lv 40) | $75.000 | 2.000 ekor | 24 | 5.000 kg | ≈ $1.974 | ±41 hari |

\*Harga dasar, pelet dibeli ×1,2, ganti air otomatis; balik modal termasuk benih pertama.

- **Pelet ikan** (`pelet_ikan`, silo): dibeli di Pasar / tombol "Pelet 3/7 hari", atau dibuat di **Pabrik Pakan Ikan** (Lv 11: 2 t kedelai + 3 t jagung → 5 t pelet). Tanpa pelet ikan tidak tumbuh dan mulai mati.
- **Kualitas air** turun tiap hari (`waterDecay`). Di bawah 50% pertumbuhan melambat, di bawah 40% ikan mati (hingga 6%/hari). "Ganti air" mengembalikan ke 100%; **aerator** (40% biaya kolam) memperlambat penurunan 50%. Opsi *Ganti air otomatis* (<50%) dan *Tebar ulang setelah panen*.
- Kolam siap panen yang dibiarkan 1 hari dipanen otomatis. XP dari nilai panen. Kolam muncul di modal naik level.
- Gambar tiap spesies (lele, nila, ikan mas, udang, salmon) adalah SVG gambar tangan di `js/ui/fishArt.js`, dipakai di kartu kolam, ikan yang berenang, cipratan panen, daftar bangun/terkunci, Gudang, Pasar, Kirim, dan modal naik level. Teks biasa (toast, pilihan) memakai 🐟 / 🦐 dari `emoji` di `js/data.js`.
