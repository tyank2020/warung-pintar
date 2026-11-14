import { numberID, productLabel, rupiah } from "./format"
import type { Product, Transaction } from "./types"

/**
 * Modal mati — modal warung yang tertahan di rak tanpa pernah bergerak.
 *
 * Kasir biasa hanya menampilkan barang terlaris. Yang warung butuhkan
 * kebalikannya: berapa uang yang diam di rak, barang apa, dan apa yang
 * harus dilakukan. Semua dihitung dari transaksi sendiri.
 */

const DAY = 24 * 60 * 60 * 1000

export interface DeadStockItem {
  productId: string
  name: string
  unit: string
  stock: number
  buyPrice: number
  /** Nilai modal yang tertahan: stok × harga modal. */
  value: number
  /** Hari sejak terakhir terjual; null kalau belum pernah laku. */
  daysSinceLastSale: number | null
  lastSaleAt: string | null
  soldLast90: number
  /** Saran tindakan, selalu berbasis data yang ada. */
  suggestion: string
  /** True kalau ini nilainya yang paling besar. */
  isBiggest: boolean
}

export interface DeadStockReport {
  items: DeadStockItem[]
  totalValue: number
  totalInventoryValue: number
  /** Porsi nilai persediaan yang tertahan (persen). */
  sharePct: number
  count: number
}

export interface DeadStockOptions {
  /** Minimal hari tanpa penjualan supaya barang dianggap mati. */
  minIdleDays?: number
  /** Minimal nilai modal (rupiah) supaya tidak jadi noise. */
  minValue?: number
  now?: Date
}

export function buildDeadStockReport(
  products: Product[],
  transactions: Transaction[],
  options: DeadStockOptions = {},
): DeadStockReport {
  const minIdleDays = options.minIdleDays ?? 45
  const minValue = options.minValue ?? 20000
  const now = options.now ?? new Date()

  const lastSale = new Map<string, { at: string; time: number }>()
  const soldLast90 = new Map<string, number>()
  const windowStart = now.getTime() - 90 * DAY

  for (const transaction of transactions) {
    if (transaction.type !== "sale") continue
    const time = new Date(transaction.created_at).getTime()
    if (time >= windowStart) {
      soldLast90.set(
        transaction.product_id,
        (soldLast90.get(transaction.product_id) ?? 0) + transaction.qty,
      )
    }
    const current = lastSale.get(transaction.product_id)
    if (!current || time > current.time) {
      lastSale.set(transaction.product_id, { at: transaction.created_at, time })
    }
  }

  // Barang laris: dipakai untuk saran bundling (data nyata, bukan tebakan).
  const fastMovers = [...soldLast90.entries()]
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([productId]) => products.find((product) => product.id === productId))
    .filter((product): product is Product => Boolean(product))
    .slice(0, 3)

  const totalInventoryValue = products.reduce(
    (sum, product) => sum + product.stock * product.buy_price,
    0,
  )

  const items: DeadStockItem[] = []
  for (const product of products) {
    if (product.stock <= 0) continue
    const value = product.stock * product.buy_price
    if (value < minValue) continue

    const sale = lastSale.get(product.id)
    const daysSinceLastSale = sale
      ? Math.max(0, Math.floor((now.getTime() - sale.time) / DAY))
      : null
    const sold = soldLast90.get(product.id) ?? 0
    const idle = daysSinceLastSale === null || daysSinceLastSale >= minIdleDays
    if (!idle) continue
    if (sold >= 5) continue

    const partner = fastMovers.find((candidate) => candidate.id !== product.id)
    let suggestion: string
    if (daysSinceLastSale === null) {
      suggestion = `Belum pernah laku. Modal ${rupiah(value)} tertahan di rak.`
    } else {
      suggestion = `Tidak laku ${daysSinceLastSale} hari. Modal ${rupiah(value)} tertahan di rak.`
    }
    if (partner) {
      suggestion += ` Coba bundling dengan ${partner.name} yang paling laku.`
    } else {
      const marginPct =
        product.sell_price > 0
          ? ((product.sell_price - product.buy_price) / product.sell_price) * 100
          : 0
      if (marginPct > 5) {
        suggestion += ` Turunkan 10% (margin masih ${numberID(marginPct, 1)}%).`
      } else {
        suggestion += ` Marginnya sudah tipis — lebih baik dikembalikan ke supplier.`
      }
    }

    items.push({
      productId: product.id,
      name: productLabel(product),
      unit: product.unit,
      stock: product.stock,
      buyPrice: product.buy_price,
      value,
      daysSinceLastSale,
      lastSaleAt: sale?.at ?? null,
      soldLast90: sold,
      suggestion,
      isBiggest: false,
    })
  }

  items.sort((a, b) => b.value - a.value)
  if (items.length > 0) items[0].isBiggest = true

  const totalValue = items.reduce((sum, item) => sum + item.value, 0)

  return {
    items,
    totalValue,
    totalInventoryValue,
    sharePct:
      totalInventoryValue > 0 ? Math.round((totalValue / totalInventoryValue) * 100) : 0,
    count: items.length,
  }
}

/** Kalimat ringkas untuk kartu di dashboard/tutup buku. */
export function deadStockHeadline(report: DeadStockReport): string {
  if (report.count === 0) return "Tidak ada modal yang tertahan di rak."
  return `${report.count} barang tidak laku — ${rupiah(report.totalValue)} modal nganggur (${report.sharePct}% dari persediaan).`
}
