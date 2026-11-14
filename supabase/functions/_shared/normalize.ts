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

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== "string") return null

  const cleaned = value.replace(/[^\d,.-]/g, "")
  if (!cleaned) return null

  const negative = cleaned.startsWith("-")
  const unsigned = cleaned.replace(/-/g, "")
  const lastComma = unsigned.lastIndexOf(",")
  const lastDot = unsigned.lastIndexOf(".")
  let normalized: string

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = unsigned.replace(/\./g, "").replace(",", ".")
    } else {
      normalized = unsigned.replace(/,/g, "")
    }
  } else if (lastComma >= 0) {
    normalized = unsigned.replace(",", ".")
  } else if (lastDot >= 0) {
    const decimals = unsigned.length - lastDot - 1
    const digitsBefore = unsigned.slice(0, lastDot).replace(/\D/g, "").length
    normalized = decimals === 3 && digitsBefore > 0 ? unsigned.replace(/\./g, "") : unsigned
  } else {
    normalized = unsigned
  }

  const parsed = Number((negative ? "-" : "") + normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function positiveNumber(value: unknown): number | null {
  const parsed = asNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

export function nonNegativeNumber(value: unknown): number | null {
  const parsed = asNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

/**
 * Rupiah has no cents. Strip separators so "15.000", "15,000", and "15000"
 * all become 15000, regardless of the AI provider's formatting.
 */
export function asRupiah(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value !== "string") return null
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function cleanName(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const cleaned = raw.replace(/\s+/g, " ").replace(/[\u0000-\u001f]/g, "").trim()
  return cleaned ? cleaned.slice(0, 120) : null
}

export function cleanUnit(value: unknown, fallback = "pcs"): string {
  const raw = asString(value)?.trim().toLowerCase()
  if (!raw) return fallback
  const withoutQty = raw.replace(/^[\d.,\s]+/, "")
  const normalized = withoutQty.replace(/[^a-z]/g, "")
  if (!normalized) return fallback
  return UNIT_ALIASES[normalized] ?? normalized.slice(0, 20)
}

/**
 * Ukuran/varian kemasan dari teks bebas ("2 Liter", "500 g", "700 gram").
 * Disimpan apa adanya (rapi, maks 30 karakter) — perbandingan antar teks
 * dilakukan parser/normalizer di frontend.
 */
export function cleanSize(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 30)
  return cleaned.length > 0 ? cleaned : null
}

/** Merek barang dari teks bebas ("Bimoli", "Wings"). Disimpan rapi. */
export function cleanBrand(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 30)
  return cleaned.length > 0 ? cleaned : null
}
