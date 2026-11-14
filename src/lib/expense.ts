import { businessDayStart, DAY_MS } from "./calendar"
import { productLabel } from "./format"
import type { Product, Transaction } from "./types"

/** Satu catatan belanja stok (pembelian) untuk ditampilkan. */
export interface PurchaseExpenseEntry {
  id: string
  productId: string
  name: string
  unit: string
  qty: number
  unitPrice: number
  /** qty × harga modal, dalam rupiah. */
  total: number
  /** Timestamp transaksi. */
  time: number
}

/** Ringkasan pengeluaran belanja dalam satu periode. */
export interface ExpenseSummary {
  /** Total biaya pembelian di periode (Rp). */
  total: number
  /** Jumlah catatan pembelian. */
  entries: number
  /** Total jumlah barang yang masuk. */
  items: number
  /** Catatan pembelian terbaru untuk tampil di layar. */
  recent: PurchaseExpenseEntry[]
}

function emptySummary(): ExpenseSummary {
  return { total: 0, entries: 0, items: 0, recent: [] }
}

/**
 * Sumber angka pengeluaran belanja warung: total transaksi pembelian.
 *
 * Semua layar yang menampilkan "pengeluaran hari ini" memakai fungsi ini
 * supaya angka tidak berbeda antar layar. Hari dihitung dalam zona waktu
 * warung (lihat `calendar.ts`), sama dengan mesin penjualan di `analytics.ts`.
 */
export function purchaseExpenses(
  products: Product[],
  transactions: Transaction[],
  start: number,
  end: number,
  now: number = Date.now(),
  recentLimit = 6,
): ExpenseSummary {
  const productById = new Map(products.map((product) => [product.id, product]))
  const entries: PurchaseExpenseEntry[] = []
  let total = 0
  let items = 0

  for (const transaction of transactions) {
    if (transaction.type !== "purchase") continue
    const product = productById.get(transaction.product_id)
    if (!product) continue

    const time = Date.parse(transaction.created_at)
    if (!Number.isFinite(time)) continue
    // Tanggal masa depan tidak dihitung, sama seperti indeks penjualan.
    if (time > now) continue
    if (time < start || time >= end) continue

    const qty = Number.isFinite(transaction.qty) ? transaction.qty : 0
    if (qty <= 0) continue

    const unitPrice = Number.isFinite(transaction.unit_price)
      ? Math.max(0, transaction.unit_price)
      : 0
    const entryTotal = qty * unitPrice

    entries.push({
      id: transaction.id,
      productId: product.id,
      name: productLabel(product),
      unit: product.unit,
      qty,
      unitPrice,
      total: entryTotal,
      time,
    })
    total += entryTotal
    items += qty
  }

  if (entries.length === 0) return emptySummary()

  entries.sort((a, b) => b.time - a.time)
  return {
    total,
    entries: entries.length,
    items,
    recent: entries.slice(0, recentLimit),
  }
}

/** Pengeluaran belanja hari ini (zona waktu warung). */
export function todayPurchaseExpenses(
  products: Product[],
  transactions: Transaction[],
  now: number = Date.now(),
): ExpenseSummary {
  const start = businessDayStart(now)
  return purchaseExpenses(products, transactions, start, start + DAY_MS, now)
}

/** Pengeluaran belanja 7 hari terakhir (zona waktu warung). */
export function weeklyPurchaseExpenses(
  products: Product[],
  transactions: Transaction[],
  now: number = Date.now(),
): ExpenseSummary {
  const start = businessDayStart(now)
  return purchaseExpenses(products, transactions, start - 6 * DAY_MS, start + DAY_MS, now)
}
