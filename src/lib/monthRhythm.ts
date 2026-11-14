// Ritme bulan warung: membandingkan penjualan antar fase tanggal dalam bulan.
// Awal bulan (uang gajian), tengah, dan tanggal tua. Angka murni dari
// transaksi — tidak ada tebakan dan tidak ada angka baru.
import type { Product, Transaction, TransactionWithProduct } from "./types"
import { isoDate } from "./format"
import { withProduct } from "./stats"

export type MonthWindowKey = "awal" | "tengah" | "tua"

export interface MonthWindow {
  key: MonthWindowKey
  label: string
  /** Banyaknya hari yang punya data di fase ini. */
  days: number
  avgDailySales: number
}

export interface MonthShift {
  productId: string
  name: string
  unit: string
  /** Rata-rata kuantitas/hari di fase awal + tengah. */
  baseDailyQty: number
  /** Rata-rata kuantitas/hari di fase tanggal tua. */
  tuaDailyQty: number
  changePct: number
}

export interface MonthRhythm {
  hasData: boolean
  monthsCovered: number
  windows: MonthWindow[]
  /** Perubahan penjualan harian tanggal tua vs awal bulan (%). */
  tuaVsAwalPct: number | null
  shifts: MonthShift[]
}

export function monthWindowKey(dayOfMonth: number): MonthWindowKey {
  if (dayOfMonth <= 10) return "awal"
  if (dayOfMonth <= 20) return "tengah"
  return "tua"
}

const WINDOW_LABELS: Record<MonthWindowKey, string> = {
  awal: "Awal (1–10)",
  tengah: "Tengah (11–20)",
  tua: "Tanggal tua (21–akhir)",
}

export function computeMonthRhythm(
  products: Product[],
  transactions: Transaction[],
): MonthRhythm {
  const joined = withProduct(products, transactions)
  const saleRows = joined.filter((row) => row.type === "sale")

  const totals: Record<MonthWindowKey, { sales: number; dates: Set<string> }> = {
    awal: { sales: 0, dates: new Set() },
    tengah: { sales: 0, dates: new Set() },
    tua: { sales: 0, dates: new Set() },
  }
  const months = new Set<string>()

  for (const row of saleRows) {
    const date = new Date(row.created_at)
    const key = monthWindowKey(date.getDate())
    totals[key].sales += row.qty * row.unit_price
    totals[key].dates.add(isoDate(date))
    months.add(isoDate(date).slice(0, 7))
  }

  const windows: MonthWindow[] = (Object.keys(totals) as MonthWindowKey[]).map((key) => ({
    key,
    label: WINDOW_LABELS[key],
    days: totals[key].dates.size,
    avgDailySales: totals[key].dates.size > 0 ? totals[key].sales / totals[key].dates.size : 0,
  }))

  const byKey = new Map(windows.map((window) => [window.key, window]))
  const awal = byKey.get("awal")
  const tua = byKey.get("tua")
  const hasData = (awal?.days ?? 0) >= 5 && (tua?.days ?? 0) >= 5

  const tuaVsAwalPct =
    hasData && awal && awal.avgDailySales > 0
      ? ((tua!.avgDailySales - awal.avgDailySales) / awal.avgDailySales) * 100
      : null

  const shifts = collectShifts(saleRows)

  return {
    hasData,
    monthsCovered: months.size,
    windows,
    tuaVsAwalPct,
    shifts,
  }
}

function collectShifts(saleRows: TransactionWithProduct[]): MonthShift[] {
  const perProduct = new Map<
    string,
    { name: string; unit: string; baseQty: number; baseDates: Set<string>; tuaQty: number; tuaDates: Set<string> }
  >()

  for (const row of saleRows) {
    const date = new Date(row.created_at)
    const key = monthWindowKey(date.getDate())
    const entry =
      perProduct.get(row.product_id) ??
      {
        name: row.product.name,
        unit: row.product.unit,
        baseQty: 0,
        baseDates: new Set<string>(),
        tuaQty: 0,
        tuaDates: new Set<string>(),
      }
    if (key === "tua") {
      entry.tuaQty += row.qty
      entry.tuaDates.add(isoDate(date))
    } else {
      entry.baseQty += row.qty
      entry.baseDates.add(isoDate(date))
    }
    perProduct.set(row.product_id, entry)
  }

  const shifts: MonthShift[] = []
  for (const [productId, entry] of perProduct) {
    if (entry.baseDates.size < 10 || entry.tuaDates.size < 10) continue
    const baseDailyQty = entry.baseQty / entry.baseDates.size
    const tuaDailyQty = entry.tuaQty / entry.tuaDates.size
    if (baseDailyQty <= 0) continue
    shifts.push({
      productId,
      name: entry.name,
      unit: entry.unit,
      baseDailyQty,
      tuaDailyQty,
      changePct: ((tuaDailyQty - baseDailyQty) / baseDailyQty) * 100,
    })
  }

  return shifts
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.tuaDailyQty - a.tuaDailyQty)
    .slice(0, 3)
}
