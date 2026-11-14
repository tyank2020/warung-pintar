import type {
  AdvisorTip,
  ConsignmentSaleRecord,
  DashboardStats,
  DaySales,
  Product,
  PurchaseSuggestion,
  TopProduct,
  Transaction,
  TransactionWithProduct,
} from "./types"
import {
  buildSalesIndex,
  bucketize,
  dailyRange,
  summarizeWindow,
  type Bucket,
  type SalesIndex,
} from "./analytics"
import {
  businessDayKey,
  businessDayLabel,
  businessDayStart,
  businessShortDate,
  DAY_MS,
} from "./calendar"
import { rupiah } from "./format"
import { computeRestockPlan, type RestockSignal } from "./restock"

/** Terima `Date` maupun timestamp, supaya pemanggil lama tidak berubah. */
export function toTime(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value
}

export function productById(products: Product[], id: string): Product | undefined {
  return products.find((product) => product.id === id)
}

export function stockStatus(product: Product): {
  label: "Aman" | "Menipis" | "Kritis"
  tone: "aman" | "menipis" | "kritis"
  percent: number
} {
  const percent = Math.min(
    100,
    Math.round((product.stock / Math.max(product.min_stock * 2, 1)) * 100),
  )
  if (product.stock <= Math.max(1, product.min_stock / 2)) {
    return { label: "Kritis", tone: "kritis", percent }
  }
  if (product.stock <= product.min_stock) {
    return { label: "Menipis", tone: "menipis", percent }
  }
  return { label: "Aman", tone: "aman", percent }
}

interface ConsignmentTotals {
  sales: number
  commission: number
  payable: number
  items: number
  transactions: number
}

function sumConsignmentSales(
  sales: ConsignmentSaleRecord[],
  start: number,
  end: number,
  now: number,
): ConsignmentTotals {
  return sales.reduce<ConsignmentTotals>(
    (total, sale) => {
      const time = Date.parse(sale.createdAt)
      if (!Number.isFinite(time) || time > now || time < start || time >= end) return total
      if (
        !Number.isFinite(sale.omzet) ||
        !Number.isFinite(sale.commission) ||
        !Number.isFinite(sale.qty)
      ) {
        return total
      }
      total.sales += sale.omzet
      total.commission += sale.commission
      total.payable += sale.omzet - sale.commission
      total.items += sale.qty
      total.transactions += 1
      return total
    },
    { sales: 0, commission: 0, payable: 0, items: 0, transactions: 0 },
  )
}

export function withProduct(
  products: Product[],
  transactions: Transaction[],
): TransactionWithProduct[] {
  const byId = new Map(products.map((product) => [product.id, product]))
  const joined: TransactionWithProduct[] = []
  for (const transaction of transactions) {
    const product = byId.get(transaction.product_id)
    if (product) joined.push({ ...transaction, product })
  }
  return joined
}

/**
 * Statistik beranda.
 *
 * Semua angka diambil dari satu indeks penjualan (lihat `analytics.ts`) dan
 * satu mesin saran restok (lihat `restock.ts`), jadi halaman ini, halaman
 * stok, kartu musim, dan view SQL tidak pernah berbeda angka.
 */
