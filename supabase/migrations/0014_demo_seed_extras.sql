-- Data contoh tambahan KHUSUS akun demo (demo@warungpintar.app).
-- Sama dengan bagian 4–7 di seed.sql — ada di sini karena seed hanya
-- dieksekusi sekali dan project production sudah mencatat seed sebagai
-- "sudah diterapkan". Semua insert dibatasi `owner_id = demo`; warung
-- pengguna lain tidak tersentuh. Idempoten: re-run tidak menggandakan data.

-- 1. Buku pelanggan.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, data pelanggan dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from public.customers
    where customers.owner_id = demo
  ) then
    insert into public.customers (owner_id, name, phone, note, created_at)
    values
      (demo, 'Pak Yono', '0812-3456-7801', 'Pelanggan tetap dekat gang 2; sering ambil rokok dan kopi', now() - interval '20 days'),
      (demo, 'Bu Sari', '0813-2211-9087', 'Suka bayar akhir minggu; telepon dulu kalau stoknya habis', now() - interval '16 days'),
      (demo, 'Mas Udin', '0878-5544-3321', 'Titip utang kecil tiap pagi', now() - interval '12 days'),
      (demo, 'Pak Daman', '0822-1123-4567', 'Belanja grosir tiap Jumat', now() - interval '9 days'),
      (demo, 'Bu Lastri', '0891-6677-8899', 'Suka sayur dan tepung', now() - interval '5 days');
  end if;
end;
$$;

-- 2. Riwayat nota belanja + satu selisih opname untuk layar Cek Stok.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, data nota belanja dilewati.';
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

-- 3. Harga pasar: laporan harga dari warung di sekitar.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, data harga pasar dilewati.';
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

-- 4. Titip jual (konsinyasi).
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  );
begin
  if demo is null then
    raise notice 'Akun demo belum ada, data titip jual dilewati.';
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
      (demo, 'Bu Sari', 'Kain Tenun Ikat', 'pcs', 3, 1, 85000, 120000, 10, 'active', 'Titipan dari tetangga, etalase rak tengah', now() - interval '12 days', null),
      (demo, 'Bu Warsih', 'Keripik Tempe', 'bungkus', 20, 15, 5000, 7000, 10, 'active', null, now() - interval '9 days', null),
      (demo, 'Haji Usman', 'Sajadah Premium', 'pcs', 5, 2, 40000, 60000, 15, 'active', 'Setuju dibagi hasil akhir bulan', now() - interval '6 days', null),
      (demo, 'Bu Lastri', 'Kue Lapis Legit', 'bungkus', 30, 30, 3000, 5000, 10, 'selesai', 'Sudah lunas dibayar ke pemilik barang', now() - interval '8 days', now() - interval '2 days');
  end if;
end;
$$;
