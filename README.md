# Warung Pintar

Kasir + penjaga warung untuk warung kecil. Pemilik warung mencatat penjualan dengan **ketuk barang** (kasir), atau lewat suara/foto nota sebagai pintasan, memeriksa hasilnya, lalu menyimpan stok dan transaksi.

> Prinsip utama: **AI hanya mengusulkan, pemilik warung yang mengonfirmasi.** Tidak ada transaksi yang tersimpan tanpa melewati layar konfirmasi yang bisa diedit. Kasirnya deterministik, angka AI tidak pernah dikarang.

## Status repo

**Live demo:** https://warung-pintar-gamma.vercel.app

- Frontend React + Vite + Tailwind sudah berjalan dan terhubung ke Supabase cloud.
- **Ada daftar dan masuk.** Satu akun = satu warung; data tiap warung terpisah
  di database lewat RLS, jadi nama Piutang, nomor telepon, dan catatan utang
  warung lain tidak bisa dibaca.
- Mode demo lokal tetap aktif tanpa Supabase (data disimpan di `localStorage`,
  tanpa perlu akun).
- Schema, view laporan, dan seed Supabase sudah diterapkan ke project cloud.
- CI GitHub Actions menjalankan typecheck, test, build, dan pengecekan Edge Function.
- Edge Function AI (`parse-voice`, `scan-receipt`, `advisor`, `seasonal-advisor`) sudah dideploy dan aktif.
- AI aktif memakai Gemini (model `gemini-3.5-flash-lite`) lewat Supabase Secrets: `scan-receipt` lewat VLM native (`generateContent`), fungsi teks lewat endpoint OpenAI-compatible. Kalau AI gagal atau kena limit, fallback lokal otomatis dipakai.
- Kartu **Saran musim ini** menghitung musim, event kalender, dan pola 60 hari ke depan dari transaksi. AI hanya merapikan bahasa; angka tetap dari mesin hitung yang sama.

### Mesin hitung

Semua angka aplikasi berasal dari satu mesin, supaya layar tidak pernah berbeda:

| Modul                  | Tugas                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `src/lib/calendar.ts`  | Hari kerja dalam zona waktu warung (WIB), sama dengan view SQL      |
| `src/lib/analytics.ts` | Indeks penjualan satu kali lintasan (grafik, ringkasan, top produk) |
| `src/lib/demand.ts`    | Proyeksi terjual per hari: laju dasar + faktor musim                |
| `src/lib/restock.ts`   | Saran "beli berapa" — satu-satunya sumber angka restok              |
| `src/lib/catalog.ts`   | Kategori barang dan lead time pemasok                               |

Dulu ada beberapa rumus restok berbeda di beberapa tempat: satu produk bisa tampil "beli 1 kg" di Beranda dan "beli 4 papan" di kartu musim. Sekarang semuanya memakai `src/lib/restock.ts`, dan `src/lib/engine.test.ts` menjaga agar tidak berbeda lagi.

Rumus yang dipakai:

```txt
proyeksi per hari = (qty terjual ÷ hari aktif) × faktor musim
target stok       = proyeksi per hari × (lead time + 3 hari)
saran beli        = target stok − stok, minimal sampai stok minimum
```

"Hari aktif" adalah hari sejak produk pertama terjual (dibatasi 30 hari), bukan pembagi tetap. Warung yang baru buka dua hari tidak lagi ikut dibagi 30 — sebelumnya sarannya jadi terlalu kecil.

### Deploy saat ini

| Bagian           | Status                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Supabase project | `osnktodmffgvxdohcjmh` (region `ap-southeast-1`)                                                                           |
| Database         | 2 migration + seed diterapkan (12 produk, 47 alias, 4.884 transaksi / 365 hari). Migration `0009_engine.sql` menunggu push |
| Edge Functions   | `parse-voice`, `scan-receipt`, `advisor`, `seasonal-advisor` aktif                                                         |
| Frontend         | Vercel production: https://warung-pintar-gamma.vercel.app                                                                  |
| AI key           | Aktif: Gemini `gemini-3.5-flash-lite`; `scan-receipt` via VLM native (`generateContent`), fungsi teks via `AI_BASE_URL` OpenAI-compatible (Supabase Secrets) |

> Login memakai nama warung + nama penjual + password, dan sesi bertahan sampai pengguna menekan Keluar. RLS masih policy demo yang permisif; ganti dengan policy per pemilik warung sebelum dipakai produksi.

## Menjalankan lokal

