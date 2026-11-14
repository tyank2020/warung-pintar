# Tugas Tim — Warung Pintar

Dokumen ini membagi pekerjaan untuk 5 orang. Setiap orang bekerja di branch sendiri, lalu membuka pull request ke `main`. Jangan push langsung ke `main`.

## Alur kerja

```bash
git checkout main
git pull
git checkout -b feat/<nama>-<tugas>
```

Contoh:

```bash
git checkout -b feat/dina-voice
```

Sebelum membuka PR:

```bash
pnpm typecheck
pnpm build
```

PR harus lolos CI (`.github/workflows/ci.yml`). Setelah di-review minimal satu anggota lain, baru boleh di-merge.

## Pembagian tugas

### 1. Frontend & pengalaman pengguna

- Rapikan halaman di `src/pages/` dan komponen di `src/components/`.
- Pastikan nyaman dipakai di HP: tombol besar, teks jelas, navigasi bawah.
- Cek tema terang/gelap dan kontras warna.
- Jangan mengubah kontrak data tanpa diskusi.

Branch contoh: `feat/<nama>-ui-mobile`

### 2. Suara & parser Bahasa Indonesia

- Kembangkan `src/lib/parser.ts` untuk lebih banyak pola kalimat.
- Tangani alias produk (`gulpas`, `mie`, `aqua`) dan satuan (`kg`, `liter`, `papan`).
- Pastikan hasil suara selalu masuk ke layar konfirmasi dulu.
- Uji dengan kalimat nyata, bukan hanya data demo.

Branch contoh: `feat/<nama>-voice`

### 3. Nota belanja & Edge Function vision

- Rawat dan uji `supabase/functions/scan-receipt`.
- Kompres foto di browser sebelum dikirim (`src/lib/image.ts`).
- Kembalikan format sesuai `docs/contract.md`.
- Jangan pernah menaruh API key di frontend.

Branch contoh: `feat/<nama>-receipt`

### 4. Data, laporan, dan saran stok

- Rawat schema dan view di `supabase/migrations/`.
- Cocokkan angka frontend (`src/lib/stats.ts`) dengan view SQL.
- Buat laporan 7 hari, 30 hari, dan 3 bulan tetap konsisten.
- Ingat: selalu **laba kotor**, bukan laba bersih.

Branch contoh: `feat/<nama>-reports`

### 5. Dokumentasi, demo, dan pitch

- Jaga `README.md` dan `docs/` tetap akurat.
- Siapkan skrip demo 3 menit (`docs/demo.md`).
- Catat bug dan hasil uji.
- Bantu menyiapkan slide pitch: masalah, solusi, demo, dampak.

Branch contoh: `feat/<nama>-docs`

## Definisi selesai

- Fitur berjalan di mode demo tanpa environment tambahan.
- `pnpm typecheck` dan `pnpm build` lolos.
- Tidak ada `.env`, `dist`, atau `node_modules` yang ikut ter-commit.
- Angka yang ditampilkan berasal dari database atau `src/lib/stats.ts`.
- Hasil AI tetap bisa diedit sebelum disimpan.

## Demo flow

Lihat `docs/demo.md` untuk urutan demo yang sudah disiapkan.
