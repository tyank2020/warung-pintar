-- Seed produk awal Warung Pintar untuk AKUN DEMO.
--
-- Stok di sini adalah stok awal. Transaksi berikutnya akan menyesuaikan stok
-- lewat trigger `transactions_apply_stock`.
--
-- Seed berjalan dengan skema yang mengharuskan `owner_id` (lihat 0011_auth_rls.sql),
-- jadi semua baris diarahkan ke akun demo (`demo@warungpintar.app`, dibuat lebih dulu
-- lewat Auth Admin API). Kalau akun demo belum ada, tidak ada baris yang diinsert —
-- ini disengaja supaya seed tidak pernah gagal di environment tanpa akun demo.
--
-- Lead time adalah lama barang sampai dari pemasok. Nilai ini dipakai untuk
-- saran restok: stok harus menutup lead time + 3 hari.

-- 1. Produk awal.
insert into public.products (
  owner_id,
  name,
  unit,
  stock,
  min_stock,
  buy_price,
  sell_price,
  lead_time_days
)
select
  demo.id,
  seed.name,
  seed.unit,
  seed.stock,
  seed.min_stock,
  seed.buy_price,
  seed.sell_price,
  seed.lead_time_days
from (
  values
    ('Beras Ramos', 'kg', 70, 15, 12000, 14500, 2),
    ('Minyak Goreng', 'liter', 20, 8, 15000, 18000, 2),
    ('Telur Ayam', 'papan', 16, 6, 25000, 30000, 2),
    ('Gula Pasir', 'kg', 12, 8, 14000, 17000, 2),
    ('Mi Instan', 'bungkus', 180, 20, 2500, 3500, 1),
    ('Kopi Kapal Api', 'sachet', 90, 12, 2000, 2500, 1),
    ('Sabun Mandi', 'pcs', 30, 8, 4000, 5500, 2),
    ('Rokok Sampoerna', 'bungkus', 80, 10, 22000, 25000, 1),
    ('Teh Botol', 'botol', 48, 12, 3500, 5000, 1),
    ('Air Mineral', 'botol', 60, 12, 2500, 4000, 1),
    ('Tepung Terigu', 'kg', 25, 5, 11000, 13000, 2),
    ('Kecap Manis', 'botol', 18, 4, 9000, 12000, 2)
) as seed(name, unit, stock, min_stock, buy_price, sell_price, lead_time_days)
cross join (
  select id
  from auth.users
  where email = 'demo@warungpintar.app'
) as demo
on conflict do nothing;

-- 2. Alias barang, supaya suara & nota mengenali nama sehari-hari.
insert into public.product_aliases (owner_id, product_id, alias)
select
  demo.id,
  products.id,
  aliases.alias
from (
  values
    ('Beras Ramos', 'beras'),
    ('Beras Ramos', 'beras premium'),
    ('Beras Ramos', 'beras ramos'),
    ('Beras Ramos', 'br'),
    ('Minyak Goreng', 'minyak'),
    ('Minyak Goreng', 'minyak goreng'),
    ('Minyak Goreng', 'mg'),
    ('Minyak Goreng', 'goreng'),
    ('Minyak Goreng', 'minyak sayur'),
    ('Telur Ayam', 'telur'),
    ('Telur Ayam', 'telor'),
    ('Telur Ayam', 'telur ayam'),
    ('Telur Ayam', 'ta'),
    ('Gula Pasir', 'gula'),
    ('Gula Pasir', 'gulpas'),
    ('Gula Pasir', 'gula pasir'),
    ('Gula Pasir', 'gp'),
    ('Gula Pasir', 'gula putih'),
    ('Mi Instan', 'mi'),
    ('Mi Instan', 'mie'),
    ('Mi Instan', 'mi instan'),
    ('Mi Instan', 'mie instan'),
    ('Mi Instan', 'indomie'),
    ('Mi Instan', 'im'),
    ('Kopi Kapal Api', 'kopi'),
    ('Kopi Kapal Api', 'kopi kapal api'),
    ('Kopi Kapal Api', 'ka'),
    ('Kopi Kapal Api', 'kapal api'),
    ('Kopi Kapal Api', 'kopi sachet'),
    ('Sabun Mandi', 'sabun'),
    ('Sabun Mandi', 'sabun mandi'),
    ('Sabun Mandi', 'sm'),
    ('Rokok Sampoerna', 'rokok'),
    ('Rokok Sampoerna', 'sampoerna'),
    ('Rokok Sampoerna', 'rokok sampoerna'),
    ('Rokok Sampoerna', 'rs'),
    ('Teh Botol', 'teh'),
    ('Teh Botol', 'teh botol'),
    ('Teh Botol', 'es teh'),
    ('Air Mineral', 'air'),
    ('Air Mineral', 'air mineral'),
    ('Air Mineral', 'aqua'),
    ('Air Mineral', 'air putih'),
    ('Tepung Terigu', 'tepung'),
    ('Tepung Terigu', 'terigu'),
    ('Kecap Manis', 'kecap'),
    ('Kecap Manis', 'kecap manis')
) as aliases(product_name, alias)
join public.products
  on lower(public.products.name) = lower(aliases.product_name)
 and public.products.owner_id = (
   select id
   from auth.users
   where email = 'demo@warungpintar.app'
 )