export function computeStatsFromIndex(
  products: Product[],
  index: SalesIndex,
  now: Date | number = Date.now(),
  consignmentSales: ConsignmentSaleRecord[] = [],
): DashboardStats {
  const nowMs = toTime(now)
  const productById = new Map(products.map((product) => [product.id, product]))

  // Komisi barang titipan ikut dihitung sebagai keuntungan warung: barangnya
  // bukan milik warung, tapi komisinya nyata masuk ke warung.
  const todayConsignment = sumConsignmentSales(
    consignmentSales,
    businessDayStart(nowMs),
    businessDayStart(nowMs) + DAY_MS,
    nowMs,
  )
  const weekConsignment = sumConsignmentSales(
    consignmentSales,
    businessDayStart(nowMs) - 6 * DAY_MS,
    businessDayStart(nowMs) + DAY_MS,
    nowMs,
  )

  const salesByDay: DaySales[] = dailyRange(index, 7, nowMs).map(({ dayStart, aggregate }) => {
    const consignment = sumConsignmentSales(
      consignmentSales,
      dayStart,
      dayStart + DAY_MS,
      nowMs,
    )
    return {
      date: businessDayKey(dayStart),
      label: businessDayLabel(dayStart),
      sales: aggregate.sales + consignment.sales,
      profit: aggregate.profit + consignment.commission,
      transactions: aggregate.transactions + consignment.transactions,
    }
  })

  const topProducts: TopProduct[] = [...index.window.byProduct.entries()]
    .map(([productId, value]) => {
      const product = productById.get(productId)
      return product
        ? {
            productId,
            name: product.name,
            unit: product.unit,
            qty: value.qty,
            revenue: value.revenue,
          }
        : null
    })
    .filter((item): item is TopProduct => item !== null)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4)

  // Barang yang tidak dijual lagi dikeluarkan dari hitung stok menipis.
  // Barang Kritis/Menipis SELALU ditampilkan, walau belum ada penjualan —
  // stok yang mentok minimum tidak menunggu adanya transaksi.
  const sellableProducts = products.filter((product) => product.archived !== true)
  const lowStock = sellableProducts
    .filter((product) => stockStatus(product).label !== "Aman")
    .sort((a, b) => a.stock / Math.max(a.min_stock, 1) - b.stock / Math.max(b.min_stock, 1))

  const restock = computeRestockPlan(products, index, nowMs)
  const suggestions = restockSignalsToSuggestions(restock.purchases.slice(0, 3))

  const tips: AdvisorTip[] = []
  if (suggestions[0]) {
    const suggestion = suggestions[0]
    tips.push({
      text: `Siapkan sekitar ${suggestion.suggestedQty} ${suggestion.unit} ${suggestion.name} untuk 3 hari ke depan.`,
      reason: suggestion.reason,
    })
  }
  const weekSales = index.window.sales + weekConsignment.sales
  const weekGrossProfit = index.window.profit + weekConsignment.commission
  if (weekSales > 0) {
    tips.push({
      text: `Laba kotor 7 hari terakhir ${rupiah(weekGrossProfit)}.`,
      reason: `Penjualan ${rupiah(weekSales)} dikurangi modal dan bagian pemilik titipan ${rupiah(
        weekSales - weekGrossProfit,
      )}.`,
    })
  }
  if (topProducts[0]) {
    const top = topProducts[0]
    tips.push({
      text: `${top.name} paling banyak terjual (${top.qty} ${top.unit} dalam 7 hari).`,
      reason: `Kontribusi omzet ${rupiah(top.revenue)}.`,
    })
  }
  if (tips.length < 3 && lowStock.length > 0) {
    tips.push({
      text: `${lowStock.length} barang sudah melewati batas stok minimum.`,
      reason: "Buka halaman Stok Barang untuk melihat daftar dan jumlah yang disarankan.",
    })
  }

  const recentTransactions: TransactionWithProduct[] = index.recent
    .map((fact): TransactionWithProduct | null => {
      const product = productById.get(fact.productId)
      return product
        ? {
            id: fact.id,
            type: "sale",
            product_id: fact.productId,
            qty: fact.qty,
            unit_price: fact.unitPrice,
            created_at: new Date(fact.time).toISOString(),
            product,
          }
        : null
    })
    .filter((row): row is TransactionWithProduct => row !== null)

  return {
    todaySales: index.today.sales + todayConsignment.sales,
    todayGrossProfit: index.today.profit + todayConsignment.commission,
    todayConsignmentSales: todayConsignment.sales,
    todayConsignmentCommission: todayConsignment.commission,
    todayConsignmentPayable: todayConsignment.payable,
    todayConsignmentItems: todayConsignment.items,
    weekConsignmentCommission: weekConsignment.commission,
    weekConsignmentSales: weekConsignment.sales,
    weekSales: index.window.sales + weekConsignment.sales,
    weekGrossProfit: index.window.profit + weekConsignment.commission,
    todayTransactions: index.today.transactions + todayConsignment.transactions,
    weekTransactions: index.window.transactions + weekConsignment.transactions,
    totalProducts: sellableProducts.length,
    lowStockCount: lowStock.length,
    lowStock,
    recentTransactions,
    salesByDay,
    topProducts,
    suggestions,
    tips,
  }
}

/** Konversi sinyal restok menjadi bentuk yang dipakai halaman. */
export function restockSignalsToSuggestions(signals: RestockSignal[]): PurchaseSuggestion[] {
  return signals.map((signal) => ({
    productId: signal.productId,
    name: signal.name,
    unit: signal.unit,
    stock: signal.stock,
    avgPerDay: signal.avgPerDay,
    suggestedQty: signal.suggestedQty,
    estimatedCost: signal.estimatedCost,
    reason: signal.reason,
  }))
}

/** Versi lama yang membangun indeks sendiri. */
export function computeStats(
  products: Product[],
  transactions: Transaction[],
  now: Date | number = Date.now(),
): DashboardStats {
  const nowMs = toTime(now)
  const index = buildSalesIndex(products, transactions, nowMs)
  return computeStatsFromIndex(products, index, nowMs)
}

export type ReportPeriod = "7 Hari" | "30 Hari" | "3 Bulan"

export interface ReportPoint {
  label: string
  sales: number
  profit: number
  transactions: number
}

export interface ReportSummary {
  sales: number
  cogs: number
  grossProfit: number
  consignmentCommission: number
  transactions: number
  itemsSold: number
  topProducts: TopProduct[]
}

