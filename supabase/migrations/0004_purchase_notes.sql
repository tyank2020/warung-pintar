-- Riwayat nota belanja: bukti fisik barang masuk gudang.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

create table if not exists public.purchase_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Nama orang yang menambah stok (pegawai atau pemilik). Belum ada login,
  -- jadi masih diisi manual oleh pemilik warung.
  added_by text not null default 'Pemilik warung',
  total numeric(14, 2) not null default 0,
  item_count integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  -- Foto nota (data URL) supaya pemilik bisa lihat lagi buktinya.
  image_data text,
  source text not null default 'scan'
);

create index if not exists purchase_notes_created_at_idx
  on public.purchase_notes (created_at desc);

alter table public.purchase_notes enable row level security;

drop policy if exists "demo purchase notes access" on public.purchase_notes;
create policy "demo purchase notes access"
  on public.purchase_notes
  for all
  using (true)
  with check (true);
