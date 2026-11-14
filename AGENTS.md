# Warung Pintar

Asisten pencatatan warung: catat penjualan lewat suara, pindai nota belanja, konfirmasi hasil, lalu simpan stok dan transaksi.

## Development Server

Vite berjalan di `http://localhost:5173` setelah `pnpm dev`. Preview produksi memakai `pnpm preview`.

## Aturan produk

- AI hanya mengusulkan. Pemilik warung harus mengonfirmasi lewat layar edit sebelum data disimpan.
- Stok = stok awal + pembelian − penjualan − penyesuaian. Satuan mengikuti produk.
- Laba selalu disebut **laba kotor** (penjualan − modal barang terjual), bukan laba bersih.
- Prediksi adalah estimasi dan harus punya alasan. Satu-satunya sumber angka restok adalah `src/lib/restock.ts`:
  `proyeksi terjual/hari × (lead time + 3 hari) − stok`.
  - Proyeksi per hari = laju dasar (qty terjual ÷ hari aktif) × faktor musim.
  - Hari aktif = hari sejak produk pertama terjual, dibatasi jendela 30 hari. Jangan pernah memakai pembagi tetap seperti 7.
  - Lead time = lama barang datang dari pemasok (`products.lead_time_days`, default per kategori).
- Semua layar (Beranda, Stok Barang, kartu musim, rencana belanja besok) memakai mesin restok yang sama. Kalau satu layar memakai rumus sendiri, angka antar layar akan berbeda.
- Semua perhitungan hari memakai zona waktu warung (`Asia/Jakarta`), bukan zona waktu perangkat. Lihat `src/lib/calendar.ts`.
- **Satu akun = satu warung.** Setiap baris yang ditulis aplikasi harus punya `owner_id` (lihat `src/lib/auth.ts`). Pemisahan antar warung dijamin RLS di database, bukan filter di frontend. Jangan pernah membuat query tanpa `owner_id` di payload insert.
- Urutan pasang wajib: `0010_auth.sql` (tambah kolom, policy masih permisif) → frontend yang mengirim `owner_id` → `0011_auth_rls.sql` (kunci policy). Kalau `0011` dipasang lebih dulu, seluruh pembacaan kosong dan aplikasi rusak.
- AI tidak boleh mengarang angka. Angka berasal dari database atau perhitungan `src/lib/`.
- Hindari duplikasi produk dengan satu nama produk + alias (`gulpas` = `Gula Pasir`). Kalau nama sudah dipakai, tawarkan menambah alias, bukan membuat barang baru.

## Project Structure

- `src/main.tsx` — entrypoint React; memuat `src/index.css` dan `src/App.tsx`
- `src/App.tsx` — shell aplikasi: navigasi, modal, dan tema
- `src/pages/` — halaman Beranda, Kasir, Stok Barang, Laporan, Riwayat, Pengaturan, Piutang, Titip, Catatan, Rekonsiliasi, Tutup Kas, Harga Pasar
- `src/index.css` — import Tailwind v4, token warna, dan seluruh styling aplikasi
- `src/components/` — modal suara, nota, produk, kartu stok, opname, konfirmasi, sidebar, header, navigasi mobile
- `src/lib/` — kontrak tipe, data demo, parser suara, perhitungan, Supabase, store, helper tampilan
- `src/lib/auth.ts` — sesi masuk, daftar, dan data pemilik warung
- `src/pages/Auth.tsx` — layar masuk dan daftar
- `src/lib/calendar.ts` — kalender bisnis: hari kerja dalam zona waktu warung
- `src/lib/analytics.ts` — indeks penjualan satu kali lintasan (dasar semua angka)
- `src/lib/catalog.ts` — kategori barang dan lead time pemasok
- `src/lib/demand.ts` — proyeksi kebutuhan harian (laju dasar + faktor musim)
- `src/lib/restock.ts` — mesin saran restok, satu-satunya sumber angka "beli berapa"
- `src/lib/inventory.ts` — perhitungan stok murni, terpisah dari state React
- `supabase/migrations/0001_init.sql` — schema produk, alias, transaksi, trigger stok, RLS demo
- `supabase/migrations/0002_views.sql` — view stok, penjualan harian, produk, saran restok
- `supabase/migrations/0009_engine.sql` — lead time, RPC harga modal, view saran restok yang sama dengan frontend
- `supabase/migrations/0010_auth.sql` — kolom `owner_id` per warung, index unik per pemilik
- `supabase/migrations/0011_auth_rls.sql` — policy RLS ketat per pemilik warung
- `supabase/seed.sql` — 12 produk awal + 7 hari transaksi contoh
- `supabase/config.toml` — konfigurasi Supabase CLI dan verifikasi JWT function
- `supabase/functions/` — Edge Function AI: `parse-voice`, `scan-receipt`, `advisor`, shared helper, dan test Deno
- `supabase/functions/_shared/` — panggilan AI, CORS/response, validasi angka dan satuan, dan handler
- `supabase/functions/_tests/` — test Edge Function dengan mock `fetch`
- `src/lib/parser.test.ts`, `src/lib/stats.test.ts`, `src/lib/seasonal.test.ts`, `src/lib/engine.test.ts`, `src/lib/inventory.test.ts` — test parser, perhitungan, dan konsistensi antar layar
- `src/components/render.test.tsx` — test render semua halaman
- `docs/contract.md` — kontrak data dan output AI
- `docs/team-tasks.md` — pembagian tugas tim
- `docs/demo.md` — skrip demo
- `docs/test-checklist.md` — checklist uji di HP nyata
- `docs/pitch-outline.md` — kerangka pitch
- `.github/workflows/ci.yml` — typecheck, test, build, dan Deno check di setiap PR
- `.env.example` — daftar environment variable; `.env` tidak boleh di-commit
- `vercel.json` — konfigurasi deploy Vercel

## Dependencies

- Runtime: React 19, React DOM 19, `@supabase/supabase-js`
- Styling: Tailwind CSS v4 lewat `@tailwindcss/vite`
- Build: Vite 8, TypeScript 5.7, `@vitejs/plugin-react`
- Format: oxfmt

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

## Mode data

- Tanpa environment Supabase: mode demo lokal, data di `localStorage` (`warung-pintar-demo-v2`).
- Dengan `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`: data cloud dari Supabase.
- Kunci AI hanya boleh ada di Supabase Edge Function, bukan di frontend.

## Git

- Jangan bekerja di `main`.
- Branch: `feat/<nama>-<tugas>`.
- Commit kecil dan jelas.
- Jangan commit `.env`, `dist`, atau `node_modules`.
- **Commit harus pakai email akun GitHub yang terverifikasi**
  (`dhanindraimamtaufik2019@gmail.com` atau `Dharch-source@users.noreply.github.com`).
  Kalau email penulis commit tidak punya akun GitHub, Vercel **menolak membangun
  preview deploy** dengan pesan "couldn't find a Git account for the commit
  author" — bukan error build, jadi mudah terlewat.
  Cek dulu dengan `git config user.email`.

## Styling

`src/index.css` mengimpor Tailwind dengan `@import "tailwindcss";`. Utilitas Tailwind boleh dipakai di JSX; styling global dan tema ada di `src/index.css`. Letakkan style elemen global di dalam `@layer base` agar utility class tetap menang. Tidak perlu file konfigurasi Tailwind atau PostCSS terpisah.
