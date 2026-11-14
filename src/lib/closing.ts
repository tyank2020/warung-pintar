import { computeCostWatch, suggestSellPrice } from "./costWatch"
import { businessDayStart } from "./calendar"
import { longDate, numberID, productLabel, rupiah } from "./format"
import type { DashboardStats, Debt, Product, Transaction } from "./types"

/**
 * "Tutup buku hari ini" — ritual harian pemilik warung.
 *
 * Semua isi dihitung dari catatan sendiri: penjualan hari ini, laba kotor,
 * barang terlaris, utang yang belum dibayar (lama/how long), stok yang perlu
 * dibeli besok, dan modal yang naik. Tidak ada angka dari AI.
 */

const DAY = 24 * 60 * 60 * 1000

export interface DebtDue {
  id: string
  debtor: string
  productName: string
  qty: number
  unit: string
  amount: number
  /** Umur utang dalam hari. */
  ageDays: number
  createdAt: string
}

export interface DailyBook {
  date: string
  label: string
  sales: number
  grossProfit: number
  consignmentCommission: number
  transactionCount: number
  itemsSold: number
  topItems: Array<{ name: string; qty: number; revenue: number }>
  debts: DebtDue[]
  debtTotal: number
  /** Utang yang sudah lewat 7 hari — prioritas ditagih. */
  overdueDebts: DebtDue[]
  lowStock: Array<{ name: string; stock: number; unit: string; minStock: number }>
  suggestions: Array<{ name: string; qty: number; unit: string; cost: number; reason: string }>
  modalUp: Array<{
    name: string
    unit: string
    changePct: number
    lastCost: number
    suggestedPrice: number | null
  }>
  headline: string
}

/**
 * Apakah dua waktu jatuh di hari yang sama.
 *
 * Hari dihitung dalam zona waktu warung (WIB), sama dengan angka penjualan
 * hari ini dan jam yang ditampilkan. Kalau dibandingkan pakai jam perangkat,
 * "hari ini" bisa beda antara HP di Jakarta dan HP di luar Jawa.
 */
function isSameDay(iso: string, day: Date): boolean {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return false
  return businessDayStart(time) === businessDayStart(day.getTime())
}

export function buildDailyBook(
  products: Product[],
  transactions: Transaction[],
  debts: Debt[],
  stats: DashboardStats,
  now = new Date(),
): DailyBook {
  const salesRows = transactions.filter(
    (row) => row.type === "sale" && isSameDay(row.created_at, now),
  )

  const itemsSold =
    salesRows.reduce((total, row) => total + row.qty, 0) + stats.todayConsignmentItems

  const perProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const row of salesRows) {
    const product = products.find((candidate) => candidate.id === row.product_id)
    if (!product) continue
    const current =
      perProduct.get(product.id) ?? { name: productLabel(product), qty: 0, revenue: 0 }
    current.qty += row.qty
    current.revenue += row.qty * row.unit_price
    perProduct.set(product.id, current)
  }
  const topItems = [...perProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 3)

  const openDebts: DebtDue[] = debts
    .filter((debt) => !debt.settled_at)
    .map((debt) => ({
      id: debt.id,
      debtor: debt.debtor,
      productName: debt.product_name,
      qty: debt.qty,
      unit: debt.unit,
      amount: debt.amount,
      ageDays: Math.max(
        0,
        Math.floor((now.getTime() - new Date(debt.created_at).getTime()) / DAY),
      ),
      createdAt: debt.created_at,
    }))
    .sort((a, b) => b.ageDays - a.ageDays || b.amount - a.amount)

  const debtTotal = openDebts.reduce((sum, debt) => sum + debt.amount, 0)
  const overdueDebts = openDebts.filter((debt) => debt.ageDays >= 7)

  const costWatch = computeCostWatch(products, transactions)
  const modalUp = costWatch.moves
    .map((move) => {
      const product = products.find((candidate) => candidate.id === move.productId)
      const suggestion = product ? suggestSellPrice(product.sell_price, move) : null
      return {
        name: move.name,
        unit: move.unit,
        changePct: move.changePct,
        lastCost: move.lastCost,
        suggestedPrice: suggestion && !suggestion.ok ? suggestion.suggestedPrice : null,
      }
    })
    .slice(0, 3)

  const headline = buildHeadline({
    sales: stats.todaySales,
    transactionCount: stats.todayTransactions,
    itemsSold,
    debtTotal,
    overdueCount: overdueDebts.length,
    lowStockCount: stats.lowStockCount,
    modalUpCount: modalUp.length,
  })

  return {
    date: now.toISOString().slice(0, 10),
    label: longDate(now),
    sales: stats.todaySales,
    grossProfit: stats.todayGrossProfit,
    consignmentCommission: stats.todayConsignmentCommission,
    transactionCount: stats.todayTransactions,
    itemsSold,
    topItems,
    debts: openDebts,
    debtTotal,
    overdueDebts,
    lowStock: stats.lowStock.slice(0, 5).map((product) => ({
      name: productLabel(product),
      stock: product.stock,
      unit: product.unit,
      minStock: product.min_stock,
    })),
    suggestions: stats.suggestions.map((suggestion) => ({
      name: suggestion.name,
      qty: suggestion.suggestedQty,
      unit: suggestion.unit,
      cost: suggestion.estimatedCost,
      reason: suggestion.reason,
    })),
    modalUp,
    headline,
  }
}

