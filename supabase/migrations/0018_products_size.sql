-- Produk bisa punya varian ukuran/kemasan: "Minyak Goreng 1 Liter" dan
-- "Minyak Goreng 2 Liter" adalah barang berbeda dengan stok terpisah.
-- Ukuran hidup di kolom `size`; kosong = barang biasa tanpa varian.
-- Contoh: nama="Minyak Goreng", size="2 Liter", stok=20 → beda dengan
-- nama="Minyak Goreng", size="1 Liter", stok=35.

alter table public.products
  add column if not exists size text;

comment on column public.products.size is
  'Ukuran/varian kemasan, mis. "1 Liter", "500 gram", "700 g". Stok dihitung per produk — varian dengan nama yang sama adalah barang berbeda.';

-- Sebelumnya unik per (nama, pemilik), sehingga varian ukuran tidak bisa
-- dibuat. Sekarang unik per (nama, ukuran, pemilik); kolom size kosong
-- diperlakukan sebagai satu kelompok (coalesce ke string kosong).
drop index if exists public.products_name_lower_idx;
create unique index if not exists products_name_lower_idx
  on public.products (lower(name), coalesce(lower(size), ''), owner_id);
