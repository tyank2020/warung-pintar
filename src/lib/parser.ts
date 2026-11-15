import type { ConfirmItem, Product, VoiceItem, VoiceParseResult } from "./types"
import { normalizeText } from "./format"

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilogram: "kg",
  gram: "gram",
  gr: "gram",
  liter: "liter",
  ltr: "liter",
  lt: "liter",
  l: "liter",
  mili: "ml",
  ml: "ml",
  dus: "dus",
  karton: "dus",
  box: "dus",
  bungkus: "bungkus",
  bks: "bungkus",
  pak: "bungkus",
  pack: "bungkus",
  papan: "papan",
  sachet: "sachet",
  sct: "sachet",
  pcs: "pcs",
  buah: "pcs",
  biji: "pcs",
  batang: "batang",
  botol: "botol",
  kaleng: "kaleng",
  karung: "karung",
  ons: "ons",
}

const NUMBER_WORDS: Record<string, number> = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
  "dua belas": 12,
  "tiga belas": 13,
  "empat belas": 14,
  "lima belas": 15,
  setengah: 0.5,
  seperempat: 0.25,
}

const UNIT_PATTERN = Object.keys(UNIT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join("|")

/**
 * Kunci perbandingan ukuran/varian: "2 L", "2 liter", "2000 ml" dibandingkan
 * lewat angka × 1 huruf satunya — varian yang sama harus mendapatkan kunci
 * yang sama. Mengembalikan null kalau kosong.
 */
export function sizeKey(value?: string | null): string | null {
  if (!value) return null
  const raw = value.toString().trim().toLowerCase().replace(/,/g, ".")
  if (!raw) return null

  const numeric = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)$/)
  if (numeric?.[1] && numeric?.[2]) {
    const parsed = Number(numeric[1])
    const unit = normalizeUnit(numeric[2])
    if (Number.isFinite(parsed)) return `${parsed}${unit}`
  }

  // Kata angka juga diterima: "dua liter".
  const words = normalizeText(value).match(
    new RegExp(`^(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})$`, "i"),
  )
  if (words?.[1] && words?.[2]) {
    const parsed = parseNumber(words[1])
    if (parsed !== null) return `${parsed}${normalizeUnit(words[2])}`
  }

  return raw.replace(/\s+/g, "")
}

/** Kunci perbandingan merek: huruf kecil, tanpa spasi. null = tanpa merek. */
export function brandKey(value?: string | null): string | null {
  if (!value) return null
  const key = normalizeText(value).replace(/\s+/g, "")
  return key.length > 0 ? key : null
}

const NUMBER_PATTERN = `\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|")}`

