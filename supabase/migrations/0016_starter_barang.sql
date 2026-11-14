-- Barang pokok dasar untuk akun baru.
--
-- Satu akun = satu warung. Kalau warung baru langsung kosong, pemilik
-- bingung mau mulai dari mana. Karena itu, setiap email baru yang mendaftar
-- otomatis mendapatkan 12 barang pokok yang paling sering dicari di pasar
-- dan supermarket: stok 0, tanpa transaksi, tidak ada data warung lain.
--
-- Dikerjakan lewat trigger `on_auth_user_created` di `auth.users`, bukan di
-- frontend, supaya tetap bekerja dari sisi mana pun pendaftaran terjadi.
-- Idempoten (`on conflict do nothing`) — aman dijalankan berkali-kali.

create or replace function public.seed_starter_barang()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  values
    (new.id, 'Beras Ramos', 'kg', 0, 15, 12000, 14500, 2),
    (new.id, 'Minyak Goreng', 'liter', 0, 8, 15000, 18000, 2),
    (new.id, 'Telur Ayam', 'papan', 0, 6, 25000, 30000, 2),
    (new.id, 'Gula Pasir', 'kg', 0, 8, 14000, 17000, 2),
    (new.id, 'Mi Instan', 'bungkus', 0, 20, 2500, 3500, 1),
    (new.id, 'Kopi Kapal Api', 'sachet', 0, 12, 2000, 2500, 1),
    (new.id, 'Sabun Mandi', 'pcs', 0, 8, 4000, 5500, 2),
    (new.id, 'Rokok Sampoerna', 'bungkus', 0, 10, 22000, 25000, 1),
    (new.id, 'Teh Botol', 'botol', 0, 12, 3500, 5000, 1),
    (new.id, 'Air Mineral', 'botol', 0, 12, 2500, 4000, 1),
    (new.id, 'Tepung Terigu', 'kg', 0, 5, 11000, 13000, 2),
    (new.id, 'Kecap Manis', 'botol', 0, 4, 9000, 12000, 2)
  on conflict do nothing;

  insert into public.product_aliases (owner_id, product_id, alias)
  select
    new.id,
    p.id,
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
  join public.products p
    on lower(p.name) = lower(aliases.product_name)
   and p.owner_id = new.id
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_starter on auth.users;
create trigger on_auth_user_created_starter
  after insert on auth.users
  for each row
  execute function public.seed_starter_barang();