Butuh Node.js 22 dan pnpm 10.

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:5173`.

Perintah lain:

```bash
pnpm typecheck   # cek TypeScript
pnpm test        # test parser dan perhitungan
pnpm build       # typecheck + build produksi
pnpm preview     # preview hasil build
pnpm format      # format dengan oxfmt
```

## Akun warung

Aplikasi punya layar **Masuk** dan **Daftar**:

- **Daftar** → minta nama pemilik, nama warung, email, dan kata sandi. Akun
  langsung aktif (Supabase dikonfigurasi dengan auto-confirm), dan warung baru
  diisi **contoh 30 hari** supaya tidak terlihat kosong.
- **Masuk** → lanjutkan catatan warung Anda.
- **Coba akun demo** → masuk ke akun yang sudah berisi contoh warung lengkap,
  buat presentasi tanpa daftar dulu.

Akun demo yang dipakai:

```txt
email    demo@warungpintar.app
sandi    warungpintar2026
warung   Warung Sumber Rejeki
```

Akun ini dipakai bersama-sama, jadi siapa pun bisa masuk dan mengubah catatannya.
Buat presentasi, jangan pakai buat data sungguhan.

Nama pemilik dan nama warung bisa diubah di **Pengaturan → Akun warung**.

Pemisahan antar warung bukan filter di kode frontend, tapi **RLS** di database:
`products`, `transactions`, `debts`, `customers`, `consignments`,
`purchase_notes`, dan `market_prices` punya kolom `owner_id`, dan policy-nya
hanya mengizinkan baris milik sendiri. Lihat
`supabase/migrations/0010_auth.sql` dan `0011_auth_rls.sql`.

> Penting: `0011_auth_rls.sql` **hanya boleh** dipasang setelah frontend yang
> mengirim `owner_id` sudah live. Kalau belum, semua pembacaan jadi kosong.

## Mode demo

Kalau `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` belum diisi, aplikasi otomatis memakai data demo — **tanpa perlu masuk**:

- 12 produk warung dengan alias.
- Transaksi 365 hari dengan pola hari kerja, gajian, musim hujan/kemarau, Ramadan/Lebaran, dan akhir tahun.
- Data disimpan di browser dengan key `warung-pintar-demo-v2`.
- Akun lokal disimpan dengan key `warung-pintar-local-account-v1` (password di-hash PBKDF2) dan sesi dengan `warung-pintar-local-session-v1`; tombol **Keluar dari akun** ada di Pengaturan.
- Tombol **Reset data demo** ada di halaman Pengaturan.

Contoh alur yang bisa langsung dicoba:

1. **Kasir** → ketuk barang → ubah jumlah → tandai satu baris **Simpen dulu (ngutang)** → isi nama peminjam → simpan.
2. **Stok Barang** → klik nama barang → kartu stok, ubah stok minimum, atau **Hitung stok** untuk opname.
3. **Asisten AI** di sidebar → tanyakan "siapa yang paling banyak utang?" atau "kapan sebaiknya kulakan?".
4. Pintasan suara: **Catat dengan suara** → ketik manual `terjual beras 10 kilo dan telur 2 papan` → periksa → simpan.
5. **Foto nota belanja** → pilih **Gunakan contoh nota** → periksa → simpan ke stok.

## Supabase

### 1. Buat project

Buat project di [supabase.com](https://supabase.com), lalu buka **SQL Editor** dan jalankan file berikut berurutan:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_views.sql`
3. `supabase/seed.sql`

Kalau memakai Supabase CLI, hubungkan project lalu push migration:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Seed tetap bisa dijalankan dari SQL Editor, atau lewat `supabase db reset` untuk database lokal.

### 2. Isi environment

Salin `.env.example` menjadi `.env`, lalu isi:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

Jangan pernah commit `.env`.

### 3. Login nama warung + password

Tidak perlu provider Google atau email asli. Frontend membuat email sintetis dari nama warung dan nama penjual, misalnya `warung-sumber-rejeki.pak-andi@warung-pintar.example.com`, lalu memakai `supabase.auth.signInWithPassword` / `signUp`.

Pastikan **Authentication → Providers → Email** aktif. Untuk demo, matikan **Confirm email** agar `signUp` langsung menghasilkan sesi. Kalau konfirmasi email menyala, akun tetap dibuat tetapi pengguna harus mengonfirmasi email sintetis yang tidak bisa dibuka — layar login akan menampilkan pesan agar konfirmasi dimatikan.