const FILLER_WORDS = new Set([
  // Kata kerja jual-beli & distribusi
  "terjual",
  "jual",
  "jualin",
  "laku",
  "lakukeras",
  "catat",
  "catatlah",
  "catatin",
  "beli",
  "membeli",
  "beliin",
  "dibeli",
  "dibelikan",
  "belinya",
  "belanja",
  "kulak",
  "kulakan",
  "kuluakan",
  "restock",
  "restok",
  "tambah",
  "tambahin",
  "tambahkan",
  "keluarkan",
  "masukan",
  "masukkan",
  "input",
  "inputkan",
  "upload",
  "tolong",
  "mohon",
  "tolonglah",
  // Kata ganti & sapaan
  "aku",
  "saya",
  "gue",
  "gua",
  "guesih",
  "gua sih",
  "aku sih",
  "saya sih",
  "kami",
  "kita",
  "mu",
  "kau",
  "kamu",
  "ente",
  "ente",
  "anda",
  "ia",
  "dia",
  "mereka",
  // Pengantar & partikel
  "tolong",
  "mohon",
  "kasih",
  "kasi",
  "antar",
  "kirim",
  "ambil",
  "bawa",
  "bawa'in",
  "minta",
  "pesan",
  "pesanin",
  "dikirim",
  "diambil",
  "dibawa",
  "dibawain",
  "diposkan",
  "format",
  "nomornya",
  "ya",
  "yaiya",
  "oke",
  "ok",
  "deh",
  "sih",
  "dong",
  "nih",
  "tuh",
  "aja",
  "saja",
  "juga",
  "iya",
  "oiya",
  "oiyah",
  "loh",
  "wah",
  "hm",
  "ehm",
  "eh",
  "hai",
  "halo",
  "haloo",
  "haloow",
  "heii",
  "heiii",
  "pusing",
  "coba",
  "tolonggue",
  "pengen",
  "pgn",
  "mau",
  "isa",
  "bisa",
  "beresin",
  "beres",
  "selesai",
  "kelar",
  "siap",
  "sip",
  "",
  // Pelaku transaksi / gelar
  "pak",
  "bu",
  "ibu",
  "mbak",
  "mas",
  "om",
  "bang",
  "dek",
  "kake",
  "nenek",
  "pakde",
  "bude",
  // Waktu & pembalesan
  "hari",
  "ini",
  "tadi",
  "kemarin",
  "lusa",
  "besok",
  "besok pagi",
  "semalam",
  "pagi",
  "siang",
  "sore",
  "malam",
  "subuh",
  "sekarang",
  "nanti",
  "lusa",
  "minggu",
  "bulan",
  "tahun",
  "minggu lalu",
  "minggu ini",
  "minggu depan",
  "malam ini",
  "sore ini",
  "siang ini",
  "subuh ini",
  // Ekonomi & hitungan
  "banyak",
  "sedikit",
  "separuh",
  "setengah",
  "kurang",
  "tambah",
  "sisa",
  "sisanya",
  "lagi",
  "lainnya",
  "seluruh",
  "semua",
  "semua orang",
  "kurang lebih",
  "kurang_lebih",
  "",
  "separuhnya",
  "keduanya",
  "iniitu",
  "itu",
  "itu itu",
  "anu",
  "anu itu",
  "ga",
  "gak",
  "gk",
  "enggak",
  "tidak",
  "ngga",
  "nggak",
  "aja",
  // Kata "beli/jual/rilis" residual
  "dijual",
  "dimasukkan",
  "diambil",
  "dimasukkan",
  "diberikan",
  "tersisa",
  "tes",
  "test",
  "coba",
  "tes coba",
  // Konfirmasi partikel
  "jadiin",
  "jadilah",
  "mentang-mentang",
  "tentu",
  "jasas",
  "jasase",
  // Harga & hitungan uang
  "seharga",
  "harganya",
  "totalnya",
  "sebesar",
  "sejumlah",
  "harganyas",
  "nominal",
  "total",
  "rp",
  "rupiah",
  "ribu",
  "rb",
  "ribuan",
  "juta",
  "jt",
  "jutaa",
  "jutaan",
  "ratus",
  "ratus ribu",
  "juta rupiah",
  // Lainnya
  "sebanyak",
  "semuanya",
  "keseluruhan",
  "sekalian",
  "jumlah",
  "jumlahnya",
  "totalnya",
  "stok",
  "restok",
  "masukkan",
  "keluarkan",
  "masuk",
  "keluar",
  "hbs",
  "abs",
  "log",
  "logok",
  "input",
  "inputkan",
  "hap",
  "dipencet",
  // Ucapan ke penjual/pegawai
  "mbak",
  "mas",
  "kak",
  "kakak",
  "dek",
  "ayah",
  "ayahku",
  "ibu",
  "ibuku",
  "kami",
  "kami liat",
  "kami ada",
  "tolong gue",
  "mau kasih",
  "mau aku",
  "mau saya",
  "ngga usah",
  "gak usah",
  "tidak perlu",
  "jangan",
  // Modal & aux verbs
  "akan",
  "telah",
  "sedang",
  "ukuran",
  "masih",
  "pernah",
  "supaya",
  "agar",
  "sehingga",
  "jadi",
  "isa",
  "sebelumnya",
  "setelah",
  "sebelum",
  "menurut",
  "sudah",
  "belum",
  "kemaren",
  "nantinya",
  // Perkiraan
  "kurang lebih",
  "kira kira",
  "kira-kira",
  "demikian",
  "sekedar",
  "sebentar",
  "tunggu",
  "nunggu",
])

export function normalizeUnit(value: string): string {
  const normalized = normalizeText(value)
  return UNIT_ALIASES[normalized] ?? normalized
}

const DEBT_KEYWORD_PATTERN =
  /\b(simpen dulu|simpennya dulu|catat dulu|dicatat dulu|utang|ngutang|bon)\b/i
const DEBT_NAME_PATTERNS = [
  // Gelar + satu kata: "buat Pak Yono". Kata jumlah (dua, tiga...) tidak
  // ikut tertangkap, sehingga tetap terbaca sebagai qty.
  /\b(?:buat|untuk|kanggo)\s+((?:bu|pak|mbak|mas|om|bang|dek)\s+[a-z]+|[a-z]+)\b/i,
  /\b(?:utang(?:nya)?|bon|simpen dulu|catat dulu)\s+((?:bu|pak|mbak|mas|om|bang|dek)\s+[a-z]+)\b/i,
]

export interface DebtorDetection {
  debtor: string | null
  /** Transcript tanpa frasa utang, siap diparse menjadi items. */
  cleanedTranscript: string
}

/**
 * Deteksi lokal yang konservatif: hanya menganggap utang kalau ada kata
 * kunci yang jelas DAN nama orangnya bisa ditunjuk. Kalau ragu, kembalikan
 * null — hasilnya diperlakukan sebagai penjualan biasa. Bekerja di
 * transkrip mentah agar desimal seperti "1,5 kg" tidak rusak.
 */
