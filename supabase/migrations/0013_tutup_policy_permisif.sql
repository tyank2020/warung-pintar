-- Warung Pintar — tutup policy permisif yang tertinggal.
-- Jalankan setelah `0012_customer_limits.sql`.
--
-- Kenapa file ini ada: `0011_auth_rls.sql` mengganti policy "demo ... access"
-- (yang permisif) dengan policy "own ... access" (per pemilik warung). Tapi
-- tiga tabel masih punya policy permisif yang namanya tidak persis sama, jadi
-- tidak ikut terhapus. Akibatnya:
--
--   product_aliases  → 100 baris alias produk bisa dibaca siapa pun yang punya
--                       kunci anon (kunci itu ada di bundle publik)
--   purchase_notes   → bukti nota belanja bisa dibaca warung lain
--   market_prices    → masih permissive, dan ini memang sebagian dari desain
--
-- Policy yang permisif dicari lewat `pg_policies` supaya tidak bergantung
-- pada nama. Jadi perbaikan ini tidak bisa lolos begitu saja.
--
-- market_prices tetap bisa dibaca semua orang — itu inti fitur "harga pasar":
-- laporan harga dari warung sekitar dipakai bersama. Yang diubah hanya
-- PENULISAN: hanya warung yang lapor yang boleh menambah atau mengubah
-- laporannya sendiri.

-- 1. Buang semua policy permisif yang tersisa.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('product_aliases', 'purchase_notes', 'market_prices')
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Alias produk: sama sekali milik warung sendiri. Alias bisa
--    membocorkan daftar barang warung ("gulpas" = Gula Pasir).
drop policy if exists "own aliases access" on public.product_aliases;
create policy "own aliases access"
  on public.product_aliases
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 3. Bukti nota belanja: milik warung sendiri.
drop policy if exists "own purchase notes access" on public.purchase_notes;
create policy "own purchase notes access"
  on public.purchase_notes
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 4. Harga pasar: dibaca bersama, ditulis pemilik laporan.
drop policy if exists "own market prices access" on public.market_prices;
drop policy if exists "read market prices" on public.market_prices;
drop policy if exists "write own market prices" on public.market_prices;

create policy "read market prices"
  on public.market_prices
  for select
  using (true);

create policy "write own market prices"
  on public.market_prices
  for insert
  with check (owner_id = auth.uid());

create policy "update own market prices"
  on public.market_prices
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "delete own market prices"
  on public.market_prices
  for delete
  using (owner_id = auth.uid());
