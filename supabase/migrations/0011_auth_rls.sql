-- Warung Pintar — kunci data per pemilik warung.
-- Jalankan SETELAH frontend sudah mengirim `owner_id` (versi yang ada di repo).
--
-- PERINGATAN: file ini mengubah RLS dari permisif jadi ketat. Kalau
-- frontend belum mengirim `owner_id`, semua pembacaan jadi kosong dan semua
-- penulisan gagal — aplikasinya terlihat rusak. Jadi pastikan versi frontend
-- yang mengirim `owner_id` sudah live sebelum migration ini dipasang.
--
-- Setelah file ini:
-- - Kunci anon hanya bisa membaca dan menulis baris miliknya sendiri.
-- - Data antar warung tidak saling terlihat, termasuk nama pelanggan, nomor
--   telepon, dan catatan utang.
-- - View laporan ikut terfilter, karena memakai `security_invoker = true`.

-- 1. Pastikan tak ada baris tanpa pemilik. Baris tanpa pemilik tidak akan
--    terlihat oleh siapa pun, jadi ambil alih ke akun demo dulu.
do $$
declare
  demo_owner uuid := 'af884678-ab7c-4723-b72c-c3572c938263';
begin
  if exists (select 1 from auth.users where id = demo_owner) then
    update public.products set owner_id = demo_owner where owner_id is null;
    update public.product_aliases set owner_id = demo_owner where owner_id is null;
    update public.transactions set owner_id = demo_owner where owner_id is null;
    update public.debts set owner_id = demo_owner where owner_id is null;
    update public.purchase_notes set owner_id = demo_owner where owner_id is null;
    update public.customers set owner_id = demo_owner where owner_id is null;
    update public.consignments set owner_id = demo_owner where owner_id is null;
    update public.market_prices set owner_id = demo_owner where owner_id is null;
  end if;
end $$;

-- 2. Setiap baris wajib punya pemilik.
alter table public.products
  alter column owner_id set not null;
alter table public.product_aliases
  alter column owner_id set not null;
alter table public.transactions
  alter column owner_id set not null;
alter table public.debts
  alter column owner_id set not null;
alter table public.purchase_notes
  alter column owner_id set not null;
alter table public.customers
  alter column owner_id set not null;
alter table public.consignments
  alter column owner_id set not null;
alter table public.market_prices
  alter column owner_id set not null;

-- 3. Policy baru: hanya pemilik baris itu yang boleh menyentuh.
--    Policy lama yang permisif ("demo ... access") dibuang lebih dulu.
drop policy if exists "demo products access" on public.products;
drop policy if exists "demo aliases access" on public.product_aliases;
drop policy if exists "demo transactions access" on public.transactions;
drop policy if exists "demo debts access" on public.debts;
drop policy if exists "demo purchase notes access" on public.purchase_notes;
drop policy if exists "demo customers access" on public.customers;
drop policy if exists "demo consignments access" on public.consignments;
drop policy if exists "demo market prices access" on public.market_prices;

create policy "own products access"
  on public.products
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own aliases access"
  on public.product_aliases
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own transactions access"
  on public.transactions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own debts access"
  on public.debts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own purchase notes access"
  on public.purchase_notes
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own customers access"
  on public.customers
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own consignments access"
  on public.consignments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "own market prices access"
  on public.market_prices
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 4. View ikut terfilter.
--
-- View sebelumnya pakai `security_invoker = true`, jadi policy tabel dasar
-- View sebelumnya pakai `security_invoker = true`, jadi policy tabel dasar
-- sudah berlaku. `owner_id` ditambahkan supaya filter-nya jelas dan
-- tabelnya bisa di-query langsung per warung.
-- tabelnya bisa di-query langsung per warung.
drop view if exists public.stock_status;
create view public.stock_status
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.unit,
  p.stock,
  p.min_stock,
  p.lead_time_days,
  p.owner_id,
  case
    when p.stock <= greatest(1, p.min_stock / 2.0) then 'Kritis'
    when p.stock <= p.min_stock then 'Menipis'
    else 'Aman'
  end as status,
  least(100, round((p.stock / greatest(p.min_stock * 2.0, 1)) * 100))::int as percent
from public.products p;

comment on view public.stock_status is
  'Status stok per produk: Kritis, Menipis, atau Aman, mengikuti aturan frontend.';

drop view if exists public.daily_sales;
create view public.daily_sales
with (security_invoker = true) as
select
  p.owner_id,
  (t.created_at at time zone 'Asia/Jakarta')::date as day,
  sum(t.qty * t.unit_price) as sales,
  sum(t.qty * (t.unit_price - p.buy_price)) as gross_profit,
  count(*) as transactions,
  sum(t.qty) as items_sold
from public.transactions t
join public.products p on p.id = t.product_id
where t.type = 'sale'
group by p.owner_id, 2;

comment on view public.daily_sales is
  'Penjualan, laba kotor, transaksi, dan barang terjual per hari (WIB).';

drop view if exists public.product_sales;
create view public.product_sales
with (security_invoker = true) as
select
  p.owner_id,
  p.id as product_id,
  p.name,
  p.unit,
  sum(t.qty) as qty_sold,
  sum(t.qty * t.unit_price) as revenue,
  sum(t.qty * p.buy_price) as cogs,
  sum(t.qty * (t.unit_price - p.buy_price)) as gross_profit
from public.transactions t
join public.products p on p.id = t.product_id
where t.type = 'sale'
group by p.owner_id, p.id, p.name, p.unit;

comment on view public.product_sales is
  'Total penjualan dan laba kotor per produk.';
