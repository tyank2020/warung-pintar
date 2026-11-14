-- Catat jenis penyesuaian stok, supaya "barang keluar untuk utang" (simpen
-- dulu) tidak dianggap sebagai selisih opname di halaman Cek Stok.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

alter table public.transactions
  add column if not exists note text;
