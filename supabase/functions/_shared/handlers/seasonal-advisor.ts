import { AiError, askJson } from "../ai.ts"
import { errorResponse, jsonResponse, preflight } from "../http.ts"
import { asRecord, asString, nonNegativeNumber } from "../normalize.ts"

interface SeasonalTip {
  text: string
  reason: string
}

const SYSTEM_PROMPT = `Anda penasihat musiman warung kecil Indonesia.
Tugas: ubah RENCANA MUSIMAN yang sudah dihitung menjadi maksimal 4 tips singkat.

Aturan:
- Gunakan HANYA angka yang ada di DATA. Jangan menghitung ulang, menambah, atau mengarang angka.
- Sebut musim atau event yang ada di DATA (mis. musim hujan, akhir tahun, Ramadan).
- Jangan pernah menyebut "laba bersih". Kalau menyebut laba, sebut "laba kotor".
- Setiap tip punya "text" (tindakan yang bisa dilakukan) dan "reason" (alasan berbasis angka dari DATA).
- Bedakan stok yang perlu ditambah, barang yang perlu dipajang, dan ide musim. Jangan mengubah ide menjadi janji angka.
- Bahasa Indonesia sehari-hari, jelas, dan singkat. Maksimal 2 kalimat per field.
- Jangan memberi janji pasti. Ini estimasi.
- Balas HANYA JSON valid, tanpa penjelasan:
{"tips":[{"text":"Siapkan kopi sachet untuk musim hujan.","reason":"Permintaan musim ini naik 46%; stok tersisa 36 sachet."}]}`

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
  const context = asRecord(record?.context)
  const data = {
    context: context
      ? {
        asOf: asString(context.asOf) ?? "",
        season: asString(context.season) ?? "",
        headline: asString(context.headline) ?? "",
        events: Array.isArray(context.events) ? context.events.slice(0, 6) : [],
        dataDays: nonNegativeNumber(context.dataDays) ?? 0,
      }
      : {},
    recommendations: Array.isArray(record?.recommendations)
      ? record.recommendations.slice(0, 6)
      : [],
    signals: Array.isArray(record?.signals) ? record.signals.slice(0, 10) : [],
    saranLokal: fallbackTips,
  }

  try {
    const result = await askJson(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `DATA:\n${JSON.stringify(data, null, 2)}` },
      ],
      { maxTokens: 900 },
    )

    const tips = normalizeTips(asRecord(result)?.tips)
    if (tips.length === 0) {
      return errorResponse("AI tidak menghasilkan saran musiman yang bisa dipakai.", 502)
    }

    return jsonResponse({ tips })
  } catch (cause) {
    console.error("seasonal-advisor error", cause)
    // Rencana lokal sudah dihitung dari transaksi. Kembalikan itu agar card
    // tetap punya angka yang benar saat penyedia AI mati atau belum diisi.
    if (fallbackTips.length > 0) {
      return jsonResponse({ tips: fallbackTips })
    }
    if (cause instanceof AiError) return errorResponse(cause.message, cause.status)
    return errorResponse("Gagal membuat saran musiman.", 500)
  }
}

function normalizeTips(value: unknown): SeasonalTip[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const row = asRecord(item)
      const text = asString(row?.text)?.replace(/\s+/g, " ").trim()
      const reason = asString(row?.reason)?.replace(/\s+/g, " ").trim()
      if (!text || !reason) return null
      return { text: text.slice(0, 240), reason: reason.slice(0, 240) }
    })
    .filter((item): item is SeasonalTip => item !== null)
    .slice(0, 4)
}
