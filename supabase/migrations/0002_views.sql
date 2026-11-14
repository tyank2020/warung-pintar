-- Warung Pintar — view bantu untuk laporan dan saran stok.
-- Jalankan setelah `0001_init.sql`.
--
-- Catatan:
-- - Laba kotor memakai `products.buy_price` saat ini karena transaksi belum
--   menyimpan snapshot harga modal.
-- - Tanggal penjualan memakai zona waktu Asia/Jakarta agar cocok dengan
--   tampilan aplikasi.

create or replace view public.stock_status
with (security_invoker = true) as
select
  p.id,
  p.name,
  p.unit,
  p.stock,
  p.min_stock,
  case
    when p.stock <= greatest(1, p.min_stock / 2.0) then 'Kritis'
    when p.stock <= p.min_stock then 'Menipis'
    else 'Aman'
  end as status,
  least(100, round((p.stock / greatest(p.min_stock * 2.0, 1)) * 100))::int as percent
from public.products p;

comment on view public.stock_status is
  'Status stok per produk: Kritis, Menipis, atau Aman, mengikuti aturan frontend.';

create or replace view public.daily_sales
with (security_invoker = true) as
select
  (t.created_at at time zone 'Asia/Jakarta')::date as day,
  sum(t.qty * t.unit_price) as sales,
  sum(t.qty * (t.unit_price - p.buy_price)) as gross_profit,
  count(*) as transactions,
  sum(t.qty) as items_sold
from public.transactions t
join public.products p on p.id = t.product_id
where t.type = 'sale'
group by 1;

comment on view public.daily_sales is
  'Penjualan, laba kotor, transaksi, dan barang terjual per hari (WIB).';

create or replace view public.product_sales
with (security_invoker = true) as
select
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
group by p.id, p.name, p.unit;

comment on view public.product_sales is
  'Total penjualan dan laba kotor per produk.';

-- CATATAN: view `restock_suggestions` di bawah memakai rumus lama (pembagi
-- tetap 7 hari, tanpa lead time, tanpa faktor musim). Rumus itu sudah diganti
-- di `0009_engine.sql`, yang menggantinya dengan rumus yang sama dipakai
-- frontend (`src/lib/restock.ts`).
--
-- Jadi jangan jalankan file ini sendiri tanpa `0009_engine.sql` sesudahnya:
-- `create or replace view` tidak bisa mengganti nama dan urutan kolom, jadi
-- file ini akan gagal kalau dijalankan ulang setelah `0009_engine.sql`.
--
-- Untuk database baru, jalankan semua migration berurutan: 0001 → 0009.
create or replace view public.restock_suggestions
with (security_invoker = true) as
with sold as (
  select product_id, sum(qty) as qty_7d
  from public.transactions
  where type = 'sale'
    and created_at >= now() - interval '7 days'
  group by product_id
),
base as (
  select
    p.id as product_id,
    p.name,
    p.unit,
    p.stock,
    p.min_stock,
    p.buy_price,
    coalesce(s.qty_7d, 0) as qty_7d,
    coalesce(s.qty_7d, 0) / 7.0 as avg_per_day
  from public.products p
  left join sold s on s.product_id = p.id
),
calc as (
  select
    base.*,
    ceil(avg_per_day * 3 - stock) as raw_qty
  from base
),
final as (
  select
    calc.*,
    case
      when raw_qty <= 0 and stock <= min_stock
        then greatest(1, ceil(min_stock - stock))
      else raw_qty
    end as suggested_qty
  from calc
)
select
  product_id,
  name,
  unit,
  stock,
  min_stock,
  qty_7d,
  round(avg_per_day, 2) as avg_per_day,
  suggested_qty,
  suggested_qty * buy_price as estimated_cost,
  case
    when qty_7d > 0 then
      'Rata-rata terjual ' || replace(round(avg_per_day, 1)::text, '.', ',') || ' ' || unit ||
      '/hari; stok sekarang ' || stock || ' ' || unit || '.'
    else
      'Stok ' || stock || ' ' || unit || ' sudah di bawah minimum ' || min_stock || ' ' || unit || '.'
  end as reason
from final
where suggested_qty > 0;

comment on view public.restock_suggestions is
  'Saran restok: rata-rata terjual per hari x 3 - stok saat ini, dengan alasan.';
