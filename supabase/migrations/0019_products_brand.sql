-- Merek barang. Barang dengan nama + ukuran sama tapi merek berbeda adalah
-- PRODUK BERBEDA dengan harga berbeda:
--   nama="Minyak Goreng", size="2 Liter", brand="Bimoli", harga 32.000
--   nama="Minyak Goreng", size="2 Liter", brand=NULL,      harga 30.000
--   nama="Minyak Goreng", size="2 Liter", brand="Filma",   harga 29.000

alter table public.products
  add column if not exists brand text;

comment on column public.products.brand is
  'Merek barang ("Bimoli", "Wings"). Kosong = tanpa merek. Identitas unik per (nama, ukuran, merek, pemilik) — barang dengan merek beda adalah produk berbeda dengan harga berbeda.';

-- Unik per (nama, ukuran, merek, pemilik); kolom size/brand kosong
-- diperlakukan sebagai satu kelompok (coalesce ke string kosong).
drop index if exists public.products_name_lower_idx;
create unique index if not exists products_name_lower_idx
  on public.products (lower(name), coalesce(lower(size), ''), coalesce(lower(brand), ''), owner_id);
