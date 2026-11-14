-- Warung Pintar — schema awal
-- Jalankan di Supabase SQL Editor atau lewat `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  stock numeric(12, 2) not null default 0 check (stock >= 0),
  min_stock numeric(12, 2) not null default 0 check (min_stock >= 0),
  buy_price numeric(14, 2) not null default 0 check (buy_price >= 0),
  sell_price numeric(14, 2) not null default 0 check (sell_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_name_lower_idx
  on public.products (lower(name));

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists product_aliases_alias_lower_idx
  on public.product_aliases (lower(alias));

create index if not exists product_aliases_product_id_idx
  on public.product_aliases (product_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('sale', 'purchase', 'adjustment')),
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(12, 2) not null,
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint transactions_qty_check check (
    (type in ('sale', 'purchase') and qty > 0)
    or (type = 'adjustment' and qty <> 0)
  )
);

create index if not exists transactions_created_at_idx
  on public.transactions (created_at desc);

create index if not exists transactions_product_created_at_idx
  on public.transactions (product_id, created_at desc);

-- updated_at otomatis untuk products.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- Stok selalu diturunkan dari transaksi:
-- sale mengurangi stok, purchase menambah stok,
-- adjustment memakai qty sebagai delta (boleh negatif).
create or replace function public.apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'sale' then
    update public.products
      set stock = stock - new.qty
      where id = new.product_id;
  else
    update public.products
      set stock = stock + new.qty
      where id = new.product_id;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_apply_stock on public.transactions;
create trigger transactions_apply_stock
  after insert on public.transactions
  for each row
  execute function public.apply_transaction_stock();

-- RLS demo: anon key boleh baca/tulis.
-- GANTI dengan auth + policy per pemilik sebelum dipakai produksi.
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "demo products access" on public.products;
create policy "demo products access"
  on public.products
  for all
  using (true)
  with check (true);

drop policy if exists "demo aliases access" on public.product_aliases;
create policy "demo aliases access"
  on public.product_aliases
  for all
  using (true)
  with check (true);

drop policy if exists "demo transactions access" on public.transactions;
create policy "demo transactions access"
  on public.transactions
  for all
  using (true)
  with check (true);
