import { AiError, askJson } from "../ai.ts"
import { errorResponse, jsonResponse, preflight } from "../http.ts"
import { asRecord, asString } from "../normalize.ts"

const SYSTEM_PROMPT = `Anda asisten pencatatan warung kecil Indonesia.
Tugas: menjawab pertanyaan pemilik warung HANYA dari DATA ringkasan yang diberikan.

Aturan:
- Angka hanya boleh berasal dari DATA. Membandingkan angka yang ada di DATA boleh;
  mengarang, menebak, atau menghitung angka baru yang tidak ada di DATA tidak boleh.
- Jangan pernah menyebut "laba bersih". Kalau menyebut laba, sebut "laba kotor".
- Jawab dengan bahasa Indonesia sehari-hari, maksimal 4 kalimat, tanpa bullet.
- Kalau DATA tidak cukup untuk menjawab, katakan jujur datanya belum ada dan
  sebut data apa yang tersedia.
- Jangan memberi janji pasti. Semua saran adalah estimasi.
- Balas HANYA JSON valid, tanpa penjelasan:
{"answer":"Penjualan hari ini Rp150.000 dari 8 transaksi. Stok kopi tinggal 2 sachet."}`

export async function handler(request: Request): Promise<Response> {
  const options = preflight(request)
  if (options) return options
  if (request.method !== "POST") return errorResponse("Gunakan metode POST.", 405)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("Body harus berupa JSON.")
  }

  const record = asRecord(body)
  const question = asString(record?.question)?.replace(/\s+/g, " ").trim()
  if (!question) return errorResponse("Pertanyaan belum diisi.", 400)
  if (question.length > 300) return errorResponse("Pertanyaan terlalu panjang.", 400)

  // Angka selalu dihitung aplikasi dari database. Function ini hanya
  // menerjemahkan DATA menjadi jawaban, tidak pernah menghitung sendiri.
  const context = asRecord(record?.context) ?? {}

  try {
    const result = await askJson(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `PERTANYAAN:\n${question}\n\nDATA:\n${JSON.stringify(context, null, 2)}`,
        },
      ],
      { maxTokens: 500 },
    )

    const answer = asString(asRecord(result)?.answer)?.replace(/\s+/g, " ").trim()
    if (!answer) {
      return errorResponse("AI tidak menghasilkan jawaban yang bisa dipakai.", 502)
    }

    return jsonResponse({ answer: answer.slice(0, 800) })
  } catch (cause) {
    console.error("ask-warung error", cause)
    if (cause instanceof AiError) return errorResponse(cause.message, cause.status)
    return errorResponse("Gagal menjawab pertanyaan.", 500)
  }
}
