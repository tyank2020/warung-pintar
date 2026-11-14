import { numberID, rupiah } from "./format"
import type { Debt, Product, Transaction } from "./types"

/**
 * Modal awal & posisi modal.
 *
 * Pemilik warung tahu dia mulai dengan modal berapa. Dari situ kita bisa
 * membandingkan: sekarang uangnya di rak (stok), di Piutang (utang konsumen),
 * atau sudah jadi laba — atau justru berkurang.
 *
 * Semua angka berasal dari data (stok, transaksi, utang) plus satu angka yang
 * dimasukkan pemilik sendiri: modal awal. Tidak ada angka yang dikarang.
 */

const KEY = "warung-pintar-capital-v1"

export interface CapitalInput {
  /** Modal yang dipakai mulai berjualan (stok + kas), dalam rupiah. */
  amount: number
  /** Tanggal mulai (YYYY-MM-DD). */
  since: string
}

export interface CapitalReport {
  initial: number
  since: string
  /** Nilai persediaan saat ini: stok × harga modal. */
  stockValue: number
  /** Laba kotor kumulatif sejak tanggal modal awal. */
  grossProfit: number
  /** Piutang: utang pembeli yang belum lunas. */
  openDebt: number
  /** Perkiraan posisi modal sekarang. */
  estimatedNow: number
  /** Selisih terhadap modal awal (positif = bertambah). */
  change: number
  verdict: "naik" | "turun" | "seimbang"
  message: string
}

export function readCapitalInput(): CapitalInput | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CapitalInput
    if (!parsed || !Number.isFinite(parsed.amount) || parsed.amount <= 0) return null
    return { amount: parsed.amount, since: parsed.since }
  } catch {
    return null
  }
}

export function writeCapitalInput(input: CapitalInput | null): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    if (!input) {
      window.localStorage.removeItem(KEY)
      return
    }
    window.localStorage.setItem(KEY, JSON.stringify(input))
  } catch {
    // Penyimpanan diblokir: nilainya tetap dipakai di sesi ini.
  }
}

function isOnOrAfter(iso: string, since: string): boolean {
  return iso.slice(0, 10) >= since
}

/**
 * Susun laporan posisi modal.
 *
 * estimatedNow = nilai stok + laba kotor kumulatif + utang belum lunas.
 * Uang tunai di laci tidak ikut dihitung (belum ada catatan kas harian) —
 * itu sebabnya hasilnya disebut "perkiraan".
 */
export function buildCapitalReport(
  input: CapitalInput,
  products: Product[],
  transactions: Transaction[],
  debts: Debt[],
): CapitalReport {
  const since = input.since

  const stockValue = products.reduce(
    (sum, product) => sum + product.stock * product.buy_price,
    0,
  )

  let grossProfit = 0
  for (const transaction of transactions) {
    if (transaction.type !== "sale") continue
    if (!isOnOrAfter(transaction.created_at, since)) continue
    const product = products.find((candidate) => candidate.id === transaction.product_id)
    const revenue = transaction.qty * transaction.unit_price
    const cogs = transaction.qty * (product?.buy_price ?? 0)
    grossProfit += revenue - cogs
  }

  const openDebt = debts
    .filter((debt) => !debt.settled_at)
    .reduce((sum, debt) => sum + debt.amount, 0)

  const estimatedNow = stockValue + grossProfit + openDebt
  const change = estimatedNow - input.amount
  const verdict: CapitalReport["verdict"] =
    change > 1000 ? "naik" : change < -1000 ? "turun" : "seimbang"

  let message: string
  if (verdict === "naik") {
    message = `Modal Anda bertambah ${rupiah(Math.abs(change))} sejak ${since === "" ? "awal" : since}.`
  } else if (verdict === "turun") {
    message = `Modal Anda berkurang ${rupiah(Math.abs(change))} sejak ${since === "" ? "awal" : since}. Cek barang hilang, harga jual, atau utang yang belum tertagih.`
  } else {
    message = "Posisi modal masih sama dengan modal awal."
  }

  return {
    initial: input.amount,
    since,
    stockValue,
    grossProfit,
    openDebt,
    estimatedNow,
    change,
    verdict,
    message: `${message} Belum termasuk uang tunai di laci.`,
  }
}

/** Ringkasan satu kalimat untuk kartu di Beranda. */
export function capitalHeadline(report: CapitalReport): string {
  return `Modal awal ${rupiah(report.initial)} · sekarang ${rupiah(report.estimatedNow)} (${numberID(report.stockValue)} di rak, ${numberID(report.grossProfit)} laba, ${numberID(report.openDebt)} Piutang).`
}
