import { businessDate, businessDayKey, businessDayStart } from "./calendar"
import { numberID, rupiah } from "./format"
import type { RestockSignal } from "./restock"
import type { Debt, Product, Transaction } from "./types"

/**
 * Membaca buku dagang.
 *
 * Dua hal yang tidak bisa dilihat kasir biasa:
 * 1. **Pola** — apa yang berubah dibanding minggu lalu, transaksi kecil yang
 *    tidak biasa, penjualan di bawah harga modal, dan jam-jam ganjil.
 * 2. **Belanja besok** — pola penjualan per hari dalam seminggu + hari gajian
 *    (tanggal 25–5) yang jadi acuan, semua dihitung dari transaksi sendiri.
 *
 * Angka di sini selalu dari data. AI cuma menyusun kalimatnya.
 */

const DAY = 24 * 60 * 60 * 1000

export interface LedgerDay {
  date: string
  label: string
  /** 0 = Minggu … 6 = Sabtu. */
  weekday: number
  sales: number
  transactions: number
  itemsSold: number
}

export interface LedgerDigest {
  days: LedgerDay[]
  /** Rata-rata omzet per hari dalam seminggu (index 0 = Minggu). */
  weekdayAvg: number[]
  /** Rata-rata omzet pada hari gajian (tanggal 25–5). */
  paydayAvg: number
  /** Rata-rata omzet pada hari biasa. */
  regularAvg: number
  /** Berapa kali lipat hari gajian lebih ramai dari hari biasa. */
  paydayRatio: number
  /** Rata-rata omzet harian seluruh periode (untuk membandingkan pola hari). */
  overallDailyAvg: number
  /** Rata-rata jumlah laku per barang per hari (30 hari terakhir). */
  productDaily: Array<{ productId: string; avgQtyPerDay: number }>
  /** Transaksi dengan nilai kecil (di bawah ambang). */
  tinySales: number
  tinyThreshold: number
  /** Transaksi yang harganya di bawah harga modal. */
  belowCostSales: number
  /** Transaksi yang tercatat di luar jam warung. */
  oddHourSales: number
  totalSales: number
  totalTransactions: number
  itemsSold: number
  lastWeekSales: number
  prevWeekSales: number
  topItems: Array<{ name: string; qty: number; revenue: number }>
  openDebtTotal: number
  openDebtCount: number
}

const TINY_THRESHOLD = 5000

/**
 * Hari gajian: tanggal 25 sampai 5 (akhir & awal bulan).
 * Tanggal diambil dari zona waktu warung, sama dengan hitungan hari lain.
 */
export function isPayday(date: Date): boolean {
  const day = Number(businessDayKey(date.getTime()).slice(8, 10))
  return day >= 25 || day <= 5
}

