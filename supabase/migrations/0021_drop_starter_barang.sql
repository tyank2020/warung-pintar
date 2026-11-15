-- Akun baru harus mulai dengan stok & kasir KOSONG — bukan 12 produk bawaan.
--
-- Sebelumnya setiap email baru yang mendaftar otomatis mendapat 12 produk
-- stok 0 lewat trigger `on_auth_user_created_starter`. Pemilik warung yang
-- baru pindah dari warung lain / memulai ulang tidak cocok dengan barang
-- bawaan — mereka butuh daftar stok yang bersih dan mulai dari awal.
--
-- Demo account (demo@warungpintar.app) tetap memiliki datanya (seeded lewat
-- seed.sql dan 0014). Produk yang sudah terlanjur dibuat untuk akun lama
-- tidak dihapus — hanya trigger ini yang dimatikan agar akun berikutnya
-- mulai kosong.

drop trigger if exists on_auth_user_created_starter on auth.users;
drop function if exists public.seed_starter_barang();
