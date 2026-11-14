-- Warung Pintar — pemilik data per akun.
-- Jalankan setelah `0009_engine.sql`.
--
-- Kenapa file ini ada: sampai sebelumnya semua data warung (produk, transaksi,
-- utang, pelanggan, titip, harga pasar) bisa dibaca dan diubah siapa pun yang
-- punya kunci anon. Kunci itu ada di bundle publik, jadi "publik" berarti
-- "dibaca siapa pun".
--
-- File ini menambah kolom `owner_id` ke setiap tabel. Kebijakan RLS yang
-- permisif BELUM diubah di sini — supaya Migrasi ini aman dipasang kapan saja
-- tanpa memutus aplikasi yang sedang jalan. Penguncian policies ada di
-- `0011_auth_rls.sql`, dan itu HANYA boleh dipasang setelah frontend sudah
-- mengirim `owner_id` (lihat PR frontend).
--
-- Satu akun = satu warung. Baris `owner_id` = `auth.users.id` pemilik warungnya.

-- 1. Kolom pemilik.
alter table public.products
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.product_aliases
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.transactions
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.debts
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.purchase_notes
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.customers
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.consignments
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

alter table public.market_prices
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

comment on column public.products.owner_id is
  'Pemilik warung. Satu akun = satu warung.';
comment on column public.product_aliases.owner_id is
  'Pemilik warung. Disalin dari produk induknya.';
comment on column public.transactions.owner_id is
  'Pemilik warung.';
comment on column public.debts.owner_id is
  'Pemilik warung.';
comment on column public.purchase_notes.owner_id is
  'Pemilik warung.';
comment on column public.customers.owner_id is
  'Pemilik warung.';
comment on column public.consignments.owner_id is
  'Pemilik warung.';
comment on column public.market_prices.owner_id is
  'Pemilik warung.';

-- 2. Data yang sudah ada pindah ke akun demo.
--
-- Akun demo dibuat lebih dulu lewat Supabase Auth (email sudah dikonfirmasi),
-- lalu baris yang ada sekarang diberikan kepadanya. Dengan begitu live demo
-- tetap utuh:
-- 12 produk, 47 alias, 4.884 transaksi, dan riwayat 365 hari.
--
-- Kalau baris ini belum dijalankan, data lama tetap terlihat oleh siapa pun
-- sampai `0011_auth_rls.sql` dipasang.
--
-- Ganti UID di bawah kalau akun demo dibuat ulang.
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

-- 3. Index unik jadi per pemilik.
--
-- Sebelumnya `lower(name)` unik untuk SELURUH tabel. Artinya dua warung
-- tidak boleh punya barang sama ("Beras Ramos") atau pelanggan sama
-- ("Pak Yono") — padahal tiap warung bebas punya daftar sendiri. Sekarang
-- uniqueness-nya per pemilik warung.
drop index if exists public.products_name_lower_idx;
create unique index products_name_lower_idx on public.products (lower(name), owner_id);

drop index if exists public.product_aliases_alias_lower_idx;
create unique index product_aliases_alias_lower_idx
  on public.product_aliases (lower(alias), owner_id);

drop index if exists public.customers_name_lower_idx;
create unique index customers_name_lower_idx on public.customers (lower(name), owner_id);

-- 4. Index. Query harian selalu memfilter `owner_id` dulu.
create index if not exists products_owner_id_idx on public.products (owner_id);
create index if not exists product_aliases_owner_id_idx on public.product_aliases (owner_id);
create index if not exists transactions_owner_id_idx on public.transactions (owner_id);
create index if not exists debts_owner_id_idx on public.debts (owner_id);
create index if not exists purchase_notes_owner_id_idx on public.purchase_notes (owner_id);
create index if not exists customers_owner_id_idx on public.customers (owner_id);
create index if not exists consignments_owner_id_idx on public.consignments (owner_id);
create index if not exists market_prices_owner_id_idx on public.market_prices (owner_id);
