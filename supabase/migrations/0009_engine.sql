-- Warung Pintar — mesin saran restok yang sama dengan frontend.
-- Jalankan setelah `0002_views.sql`.
--
-- Perubahan di file ini:
-- - `products.lead_time_days`: lama barang datang dari pemasok. Saran restok
--   memakai lead time + 3 hari stok, jadi owning warung bisa menyetel
--   sendiri kalau supliernya lebih lama.
-- - `set_buy_prices`: satu RPC untuk memperbarui harga modal beberapa
--   barang sekaligus. Sebelumnya frontend melakukan satu permintaan per barang.
-- - `restock_suggestions`: rumus disamakan dengan `src/lib/restock.ts` dan
--   `src/lib/demand.ts`, jadi angka SQL dan angka aplikasi tidak berbeda.

-- 1. Lead time pemasok per barang.
alter table public.products
  add column if not exists lead_time_days integer not null default 2;

update public.products set lead_time_days = 2
where lower(name) in ('beras ramos', 'minyak goreng', 'telur ayam', 'gula pasir', 'tepung terigu');

update public.products set lead_time_days = 1
where lower(name) in ('mi instan', 'kopi kapal api', 'rokok sampoerna', 'teh botol', 'air mineral');

update public.products set lead_time_days = 2
where lower(name) in ('sabun mandi', 'kecap manis');

comment on column public.products.lead_time_days is
  'Lama barang sampai dari pemasok dalam hari. Dipakai untuk saran restok.';

-- 2. Satu RPC untuk harga modal beberapa barang.
create or replace function public.set_buy_prices(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(payload, '[]'::jsonb))
  loop
    update public.products
    set buy_price = (item ->> 'buyPrice')::numeric
    where id = (item ->> 'productId')::uuid;
  end loop;
end;
$$;

comment on function public.set_buy_prices(jsonb) is
  'Perbarui harga modal beberapa produk dalam satu permintaan.';

-- 3. View saran restok dengan rumus yang sama seperti frontend.
--
-- Rumus:
--   rata-rata per hari = qty terjual (30 hari) / hari aktif
--   hari aktif         = hari sejak produk pertama terjual, dibatasi 30
--   target stok        = proyeksi per hari × (lead time + 3)
--   saran beli         = target − stok, minimal sampai stok minimum
--
-- Hari aktif penting: warung yang baru buka tidak boleh dibagi 30, karena
-- sarannya jadi terlalu kecil dan warung justru kekurangan stok.
-- Kolom view berubah urutan dan nama, jadi view lama harus dilepas dulu.
-- `create or replace view` tidak bisa mengganti nama atau urutan kolom.
drop view if exists public.restock_suggestions;

