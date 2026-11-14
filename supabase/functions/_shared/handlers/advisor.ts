import { AiError, askJson } from "../ai.ts"
import { errorResponse, jsonResponse, preflight } from "../http.ts"
import { asRecord, asString, nonNegativeNumber } from "../normalize.ts"

interface AdvisorTip {
  text: string
  reason: string
}

const SYSTEM_PROMPT = `Anda penasihat warung kecil Indonesia.
Tugas: ubah DATA yang sudah dihitung menjadi maksimal 3 tips singkat.

Aturan:
- Gunakan HANYA angka yang ada di DATA. Jangan menghitung ulang, menambah, atau mengarang angka.
- Jangan pernah menyebut "laba bersih". Kalau menyebut laba, sebut "laba kotor".
- Setiap tip punya "text" (tindakan yang bisa dilakukan) dan "reason" (alasan berbasis angka dari DATA).
- Bahasa Indonesia sehari-hari, jelas, dan singkat. Maksimal 2 kalimat per field.
- Jangan memberi janji pasti. Ini estimasi.
- Balas HANYA JSON valid, tanpa penjelasan:
{"tips":[{"text":"Siapkan stok beras.","reason":"Rata-rata terjual 4 kg/hari; stok tersisa 2 kg."}]}`

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
  const fallbackTips = normalizeTips(record?.tips)
  const data = {
    weekSales: nonNegativeNumber(record?.weekSales) ?? 0,
    weekCogs: nonNegativeNumber(record?.weekCogs) ?? 0,
    lowStock: Array.isArray(record?.lowStock) ? record.lowStock.slice(0, 10) : [],
    suggestions: Array.isArray(record?.suggestions) ? record.suggestions.slice(0, 5) : [],
    saranLokal: fallbackTips,
  }

  try {
    const result = await askJson(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `DATA:\n${JSON.stringify(data, null, 2)}` },
      ],
      { maxTokens: 700 },
    )

    const tips = normalizeTips(asRecord(result)?.tips)
    if (tips.length === 0) {
      return errorResponse("AI tidak menghasilkan saran yang bisa dipakai.", 502)
    }

    return jsonResponse({ tips })
  } catch (cause) {
    console.error("advisor error", cause)
    // Local tips are already computed from the database. Returning them is
    // safer than inventing new numbers when the AI provider is unavailable.
    if (fallbackTips.length > 0) {
      return jsonResponse({ tips: fallbackTips })
    }
    if (cause instanceof AiError) return errorResponse(cause.message, cause.status)
    return errorResponse("Gagal membuat saran.", 500)
  }
}

function normalizeTips(value: unknown): AdvisorTip[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const row = asRecord(item)
      const text = asString(row?.text)?.replace(/\s+/g, " ").trim()
      const reason = asString(row?.reason)?.replace(/\s+/g, " ").trim()
      if (!text || !reason) return null
      return { text: text.slice(0, 240), reason: reason.slice(0, 240) }
    })
    .filter((item): item is AdvisorTip => item !== null)
    .slice(0, 3)
}