Sesi disimpan di perangkat dan hanya dihapus lewat tombol **Keluar dari akun** di Pengaturan. `site_url` dan redirect `http://localhost:5173` untuk Supabase lokal sudah diset di `supabase/config.toml`.

Tanpa environment Supabase, layar login memakai akun lokal di browser: nama warung + nama penjual + password, tanpa email. Password disimpan sebagai hash PBKDF2, bukan teks biasa.

### 4. RLS

Migration ini memakai policy demo yang mengizinkan anon key membaca dan menulis. **Ini hanya untuk hackathon/demo.** Sebelum dipakai sungguhan, ganti dengan policy per pemilik warung; login saja belum membatasi data antar warung.

### 5. Edge Function AI

Kode function ada di `supabase/functions/`. Isi kunci AI lewat Supabase Secrets, lalu deploy:

```bash
supabase secrets set \
  AI_API_KEY=... \
  AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
  AI_MODEL=gemini-3.5-flash-lite

supabase functions deploy parse-voice
supabase functions deploy scan-receipt
supabase functions deploy advisor
supabase functions deploy seasonal-advisor
```

`AI_BASE_URL` harus kompatibel dengan endpoint `/chat/completions` (dipakai fungsi teks). `scan-receipt` tidak memakai `AI_BASE_URL` — ia memakai VLM native Gemini (`generateContent`, default `https://generativelanguage.googleapis.com/v1beta`, override dengan secret `AI_VLM_BASE_URL`) dengan model `AI_MODEL`, yang harus mendukung input gambar. Detail kontrak dan catatan keamanan ada di `supabase/functions/README.md`.

Jangan pernah menaruh `AI_API_KEY` di `.env` frontend atau memberi prefix `VITE_`.

## Struktur data

```txt
products(id, name, unit, stock, min_stock, buy_price, sell_price)
product_aliases(id, product_id, alias)
transactions(id, type 'sale'|'purchase'|'adjustment', product_id, qty, unit_price, created_at)
```

Aturan perhitungan:

- **Stok** = stok awal + pembelian − penjualan − penyesuaian. Satuan mengikuti produk (`kg`, `liter`, `dus`, `bungkus`, `papan`, dan lain-lain).
- **Laba kotor** = penjualan − modal barang terjual. Aplikasi tidak pernah menyebutnya laba bersih.
- **Saran stok** = proyeksi terjual per hari × (lead time + 3 hari) − stok saat ini. Proyeksi memakai laju dasar (qty terjual ÷ hari aktif dalam 30 hari) yang dikoreksi faktor musim. Angka ini estimasi dan selalu disertai alasan.
- **Lead time** = lama barang datang dari pemasok, bisa disetel sendiri per barang.
- **Saran musim** membandingkan 60 hari ke depan dengan tanggal yang sama tahun lalu, lalu menyesuaikan proyeksi dengan lead time dan stok minimum. Event (akhir tahun, Ramadan, Lebaran) hanya memberi konteks; angkanya tetap dari transaksi.
- **Hari** dihitung dalam zona waktu warung (WIB), sama dengan view SQL dan jam yang ditampilkan.
- **Harga modal** saat ini memakai `products.buy_price` karena transaksi belum menyimpan snapshot harga modal.

## Struktur folder