create view public.restock_suggestions
with (security_invoker = true) as
with bounds as (
  select
    (now() at time zone 'Asia/Jakarta')::date as today,
    (now() at time zone 'Asia/Jakarta')::date - 29 as start30,
    (now() at time zone 'Asia/Jakarta')::date - 89 as start90
),
first_sale as (
  select
    product_id,
    min((created_at at time zone 'Asia/Jakarta')::date) as first_day
  from public.transactions
  where type = 'sale'
  group by product_id
),
sales as (
  select
    t.product_id,
    sum(t.qty) filter (
      where (t.created_at at time zone 'Asia/Jakarta')::date >= b.start30
    ) as qty_30d,
    sum(t.qty) filter (
      where (t.created_at at time zone 'Asia/Jakarta')::date >= b.start90
    ) as qty_90d,
    -- Total SELURUH histori. Dipakai sebagai pembanding rata-rata harian,
    -- jadi tidak boleh ikut difilter jendela 90 hari.
    sum(t.qty) as qty_all
  from public.transactions t
  cross join bounds b
  where t.type = 'sale'
  group by t.product_id
),
-- Jendela musim: 60 hari ke depan dibandingkan tanggal yang sama tahun lalu.
hist_window as (
  select
    b.today + g.i + 1 as future_day,
    (b.today + g.i + 1 - interval '1 year')::date as past_day
  from bounds b
  cross join generate_series(0, 59) as g(i)
),
season as (
  select
    t.product_id,
    sum(t.qty) as season_qty,
    count(distinct (t.created_at at time zone 'Asia/Jakarta')::date) as season_days
  from public.transactions t
  join hist_window hw
    on (t.created_at at time zone 'Asia/Jakarta')::date = hw.past_day
  where t.type = 'sale'
  group by t.product_id
),
live as (
  select
    p.id as product_id,
    coalesce(
      least(30, greatest(1, (b.today - greatest(f.first_day, b.start30)) + 1)),
      30
    ) as live_days_30,
    coalesce(
      least(90, greatest(1, (b.today - greatest(f.first_day, b.start90)) + 1)),
      90
    ) as live_days_90,
    coalesce(
      least(365, greatest(1, (b.today - f.first_day) + 1)),
      365
    ) as live_days_all
  from public.products p
  cross join bounds b
  left join first_sale f on f.product_id = p.id
),
rates as (
  select
    p.id as product_id,
    p.name,
    p.unit,
    p.stock,
    p.min_stock,
    p.buy_price,
    p.sell_price,
    p.lead_time_days,
    coalesce(s.qty_30d, 0) as qty_30d,
    coalesce(s.qty_90d, 0) as qty_90d,
    coalesce(s.qty_all, 0) as qty_all,
    l.live_days_30,
    l.live_days_90,
    l.live_days_all,
    coalesce(se.season_qty, 0) as season_qty,
    coalesce(se.season_days, 0) as season_days
  from public.products p
  left join sales s on s.product_id = p.id
  join live l on l.product_id = p.id
  left join season se on se.product_id = p.id
),
calc as (
  select
    rates.*,
    case when live_days_30 > 0 then qty_30d::numeric / live_days_30 else 0 end as avg_daily_30,
    case when live_days_90 > 0 then qty_90d::numeric / live_days_90 else 0 end as avg_daily_90,
    case when live_days_all > 0 then qty_all::numeric / live_days_all else 0 end as avg_daily_all
  from rates
),
seasonal as (
  select
    calc.*,
    case
      when avg_daily_all > 0 and season_days > 0
        then least(2.5, greatest(0.5, (season_qty::numeric / season_days) / avg_daily_all))
      else 1
    end as seasonal_factor
  from calc
),
final as (
  select
    seasonal.*,
    case
      when avg_daily_30 > 0 and avg_daily_90 > 0
        then avg_daily_30 * 0.7 + avg_daily_90 * 0.3
      else 0
    end as base_daily,
    greatest(1, lead_time_days + 3) as cover_days
  from seasonal
),
projected as (
  select
    final.*,
    base_daily * (1 + (seasonal_factor - 1) * 0.3) as projected_daily
  from final
),
sized as (
  select
    projected.*,
    greatest(
      0,
      ceil(projected_daily * cover_days - stock),
      case when stock < min_stock then greatest(1, ceil(min_stock - stock)) else 0 end
    ) as suggested_qty
  from projected
)
select
  product_id,
  name,
  unit,
  stock,
  min_stock,
  lead_time_days,
  round(avg_daily_30, 2) as avg_daily_30,
  round(projected_daily, 2) as projected_daily,
  round(seasonal_factor, 2) as seasonal_factor,
  case
    when projected_daily > 0 then round(stock / projected_daily, 1)
    else null
  end as days_of_cover,
  suggested_qty,
  suggested_qty * buy_price as estimated_cost,
  case
    when projected_daily > 0 then
      'Rata-rata terjual ' || replace(round(projected_daily, 1)::text, '.', ',') || ' ' || unit ||
      '/hari; stok sekarang ' || stock || ' ' || unit || '.'
    else
      'Belum ada penjualan. Stok ' || stock || ' ' || unit ||
      '; minimum ' || min_stock || ' ' || unit || '.'
  end as reason
from sized
where suggested_qty > 0;

comment on view public.restock_suggestions is
  'Saran restok: proyeksi per hari x (lead time + 3) - stok, dengan alasan.';

-- 4. View stok sekalian menampilkan lead time supaya halaman stok bisa
--    menampilkan kapan barang harus dipesan.
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
  case
    when p.stock <= greatest(1, p.min_stock / 2.0) then 'Kritis'
    when p.stock <= p.min_stock then 'Menipis'
    else 'Aman'
  end as status,
  least(100, round((p.stock / greatest(p.min_stock * 2.0, 1)) * 100))::int as percent
from public.products p;

comment on view public.stock_status is
  'Status stok per produk: Kritis, Menipis, atau Aman, mengikuti aturan frontend.';
