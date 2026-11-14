import { rupiah } from "./format"

/**
 * Tutup buku kas — bandingkan uang fisik di laci dengan catatan penjualan.
 *
 * Kasir pada umumnya tidak pernah menghitung ulang laci, padahal warung
 *biasanya cek laci tiap malam. Selisihnya bisa jadi salah hitung, atau
 * benar-benar uang yang hilang. Aplikasi tidak menuduh siapa — hanya
 * menunjukkan angkanya supaya pemilik yang memeriksa.
 */

const KEY = "warung-pintar-cash-v1"

export interface CashClosing {
  /** Tanggal penutupan (YYYY-MM-DD). */
  date: string
  /** Uang yang dihitung fisik di laci. */
  counted: number
  /** Uang yang seharusnya ada menurut catatan. */
  expected: number
  /** Selisih: positif = lebih, negatif = kurang. */
  diff: number
  at: string
}

export type CashTone = "sesuai" | "kurang" | "lebih"

/**
 * Uang yang seharusnya ada di laci: penjualan hari ini (diasumsikan tunai)
 * ditambah utang yang dibayar hari ini.
 */
export function expectedCash(salesToday: number, settledDebtToday: number): number {
  return Math.max(0, salesToday + settledDebtToday)
}

export function buildCashClosing(
  counted: number,
  expected: number,
  now = new Date(),
): CashClosing {
  return {
    date: now.toISOString().slice(0, 10),
    counted: Math.max(0, counted),
    expected: Math.max(0, expected),
    diff: counted - expected,
    at: now.toISOString(),
  }
}

export function cashClosingVerdict(closing: CashClosing): {
  label: string
  tone: CashTone
} {
  if (closing.diff === 0) return { label: "Laci sesuai catatan", tone: "sesuai" }
  if (closing.diff < 0) {
    return {
      label: `Laci kurang ${rupiah(Math.abs(closing.diff))} dari catatan`,
      tone: "kurang",
    }
  }
  return { label: `Laci lebih ${rupiah(closing.diff)} dari catatan`, tone: "lebih" }
}

export function readCashClosings(): CashClosing[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return []
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CashClosing[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.date === "string")
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  } catch {
    return []
  }
}

export function writeCashClosings(closings: CashClosing[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    window.localStorage.setItem(KEY, JSON.stringify(closings.slice(0, 30)))
  } catch {
    // Penyimpanan penuh: riwayat dilewati, angka tetap tampil.
  }
}

export interface ClosingsSummary {
  count: number
  /** Total selisih (negatif = kurang). */
  totalDiff: number
  /** Berapa kali laci tidak sesuai. */
  mismatchCount: number
  lastClosing: CashClosing | null
}

export function summarizeClosings(closings: CashClosing[]): ClosingsSummary {
  return {
    count: closings.length,
    totalDiff: closings.reduce((sum, closing) => sum + closing.diff, 0),
    mismatchCount: closings.filter((closing) => closing.diff !== 0).length,
    lastClosing: closings[0] ?? null,
  }
}