export function detectDebtor(transcript: string): DebtorDetection {
  if (!DEBT_KEYWORD_PATTERN.test(transcript)) {
    return { debtor: null, cleanedTranscript: transcript }
  }

  for (const pattern of DEBT_NAME_PATTERNS) {
    const match = transcript.match(pattern)
    if (!match?.[1]) continue
    const words = match[1]
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
    // Buang kata angka/satuan yang ikut tertangkap: "pak yono dua" → "pak yono".
    // Gelar (Pak/Bu/Mbak...) bukan satuan walau ada di UNIT_ALIASES ("pak").
    const GELAR = new Set(["bu", "pak", "mbak", "mas", "om", "bang", "dek"])
    const nameWords: string[] = []
    for (const word of words) {
      const normalizedWord = normalizeText(word)
      if (GELAR.has(normalizedWord)) {
        nameWords.push(word)
        continue
      }
      if (NUMBER_WORDS[normalizedWord] !== undefined) break
      if (UNIT_ALIASES[normalizedWord]) break
      nameWords.push(word)
    }
    if (nameWords.length === 0) continue
    const debtor = nameWords
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
    const cleanedTranscript = transcript.replace(match[0], " ")
    return { debtor, cleanedTranscript }
  }

  return { debtor: null, cleanedTranscript: transcript }
}

function parseNumber(value: string): number | null {
  const normalized = normalizeText(value)
  if (normalized in NUMBER_WORDS) return NUMBER_WORDS[normalized]
  // Do not run digits through normalizeText: it strips the decimal separator,
  // turning "1.5" into "1 5". Keep the raw value for numeric parsing instead.
  const numeric = Number(value.replace(/\s/g, "").replace(",", "."))
  return Number.isFinite(numeric) ? numeric : null
}

/**
 * Konversi satuan yang sering muncul dalam suara.
 *
 * "500 gram gula" tidak boleh menjadi 500 kg gula. Kalau satuan yang diucapkan
 * bisa dikonversi ke satuan produk, jumlahnya dikonversi otomatis. Kalau tidak,
 * biarkan saja supaya pemilik warung yang memutuskan.
 */
const UNIT_CONVERSION: Record<string, { group: string; toBase: number }> = {
  gram: { group: "mass", toBase: 1 },
  ons: { group: "mass", toBase: 100 },
  kg: { group: "mass", toBase: 1000 },
  liter: { group: "volume", toBase: 1000 },
  ml: { group: "volume", toBase: 1 },
}

/**
 * Ubah jumlah dari satu satuan ke satuan lain kalau memungkinkan.
 * Mengembalikan `null` kalau tidak ada konversi yang aman.
 */
export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = UNIT_CONVERSION[normalizeUnit(fromUnit)]
  const to = UNIT_CONVERSION[normalizeUnit(toUnit)]
  if (!from || !to || from.group !== to.group) return null
  const converted = (qty * from.toBase) / to.toBase
  // Pecahan di bawah 0,01 dibulatkan supaya tidak menghasilkan 0,003 kg.
  return converted < 0.01 ? Math.round(converted) : Math.round(converted * 100) / 100
}

/** Apakah ucapan menunjukkan orang membeli/stok masuk (bukan penjualan). */
const PURCHASE_INTENT_PATTERN = /\b(membeli|beli|belanja|kulak|kulakan|restock|restok)\b/i

export function isPurchaseIntent(transcript: string): boolean {
  return PURCHASE_INTENT_PATTERN.test(transcript)
}

/** Apakah `needle` muncul sebagai kata utuh di dalam `haystack`. */
function containsWord(haystack: string, needle: string): boolean {
  const index = haystack.indexOf(needle)
  if (index < 0) return false
  const before = index === 0 ? " " : haystack[index - 1]
  const after = index + needle.length >= haystack.length ? " " : haystack[index + needle.length]
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)
}

/** Nilai tertinggi di antara kandidat skor; null kalau tidak ada yang cocok. */
function scoreProducts(products: Product[], rawName: string): { product: Product; score: number } | null {
  const query = normalizeText(rawName)
  if (!query) return null

  const queryTokens = new Set(query.split(" ").filter(Boolean))
  let best: { product: Product; score: number } | null = null

  for (const product of products) {
    if (product.archived === true) continue
    const candidates = [product.name, product.brand ?? "", ...product.aliases]
      .map(normalizeText)
      .filter(Boolean)
    for (const candidate of candidates) {
      // Cocok persis selalu menang: "gulpas" harus jadi Gula Pasir.
      if (candidate === query) return { product, score: 1 }

      const candidateTokens = candidate.split(" ").filter(Boolean)
      const shared = candidateTokens.filter((token) => queryTokens.has(token)).length
      const coverage = shared / candidateTokens.length
      const queryCoverage = shared / queryTokens.size

      let score = 0
      // Pencocokan teks harus pada batas kata. Tanpa ini alias pendek seperti
      // "air" bisa ikut cocok dengan kata lain yang tidak berkaitan.
      if (containsWord(query, candidate) || containsWord(candidate, query)) {
        const shorter = Math.min(query.length, candidate.length)
        if (shorter >= 3) score = 0.75 + Math.min(shorter / 40, 0.2)
      }
      if (coverage >= 0.6 && queryCoverage >= 0.5) {
        score = Math.max(score, 0.65 + coverage * 0.25)
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { product, score }
      }
    }
  }

  return best
}

