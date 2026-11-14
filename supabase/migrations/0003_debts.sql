-- Warung Pintar — buku utang ("simpen dulu")
-- Jalankan lewat `supabase db push`.

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  debtor text not null,
  product_name text not null,
  qty numeric(12, 2) not null default 1 check (qty > 0),
  unit text not null default 'pcs',
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists debts_settled_at_idx
  on public.debts (settled_at);

create index if not exists debts_debtor_idx
  on public.debts (lower(debtor));

-- Buku utang mengikuti policy demo yang permisif seperti tabel lain.
-- GANTI dengan auth + policy per pemilik sebelum dipakai produksi.
alter table public.debts enable row level security;

drop policy if exists "demo debts access" on public.debts;
create policy "demo debts access"
  on public.debts for all
  using (true)
  with check (true);