```txt
src/
  App.tsx                  # shell aplikasi: navigasi, modal, dan tema
  pages/
    Cashier.tsx            # kasir klik-klik: keranjang, split bayar/ngutang
    Dashboard.tsx          # ringkasan, catat suara/nota, saran stok
    Inventory.tsx          # daftar stok, kartu stok, opname, restok
    Reports.tsx            # tren penjualan, laba kotor, produk terlaris
    History.tsx            # riwayat transaksi
    Settings.tsx           # tema, sumber data, reset demo
  components/
    ChatPanel.tsx          # asisten warung dengan sesi percakapan
    ConfirmEditor.tsx      # tabel konfirmasi yang bisa diedit
    ProductSheet.tsx       # kartu stok, opname, restok cepat, stok minimum
    StockCountSheet.tsx    # stok opname massal
    VoiceModal.tsx         # rekaman suara + parser lokal (+ mode katalog)
    ReceiptModal.tsx       # scan nota + contoh nota demo
    ProductModal.tsx       # tambah barang dan alias
    Sidebar.tsx            # navigasi desktop
    AppHeader.tsx          # pencarian dan notifikasi
    AuthGate.tsx           # menahan aplikasi sampai sesi login diperiksa
    AuthScreen.tsx         # form masuk / buat akun warung
    UserAvatar.tsx         # inisial nama penjual
    MobileNav.tsx          # navigasi bawah untuk HP
    DemoBanner.tsx         # pengingat mode demo
    Icon.tsx
  lib/
    api.ts                 # CRUD Supabase + pemanggilan Edge Function
    analytics.ts           # indeks penjualan satu kali lintasan
    auth.tsx               # sign in/up Supabase + akun lokal, logout
    authSession.ts         # pemetaan profil, email sintetis, validasi sesi lokal
    localAccount.ts        # hash password PBKDF2 dan penyimpanan akun lokal
    calendar.ts            # kalender bisnis (zona waktu warung)
    capital.ts             # modal awal dan pembukuan harian
    catalog.ts             # kategori barang + lead time pemasok
    cashClosing.ts         # tutup kas
    chat.ts                # sesi percakapan (localStorage)
    chatAnswers.ts         # jawaban cadangan dari data warung
    checkout.ts            # logika keranjang kasir
    closing.ts             # rekap tutup kas
    consignment.ts         # titip jual (konsinyasi)
    costWatch.ts           # pantau harga beli
    customers.ts           # buku Piutang
    deadStock.ts           # barang lambat mover
    demand.ts              # proyeksi terjual per hari (laju + musim)
    demo.ts                # data demo deterministik
    display.ts             # helper tampilan transaksi dan status
    inventory.ts           # perhitungan stok murni (bisa diuji)
    ledger.ts              # buku dagang + rencana belanja besok
    marketPrice.ts         # radar harga pasar
    monthRhythm.ts         # pola bulanan (gajian, akhir bulan)
    nav.ts                 # label dan ikon navigasi
    notes.ts               # bukti nota belanja
    parser.ts              # parser suara Bahasa Indonesia
    reconcile.ts           # selisih opname dan nota
    restock.ts             # mesin saran restok (sumber tunggal)
    seasonal.ts            # mesin musim, event, dan rekomendasi
    stats.ts               # beranda, laporan, dan ringkasan
    store.tsx              # state global + mode demo/Supabase
    supabase.ts
    types.ts               # kontrak data bersama
supabase/
  migrations/0001_init.sql # schema, trigger stok, RLS demo
  migrations/0002_views.sql # view stok, penjualan harian, saran restok
  migrations/0009_engine.sql # lead time, RPC harga modal, view restok yang sama dengan frontend
  seed.sql                 # 12 produk + 7 hari transaksi contoh
  functions/               # Edge Function AI + shared helper + test Deno
docs/
  contract.md              # kontrak data dan output AI
  team-tasks.md            # pembagian tugas 5 orang
  demo.md                  # skrip demo 3 menit
.github/workflows/ci.yml   # typecheck + build
```

## Deploy ke Vercel

1. Import repo ini ke Vercel.
2. Framework preset: **Vite**.
3. Build command: `pnpm build`.
4. Output directory: `dist`.
5. Tambahkan environment variable `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di Vercel.

`vercel.json` sudah menyiapkan rewrite SPA agar refresh halaman tidak 404.

## Alur kerja Git

- Jangan bekerja langsung di `main`.
- Buat branch `feat/<nama>-<tugas>`.
- Commit kecil dan jelas.
- Jangan commit `.env`, `dist`, atau `node_modules`.
- File contoh environment hanya `.env.example`.
- Setiap pull request harus lolos CI (`pnpm typecheck`, `pnpm test`, `pnpm build`, dan Deno check).

## Dokumentasi tim

- `docs/contract.md` — kontrak data dan output AI.
- `docs/team-tasks.md` — pembagian tugas untuk 5 orang.
- `docs/demo.md` — skrip demo 3 menit.
- `docs/test-checklist.md` — checklist uji aplikasi di HP nyata.
- `docs/pitch-outline.md` — kerangka pitch 3 menit.
- `AGENTS.md` — aturan kerja untuk AI agent dan anggota tim.

## Yang belum dikerjakan

- Uji alur suara dan kamera di perangkat nyata.
- Konfirmasi email untuk pendaftaran. Sekarang auto-confirm supaya pendaftaran
  instan; kalau mau akun sungguhan, nyalakan lagi `mailer_autoconfirm` di
  dashboard Supabase dan pasang SMTP sendiri (SMTP bawaan Supabase hanya bisa
  mengirim 2 email per jam).
- Snapshot harga modal di transaksi agar laba historis lebih akurat. Saat ini
  laba historis memakai `products.buy_price` yang sekarang, jadi kalau harga
  modal berubah, laba bulan lalu ikut berubah.