/**
 * Cari produk berdasarkan nama (atau alias). Kalau `size` / `brand` diberikan,
 * HANYA produk dengan nilai yang cocok yang boleh terpilih — "minyak 2 liter"
 * tidak boleh masuk ke "Minyak Goreng" lepas (stok & harga akan salah), dan
 * "Bimoli 2 L" tidak boleh masuk ke "Minyak Goreng · 2 Liter" tanpa merek —
 * merek beda = harga beda. Tidak ada kandidat cocok → null (jadi produk baru).
 * Tanpa `size` dan `brand`, cocok menurut nama seperti biasa (perilaku lama).
 */
export function findProduct(
  products: Product[],
  rawName: string,
  size?: string | null,
  brand?: string | null,
): Product | null {
  const sizeHint = sizeKey(size)
  const brandHint = brandKey(brand)
  let pool = products
  if (sizeHint) {
    pool = pool.filter((product) => sizeKey(product.size) === sizeHint)
  }
  if (brandHint) {
    pool = pool.filter((product) => brandKey(product.brand) === brandHint)
  }
  return scoreProducts(pool, rawName)?.product ?? null
}

/**
 * Find an existing product that already uses the same name or alias, size,
 * AND brand. Ukuran/merek berbeda = produk & harga berbeda, bukan duplikat —
 * "Minyak Goreng · 2 Liter" bukan duplikat dari "Minyak Goreng · 1 Liter"
 * maupun dari "Bimoli Minyak Goreng · 2 Liter". Kalau salah satu sisi tidak
 * punya ukuran (data lama), ukuran dianggap sama — barang lama tetap
 * dikenali sebagai duplikat, tapi merek harus identik persis.
 */
export function findDuplicateProduct(
  products: Product[],
  name: string,
  aliases: string[] = [],
  size?: string | null,
  brand?: string | null,
): Product | null {
  const incoming = [name, ...aliases].map(normalizeText).filter(Boolean)
  const normalizedBrand = brandKey(brand)
  if (normalizedBrand) incoming.push(normalizedBrand)
  if (incoming.length === 0) return null
  const incomingSize = sizeKey(size)
  const incomingBrand = brandKey(brand)

  return (
    products.find((product) => {
      const existing = [product.brand ? product.brand : "", ...product.aliases, product.name]
        .map(normalizeText)
        .filter(Boolean)
      if (!existing.some((candidate) => incoming.includes(candidate))) return false
      const existingSize = sizeKey(product.size)
      if (incomingSize && existingSize && incomingSize !== existingSize) return false
      const existingBrand = brandKey(product.brand)
      // Merek HARUS sama persis untuk dianggap kembar — merek berbeda (atau
      // kosong vs terisi) berarti produk & harga berbeda, bukan duplikat.
      if (incomingBrand !== existingBrand) return false
      return true
    }) ?? null
  )
}

/** Bersihkan kata-kata pengantar dari nama produk — ekspor untuk dipakai luas. */
export function sanitizeProductName(value: string): string {
  return cleanName(value)
}

function cleanName(value: string): string {
  return value
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(" ")
}

interface RawItem {
  name: string
  qty: number
  unit: string
  confidence: number
  product: Product | null
  /** Ukuran/varian yang disebut, mis. "2 Liter" ("minyak 2 liter 20 botol"). */
  size: string | null
  /** Total harga untuk baris ini ("seharga 250 ribu"), rupiah. */
  priceTotal: number | null
  /** Harga SATUAN ("per 25 ribu", "@ 25 ribu"), rupiah. */
  unitPrice: number | null
}

interface PriceMatch {
  priceTotal: number | null
  unitPrice: number | null
  /** Teks tanpa penyebutan harga — siap diambil nama barangnya. */
  remainder: string
}

/** Angka yang ditulis "250.000" (format titik ribuan) atau "250 ribu". */
function parsePriceToken(base: string | undefined, word: string | undefined): number | null {
  const cleaned = (base ?? "").trim()
  if (!cleaned) return null
  // "250.000" / "1.500.000" — titik ribuan, tanpa kata pengali.
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned) && !word) {
    return Number(cleaned.replace(/\./g, ""))
  }
  const parsed = parseNumber(cleaned)
  if (parsed === null) return null
  const multiplier = word ? (PRICE_MULTIPLIERS[word.toLowerCase()] ?? 1) : 1
  return Math.round(parsed * multiplier)
}

