# Kontrak Data — Warung Pintar

Dokumen ini adalah kesepakatan bersama. Jangan ubah tanpa memberi tahu tim.

## Tabel

```txt
products(
  id,
  name,
  unit,
  stock,
  min_stock,
  buy_price,
  sell_price,
  lead_time_days,
  owner_id
)

product_aliases(
  id,
  product_id,
  alias
)

transactions(
  id,
  type 'sale' | 'purchase' | 'adjustment',
  product_id,
  qty,
  unit_price,
  created_at,
  owner_id
)

debts(
  id,
  debtor,
  product_name,
  qty,
  unit,
  amount,
  note,
  created_at,
  settled_at
)
```

## Aturan

- Satu produk punya satu nama utama dan boleh punya banyak alias.
- `gulpas`, `gula`, dan `gula pasir` harus mengarah ke produk yang sama.
- Stok dihitung dari transaksi: pembelian menambah, penjualan mengurangi.
- `adjustment` memakai `qty` sebagai delta dan boleh negatif.
- `lead_time_days` adalah lama barang sampai dari pemasok. Nil dipakai untuk menghitung saran restok. Kalau kosong, perkiraan per kategori dipakai.
- Laba selalu **laba kotor** = penjualan − modal barang terjual.
- Satuan mengikuti produk: `kg`, `liter`, `dus`, `bungkus`, `papan`, `pcs`, dan lain-lain.
- Buku utang (`debts`) terpisah dari transaksi: barang disimpan dulu tidak
  mengubah stok/statistik sampai pemilik warung mencatat penjualannya sendiri
  saat pelunasan.

## Aturan angka (sumber tunggal)

Saran restok hanya boleh dihitung oleh `src/lib/restock.ts`. View SQL
`public.restock_suggestions` memakai rumus yang sama.

```txt
hari aktif       = hari sejak produk pertama terjual, dibatasi 30 hari
laju dasar       = qty terjual (30 hari) ÷ hari aktif
faktor musim     = pola 60 hari ke depan ÷ rata-rata hari ini  (dibatasi 0,5–2,5)
proyeksi per hari = (laju dasar × 0,7 + laju 90 hari × 0,3) × (1 + (faktor musim − 1) × 0,3)
target stok      = proyeksi per hari × (lead time + 3)
saran beli       = target stok − stok, minimal sampai stok minimum
```

Larangan yang sering jadi sumber salah:

- Jangan memakai pembagi tetap (misalnya `qty / 7`). Warung yang baru buka
  akan mendapat saran yang jauh terlalu kecil.
- Jangan menghitung saran di satu layar dengan rumus sendiri. Beranda, Stok
  Barang, kartu musim, dan rencana belanja besok harus menampilkan angka yang
  sama untuk produk yang sama.
- Jangan memasukkan transaksi bertanggal di masa depan ke hitungan.
- Semua pengelompokan hari memakai zona waktu warung (`Asia/Jakarta`). View
  SQL memakai `at time zone 'Asia/Jakarta'` supaya sama dengan frontend.
- **Satu akun = satu warung.** Semua tabel yang menyimpan data warung punya
  `owner_id` yang sama dengan `auth.users.id` pemilik warungnya, dan policy
  RLS-nya hanya mengizinkan baris milik sendiri:

  ```sql
  create policy "own products access"
    on public.products
    for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
  ```

  Jadi frontend tidak perlu memfilter per warung — RLS yang melakukannya.
  Tapi **setiap insert wajib mengisi `owner_id`**, kalau tidak barisnya tidak
  terlihat oleh siapa pun, termasuk pemiliknya sendiri.
- Nama produk dan nama Piutang unik **per warung**, bukan unik global. Dua
  warung boleh sama-sama punya "Beras Ramos" atau Piutang "Pak Yono".

## Output AI

Semua error dari Edge Function memakai bentuk:

```json
{ "error": "Pesan yang bisa ditampilkan ke pengguna." }
```

### `parse-voice`

Input:

```json
{
  "transcript": "terjual beras 10 kilo dan telur 2 papan",
  "products": [{ "name": "Beras Ramos", "unit": "kg", "aliases": ["beras"], "size": null }]
}
```

`products` opsional, tetapi membantu AI memakai nama produk yang sudah ada.

Output:

```json
{
  "items": [
    { "name": "Beras Ramos", "qty": 10, "unit": "kg", "confidence": 0.95, "size": null }
  ],
  "debtor": null
}
```

`size` berisi ukuran/varian kemasan ("2 Liter") kalau ucapan menyebut dua angka
("minyak 2 liter 20 botol" → size `2 Liter`, qty `20`, unit `botol`); `null`
bila tidak, atau hanya satu angka+satuan (diperlakukan sebagai qty, perilaku lama).

`debtor` berisi nama orang kalau ucapan menandakan barang disimpan dulu
("simpen dulu buat Pak Yono") — hasilnya dicatat ke buku utang `debts`, bukan
sebagai penjualan. Versi lama tanpa `debtor` tetap kompatibel (dianggap null).

### `scan-receipt`

Diimplementasikan lewat VLM native (Gemini `generateContent`, gambar sebagai `inlineData`), bukan
shim chat-completions.

Input:

```json
{ "imageBase64": "...", "mimeType": "image/jpeg" }
```

Output:

```json
{
  "items": [
    { "name": "Minyak Goreng", "qty": 5, "unit": "liter", "unit_price": 15000, "size": null }
  ],
  "total": 515000
}
```

`size` berisi ukuran/varian kemasan bila tertulis di baris barang ("Minyak
Goreng 2 L x 20" → size `2 Liter`, qty `20`, unit `botol`); `null` bila tidak ada.

### `advisor`

Input berisi angka yang sudah dihitung frontend: penjualan mingguan, modal, stok rendah, dan tips lokal.

```json
{
  "weekSales": 500000,
  "weekCogs": 350000,
  "lowStock": [{ "name": "Telur Ayam", "stock": 2, "unit": "papan", "min_stock": 6 }],
  "tips": [{ "text": "Saran lokal", "reason": "Alasan dari database" }]
}
```

Output:

```json
{
  "tips": [
    {
      "text": "Siapkan sekitar 15 kg Beras Ramos untuk 3 hari ke depan.",
      "reason": "Rata-rata terjual 5 kg/hari; stok sekarang 10 kg."
    }
  ]
}
```

Kalau penyedia AI gagal dan tips lokal dikirim, function mengembalikan tips lokal tersebut.

## Aturan untuk AI

- AI hanya mengusulkan. Merchant selalu mengonfirmasi lewat layar edit.
- AI tidak boleh mengarang angka. Angka berasal dari database atau perhitungan `src/lib/stats.ts`.
- Prediksi ditulis sebagai perkiraan, bukan janji.
- Jika ragu, turunkan `confidence` dan minta merchant memeriksa.
- Kunci AI hanya boleh ada di Supabase Secrets, bukan di frontend atau repo.
