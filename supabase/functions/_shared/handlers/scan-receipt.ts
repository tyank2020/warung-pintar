import { AiError } from "../ai.ts"
import { askVlmJson } from "../vlm.ts"
import { errorResponse, jsonResponse, preflight } from "../http.ts"
import {
  asRecord,
  asRupiah,
  asString,
  cleanBrand,
  cleanName,
  cleanSize,
  cleanUnit,
  positiveNumber,
  round2,
} from "../normalize.ts"

interface ReceiptItem {
  name: string
  qty: number
  unit: string
  unit_price: number
  size: string | null
  brand: string | null
}

interface ReceiptResult {
  items: ReceiptItem[]
  total: number
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_BASE64_LENGTH = 8_000_000

const SYSTEM_PROMPT = `Anda asisten membaca nota belanja warung Indonesia dari sebuah foto.
Tugas: ekstrak semua baris barang yang terlihat di nota.

Aturan:
- Hanya gunakan data yang terlihat di nota. Jangan mengarang barang, jumlah, atau harga.
- name: NAMA BARANG SAJA — huruf besar di awal, tanpa kata kerja/kata ganti/kata pengantar/partikel apapun (contoh salah: "Terjual Beras", "Beli minyak"). Contoh benar: "Beras Ramos", "Minyak Goreng". Jangan mengarang nama barang yang tidak tertulis di nota — nama bebas dari nota, tidak perlu cocok dengan database.
- size: ukuran/varian kemasan yang tertera di baris barang ("1 Liter", "500 g", "700 ml"). Kalau ada DUA angka+satuan di satu baris (mis. "Minyak Goreng 2 L x 20"), angka SATU adalah size dan yang TERAKHIR adalah qty. Kalau tidak ada ukuran, isi null.
- brand: merek barang ("Bimoli", "Wings", "Sederhana"). Kalau tertulis, isi. Kalau tidak ada, isi null. Barang dengan nama + ukuran sama tapi merek berbeda adalah PRODUK BERBEDA dengan harga berbeda — jangan disamakan.
- qty: angka positif. Contoh "5 L" berarti qty 5 dan unit "liter".
- unit: satuan barang (kg, liter, pcs, bungkus, dus, botol, papan, sachet). Kalau tidak ada, pakai "pcs".
- unit_price: harga satuan dalam rupiah, angka saja tanpa titik atau pemisah ribuan.
- Kalau harga tidak terbaca, isi 0. Jangan menebak.
- total: total akhir yang tertera di nota, angka saja. Kalau tidak terlihat, jumlahkan qty x unit_price.
- Balas HANYA JSON valid, tanpa penjelasan:
{"items":[{"name":"Minyak Goreng","size":"2 Liter","brand":"Bimoli","qty":5,"unit":"botol","unit_price":30000}],"total":150000}`

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
  const rawImage = asString(record?.imageBase64)
  if (!rawImage) return errorResponse("Field imageBase64 wajib diisi.")

  const imageBase64 = stripDataUrl(rawImage)
  if (imageBase64.length < 100) {
    return errorResponse("Gambar terlalu kecil atau tidak valid.")
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return errorResponse("Gambar terlalu besar (maksimal sekitar 6 MB).", 413)
  }

  const mimeType = normalizeMimeType(asString(record?.mimeType))
  if (!mimeType) {
    return errorResponse("Format gambar harus JPEG, PNG, atau WebP.")
  }

  try {
    const result = await askVlmJson(
      {
        systemPrompt: SYSTEM_PROMPT,
        userText: "Baca nota pada gambar ini dan kembalikan JSON sesuai aturan.",
        imageBase64,
        mimeType,
      },
      { maxTokens: 1600 },
    )

    const normalized = normalizeReceipt(result)
    if (normalized.items.length === 0) {
      return errorResponse(
        "Tidak ada barang yang terbaca. Pastikan seluruh nota terlihat jelas.",
        422,
      )
    }

    return jsonResponse(normalized)
  } catch (cause) {
    if (cause instanceof AiError) return errorResponse(cause.message, cause.status)
    console.error("scan-receipt error", cause)
    return errorResponse("Gagal memindai nota.", 500)
  }
}

function stripDataUrl(value: string): string {
  const comma = value.indexOf(",")
  if (value.startsWith("data:") && comma >= 0) {
    return value.slice(comma + 1)
  }
  return value
}

function normalizeMimeType(value: string | null): string | null {
  const mime = (value?.trim() || "image/jpeg").toLowerCase()
  if (mime === "image/jpg") return "image/jpeg"
  return ALLOWED_MIME_TYPES.has(mime) ? mime : null
}

function normalizeReceipt(value: unknown): ReceiptResult {
  const record = asRecord(value)
  const rawItems = Array.isArray(record?.items) ? record.items : []

  const items = rawItems
    .map((item) => {
      const row = asRecord(item)
      const name = cleanName(row?.name)
      const qty = positiveNumber(row?.qty)
      const unitPrice = asRupiah(row?.unit_price ?? row?.unitPrice)
      if (!name || qty === null || unitPrice === null) return null

      return {
        name,
        qty: round2(qty),
        unit: cleanUnit(row?.unit),
        unit_price: Math.round(unitPrice),
        size: cleanSize(row?.size),
        brand: cleanBrand(row?.brand),
      }
    })
    .filter((item): item is ReceiptItem => item !== null)
    .slice(0, 50)

  const computedTotal = items.reduce((total, item) => total + item.qty * item.unit_price, 0)
  const aiTotal = asRupiah(record?.total)
  const total = aiTotal !== null && aiTotal > 0 ? aiTotal : computedTotal

  return { items, total: Math.round(total) }
}
