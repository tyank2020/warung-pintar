# Kerangka Pitch — Warung Pintar

Durasi target: 3 menit + tanya jawab. Pasangkan dengan demo live dari `docs/demo.md`. Selalu punya rencana cadangan: video rekaman demo dan mode demo lokal.

## 1. Masalah (30 detik)

- Pemilik warung mencatat penjualan di buku, sering lupa stok, dan tidak tahu laba.
- Catatan tersebar, tidak bisa dihitung cepat, dan keputusan restok jadi tebakan.
- Angka pembuka: warung kecil mencatat puluhan transaksi per hari — semuanya hilang di buku tulis.

## 2. Solusi (30 detik)

- **Warung Pintar**: **mesin kasir + penjaga warung.** Kasir untuk eksekusi cepat (ketuk barang, simpan, stok turun sendiri), AI untuk **keputusan** yang tidak bisa dilihat kasir biasa: harga jual, kulakan, modal naik, buku utang, dan **bacaan atas buku dagang**.
- AI punya satu peran baru: **membaca buku dagang 30 hari** lalu memberi tahu apa yang berubah dan apa yang perlu dicek — dengan temuan yang bisa diperiksa sendiri, dan tetap jalan walau AI mati.
- Kasirnya deterministik — tidak pernah salah baca. AI hanya mengusulkan, pemilik warung yang mengonfirmasi lewat layar yang bisa diedit.
- Onboarding tanpa ketik satu-satu: daftarkan katalog cukup dengan satu kalimat suara — "beras 14 ribu, gula 17 ribu dan mi instan 3rb" — lalu periksa dan simpan sekali.
- **Identitas yang tidak ada di kasir mana pun**: **buku Piutang** (siapa yang punya utang, barang favorit, kapan datang), buku utang **"Simpen dulu"** (bisa per barang dalam satu transaksi), ritme **tanggal tua**, alarm **modal naik**, **kartu stok**, **riwayat nota** (foto nota + siapa yang menambah stok), **cek stok** (selisih opname ditautkan ke nota), **modal nganggur** (uang yang diam di rak), **cek laci uang**, dan **tutup buku** sebagai ritual harian.
- Berbahasa Indonesia sehari-hari, dipakai langsung dari HP, tanpa aplikasi baru yang ribet.
- Prinsip utama: **AI hanya mengusulkan, pemilik warung yang mengonfirmasi.** Tidak ada data tersimpan tanpa layar konfirmasi yang bisa diedit.

## 3. Demo live (3 menit)

Ritme: **kasir dulu** — tunjukkan ini aplikasi kasir sungguhan, baru tunjukkan bagian yang tidak bisa dilakukan kasir biasa. Detail teknis di `docs/demo.md`:

1. **(0:00–0:50) Kasir klik-klik** — buka menu **Kasir**, ketuk barang, ubah jumlah, ubah harga. Satu baris ditandai **"Simpen dulu (ngutang)"** — persis kasus "beli 4 pisang, tapi 4 pisangnya ngutang dulu": sebagian dibayar, sisanya masuk buku utang, stok tetap turun untuk keduanya. Poin: "kasir yang sale dan utang bisa campur, dan barang yang ngutang tetap terpotong dari stok."
2. **(0:50–1:10) Modal awal — untung atau rugi** — di Beranda, kartu **Modal awal & untung/rugi**: isi modal awal (mis. Rp5.000.000) + tanggal mulai → aplikasi membandingkan dengan uang sekarang: nilai stok + laba kotor + Piutang. Poin: "pemilik warung tahu dia mulai dengan modal berapa; kami tunjukkan sekarang dia untung atau rugi — dan kalau rugi, kami kasih arahnya (barang hilang, harga jual, atau utang yang tak tertagih)."
3. **(0:50–1:20) Stok: opname, kartu stok, riwayat nota, modal nganggur** — Stok Barang → klik nama barang → **kartu stok** (riwayat masuk/keluar), ubah **stok minimum**, atau **Hitung stok** untuk opname (selisih dicatat sebagai penyesuaian, barang hilang jadi kelihatan). Tunjukkan panel **Modal nganggur**: "Rp 2,3 juta modal Anda diam di rak". Poin: "nota belanja dari pegawai tersimpan semua — lengkap dengan foto dan siapa yang input, jadi owner bisa memeriksa sendiri."
4. **(1:20–2:10) Penjaga margin di Sinyal warung** — kartu **Modal bergerak**: "Modal telur naik 8% — margin menyusut 16,7% → 10%" lengkap dengan saran harga jual → tombol **Atur harga jual** → simpan. Poin: "kasir biasa tidak tahu kalau margin sedang susut."
5. **(2:10–2:40) AI baca buku dagang + Belanja besok** — di Beranda, panel **AI baca buku dagang**: tunjukkan temuan (omzet naik/turun, transaksi kecil, harga di bawah modal) → klik **Minta AI membaca** → bacaan AI. Di Stok Barang, panel **Belanja besok**: "besok Jumat, beli X" dari pola hari & hari gajian.
6. **(2:40–3:00) Cek Stok + asisten warung** — buka **Cek Stok**: temuan selisih opname yang ditautkan ke nota tertentu → tombol **Lihat nota**. Lalu buka **Asisten AI** di sidebar, tanyakan "siapa yang paling banyak utang?" → jawaban dihitung dari catatan warung sendiri.