interface PeriodLayout {
  /** Jumlah titik pada grafik. */
  points: number
  /** Panjang tiap bucket dalam hari. */
  bucketDays: number
  /** Jumlah hari yang dicakup. */
  days: number
  /** Label titik: hari tunggal atau rentang tanggal. */
  label: (start: number, index: number) => string
}

const PERIODS: Record<ReportPeriod, PeriodLayout> = {
  "7 Hari": {
    points: 7,
    bucketDays: 1,
    days: 7,
    label: (start) => businessDayLabel(start),
  },
  "30 Hari": {
    points: 10,
    bucketDays: 3,
    days: 30,
    label: (start) => businessShortDate(start),
  },
  "3 Bulan": {
    points: 12,
    bucketDays: 7,
    days: 84,
    label: (start) => businessShortDate(start),
  },
}

export function reportSeriesFromIndex(
  index: SalesIndex,
  period: ReportPeriod,
  now: Date | number = Date.now(),
  consignmentSales: ConsignmentSaleRecord[] = [],
): ReportPoint[] {
  const layout = PERIODS[period]
  const todayStart = businessDayStart(toTime(now))
  const seriesStart = todayStart - (layout.days - 1) * DAY_MS

  const buckets: Array<{ label: string; start: number; end: number }> = []
  for (let index = 0; index < layout.points; index += 1) {
    const start = seriesStart + index * layout.bucketDays * DAY_MS
    buckets.push({
      label: layout.label(start, index),
      start,
      end: start + layout.bucketDays * DAY_MS,
    })
  }

  const result = bucketize(index, buckets)
  const firstStart = buckets[0]?.start ?? 0
  const lastEnd = buckets[buckets.length - 1]?.end ?? 0
  const width = buckets[0] ? buckets[0].end - buckets[0].start : 0
  for (const sale of consignmentSales) {
    const time = Date.parse(sale.createdAt)
    if (
      !Number.isFinite(time) ||
      time > toTime(now) ||
      time < firstStart ||
      time >= lastEnd ||
      !Number.isFinite(sale.omzet) ||
      !Number.isFinite(sale.commission)
    ) {
      continue
    }
    const position = Math.floor((businessDayStart(time) - firstStart) / width)
    const bucket = result[position]
    if (!bucket) continue
    bucket.sales += sale.omzet
    bucket.profit += sale.commission
    bucket.transactions += 1
  }

  return result.map((bucket: Bucket) => ({
    label: bucket.label,
    sales: bucket.sales,
    profit: bucket.profit,
    transactions: bucket.transactions,
  }))
}

export function reportSummaryFromIndex(
  products: Product[],
  index: SalesIndex,
  period: ReportPeriod,
  now: Date | number = Date.now(),
  consignmentSales: ConsignmentSaleRecord[] = [],
): ReportSummary {
  const layout = PERIODS[period]
  const todayStart = businessDayStart(toTime(now))
  const start = todayStart - (layout.days - 1) * DAY_MS
  const end = todayStart + DAY_MS

  const summary = summarizeWindow(index, start, end)
  const consignment = sumConsignmentSales(consignmentSales, start, end, toTime(now))
  const productById = new Map(products.map((product) => [product.id, product]))

  const topProducts: TopProduct[] = [...summary.byProduct.entries()]
    .map(([productId, value]) => {
      const product = productById.get(productId)
      return product
        ? {
            productId,
            name: product.name,
            unit: product.unit,
            qty: value.qty,
            revenue: value.revenue,
          }
        : null
    })
    .filter((item): item is TopProduct => item !== null)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4)

  return {
    sales: summary.sales + consignment.sales,
    cogs: summary.cogs + consignment.payable,
    grossProfit: summary.grossProfit + consignment.commission,
    consignmentCommission: consignment.commission,
    transactions: summary.transactions + consignment.transactions,
    itemsSold: summary.itemsSold + consignment.items,
    topProducts,
  }
}

export function reportSeries(
  products: Product[],
  transactions: Transaction[],
  period: ReportPeriod,
  now: Date | number = Date.now(),
  consignmentSales: ConsignmentSaleRecord[] = [],
): ReportPoint[] {
  const nowMs = toTime(now)
  const index = buildSalesIndex(products, transactions, nowMs)
  return reportSeriesFromIndex(index, period, nowMs, consignmentSales)
}

export function reportSummary(
  products: Product[],
  transactions: Transaction[],
  period: ReportPeriod,
  now: Date | number = Date.now(),
  consignmentSales: ConsignmentSaleRecord[] = [],
): ReportSummary {
  const nowMs = toTime(now)
  const index = buildSalesIndex(products, transactions, nowMs)
  return reportSummaryFromIndex(products, index, period, nowMs, consignmentSales)
}