export function buildLedgerDigest(
  products: Product[],
  transactions: Transaction[],
  debts: Debt[],
  now = new Date(),
  windowDays = 30,
): LedgerDigest {
  // Jendela dihitung per hari warung (WIB), sama dengan angka penjualan
  // hari ini dan view SQL. Kalau pakai jam perangkat, "30 hari terakhir"
  // bisa bergeser satu hari di zona waktu yang beda.
  const today = businessDayStart(now.getTime())
  const from = today - (windowDays - 1) * DAY

  const perDay = new Map<string, LedgerDay>()
  for (let offset = 0; offset < windowDays; offset += 1) {
    const dayStart = from + offset * DAY
    const key = businessDayKey(dayStart)
    const date = businessDate(dayStart)
    perDay.set(key, {
      date: key,
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      weekday: date.getDay(),
      sales: 0,
      transactions: 0,
      itemsSold: 0,
    })
  }

  const weekdayTotals = new Array(7).fill(0)
  const weekdayCounts = new Array(7).fill(0)
  const paydayTotals: number[] = []
  const regularTotals: number[] = []
  let tinySales = 0
  let belowCostSales = 0
  let oddHourSales = 0
  let totalSales = 0
  let totalTransactions = 0
  let itemsSold = 0

  const perProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  const qtyPerProduct = new Map<string, number>()

  for (const transaction of transactions) {
    if (transaction.type !== "sale") continue
    const time = new Date(transaction.created_at).getTime()
    if (time < from) continue
    const product = products.find((candidate) => candidate.id === transaction.product_id)
    const amount = transaction.qty * transaction.unit_price
    const key = businessDayKey(Date.parse(transaction.created_at))
    const day = perDay.get(key)
    if (day) {
      day.sales += amount
      day.transactions += 1
      day.itemsSold += transaction.qty
    }

    weekdayTotals[new Date(transaction.created_at).getDay()] += amount
    weekdayCounts[new Date(transaction.created_at).getDay()] += 1
    if (isPayday(new Date(transaction.created_at))) paydayTotals.push(amount)
    else regularTotals.push(amount)

    if (amount < TINY_THRESHOLD) tinySales += 1
    if (product && transaction.unit_price < product.buy_price) belowCostSales += 1
    const hour = new Date(transaction.created_at).getHours()
    if (hour < 6 || hour >= 22) oddHourSales += 1

    totalSales += amount
    totalTransactions += 1
    itemsSold += transaction.qty

    if (product) {
      const current = perProduct.get(product.id) ?? { name: product.name, qty: 0, revenue: 0 }
      current.qty += transaction.qty
      current.revenue += amount
      perProduct.set(product.id, current)
      qtyPerProduct.set(product.id, (qtyPerProduct.get(product.id) ?? 0) + transaction.qty)
    }
  }

  const weekdayAvg = weekdayTotals.map((total, index) =>
    weekdayCounts[index] > 0 ? Math.round(total / weekdayCounts[index]) : 0,
  )

  const paydayAvg = paydayTotals.length
    ? Math.round(paydayTotals.reduce((a, b) => a + b, 0) / paydayTotals.length)
    : 0
  const regularAvg = regularTotals.length
    ? Math.round(regularTotals.reduce((a, b) => a + b, 0) / regularTotals.length)
    : 0
  const paydayRatio = regularAvg > 0 ? Math.round((paydayAvg / regularAvg) * 100) / 100 : 1

  const weekAgo = today - 7 * DAY
  const twoWeeksAgo = today - 14 * DAY
  let lastWeekSales = 0
  let prevWeekSales = 0
  for (const transaction of transactions) {
    if (transaction.type !== "sale") continue
    const time = new Date(transaction.created_at).getTime()
    const amount = transaction.qty * transaction.unit_price
    if (time >= weekAgo) lastWeekSales += amount
    else if (time >= twoWeeksAgo) prevWeekSales += amount
  }

  const openDebts = debts.filter((debt) => !debt.settled_at)

  return {
    days: [...perDay.values()],
    weekdayAvg,
    paydayAvg,
    regularAvg,
    paydayRatio,
    overallDailyAvg: Math.round(totalSales / windowDays),
    productDaily: [...qtyPerProduct.entries()].map(([productId, qty]) => ({
      productId,
      avgQtyPerDay: Math.round((qty / windowDays) * 100) / 100,
    })),
    tinySales,
    tinyThreshold: TINY_THRESHOLD,
    belowCostSales,
    oddHourSales,
    totalSales,
    totalTransactions,
    itemsSold,
    lastWeekSales,
    prevWeekSales,
    topItems: [...perProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    openDebtTotal: openDebts.reduce((sum, debt) => sum + debt.amount, 0),
    openDebtCount: openDebts.length,
  }
}

/**
 * Temuan deterministik dari buku dagang — fakta yang bisa diperiksa sendiri.
 * Ini yang diberikan ke AI sebagai DATA; AI tidak boleh mengarang angka lain.
 */
export function ledgerInsights(digest: LedgerDigest): string[] {
  const insights: string[] = []

  if (digest.lastWeekSales > 0 && digest.prevWeekSales > 0) {
    const diff = digest.lastWeekSales - digest.prevWeekSales
    const pct = Math.round((diff / digest.prevWeekSales) * 100)
    if (Math.abs(pct) >= 10) {
      insights.push(
        `Omzet 7 hari terakhir ${diff > 0 ? "naik" : "turun"} ${numberID(Math.abs(pct))}% dibanding 7 hari sebelumnya (${rupiah(digest.lastWeekSales)} vs ${rupiah(digest.prevWeekSales)}).`,
      )
    }
  }

  if (digest.tinySales > 0) {
    insights.push(
      `Ada ${digest.tinySales} transaksi bernilai di bawah ${rupiah(digest.tinyThreshold)} dalam ${digest.days.length} hari terakhir.`,
    )
  }

  if (digest.belowCostSales > 0) {
    insights.push(
      `${digest.belowCostSales} penjualan tercatat dengan harga di bawah harga modal barang.`,
    )
  }

  if (digest.oddHourSales > 0) {
    insights.push(
      `${digest.oddHourSales} transaksi tercatat di luar jam warung (sebelum jam 6 pagi atau setelah jam 10 malam).`,
    )
  }

  if (digest.paydayRatio >= 1.15) {
    insights.push(
      `Hari gajian (tanggal 25–5) rata-rata ${numberID(digest.paydayRatio, 2)}× lebih ramai dari hari biasa.`,
    )
  }

  if (digest.openDebtCount > 0) {
    insights.push(
      `Ada ${digest.openDebtCount} catatan utang belum lunas, total ${rupiah(digest.openDebtTotal)}.`,
    )
  }

  return insights
}

/** Konteks ringkas untuk AI — hanya angka yang sudah dihitung aplikasi. */
export function ledgerContext(digest: LedgerDigest) {
  return {
    periodeHari: digest.days.length,
    omzetPeriode: digest.totalSales,
    transaksiPeriode: digest.totalTransactions,
    barangTerjual: digest.itemsSold,
    omzet7HariTerakhir: digest.lastWeekSales,
    omzet7Sebelumnya: digest.prevWeekSales,
    rataOmzetPerHariDalamMinggu: digest.weekdayAvg,
    hariGajian: {
      rataOmzet: digest.paydayAvg,
      rataOmzetHariBiasa: digest.regularAvg,
      rasio: digest.paydayRatio,
    },
    transaksiNilaiKecil: digest.tinySales,
    penjualanDiBawahModal: digest.belowCostSales,
    transaksiDiLuarJamWarung: digest.oddHourSales,
    produkTerlaris: digest.topItems.map((item) => ({
      nama: item.name,
      qty: item.qty,
      omzet: item.revenue,
    })),
    utangBelumLunas: {
      catatan: digest.openDebtCount,
      total: digest.openDebtTotal,
    },
    penjualanHarian: digest.days.map((day) => ({
      tanggal: day.label,
      omzet: day.sales,
      transaksi: day.transactions,
    })),
  }
}

export interface PurchasePlanItem {
  productId: string
  name: string
  unit: string
  stock: number
  /** Perkiraan laku besok, dari pola hari yang sama. */
  expectedTomorrow: number
  /** Sisa stok untuk berapa hari ke depan. */
  daysOfCover: number
  suggestedQty: number
  estimatedCost: number
  priority: "tinggi" | "sedang" | "rendah"
  reason: string
}

/**
 * Belanja besok: pola per hari dalam seminggu + hari gajian, dihitung dari
 * transaksi 8 minggu terakhir. Jangan pakai tebakan.
 *
 * Perkiraan laku besok per barang = rata-rata laku harian barang itu
 * × faktor hari (hari itu lebih ramai/sepi dari rata-rata)
 * × faktor gajian. Setiap barang punya angkanya sendiri — bukan
 * memakai porsi omzet barang lain.
 */
export function buildPurchasePlan(
  products: Product[],
  digest: LedgerDigest,
  tomorrow: Date,
  restock?: Map<string, RestockSignal>,
): PurchasePlanItem[] {
  const weekday = tomorrow.getDay()
  const items: PurchasePlanItem[] = []

  // Faktor pola hari: rata-rata omzet hari itu dibanding rata-rata harian.
  const weekdayFactor =
    digest.overallDailyAvg > 0
      ? (digest.weekdayAvg[weekday] || digest.overallDailyAvg) / digest.overallDailyAvg
      : 1
  const paydayFactor =
    isPayday(tomorrow) && digest.paydayRatio > 1 ? Math.min(digest.paydayRatio, 2) : 1

  const dailyByProduct = new Map(
    digest.productDaily.map((item) => [item.productId, item.avgQtyPerDay]),
  )

  for (const product of products) {
    if (product.stock <= 0) continue
    const avgDaily = dailyByProduct.get(product.id) ?? 0
    if (avgDaily <= 0) continue

    const expected = Math.max(1, Math.round(avgDaily * weekdayFactor * paydayFactor))
    const daysOfCover = product.stock / expected
    if (daysOfCover > 3) continue

    const suggestedQty =
      restock?.get(product.id)?.suggestedQty ??
      Math.max(1, Math.ceil(expected * 3 - product.stock))
    const priority: PurchasePlanItem["priority"] =
      daysOfCover <= 1 ? "tinggi" : daysOfCover <= 2 ? "sedang" : "rendah"

    items.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      stock: product.stock,
      expectedTomorrow: expected,
      daysOfCover: Math.round(daysOfCover * 10) / 10,
      suggestedQty,
      estimatedCost: suggestedQty * product.buy_price,
      priority,
      reason: `Stok ${product.stock} ${product.unit}, diperkirakan laku ${expected} ${product.unit} besok — sisa ${numberID(daysOfCover, 1)} hari.`,
    })
  }

  return items
    .sort((a, b) => a.daysOfCover - b.daysOfCover || b.estimatedCost - a.estimatedCost)
    .slice(0, 5)
}
