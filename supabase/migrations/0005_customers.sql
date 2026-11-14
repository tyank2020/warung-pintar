-- Buku pelanggan: identitas langganan warung + catatan (telepon, catatan).
-- Riwayat utang tetap di tabel debts; tabel ini menyimpan data pelanggan
-- yang tidak bisa ditebak dari transaksi (mis. telepon, catatan),
-- supaya pemilik tahu siapa yang sedang punya utang.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_name_lower_idx
  on public.customers (lower(name));

alter table public.customers enable row level security;

drop policy if exists "demo customers access" on public.customers;
create policy "demo customers access"
  on public.customers
  for all
  using (true)
  with check (true);