cross join (
  select id
  from auth.users
  where email = 'demo@warungpintar.app'
) as demo
on conflict do nothing;

-- 3. Pembelian & penjualan contoh untuk 7 hari terakhir.
--    Dijalankan kalau akun demo belum punya transaksi, supaya data demo
--    tidak menumpuk saat seed dijalankan ulang.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, seed transaksi dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.transactions
    where transactions.owner_id = demo
  ) then
    -- Pembelian contoh. Dibuat lebih dulu supaya stok tidak minus saat
    -- penjualan demo di bawah ini diproses trigger.
    insert into public.transactions (owner_id, type, product_id, qty, unit_price, created_at)
    select
      demo,
      'purchase',
      products.id,
      purchases.qty,
      products.buy_price,
      date_trunc('day', now()) - interval '6 days' + interval '9 hours'
    from (
      values
        ('Minyak Goreng', 24),
        ('Gula Pasir', 20),
        ('Mi Instan', 100),
        ('Kopi Kapal Api', 60)
    ) as purchases(product_name, qty)
    join public.products
      on public.products.name = purchases.product_name
     and public.products.owner_id = demo;

    -- Penjualan 7 hari terakhir.
    insert into public.transactions (owner_id, type, product_id, qty, unit_price, created_at)
    select
      demo,
      'sale',
      products.id,
      sales.qty,
      products.sell_price,
      case
        when days.day_offset = 6 then now() - interval '30 minutes'
        else date_trunc('day', now())
          - (6 - days.day_offset) * interval '1 day'
          + interval '10 hours'
      end
    from generate_series(0, 6) as days(day_offset)
    cross join (
      values
        ('Beras Ramos', 3),
        ('Minyak Goreng', 2),
        ('Telur Ayam', 2),
        ('Gula Pasir', 2),
        ('Mi Instan', 10),
        ('Kopi Kapal Api', 5),
        ('Sabun Mandi', 1),
        ('Rokok Sampoerna', 4),
        ('Teh Botol', 2),
        ('Air Mineral', 3),
        ('Tepung Terigu', 1),
        ('Kecap Manis', 1)
    ) as sales(product_name, qty)
    join public.products
      on public.products.name = sales.product_name
     and public.products.owner_id = demo;
  end if;
end;
$$;

-- 4. Buku Piutang: langganan tetap warung demo.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, seed Piutang dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.customers
    where customers.owner_id = demo
  ) then
    insert into public.customers (owner_id, name, phone, note, created_at)
    values
      (demo, 'Pak Yono', '0812-3456-7801', 'Piutang tetap dekat gang 2; sering ambil rokok dan kopi', now() - interval '20 days'),
      (demo, 'Bu Sari', '0813-2211-9087', 'Suka bayar akhir minggu; telepon dulu kalau stoknya habis', now() - interval '16 days'),
      (demo, 'Mas Udin', '0878-5544-3321', 'Titip utang kecil tiap pagi', now() - interval '12 days'),
      (demo, 'Pak Daman', '0822-1123-4567', 'Belanja grosir tiap Jumat', now() - interval '9 days'),
      (demo, 'Bu Lastri', '0891-6677-8899', 'Suka sayur dan tepung', now() - interval '5 days');
  end if;
end;
$$;

