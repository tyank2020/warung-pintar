/**
 * Indeks penjualan satu kali lintasan.
 *
 * Halaman lama menyaring dan mengurutkan thousands transaksi berulang kali:
 * `computeStats` menyaring 7× untuk grafik 7 hari, `reportSeries` menyaring
 * 10–12× untuk grafik 30 hari, lalu semuanya diurutkan penuh hanya untuk
 * mengambil 6 baris terbaru. Sekarang semua itu dihitung dalam satu lintasan
 * dan disimpan sebagai indeks.
 */

import { businessDayKey, businessDayStart, DAY_MS } from "./calendar"
import type { Product, Transaction } from "./types"

export interface SaleFact {
  id: string
  productId: string
  qty: number
  unitPrice: number
  /** qty × harga jual. */
  revenue: number
  /** qty × harga modal. */
  cogs: number
  /** Timestamp transaksi. */
  time: number
  /** Timestamp awal hari bisnis. */
  dayStart: number
}

export interface DailyAggregate {
  sales: number
  profit: number
  transactions: number
  items: number
}

export interface ProductAggregate {
  qty: number
  revenue: number
  cogs: number
  transactions: number
}

export interface SalesIndex {
  /** Semua baris penjualan yang produknya masih ada. */
  sales: SaleFact[]
  /** Agregasi per hari, di-key dengan timestamp awal hari. */
  daily: Map<number, DailyAggregate>
  /** Agregasi per produk (semua histori). */
  byProduct: Map<string, ProductAggregate>
  /** Jumlah terjual per produk per hari, di-key dengan timestamp awal hari. */
  productDayQty: Map<string, Map<number, number>>
  /** Penjualan dalam jendela terakhir. */
  window: {
    sales: number
    profit: number
    transactions: number
    items: number
    byProduct: Map<string, { qty: number; revenue: number }>
  }
  /** Penjualan hari ini. */
  today: DailyAggregate
  /** N transaksi terbaru, sudah terurut. */
  recent: SaleFact[]
  /** Waktu transaksi paling awal dan paling akhir. */
  earliest: number
  latest: number
  /** Jumlah hari berbeda yang punya transaksi penjualan. */
  activeDays: number
}

const EMPTY_DAILY: DailyAggregate = { sales: 0, profit: 0, transactions: 0, items: 0 }

function emptyDaily(): DailyAggregate {
  return { sales: 0, profit: 0, transactions: 0, items: 0 }
}

function emptyProduct(): ProductAggregate {
  return { qty: 0, revenue: 0, cogs: 0, transactions: 0 }
}

/**
 * Sisipkan ke daftar kecil yang sudah terurut menurun.
 * Dipakai untuk mengambil N terbaru tanpa mengurutkan seluruh histori.
 */
function insertRecent(list: SaleFact[], fact: SaleFact, limit: number) {
  if (list.length === limit && fact.time <= list[list.length - 1].time) return
  let index = list.length
  while (index > 0 && list[index - 1].time < fact.time) index -= 1
  list.splice(index, 0, fact)
  if (list.length > limit) list.pop()
}

export interface BuildIndexOptions {
  /** Panjang jendela "hari ini" dan "7 hari terakhir". Default 7. */
  windowDays?: number
  /** Berapa transaksi terbaru yang perlu disimpan. Default 6. */
  recentLimit?: number
}