- Tekankan: "AI boleh salah, makanya semuanya bisa diedit dulu."
- Tekankan: "AI tidak di jalur kritis — kasir, stok, dan catatan tetap jalan penuh tanpa internet."

## 4. Teknologi (30 detik)

- Frontend: React + Vite + Tailwind, mobile-first, tema terang/gelap.
- Data: Supabase Postgres — schema produk, alias, transaksi, dan view laporan.
- AI: Edge Functions dengan kunci API **hanya di server** (Supabase Secrets), output JSON mengikuti kontrak di `docs/contract.md`.
- Tanya Warung: pertanyaan bebas dijawab dari ringkasan statistik yang dihitung aplikasi — AI hanya menyusun kalimatnya, tidak pernah menghitung angka baru.
- Prediksi: rata-rata terjual per hari × 3 − stok, dihitung dari data; AI hanya merapikan bahasanya.
- Parser katalog onboarding 100% lokal dan deterministik (tanpa AI/edge function): daftar barang tetap jalan tanpa internet, dan harga hanya dikenali dari sinyal yang jelas ("14 ribu", "17.000", "1,5 juta") — angka polos tetap dibaca jumlah, bukan harga.
- Hosting: Vercel. Bisa dibuka juri dari HP masing-masing lewat satu tautan.

## 5. Dampak (20 detik)

- Pasarnya nyata: **4,5 juta warung** di Indonesia. Pencatatan yang biasanya menyita **±30 menit** per hari selesai dalam **3 menit** — tanpa AI pun.
- Demo ini berjalan di atas **4.887 transaksi nyata** selama 365 hari — setiap saran bisa ditelusuri balik ke datanya.
- Pemilik warung tahu stok dan **laba kotor** setiap hari tanpa pembukuan manual.
- Saran restok, saran harga jual, dan kartu stok punya alasan yang bisa diperiksa, jadi keputusan lebih cepat dan lebih yakin.
- Sistem tumbuh dari kebiasaan nyata warung: terima barang pagi, jual siang, cek malam.

## 6. Rencana lanjut (20 detik)

- Autentikasi dan RLS per pemilik warung (saat ini masih policy demo yang permisif).
- Ledger stok lengkap (rusak, kedaluwarsa, retur) dan snapshot harga modal di transaksi.
- Antrean offline: rekaman suara dan foto nota diproses saat internet kembali.
- Kemasan aplikasi Android (Expo) dari basis web yang sama.

## Pesan kunci yang wajib disebut

1. **Kasir untuk eksekusi, AI untuk keputusan** — kasir tak pernah salah baca, AI tak pernah mengarang.
2. **AI mengusulkan, pemilik mengonfirmasi** — konfirmasi sebelum simpan.
3. **Prediksi adalah perkiraan dengan alasan**, bukan janji.
4. **Laba kotor**, bukan laba bersih.
5. **"AI boleh mengusul, tidak boleh mengarang angka"** — semua angka dari database dan aturan bisnis yang bisa dijelaskan; AI hanya mengusulkan dan merapikan bahasa.
6. Satu produk satu nama + alias, jadi tidak ada stok ganda.