-- 5. Riwayat nota belanja + satu selisih opname untuk layar Cek Stok.
--
-- Skenarionya disengaja bisa mendemokan dua temuan:
--   1. Beras Ramos kurang 4 kg saat opname â†’ tertaut ke nota 5 hari lalu
--      ("barang ini masuk dari nota â€¦ â€” cek nota itu (Pak Andi)").
--   2. Nota Telur Ayam tercatat, tapi tidak pernah ada pembelian telur â†’
--      temuan "nota tanpa stok".
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, seed nota belanja dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.purchase_notes
    where purchase_notes.owner_id = demo
  ) then
    insert into public.purchase_notes (
      owner_id,
      added_by,
      total,
      item_count,
      items,
      image_data,
      source,
      created_at
    )
    values
      (
        demo,
        'Pak Andi',
        480000,
        2,
        '[{"name":"Beras Ramos","qty":10,"unit":"kg","unitPrice":12000},{"name":"Minyak Goreng","qty":24,"unit":"liter","unitPrice":15000}]'::jsonb,
        null,
        'scan',
        date_trunc('day', now()) - interval '5 days' + interval '9 hours'
      ),
      (
        demo,
        'Pegawai toko',
        405000,
        2,
        '[{"name":"Telur Ayam","qty":5,"unit":"papan","unitPrice":25000},{"name":"Gula Pasir","qty":20,"unit":"kg","unitPrice":14000}]'::jsonb,
        null,
        'scan',
        date_trunc('day', now()) - interval '2 days' + interval '15 hours'
      );
  end if;

  if not exists (
    select 1
    from public.transactions
    where transactions.owner_id = demo
      and transactions.type = 'adjustment'
      and transactions.note = 'opname'
  ) then
    insert into public.transactions (
      owner_id,
      type,
      product_id,
      qty,
      unit_price,
      created_at,
      note
    )
    select
      demo,
      'adjustment',
      products.id,
      -4,
      products.buy_price,
      date_trunc('day', now()) - interval '1 day' + interval '10 hours',
      'opname'
    from public.products
    where products.owner_id = demo
      and products.name = 'Beras Ramos';
  end if;
end;
$$;

-- 6. Harga pasar: laporan harga dari warung di sekitar.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, seed harga pasar dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.market_prices
    where market_prices.owner_id = demo
  ) then
    insert into public.market_prices (
      owner_id,
      product_id,
      product_name,
      price,
      source_name,
      reported_by,
      reported_at
    )
    select
      demo,
      products.id,
      products.name,
      prices.price,
      prices.source_name,
      'Pak Andi',
      now() - prices.days_ago * interval '1 day'
    from public.products
    join (
      values
        ('Beras Ramos', 12500, 'Toko Bu Rina', 0),
        ('Minyak Goreng', 15800, 'Warung sebelah', 0),
        ('Telur Ayam', 26500, 'Toko Bu Rina', 1),
        ('Gula Pasir', 14500, 'Warung sebelah', 1),
        ('Mi Instan', 2600, 'Warung sebelah', 2),
        ('Kopi Kapal Api', 2100, 'Toko Bu Rina', 2),
        ('Rokok Sampoerna', 23000, 'Warung sebelah', 3),
        ('Air Mineral', 2800, 'Toko Bu Rina', 3)
    ) as prices(product_name, price, source_name, days_ago)
      on products.name = prices.product_name
     and products.owner_id = demo;
  end if;
end;
$$;

-- 7. Titip jual (konsinyasi): barang milik tetangga/titipan yang dijual di warung.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, seed titip jual dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.consignments
    where consignments.owner_id = demo
  ) then
    insert into public.consignments (
      owner_id,
      depositor,
      product_name,
      unit,
      qty,
      sold_qty,
      buy_price,
      sell_price,
      commission_pct,
      status,
      note,
      created_at,
      settled_at
    )
    values
      (demo, 'Bu Sari', 'Keripik Singkong Balado', 'bungkus', 40, 12, 3000, 5000, 10, 'active', 'Titipan dari tetangga, etalase rak depan', now() - interval '12 days', null),
      (demo, 'Bu Warsih', 'Keripik Tempe', 'bungkus', 20, 15, 5000, 7000, 10, 'active', null, now() - interval '9 days', null),
      (demo, 'Haji Usman', 'Kacang Koro Pedas', 'bungkus', 25, 8, 4000, 7000, 15, 'active', 'Titipan langganan, rak dekat kasir', now() - interval '6 days', null),
      (demo, 'Bu Lastri', 'Kue Lapis Legit', 'bungkus', 30, 30, 3000, 5000, 10, 'selesai', 'Sudah lunas dibayar ke pemilik barang', now() - interval '8 days', now() - interval '2 days');
  end if;
end;
$$;

