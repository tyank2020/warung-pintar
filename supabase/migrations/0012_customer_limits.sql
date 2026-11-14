-- Batas utang per pelanggan: pedagang bisa membatasi berapa maksimal utang
-- tiap orang (max_debt, dalam rupiah) dan kapan paling lama utangnya
-- harus lunas (debt_deadline, tanggal). Jika utang seseorang sudah menyentuh
-- batas maksimal, tidak boleh menambah utang lagi kecuali dilunasi dulu.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

alter table public.customers
  add column if not exists max_debt bigint,
  add column if not exists debt_deadline date;