## Antisipasi pertanyaan juri

- "Ini kan cuma aplikasi kasir + AI?" → Ya, dan itu memang disengaja: kasir untuk eksekusi cepat (tidak pernah salah baca), AI untuk keputusan yang tidak bisa dilihat kasir biasa — harga jual saat modal naik, kapan kulakan, siapa yang ngutang. Yang membedakan: kasir biasa tidak tahu kalau margin sedang susut.
- "Buat apa AI kalau sudah ada kasir?" → AI tidak di jalur kritis. Kasir, stok, dan catatan tetap jalan penuh tanpa internet; kalau AI mati, chat dan bacaan dagang tetap menjawab dari data yang sama (dihitung sendiri, bukan dikarang). Contoh: **AI baca buku dagang 30 hari** → "omzet naik 18%, tapi ada 12 transaksi di bawah Rp5.000 — cek pembukuan".
- "Bagaimana kalau AI salah membaca?" → Semua hasil lewat layar konfirmasi yang bisa diedit; item ragu ditandai _periksa lagi_.
- "Kalau pegawai yang nambah stok, bisa dia memanipulasi?" → Setiap stok yang masuk dari nota disimpan sebagai bukti: foto nota, isi nota, harga, dan nama orang yang menambahkannya. Owner bisa buka riwayat nota kapan saja, dan **Cek Stok** menandai selisih opname lalu menautkan ke nota yang perlu dicek.
- "Ada bedanya dengan aplikasi kasir biasa?" → Ya: kasir biasa mencatat transaksi, lalu berhenti. Warung Pintar melanjutkan: **buku Piutang** (siapa yang menunggak, barang favorit, kapan datang), **modal awal & untung/rugi** (bandingkan modalmu sekarang dengan modal awal), **modal nganggur** (berapa uangmu yang diam di rak), **cek stok** (selisih opname yang ditautkan ke nota), **cek laci uang**, dan **tutup buku** sebagai ritual harian.
- "Warung baru harus input banyak barang dulu, kan?" → Tidak satu per satu: satu kalimat suara ("beras 14 ribu, gula 17 ribu dan mi instan 3rb") jadi proposal katalog yang bisa diedit lalu disimpan sekali. Parser-nya lokal, tetap jalan tanpa internet.
- "Saran harga jual itu dari mana?" → Aturan bisnis yang bisa dijelaskan: harga jual sekarang × (modal terakhir / modal sebelumnya), dibulatkan ke kelipatan 100. Bukan tebakan AI.
- "Datanya dari mana?" → Database transaksi nyata (365 hari); lihat alasan di setiap saran.
- "Kalau internet mati?" → Mode demo lokal tetap jalan; antrean offline ada di rencana lanjut.
- "Bisa dipakai warung lain?" → Ya: login nama warung + password sudah ada; isolasi data per pemilik masih di rencana lanjut.
- "Kenapa web, bukan aplikasi?" → Juri langsung mencoba lewat tautan; basis yang sama bisa dikemas ke Android lewat Expo.
- "Apa bedanya dengan kasir digital yang sudah ada?" → Mereka model minimarket: transaksi kas, produk resmi, staf yang mengetik. Warung itu kebalikannya: utang pakai nama panggilan, pembeli datang saat tanggal tua, harga modal naik diam-diam. Kami memodelkan empat hal itu — Simpen Dulu, tanggal tua, modal naik, dan opname — dan tak satu pun masuk akal untuk minimarket.
- "Biaya AI-nya tidak mahal?" → Model kelas flash-lite, teks pendek per request: ±50 transaksi/hari ≈ di bawah Rp10.000/bulan — lebih murah dari kopi sachet. Dan AI tidak di jalur kritis: kalau limit/mati, pencatatan dan semua angka tetap jalan tanpa AI.
