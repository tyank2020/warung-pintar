-- Harga pasar: laporan harga yang dilihat warung di sekitar (crowd-sourced).
-- Tidak ada sumber publik untuk harga warung sebelah per barang, jadi data
-- dikumpulkan dari warung yang memakai aplikasi ini. Setiap laporan menyimpan
-- sumber dan waktunya supaya bisa ditelusuri.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  product_name text not null,
  price numeric(14, 2) not null check (price > 0),
  source_name text not null default 'Warung sebelah',
  reported_by text,
  reported_at timestamptz not null default now()
);

create index if not exists market_prices_product_reported_idx
  on public.market_prices (product_id, reported_at desc);

alter table public.market_prices enable row level security;

drop policy if exists "demo market prices access" on public.market_prices;
create policy "demo market prices access"
  on public.market_prices
  for all
  using (true)
  with check (true);
