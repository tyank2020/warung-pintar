-- Titip jual akun demo: ganti titipan non-kebutuhan pasar/supermarket
-- (Kain Tenun Ikat, Sajadah Premium) dengan barang titipan yang umum
-- dijual di pasar & supermarket (keripik singkong, kacang koro).
-- Hanya menyentuh baris milik akun demo. Idempoten: aman dijalankan ulang.

delete from public.consignments
where owner_id = (
    select id
    from auth.users
    where email = 'demo@warungpintar.app'
  )
  and product_name in ('Kain Tenun Ikat', 'Sajadah Premium');

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
      and consignments.product_name = 'Keripik Singkong Balado'
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
      (demo, 'Bu Sari', 'Keripik Singkong Balado', 'bungkus', 40, 12, 3000, 5000, 10, 'active', 'Titipan dari tetangga, etalase rak depan', now() - interval '12 days', null);
  end if;

  if not exists (
    select 1
    from public.consignments
    where consignments.owner_id = demo
      and consignments.product_name = 'Kacang Koro Pedas'
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
      (demo, 'Haji Usman', 'Kacang Koro Pedas', 'bungkus', 25, 8, 4000, 7000, 15, 'active', 'Titipan langganan, rak dekat kasir', now() - interval '6 days', null);
  end if;
end;
$$;