/**
 * Tarik penyebutan harga dari baris ucapan, tanpa menyentuh angka
 * jumlah/ukuran karena keyword-nya wajib ada:
 *
 * - "per 25 ribu" / "@ 25 ribu" → harga per satuan (25.000/botol)
 * - "seharga 250 ribu" / "total 250 ribu" / "sebesar 1,5 juta"
 *   → total harga baris (dibagi qty jadi harga satuan)
 */
function extractPrice(text: string): PriceMatch {
  const perMatch = text.match(
    /(?:^|\s)(?:per|@)\s*(?:rp\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(ribu|rb|ribuan|juta)?\b/i,
  )
  if (perMatch) {
    const unitPrice = parsePriceToken(perMatch[1], perMatch[2])
    return {
      priceTotal: null,
      unitPrice,
      remainder: text.replace(perMatch[0], " "),
    }
  }

  const totalMatch = text.match(
    /(?:^|\s)(?:seharga|total|sebesar|sejumlah|harga)\s*(?:rp\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(ribu|rb|ribuan|juta)?\b/i,
  )
  if (totalMatch) {
    const priceTotal = parsePriceToken(totalMatch[1], totalMatch[2])
    return {
      priceTotal,
      unitPrice: null,
      remainder: text.replace(totalMatch[0], " "),
    }
  }

  return { priceTotal: null, unitPrice: null, remainder: text }
}

interface QtyUnitSize {
  qty: number | null
  unit: string
  size: string | null
  /** Sisa teks setelah pasangan angka+satuan dibuang. */
  name: string
}

/**
 * Pisahkan jumlah + satuan dari nama barang, dan kenali dua pasangan angka:
 * satu adalah UKURAN/varian, satu lagi adalah QTY. Penentuan SIA PUNYA peran
 * ditentukan dari KELAS SATUAN — bukan urutan:
 *
 * - Satuan isi/berat/volume (kg, gram, liter, ml, ons) → itu UKURAN/varian.
 * - Satuan jual/wadah (botol, dus, pcs, bungkus, papan, sachet, karung,
 *   kaleng, batang, karton) → itu QTY.
 *
 * - "minyak 2 liter 20 botol"        → size "2 liter", qty 20 botol
 * - "10 botol air mineral 1 liter"   → size "1 liter", qty 10 botol
 * - "air mineral 1 liter 10 botol"   → size "1 liter", qty 10 botol
 * - "beras 5 kg 10 karung"           → size "5 kg", qty 10 karung
 * - "beras 10 kilo"                  → qty 10 kg (tanpa ukuran)
 * - "telur 2 papan"                  → qty 2 papan (tanpa ukuran)
 */
const COUNT_UNITS = new Set([
  "botol",
  "karton",
  "karung",
  "kaleng",
  "batang",
  "papan",
  "sachet",
  "pcs",
  "dus",
  "bungkus",
  "pak",
  "pack",
])
const MEASURE_UNITS = new Set(["kg", "gram", "liter", "ml", "ons"])

function extractQtyUnitSize(text: string): QtyUnitSize {
  const pairPattern = new RegExp(`(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})\\b`, "gi")
  const pairs = [...text.matchAll(pairPattern)]

  if (pairs.length >= 2) {
    const classify = (pair: RegExpMatchArray): "measure" | "count" | "other" => {
      const unit = normalizeUnit(pair[2] ?? "")
      if (MEASURE_UNITS.has(unit)) return "measure"
      if (COUNT_UNITS.has(unit)) return "count"
      return "other"
    }
    // Cari pasangan satuan hitung (botol/dus/pcs...) → itu qty; pasangan
    // satuan ukuran (kg/liter/ml...) → itu ukuran.
    const countPair = pairs.find((pair) => classify(pair) === "count")
    const measurePair = pairs.find((pair) => classify(pair) === "measure")
    const sizePair = measurePair ?? pairs[0]!
    const qtyPair = countPair ?? pairs[pairs.length - 1]!
    const sizeQty = parseNumber(sizePair[1])
    const qty = parseNumber(qtyPair[1])
    const size =
      sizeQty !== null ? `${sizeQty} ${normalizeUnit(sizePair[2])}` : null
    const name = text
      .replace(sizePair[0], " ")
      .replace(qtyPair[0], " ")
    return { qty, unit: normalizeUnit(qtyPair[2]), size, name }
  }

  const match = pairs[0]
  if (match) {
    const qty = parseNumber(match[1])
    return {
      qty,
      unit: normalizeUnit(match[2]),
      size: null,
      name: text.replace(match[0], " "),
    }
  }

  // Tanpa satuan. Coba angka di akhir atau awal, mis. "beras 10".
  const numberMatch = text.match(new RegExp(`(${NUMBER_PATTERN})`, "i"))
  if (numberMatch) {
    return {
      qty: parseNumber(numberMatch[1]),
      unit: "",
      size: null,
      name: text.replace(numberMatch[0], " "),
    }
  }

  return { qty: null, unit: "", size: null, name: text }
}

function parseSegment(segment: string, products: Product[]): RawItem | null {
  const text = restoreDecimals(normalizeText(protectDecimals(segment)))
  if (!text) return null

  // Examples handled: "beras 10 kilo", "10 kg beras", "telur 2 papan",
  // "minyak 2 liter 20 botol", "10 botol air mineral 1 liter seharga 250 ribu".
  const priced = extractPrice(text)
  const extracted = extractQtyUnitSize(priced.remainder)
  const qty = extracted.qty
  let unit = extracted.unit
  const size = extracted.size
  let name = extracted.name
  const priceTotal = priced.priceTotal
  const unitPrice = priced.unitPrice

  name = cleanName(name)
  if (!name || qty === null || qty <= 0) return null

  // Baris hanya berisi penyebutan harga tanpa barang → abaikan.
  if (/\b(rp|ribu|ribuan|juta)\b/.test(priced.remainder) && extracted.unit === "") return null

  const product = findProduct(products, name, size)
  if (product) {
    name = product.name
    if (!unit) unit = product.unit
  }

  const unitMatches = product ? normalizeUnit(unit) === normalizeUnit(product.unit) : true
  let confidence = product ? (unitMatches ? 0.95 : 0.7) : 0.45
  if (extracted.unit === "") confidence -= 0.1
  confidence = Math.max(0.25, Math.min(0.99, confidence))

  return { name, qty, unit: unit || "pcs", confidence, product, size, priceTotal, unitPrice }
}

const DECIMAL_TOKEN = "koma"

function protectDecimals(value: string): string {
  return value.replace(/(\d)\s*[,.]\s*(\d)/g, `$1${DECIMAL_TOKEN}$2`)
}

function restoreDecimals(value: string): string {
  return value.replace(new RegExp(`(\\d)${DECIMAL_TOKEN}(\\d)`, "g"), "$1.$2")
}

/**
 * Deterministic Indonesian voice parser.
 * It is intentionally conservative: when unsure, it lowers confidence and
 * lets the merchant correct the row in the confirmation screen.
 */
export function parseVoiceText(transcript: string, products: Product[]): VoiceParseResult {
  // Buku utang: "simpen dulu buat Pak Yono ..." → debtor + items tanpa frasa utang.
  const debt = detectDebtor(transcript)

  // Split item separators before normalizeText removes commas. Decimal
  // separators are protected first so "1,5 kg" stays one quantity.
  const prepared = protectDecimals(debt.cleanedTranscript)
    .replace(/[;,]/g, "|")
    .replace(/\b(dan|sama|serta|plus|tambah|dengan)\b/gi, "|")

  const segments = prepared
    .split("|")
    .map((part) => restoreDecimals(normalizeText(part)))
    .filter(Boolean)
  const flat = segments.join(" ")

  const parsed: RawItem[] = []
  for (const segment of segments) {
    const item = parseSegment(segment, products)
    if (item) parsed.push(item)
  }

  // Fallback: if no segment had a number, look for product mentions with qty 1.
  if (parsed.length === 0) {
    for (const product of products) {
      const aliases = [product.name, ...product.aliases].map(normalizeText)
      if (aliases.some((alias) => alias.length >= 3 && flat.includes(alias))) {
        parsed.push({
          name: product.name,
          qty: 1,
          unit: product.unit,
          confidence: 0.5,
          product,
          size: product.size ?? null,
          priceTotal: null,
          unitPrice: null,
        })
      }
    }
  }

  const merged = new Map<string, VoiceItem>()
  for (const item of parsed) {
    const key = item.product?.id ?? `${normalizeText(item.name)}|${sizeKey(item.size) ?? ""}`
    const existing = merged.get(key)
    if (existing) {
      existing.qty += item.qty
      existing.confidence = Math.max(existing.confidence, item.confidence)
      if (!existing.size && item.size) existing.size = item.size
    } else {
      merged.set(key, {
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        confidence: item.confidence,
        size: item.size,
        priceTotal: item.priceTotal,
        unitPrice: item.unitPrice,
      })
    }
  }

  return { items: [...merged.values()], debtor: debt.debtor }
}

/**
 * Gabungkan hasil parser lokal dan hasil AI.
 *
 * Sebelumnya hasil AI langsung menggantikan hasil parser lokal. Padahal
 * parser lokal tahu daftar alias barang persis, sementara AI lebih pandai
 * memahami kalimat yang rumit. Jadi keduanya digabung: baris yang sama memakai
 * pembacaan yang lebih yakin, baris yang hanya ada di salah satu tetap
 * dipertahankan.
 */
export function mergeVoiceItems(
  local: VoiceItem[],
  remote: VoiceItem[],
  products: Product[],
): VoiceItem[] {
  const merged = new Map<string, VoiceItem>()

  for (const item of local) {
    const cleanItemName = sanitizeProductName(item.name)
    const product = findProduct(products, cleanItemName, item.size, item.brand)
    const key =
      product?.id ??
      `name:${normalizeText(cleanItemName)}|${sizeKey(item.size) ?? ""}|${brandKey(item.brand) ?? ""}`
    merged.set(key, {
      ...item,
      name: product?.name ?? cleanItemName,
      unit: product?.unit ?? item.unit,
      size: item.size ?? product?.size ?? null,
      brand: item.brand ?? product?.brand ?? null,
    })
  }

  for (const item of remote) {
    const cleanItemName = sanitizeProductName(item.name)
    const product = findProduct(products, cleanItemName, item.size, item.brand)
    const key =
      product?.id ??
      `name:${normalizeText(cleanItemName)}|${sizeKey(item.size) ?? ""}|${brandKey(item.brand) ?? ""}`
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, {
        ...item,
        name: product?.name ?? cleanItemName,
        unit: product?.unit ?? item.unit,
        size: item.size ?? product?.size ?? null,
        brand: item.brand ?? product?.brand ?? null,
      })
      continue
    }

    // Baris sama: ambil pembacaan yang lebih yakin. Kalau seri, pakai
    // pembacaan lokal karena daftar alias lokal sudah pasti benar.
    if (item.confidence > existing.confidence) {
      merged.set(key, {
        ...item,
        name: existing.name,
        unit: existing.unit,
        size: existing.size ?? item.size ?? null,
        brand: existing.brand ?? item.brand ?? null,
      })
    }
  }

  return [...merged.values()]
}