export function buildSalesIndex(
  products: Product[],
  transactions: Transaction[],
  now: number = Date.now(),
  options: BuildIndexOptions = {},
): SalesIndex {
  const windowDays = options.windowDays ?? 7
  const recentLimit = options.recentLimit ?? 6

  const productById = new Map(products.map((product) => [product.id, product]))
  const todayStart = businessDayStart(now)
  const windowStart = todayStart - (windowDays - 1) * DAY_MS

  const sales: SaleFact[] = []
  const daily = new Map<number, DailyAggregate>()
  const byProduct = new Map<string, ProductAggregate>()
  const productDayQty = new Map<string, Map<number, number>>()
  const windowByProduct = new Map<string, { qty: number; revenue: number }>()
  const recent: SaleFact[] = []
  const activeDays = new Set<number>()

  let windowSales = 0
  let windowProfit = 0
  let windowTransactions = 0
  let windowItems = 0
  let todaySales = 0
  let todayProfit = 0
  let todayTransactions = 0
  let todayItems = 0
  let earliest = Number.POSITIVE_INFINITY
  let latest = Number.NEGATIVE_INFINITY

  for (const transaction of transactions) {
    if (transaction.type !== "sale") continue

    const product = productById.get(transaction.product_id)
    if (!product) continue

    const time = Date.parse(transaction.created_at)
    if (!Number.isFinite(time)) continue
    // Transaksi yang bertanggal di masa depan tidak dihitung. Kesalahan tanggal
    // di perangkat tidak boleh jadi omzet atau saran restok.
    if (time > now) continue

    const revenue = transaction.qty * transaction.unit_price
    const cogs = transaction.qty * product.buy_price
    const dayStart = businessDayStart(time)

    const fact: SaleFact = {
      id: transaction.id,
      productId: transaction.product_id,
      qty: transaction.qty,
      unitPrice: transaction.unit_price,
      revenue,
      cogs,
      time,
      dayStart,
    }
    sales.push(fact)

    // Agregasi harian.
    let day = daily.get(dayStart)
    if (!day) {
      day = emptyDaily()
      daily.set(dayStart, day)
    }
    day.sales += revenue
    day.profit += revenue - cogs
    day.transactions += 1
    day.items += transaction.qty

    // Agregasi per produk.
    let productTotal = byProduct.get(transaction.product_id)
    if (!productTotal) {
      productTotal = emptyProduct()
      byProduct.set(transaction.product_id, productTotal)
    }
    productTotal.qty += transaction.qty
    productTotal.revenue += revenue
    productTotal.cogs += cogs
    productTotal.transactions += 1

    // Jumlah terjual per hari per produk.
    let days = productDayQty.get(transaction.product_id)
    if (!days) {
      days = new Map<number, number>()
      productDayQty.set(transaction.product_id, days)
    }
    days.set(dayStart, (days.get(dayStart) ?? 0) + transaction.qty)

    // Jendela 7 hari terakhir.
    if (dayStart >= windowStart) {
      windowSales += revenue
      windowProfit += revenue - cogs
      windowTransactions += 1
      windowItems += transaction.qty
      const current = windowByProduct.get(transaction.product_id) ?? { qty: 0, revenue: 0 }
      current.qty += transaction.qty
      current.revenue += revenue
      windowByProduct.set(transaction.product_id, current)
    }

    // Hari ini.
    if (dayStart === todayStart) {
      todaySales += revenue
      todayProfit += revenue - cogs
      todayTransactions += 1
      todayItems += transaction.qty
    }

    activeDays.add(dayStart)
    if (time < earliest) earliest = time
    if (time > latest) latest = time
    insertRecent(recent, fact, recentLimit)
  }

  return {
    sales,
    daily,
    byProduct,
    productDayQty,
    window: {
      sales: windowSales,
      profit: windowProfit,
      transactions: windowTransactions,
      items: windowItems,
      byProduct: windowByProduct,
    },
    today: {
      sales: todaySales,
      profit: todayProfit,
      transactions: todayTransactions,
      items: todayItems,
    },
    recent,
    earliest: Number.isFinite(earliest) ? earliest : now,
    latest: Number.isFinite(latest) ? latest : now,
    activeDays: activeDays.size,
  }
}

/**
 * Bagi penjualan ke beberapa bucket yang berdampingan.
 * Bucket harus rata lebar dan berurutan, jadi indeks bucket dihitung
 * secara aritmetika, bukan dengan menyaring ulang.
 */
export interface Bucket {
  label: string
  start: number
  end: number
  sales: number
  profit: number
  transactions: number
}

export function bucketize(
  index: SalesIndex,
  buckets: Array<{ label: string; start: number; end: number }>,
): Bucket[] {
  const result: Bucket[] = buckets.map((bucket) => ({
    ...bucket,
    sales: 0,
    profit: 0,
    transactions: 0,
  }))

  if (result.length === 0) return result

  const firstStart = result[0].start
  const lastEnd = result[result.length - 1].end
  const width = result[0].end - result[0].start

  for (const fact of index.sales) {
    if (fact.time < firstStart || fact.time >= lastEnd) continue
    const position = Math.floor((fact.dayStart - firstStart) / width)
    if (position < 0 || position >= result.length) continue
    const bucket = result[position]
    bucket.sales += fact.revenue
    bucket.profit += fact.revenue - fact.cogs
    bucket.transactions += 1
  }

  return result
}

/** Ringkasan periode dari indeks, tanpa menyaring ulang transaksi. */
export function summarizeWindow(
  index: SalesIndex,
  start: number,
  end: number,
): {
  sales: number
  cogs: number
  grossProfit: number
  transactions: number
  itemsSold: number
  byProduct: Map<string, { qty: number; revenue: number; cogs: number }>
} {
  let sales = 0
  let cogs = 0
  let transactions = 0
  let itemsSold = 0
  const byProduct = new Map<string, { qty: number; revenue: number; cogs: number }>()

  for (const fact of index.sales) {
    if (fact.time < start || fact.time >= end) continue
    sales += fact.revenue
    cogs += fact.cogs
    transactions += 1
    itemsSold += fact.qty
    const current = byProduct.get(fact.productId) ?? { qty: 0, revenue: 0, cogs: 0 }
    current.qty += fact.qty
    current.revenue += fact.revenue
    current.cogs += fact.cogs
    byProduct.set(fact.productId, current)
  }

  return { sales, cogs, grossProfit: sales - cogs, transactions, itemsSold, byProduct }
}

/** Agregasi harian untuk rentang hari tertentu, termasuk hari tanpa transaksi. */
export function dailyRange(
  index: SalesIndex,
  days: number,
  now: number,
): Array<{ dayStart: number; dayKey: string; aggregate: DailyAggregate }> {
  const todayStart = businessDayStart(now)
  const result: Array<{ dayStart: number; dayKey: string; aggregate: DailyAggregate }> = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dayStart = todayStart - offset * DAY_MS
    const dayKey = businessDayKey(dayStart)
    result.push({
      dayStart,
      dayKey,
      aggregate: index.daily.get(dayStart) ?? EMPTY_DAILY,
    })
  }
  return result
}
