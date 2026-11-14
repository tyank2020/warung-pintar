-- Titip jual (konsinyasi): warung menjadi etalase untuk barang milik orang
-- lain (tetangga, sajadah). Warung mencatat barang titipan, mencatat penjualan
-- titipan, lalu membayar bagian pemilik barang setelah dikurangi komisi.
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).

create table if not exists public.consignments (
  id uuid primary key default gen_random_uuid(),
  -- Nama yang menitipkan barang.
  depositor text not null,
  product_name text not null,
  unit text not null default 'pcs',
  -- Jumlah yang dititipkan.
  qty numeric(12, 2) not null check (qty > 0),
  -- Dari jumlah titipan, berapa yang sudah terjual.
  sold_qty numeric(12, 2) not null default 0 check (sold_qty >= 0),
  -- Harga modal dari pemilik barang (dipakai untuk hitung bagian yang dibayar).
  buy_price numeric(14, 2) not null default 0 check (buy_price >= 0),
  -- Harga jual ke pelanggan.
  sell_price numeric(14, 2) not null default 0 check (sell_price >= 0),
  -- Komisi warung dalam persen dari omzet.
  commission_pct numeric(5, 2) not null default 10 check (commission_pct >= 0),
  status text not null default 'active' check (status in ('active', 'selesai')),
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists consignments_status_idx
  on public.consignments (status);

alter table public.consignments enable row level security;

drop policy if exists "demo consignments access" on public.consignments;
create policy "demo consignments access"
  on public.consignments
  for all
  using (true)
  with check (true);
