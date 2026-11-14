# Edge Functions

Empat fungsi AI sudah diimplementasikan. Semua kunci AI hanya dibaca dari Supabase Secrets, tidak
pernah dari frontend.

```txt
_shared/
  ai.ts                  # panggilan OpenAI-compatible + parsing JSON (fungsi teks)
  vlm.ts                 # panggilan VLM native (Gemini generateContent) untuk gambar
  http.ts                # CORS, response JSON, error
  normalize.ts           # validasi angka, satuan, nama barang
  handlers/
    parse-voice.ts       # logika function
    scan-receipt.ts
    advisor.ts
    seasonal-advisor.ts
parse-voice/
  index.ts               # entrypoint: Deno.serve(handler)
scan-receipt/
  index.ts
advisor/
  index.ts
seasonal-advisor/
  index.ts
_tests/
  functions_test.ts
```

## Kontrak

### `parse-voice`

Input:

```json
{
  "transcript": "terjual beras 10 kilo dan telur 2 papan",
  "products": [
    { "name": "Beras Ramos", "unit": "kg", "aliases": ["beras", "br"] }
  ]
}
```

`products` opsional, tapi sangat disarankan agar nama barang cocok dengan database.

Output:

```json
{
  "items": [{ "name": "Beras Ramos", "qty": 10, "unit": "kg", "confidence": 0.95, "size": null }]
}
```

`size` terisi kalau ucapan menyebut ukuran/varian ("minyak 2 liter 20 botol" →
`{"name":"Minyak Goreng","size":"2 Liter","qty":20,"unit":"botol"}`), `null` kalau tidak.

### `scan-receipt`

Diimplementasikan lewat VLM native (Gemini `generateContent`): gambar dikirim sebagai `inlineData`
di content multimodal, kunci lewat header `x-goog-api-key`, dan output diminta sebagai JSON
(`responseMimeType: application/json`). Bukan lewat shim chat-completions. Model default
`gemini-3.5-flash-lite` (override dengan `AI_MODEL`), endpoint default
`https://generativelanguage.googleapis.com/v1beta` (override dengan `AI_VLM_BASE_URL`).

Input:

```json
{ "imageBase64": "...", "mimeType": "image/jpeg" }
```

`imageBase64` boleh berupa data URL (`data:image/jpeg;base64,...`) atau base64 mentah. Format yang
didukung: JPEG, PNG, WebP. Ukuran maksimal sekitar 6 MB.

Output:

```json
{
  "items": [{ "name": "Minyak Goreng", "qty": 5, "unit": "liter", "unit_price": 15000, "size": null }],
  "total": 75000
}
```

`size` terisi kalau baris nota menyebut ukuran/varian (mis. "Minyak Goreng 2 L x
20" → `{"size":"2 Liter","qty":20,"unit":"botol"}`), `null` kalau tidak ada.

### `advisor`

Input berisi angka yang sudah dihitung frontend. AI hanya memilih dan menjelaskan, tidak boleh
mengarang angka.

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
      "text": "Siapkan stok telur.",
      "reason": "Rata-rata terjual 2 papan/hari; stok tersisa 2 papan."
    }
  ]
}
```

Kalau penyedia AI gagal dan `tips` lokal dikirim, function mengembalikan tips lokal itu. Ini menjaga
dashboard tetap punya saran yang angkanya sudah dihitung dari database.

### `seasonal-advisor`

Input berisi rencana musiman yang sudah dihitung `src/lib/seasonal.ts`. AI hanya memilih dan
merapikan bahasa; angka tetap dari transaksi.

```json
{
  "context": {
    "asOf": "2026-11-09",
    "season": "Musim hujan",
    "headline": "Musim hujan + akhir tahun",
    "events": [{ "label": "Akhir tahun", "daysUntil": 41 }],
    "dataDays": 365
  },
  "recommendations": [
    {
      "kind": "display",
      "action": "Dekatkan Kopi Kapal Api ke kasir",
      "reason": "Permintaan musim ini naik 46%; stok 36 sachet."
    }
  ],
  "signals": [
    {
      "name": "Kopi Kapal Api",
      "stock": 36,
      "unit": "sachet",
      "seasonalIndex": 1.46,
      "upliftPct": 46,
      "suggestedQty": 0
    }
  ],
  "tips": [{ "text": "Saran lokal", "reason": "Alasan dari database" }]
}
```

Output:

```json
{
  "tips": [
    {
      "text": "Dekatkan kopi ke kasir.",
      "reason": "Permintaan musim ini naik 46%; stok 36 sachet."
    }
  ]
}
```

Kalau AI gagal dan `tips` lokal dikirim, function mengembalikan tips lokal itu. Frontend juga punya
fallback ke `advisor` lama kalau `seasonal-advisor` belum dideploy.

## Error

Semua error memakai bentuk:

```json
{ "error": "Pesan yang bisa ditampilkan ke pengguna." }
```

Status yang dipakai: `400` input tidak valid, `405` metode salah, `413` gambar terlalu besar, `422`
nota tidak terbaca, `500` konfigurasi server, `502`/`504` penyedia AI bermasalah.

## Deploy

```bash
supabase link --project-ref <project-ref>

supabase secrets set \
  AI_API_KEY=... \
  AI_BASE_URL=https://api.openai.com/v1 \
  AI_MODEL=gemini-3.5-flash-lite

# Opsional: override endpoint VLM native untuk scan-receipt
# supabase secrets set AI_VLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta

supabase functions deploy parse-voice
supabase functions deploy scan-receipt
supabase functions deploy advisor
supabase functions deploy seasonal-advisor
```

`AI_BASE_URL` harus kompatibel dengan endpoint `/chat/completions` (dipakai fungsi teks).
`scan-receipt` tidak memakai `AI_BASE_URL`; ia memakai VLM native (`AI_VLM_BASE_URL`, default
`https://generativelanguage.googleapis.com/v1beta`) dengan model `AI_MODEL` — model itu harus
mendukung input gambar. Detail kontrak ada di bagian atas.

## Test lokal

```bash
deno check \
  supabase/functions/parse-voice/index.ts \
  supabase/functions/scan-receipt/index.ts \
  supabase/functions/advisor/index.ts \
  supabase/functions/seasonal-advisor/index.ts

deno test --allow-env supabase/functions/_tests/functions_test.ts
```

Test memakai mock `fetch`, jadi tidak butuh API key asli dan tidak mengirim data ke internet.

## Catatan keamanan

- Jangan memakai prefix `VITE_` untuk `AI_API_KEY`; semua variabel `VITE_` ikut ke browser.
- Edge Function memakai verifikasi JWT bawaan Supabase. Frontend memanggilnya lewat
  `supabase.functions.invoke`, yang mengirim anon key sebagai JWT.
- CORS saat ini `*` untuk demo. Sebelum produksi, batasi ke domain aplikasi.
- Tambahkan rate limit dan kuota sebelum dipakai publik.
- AI tetap hanya mengusulkan. Merchant harus mengonfirmasi lewat layar edit sebelum data disimpan.
