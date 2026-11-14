# Checklist Uji — Warung Pintar

Daftar periksa untuk menguji aplikasi di HP nyata sebelum demo. Kerjakan berurutan, centang yang sudah lulus. Kalau ada yang gagal, catat langkahnya di pesan tim.

Target perangkat: HP Android kelas bawah dengan internet normal, dan 1 HP iPhone/browser lain untuk variasi.

## 0. Persiapan

- [ ] Buka aplikasi di browser HP (live demo atau `pnpm dev` via jaringan lokal).
- [ ] Cek sumber data di halaman Pengaturan: mode Supabase (cloud) atau demo lokal.
- [ ] Tombol **Reset data demo** berfungsi dan data kembali wajar.
- [ ] Tema terang dan tema gelap keduanya terbaca nyaman.

## 1. Beranda

- [ ] Kartu **Penjualan hari ini**, **Laba kotor hari ini**, dan **Total jenis barang** tampil dengan angka.
- [ ] Kartu **Saran musim ini** tampil: judul musim, badge event, dan rekomendasi dengan alasan.
- [ ] Footer kartu musim menyebut jumlah hari data (misal "365 hari data").
- [ ] Tombol **Lihat sinyal** membuka tabel rata-rata/hari, kenaikan musim, dan sisa hari stok.
- [ ] Tombol **Minta AI rapikan** tidak merusak tampilan saat AI belum aktif (rencana lokal tetap dipakai).
- [ ] Bagian **Stok hampir habis** menampilkan barang di bawah stok minimum.
- [ ] **Saran stok harian** menyebut alasan: rata-rata terjual/hari × 3 − stok.

## 2. Catat dengan suara

- [ ] Klik **Catat dengan suara** → animasi mendengarkan tampil.
- [ ] Ucapkan kalimat normal: `terjual beras 10 kilo dan telur 2 papan` → transkrip tampil.
- [ ] Hasil masuk ke **layar konfirmasi** dulu, bukan langsung disimpan.
- [ ] Edit jumlah, satuan, dan hapus baris di layar konfirmasi berfungsi.
- [ ] Item dengan keyakinan rendah mendapat tanda **periksa lagi**.
- [ ] Simpan → stok berkurang, transaksi masuk Riwayat.
- [ ] Kalimat sulit tetap wajar: `jual 20 mie instan dan 5 kopi`, `terjual setengah kilo gula pasir`.
- [ ] Alias mengarah ke produk yang sama (`gulpas` = `Gula Pasir`).
- [ ] Browser tanpa dukungan suara → kolom ketik manual muncul dan demo tetap jalan.
- [ ] Lingkungan bising → hasil tetap masuk layar konfirmasi (tidak langsung tersimpan).

## 3. Foto nota belanja

- [ ] Klik **Foto nota belanja** → kamera/upload terbuka.
- [ ] **Gunakan contoh nota** → hasil OCR contoh tampil di layar konfirmasi.
- [ ] Foto nota asli yang jelas → item, jumlah, dan harga terbaca.
- [ ] Foto buram → hasil tetap masuk layar konfirmasi, baris ragu ditandai.
- [ ] Total hasil OCR tidak cocok dengan penjumlahan item → ada peringatan yang terlihat.
- [ ] Ukuran foto besar tetap terkirim (kompresi jalan, upload tidak mentok).
- [ ] Simpan → stok bertambah (tipe pembelian), masuk Riwayat.

## 4. Stok Barang

- [ ] Daftar stok, pencarian, dan filter berfungsi.
- [ ] Tambah barang baru + alias berfungsi; barang baru muncul di daftar.
- [ ] Restok lewat nota menaikkan stok sesuai satuan produk (kg, liter, dus, bungkus, papan).
- [ ] Produk dengan stok di bawah minimum ditandai.

## 5. Laporan

- [ ] Tren penjualan 7 hari tampil dari data nyata.
- [ ] Angka **laba kotor** = penjualan − modal barang terjual (tidak pernah tertulis "laba bersih").
- [ ] Produk terlaris dan margin tampil wajar.

## 6. Riwayat

- [ ] Hanya **100 baris pertama** yang dirender di awal.
- [ ] Tombol **Tampilkan 100 transaksi lagi** menambah 100 baris dan berfungsi berkali-kali.
- [ ] Filter Semua / Penjualan / Pembelian berfungsi.

## 7. Kondisi jelek

- [ ] Internet dimatikan → aplikasi tetap terbuka, pesan kesalahan jelas, tidak blank.
- [ ] Internet lambat → ada status memuat, tombol tidak terklik dua kali.
- [ ] Mode demo lokal tetap jalan tanpa Supabase (kartu musim tetap muncul dari data demo).
- [ ] Kembali ke internet → tidak ada data yang tertinggal ganda.

## 8. Aturan produk (cek akhir sebelum demo)

- [ ] Tidak ada satu pun data tersimpan tanpa melewati layar konfirmasi yang bisa diedit.
- [ ] Prediksi selalu disertai alasan dan tertulis sebagai perkiraan.
- [ ] Istilah yang dipakai: **laba kotor**, bukan laba bersih.
- [ ] Satuan mengikuti produk dan tidak ada produk duplikat.
- [ ] Tidak ada API key yang terlihat di UI, di `.env` frontend, atau di layar saat demo.