interface HeadlineInput {
  sales: number
  transactionCount: number
  itemsSold: number
  debtTotal: number
  overdueCount: number
  lowStockCount: number
  modalUpCount: number
}

/** Satu kalimat ringkas untuk dibaca pemilik warung. */
export function buildHeadline(input: HeadlineInput): string {
  if (input.transactionCount === 0) {
    if (input.lowStockCount > 0) {
      return `Belum ada penjualan hari ini. ${input.lowStockCount} barang tinggal sedikit — siapkan dulu sebelum buka.`
    }
    return "Belum ada penjualan hari ini. Catatan tetap aman, ya."
  }
  const parts = [`Penjualan hari ini ${rupiah(input.sales)} dari ${input.transactionCount} transaksi`]
  if (input.overdueCount > 0) {
    parts.push(`${input.overdueCount} utang sudah lewat 7 hari — tagih besok pagi`)
  } else if (input.debtTotal > 0) {
    parts.push(`Utang berjalan ${rupiah(input.debtTotal)}`)
  }
  if (input.lowStockCount > 0) {
    parts.push(`${input.lowStockCount} barang perlu beli ulang`)
  }
  if (input.modalUpCount > 0) {
    parts.push(`Modal naik di ${input.modalUpCount} barang — cek harga jual`)
  }
  return `${parts.join(". ")}.`
}

/** Ringkasan teks untuk disalin (mis. dikirim ke supplier lewat chat). */
export function buildSummaryText(book: DailyBook): string {
  const lines: string[] = []
  lines.push(`Tutup buku ${book.label}`)
  lines.push(
    `Penjualan ${rupiah(book.sales)} · laba kotor ${rupiah(book.grossProfit)} · ${book.transactionCount} transaksi`,
  )
  if (book.consignmentCommission > 0) {
    lines.push(`Termasuk komisi barang titipan ${rupiah(book.consignmentCommission)}.`)
  }
  if (book.topItems.length > 0) {
    lines.push(
      `Terlaris: ${book.topItems.map((item) => `${item.name} ${numberID(item.qty)}`).join(", ")}`,
    )
  }
  if (book.debts.length > 0) {
    lines.push(
      `Utang berjalan ${rupiah(book.debtTotal)} (${book.debts.length} catatan${
        book.overdueDebts.length > 0 ? `, ${book.overdueDebts.length} lewat 7 hari` : ""
      })`,
    )
  }
  if (book.suggestions.length > 0) {
    lines.push(
      `Saran kulakan: ${book.suggestions
        .map((item) => `${item.name} ${numberID(item.qty)} ${item.unit}`)
        .join(", ")}`,
    )
  }
  if (book.modalUp.length > 0) {
    lines.push(
      `Modal naik: ${book.modalUp
        .map(
          (item) =>
            `${item.name} ${item.changePct >= 0 ? "+" : "−"}${numberID(Math.abs(item.changePct), 1)}%`,
        )
        .join(", ")}`,
    )
  }
  return lines.join("\n")
}