/** Konversi parser output menjadi editable confirmation rows. */
export function toConfirmItems(
  items: VoiceItem[],
  products: Product[],
  kind: "sale" | "purchase",
): ConfirmItem[] {
  return items.map((item, index) => {
    const product = findProduct(products, sanitizeProductName(item.name), item.size, item.brand)
    let qty = item.qty
    let unit = product?.unit ?? normalizeUnit(item.unit)
    const size = item.size ?? product?.size ?? null
    const brand = item.brand ?? product?.brand ?? null
    const cleanItemName = sanitizeProductName(item.name)
    // Harga yang diucapkan mengalahkan katalog:
    //   "per 25 ribu" / "@ 25 ribu" (unitPrice) >
    //   "seharga 250 ribu" untuk 10 botol (25.000/botol, dari priceTotal) >
    //   harga katalog terakhir.
    const spokenUnitPrice =
      item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice > 0
        ? Math.round(item.unitPrice)
        : item.priceTotal !== undefined && item.priceTotal !== null && item.priceTotal > 0 && qty > 0
          ? Math.round(item.priceTotal / qty)
          : null

    if (product) {
      // "500 gram" untuk barang per kg menjadi 0,5 kg.
      const converted = convertQty(item.qty, item.unit, product.unit)
      if (converted !== null) qty = converted
      unit = product.unit
    }

    return {
      key: `${kind}-${product?.id ?? `${normalizeText(cleanItemName)}|${sizeKey(item.size) ?? ""}|${brandKey(item.brand) ?? ""}`}-${index}`,
      productId: product?.id ?? "",
      name: product?.name ?? cleanItemName,
      qty,
      unit,
      unitPrice:
        spokenUnitPrice ??
        (product ? (kind === "sale" ? product.sell_price : product.buy_price) : 0),
      confidence: item.confidence,
      isNew: !product,
      size,
      brand,
    }
  })
}

