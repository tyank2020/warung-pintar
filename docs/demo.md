# Skrip Demo — Warung Pintar

Durasi target: 3 menit. Bisa dijalankan dengan data demo lokal atau live demo Supabase.

## Persiapan

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:5173`. Kalau data demo sudah berantakan, buka **Pengaturan → Reset data demo**.

Untuk demo cloud, buka https://warung-pintar-gamma.vercel.app. Data cloud sudah berisi 365 hari transaksi.

## Urutan demo

Prinsip: **buka dengan kasir, tutup dengan keputusan.** Menunjukkan kasir klik-klik bikin juri tahu ini aplikasi kasir sungguhan; efeknya datang dari bagian yang tidak bisa dilakukan kasir biasa (margin, stok, utang). Jangan buka dashboard duluan.

### 1. Masalah (15 detik)

“Pemilik warung mencatat di buku, lupa stok, dan tidak tahu laba kotor. Kasir digital untuk minimarket; warung punya cara jual sendiri. Yang hilang bukan mesin kasirnya — catatannya, dan keputusan yang bisa dipercaya.”

### 2. Kasir klik-klik — bayar campur utang (50 detik)

1. Buka menu **Kasir** (menu pertama).
2. Ketuk dua barang (mis. Rokok Kretek ×2, Pisang ×4) → masuk keranjang, atur jumlah, ubah harga kalau perlu.
3. Di baris **Pisang**, klik **Simpen dulu (ngutang)** → muncul kolom nama peminjam → isi **Pak Yono**.
4. Klik **Simpan**. Poin: “Satu transaksi bisa campur: sebagian dibayar, sebagian disimpan dulu — persis kalimat Pak Yono. Dan barang yang ngutang tetap terpotong dari stok.”
5. Tunjukkan total: dibayar sekarang vs disimpan dulu.

### 3. Modal awal — untung atau rugi (20 detik)

1. Di Beranda, buka kartu **Modal awal & untung/rugi**.
2. Isi **modal awal** (mis. `5000000`) dan tanggal mulai.
3. Tunjukkan hasilnya: "Modal Anda bertambah Rp… / berkurang Rp…" + rinciannya (di rak, laba kotor, Piutang).
4. Jelaskan: "Kasir tahu transaksi. Yang ditanyakan pemilik warung justru: *uang saya bertambah atau berkurang?* Dan kalau berkurang, kami tunjukkan arahnya — barang hilang, harga jual, atau utang yang belum tertagih."

### 4. Stok: kartu stok + riwayat nota + opname (30 detik)

1. Buka **Stok Barang** → klik **nama barang** → kartu stok terbuka (riwayat masuk/keluar/penyesuaian).
2. Tunjukkan saran kulakan dan ubah **stok minimum** kalau perlu.
3. Tutup, lalu klik **Riwayat nota** → tunjukkan daftar nota (foto, isi, total) dan siapa yang menambah stok. Poin: "Stok masuk dari pegawai tetap ada buktinya — owner bisa cek sendiri."
4. Kalau waktu tersisa: **Hitung stok** untuk opname (selisih dicatat sebagai penyesuaian, barang hilang kelihatan) dan **Restok cepat** (tambah stok + harga modal tanpa foto nota).

### 5. AI baca buku dagang + Belanja besok (30 detik)

1. Di Beranda, buka panel **AI baca buku dagang** → tunjukkan temuan otomatis: "omzet 7 hari naik 18%", "12 transaksi di bawah Rp5.000", "3 penjualan di bawah harga modal".
2. Klik **Minta AI membaca** → bacaan AI (maksimal 4 kalimat). Poin: "AI baca 30 hari catatanmu, bukan cuma njawab pertanyaan. Angkanya dari catatan, AI cuma merangkainya."
3. Di Stok Barang, panel **Belanja besok**: "besok Friday, beli X" — dari pola hari dalam seminggu & hari gajian (tanggal 25–5) yang dihitung dari data.
4. Poin: "Angka belanja besok, saran stok di Beranda, dan kartu musim semuanya dari satu mesin. Jadi tidak pernah ada dua layar bilang jumlah berbeda untuk barang yang sama."

### 6. Sinyal warung: penjaga margin & tanggal tua (30 detik)

1. Scroll ke panel **Sinyal warung**.
2. **Ritme tanggal tua**: penjualan akhir bulan vs awal bulan, dan barang apa yang naik.
3. **Modal bergerak**: "Modal telur naik 8% dari kulakan terakhir — margin menyusut 16,7% → 10% kalau harga jual diam."
4. Klik **Atur harga jual** → form terisi saran (mis. Rp 32.400) → **Simpan harga**. Poin: "App tidak cuma mencatat — dia menjaga margin sebelum habis diam-diam."
5. Jelaskan: "Kasir biasa tidak tahu kalau margin sedang susut. Ini yang kami tambahkan."

### 7. Simpen dulu + Piutang (25 detik)

1. Di Beranda, panel **Simpen Dulu** menampilkan utang Pak Yono dari transaksi tadi.
2. Klik **Lunas** untuk satu barang. Jelaskan: “Buku utang adalah jantung warung — dan tidak ada aplikasi kasir yang berani menyentuhnya karena isinya nama panggilan tanpa nomor HP.”
3. Buka menu **Piutang** → kartu "Pak Yono — menunggak 12 hari, Rp 40.000, favorit Rokok Kretek" → klik **Siapkan pesan tagihan** (teks siap kirim ke WA). Poin: "kasir mencatat barang; kami mengingat orangnya."

### 8. Tutup buku + Cek Stok (25 detik)

1. Buka menu **Tutup buku** → tunjukkan satu kalimat ringkasan hari ini (penjualan, laba kotor, utang yang lewat 7 hari, yang perlu dibeli besok).
2. Klik **Salin ringkasan** → poin: “ringkasannya bisa langsung dikirim ke supplier buat order, atau ke Piutang buat tagih utang.”
3. Buka menu **Cek Stok** → tunjukkan temuan selisih opname → klik **Lihat nota**. Poin: “selisih barang otomatis ditautkan ke nota yang perlu diperiksa — bukan cuma ‘ada selisih’.”

### 9. Asisten warung (20 detik)

1. Klik **Asisten AI** di sidebar (atau ikon di header).
2. Tanyakan: `siapa yang paling banyak utang?` → jawabannya dari catatan warung sendiri.
3. Tanyakan: `kapan sebaiknya kulakan?` → angka dari 365 hari transaksi.
4. Tunjukkan **Riwayat**: buat sesi baru, ganti nama sesi. Poin: “Sesi tersimpan di perangkat, jadi besok tinggal lanjut tanya.”
5. Jelaskan: “Kalau AI mati, chat tetap menjawab dari data yang sama — dihitung sendiri, bukan dikarang.”

### 10. Suara & foto nota — pintasan (opsional, 20 detik)

Kalau masih ada waktu, tunjukkan dua pintasan yang membuat kasir ini cepat:

1. Dari Beranda → **Catat dengan suara**: kalimat berantakan `tadi jual tiga kopi kapal api sama dua indomie` → kalimat kacau jadi baris rapi → simpan → stok turun.
2. **Foto nota belanja** → **Gunakan contoh nota** → konfirmasi tabel → simpan → stok bertambah.

### 11. Penutup (10 detik)

“Kasir untuk eksekusi, AI untuk keputusan. Semua angka dari catatan warung sendiri, dan pemilik warung tetap yang memutuskan.”


### Cadangan: dashboard, laporan, dan musim (kalau ada waktu)

1. **Beranda**: tunjukkan penjualan hari ini, **laba kotor**, dan panel **Sinyal warung**.
2. **Laporan**: tren penjualan, produk terlaris, dan margin. Tekankan: “Laba kotor = penjualan − modal barang terjual.”
3. **Saran musim ini**: badge musim, saran restok dengan alasan kenaikan musim. “Musim hanya memberi konteks; angka tetap dari 365 hari transaksi.” Kalau ada waktu, cocokkan angkanya dengan panel **Belanja besok** — keduanya harus sama.
4. **Tanya warung Anda** di Beranda: versi singkat dari asisten untuk pertanyaan sekali pakai.

Total ±3 menit. Kalau waktu mepet, lewati bagian cadangan dan foto nota — semuanya ada di video cadangan.

## Kalimat suara cadangan

- `beras 14 ribu, gula 17 ribu dan mi instan 3rb` (katalog — via **Tambah lewat suara**)
- `terjual beras 10 kilo dan telur 2 papan`
- `jual minyak goreng 5 liter, gula pasir 3 kilo`
- `terjual 20 mie instan dan 5 kopi`
- `tadi jual tiga kopi kapal api sama dua indomie terus ada beli telur satu kilo` (berantakan, untuk momen wow)
- `simpen dulu buat Pak Yono dua rokok` (utang — masuk panel Simpen Dulu)
- `kedah jual opat kilo gulo pasir` (Sunda — tunjukkan kalau waktu cukup)

## Catatan

- Jangan menampilkan API key atau file `.env` saat demo.
- Kalau mikrofon tidak tersedia, gunakan kolom ketik manual.
- Kalau internet bermasalah, tetap di mode demo lokal; kartu musim tetap berjalan dari 365 hari data demo.
- Tombol **Minta AI rapikan** dan kartu **Tanya warung Anda** hanya muncul di mode Supabase. Kalau AI gagal atau kena limit, rencana lokal tetap dipakai dan angka tetap ada di Laporan.
- Kalau ditanya “ini kan cuma kasir + AI”: jawab “tidak ada alur bayar di sini — kami buku kas yang bisa diajak ngobrol, bukan mesin kasir.”
