-- Data contoh untuk memastikan transaksi hari ini akun demo dihitung Beranda.
do $$
declare
  demo uuid := (
    select id
    from auth.users
    where lower(email) = 'demo@warungpintar.app'
  );
  local_day_start timestamptz := (
    date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
  );
  sample_time timestamptz := greatest(
    local_day_start,
    least(now() - interval '1 minute', local_day_start + interval '6 hours')
  );
  sample_note constant text := 'Data contoh Beranda akun demo';
begin
  if demo is null then
    raise notice 'Akun demo belum ada, data Beranda dilewati.';
    return;
  end if;

  update public.transactions as transactions
  set created_at = sample_time,
      note = sample_note
  from public.products as products
  where transactions.product_id = products.id
    and transactions.owner_id = demo
    and transactions.created_at >= local_day_start
    and transactions.created_at < local_day_start + interval '1 day'
    and transactions.created_at > sample_time
    and (
      transactions.note = sample_note
      or (
        transactions.type = 'sale'
        and transactions.note is null
        and exists (
          select 1
          from (
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
          ) as seed_sales(product_name, qty)
          where seed_sales.product_name = products.name
            and seed_sales.qty = transactions.qty
        )
      )
    );

  if not exists (
    select 1
    from public.transactions
    where owner_id = demo
      and type = 'purchase'
      and created_at >= local_day_start
      and created_at <= sample_time
  ) then
    insert into public.transactions (owner_id, type, product_id, qty, unit_price, created_at, note)
    select demo, 'purchase', products.id, 2, products.buy_price, sample_time, sample_note
    from public.products
    where products.owner_id = demo
      and products.name = 'Minyak Goreng'
    limit 1;
  end if;

  if not exists (
    select 1
    from public.transactions
    where owner_id = demo
      and type = 'sale'
      and created_at >= local_day_start
      and created_at <= sample_time
  ) then
    insert into public.transactions (owner_id, type, product_id, qty, unit_price, created_at, note)
    select
      demo,
      'sale',
      products.id,
      sales.qty,
      products.sell_price,
      sample_time,
      sample_note
    from (
      values
        ('Air Mineral', 3),
        ('Mi Instan', 8)
    ) as sales(product_name, qty)
    join public.products
      on products.name = sales.product_name
     and products.owner_id = demo
    where products.stock >= sales.qty;
  end if;

  if exists (
    select 1
    from public.transactions
    where owner_id = demo
  ) and not exists (
    select 1
    from public.debts
    where owner_id = demo
      and settled_at is null
  ) and not exists (
    select 1
    from public.debts
    where owner_id = demo
      and note = sample_note
  ) then
    insert into public.debts (
      owner_id,
      debtor,
      product_name,
      qty,
      unit,
      amount,
      note,
      created_at
    )
    values
      (
        demo,
        'Pak Yono',
        'Rokok Sampoerna',
        2,
        'bungkus',
        50000,
        sample_note,
        now() - interval '3 days'
      ),
      (
        demo,
        'Bu Tuti',
        'Beras Ramos',
        3,
        'kg',
        43500,
        sample_note,
        now() - interval '6 days'
      );
  end if;
end;
$$;