export interface CatalogItem {
  name: string
  /** Stok awal yang disebut; 0 bila tidak disebut. */
  qty: number
  unit: string
  /** Harga jual dari ucapan ("14 ribu", "Rp 14.000"); 0 bila tidak disebut. */
  sellPrice: number
  confidence: number
  /**
   * Terisi kalau nama yang disebut cocok dengan barang yang sudah ada —
   * stoknya akan ditambah, bukan dibuat sebagai barang baru.
   */
  matchId: string | null
  /** Ukuran/varian yang disebut, mis. "2 Liter" ("minyak 2 liter 14 ribu 20
   * botol"). Dipakai mencocokkan varian: "minyak 2 liter" tidak cocok ke
   * produk "Minyak Goreng · 1 Liter". */
  size?: string | null
  /** Merek barang ("Bimoli"); kosong = tanpa merek. */
  brand?: string | null
}

const PRICE_MULTIPLIERS: Record<string, number> = {
  ribu: 1000,
  rb: 1000,
  ribuan: 1000,
  juta: 1000000,
}

const CATALOG_FILLER_WORDS = new Set([...FILLER_WORDS, "harga", "stok", "isi", "barang"])

function titleCaseName(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Parser katalog yang deterministik dan berjalan lokal (tanpa internet).
 * Mengubah ucapan seperti "beras 14 ribu, mi instan 3rb dan telur 2 papan
 * 30 ribu" menjadi usulan barang baru. Harga hanya dikenali dari sinyal
 * yang jelas (kata ribu/rb/juta atau format ribuan) supaya jumlah dan harga
 * tidak tertukar; sisanya diperbaiki pedagang di layar konfirmasi.
 *
 * Kalau `products` diberikan, barang yang namanya (atau aliasnya) cocok
 * ditandai lewat `matchId` — layar akan menambah stok barang yang sudah
 * ada itu alih-alih membuat barang baru dengan nama frasa ucapannya.
 */
export function parseCatalogText(transcript: string, products: Product[] = []): CatalogItem[] {
  const prepared = protectDecimals(transcript)
    .replace(/[;,]/g, "|")
    .replace(/\b(dan|sama|serta|plus|lalu|terus)\b/gi, "|")

  const segments = prepared
    .split("|")
    .map((part) => restoreDecimals(normalizeText(part)))
    .filter(Boolean)

  const items: CatalogItem[] = []
  const byName = new Map<string, CatalogItem>()
  for (const segment of segments) {
    const item = parseCatalogSegment(segment, products)
    if (!item) continue
    const key = item.matchId ?? `${item.name.toLowerCase()}|${sizeKey(item.size) ?? ""}`
    const existing = byName.get(key)
    if (existing) {
      existing.qty += item.qty
      if (item.sellPrice > 0) existing.sellPrice = item.sellPrice
      if (!existing.size && item.size) existing.size = item.size
      existing.confidence = Math.max(existing.confidence, item.confidence)
    } else {
      byName.set(key, item)
      items.push(item)
    }
  }
  return items
}

function parseCatalogSegment(segment: string, products: Product[]): CatalogItem | null {
  let text = restoreDecimals(normalizeText(protectDecimals(segment)))
  if (!text) return null

  // 1. Harga dengan sinyal jelas: "14.000" (format ribuan), "14 ribu/rb",
  //    "rp 14", "1,5 juta". Angka polos dianggap jumlah, bukan harga.
  //    PENTING: "rp 14" berarti Rp14, bukan Rp14.000 — hanya "14 ribu"
  //    yang berarti 14.000.
  let sellPrice = 0
  const thousands = text.match(/(?:\brp\.?\s*)?(\d{1,3}(?:\.\d{3})+)\b/i)
  const withWord = text.match(
    new RegExp(`(${NUMBER_PATTERN})\\s*(ribu|rb|ribuan|juta)\\b`, "i"),
  )
  const withRp = text.match(new RegExp(`\\brp\\.?\\s*(${NUMBER_PATTERN})\\b`, "i"))
  if (thousands) {
    sellPrice = Number(thousands[1]?.replace(/\./g, ""))
    text = text.replace(thousands[0], " ")
  } else if (withWord) {
    const base = parseNumber(withWord[1]) ?? 0
    const word = (withWord[2] ?? "ribu").toLowerCase()
    sellPrice = Math.round(base * (PRICE_MULTIPLIERS[word] ?? 1))
    text = text.replace(withWord[0], " ")
  } else if (withRp) {
    sellPrice = parseNumber(withRp[1]) ?? 0
    text = text.replace(withRp[0], " ")
  }
  // Sisa kata pengali yang tidak ikut tertangkap (mis. "rp 14 ribu").
  text = text.replace(/\b(ribu|rb|ribuan|juta)\b/gi, " ")
  // Sisa penanda "rp" supaya tidak ikut jadi nama barang.
  text = text.replace(/\brp\.?\b/gi, " ")

  // 2. Jumlah + satuan: "20 kilo", "2 papan", "minyak 2 liter 20 botol"
  //    (pertama = ukuran, terakhir = jumlah).
  const extracted = extractQtyUnitSize(text)
  const qty = extracted.qty ?? 0
  const unit = extracted.unit
  const size = extracted.size
  text = extracted.name

  // 3. Nama: buang kata sambungan lalu rapikan kapitalisasi.
  const rawName = titleCaseName(
    text
      .split(" ")
      .map((word) => word.trim())
      .filter((word) => word && !CATALOG_FILLER_WORDS.has(word))
      .join(" "),
  )
  if (!rawName) return null

  // Kalau cocok dengan barang yang sudah ada (dan ukurannya sama), pakai
  // nama & satuan kanonik — stoknya ditambah, bukan dibuat barang baru.
  const match = findProduct(products, rawName, size)
  if (match) {
    return {
      name: match.name,
      qty,
      unit: match.unit,
      sellPrice: 0,
      confidence: 0.8,
      matchId: match.id,
      size,
    }
  }

  return { name: rawName, qty, unit: unit || "pcs", sellPrice, confidence: 0.6, matchId: null, size }
}
