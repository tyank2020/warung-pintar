-- Arsipkan barang yang tidak lagi dijual.
--
-- Sebagian barang hanya ramai musiman atau berhenti dijual total. Menghapus
-- baris barang itu mustahil (transaksi lama mereferensikan `products.id`
-- dengan `on delete restrict`) dan tidak pantas — riwayat penjualan harus
-- tetap bisa ditelusuri. Karena itu barang diberi kolom `archived`:
-- true = tidak dijual/ditawarkan lagi, false = masih aktif.
-- Baris yang diarsipkan tetap ada, hanya tidak tampil di Kasir, Stok Barang,
-- saran restok, dan pencarian suara; riwayat transaksinya tidak berubah.

alter table public.products
  add column if not exists archived boolean not null default false;

create index if not exists products_archived_owner_idx
  on public.products (owner_id, archived);
