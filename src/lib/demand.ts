/**
 * Proyeksi kebutuhan harian per produk.
 *
 * Dipakai oleh mesin saran restok dan kartu musim supaya keduanya membaca
 * angka yang sama. Tiga lapis:
 *
 *   1. Laju dasar  : qty terjual ÷ hari aktif (bukan dibagi 7 atau 30 tetap)
 *   2. Faktor musim: pola 60 hari ke depan dibandingkan tanggal yang sama
 *                    tahun lalu, jadi event akhir tahun/Ramadan terbaca dari
 *                    transaksi sendiri, bukan dari tebakan
 *   3. Proyeksi    : laju dasar × (1 + (faktor musim − 1) × 0,3)
 *
 * "Hari aktif" dihitung sejak produk pertama terjual, dibatasi jendela
 * analisis. Warung yang baru buka dua hari tidak ikut dibagi 30.
 */

import {
  businessDayKey,
  businessDayStart,
  businessDayStartFromKey,
  sameDayPreviousYear,
  DAY_MS,
} from "./calendar"
import type { SalesIndex } from "./analytics"
import type { Product } from "./types"

/** Keyakinan data: berapa banyak hari penjualan yang jadi dasar hitungan. */
export type DataConfidence = "rendah" | "sedang" | "tinggi"

export interface DemandProfile {
  productId: string
  /** Rata-rata terjual per hari, jendela 30 hari. */
  avgDaily30: number
  /** Rata-rata terjual per hari, jendela 90 hari. */
  avgDaily90: number
  /** Faktor musiman, 0,5–2,5. 1 berarti pola biasa. */
  seasonalFactor: number
  /** Kenaikan musiman dalam persen. */
  upliftPct: number
  /** Rata-rata harian yang dipakai untuk proyeksi. */
  projectedDaily: number
  /** Stok sekarang cukup berapa hari pada proyeksi. */
  daysOfCover: number
  /** Kenaikan 30 hari dibanding 90 hari, dalam persen. */
  trendPct: number
  /** Jumlah hari data yang dipakai. */
  dataDays: number
  confidence: DataConfidence
}

export interface DemandOptions {
  /** Panjang jendela laju dasar. Default 30 hari. */
  windowDays?: number
  /** Panjang jendela pembanding musiman. Default 60 hari. */
  seasonWindowDays?: number
}

function confidenceForDays(days: number): DataConfidence {
  if (days >= 14) return "tinggi"
  if (days >= 7) return "sedang"
  return "rendah"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Hitung profil kebutuhan semua produk.
 * Satu lintasan atas peta hari per produk, bukan per produk.
 */
export function computeDemandProfiles(
  products: Product[],
  index: SalesIndex,
  now: number = Date.now(),
  options: DemandOptions = {},
): Map<string, DemandProfile> {
  const windowDays = options.windowDays ?? 30
  const seasonWindowDays = options.seasonWindowDays ?? 60

  const todayStart = businessDayStart(now)
  const windowStart = todayStart - (windowDays - 1) * DAY_MS
  const longStart = todayStart - (Math.max(windowDays, 90) - 1) * DAY_MS

  // Kunci hari untuk 60 hari ke depan beserta padanannya tahun lalu.
  // Dihitung sekali untuk semua produk, bukan sekali per produk.
  const seasonDays: Array<{ futureDayStart: number; pastDayStart: number }> = []
  for (let offset = 1; offset <= seasonWindowDays; offset += 1) {
    const futureDayStart = todayStart + offset * DAY_MS
    const futureKey = businessDayKey(futureDayStart)
    const pastKey = sameDayPreviousYear(futureKey)
    seasonDays.push({
      futureDayStart,
      pastDayStart: businessDayStartFromKey(pastKey),
    })
  }

  const profiles = new Map<string, DemandProfile>()

  for (const product of products) {
    if (product.archived === true) continue
    const days = index.productDayQty.get(product.id)

    let qty30 = 0
    let qty90 = 0
    let qtyAll = 0
    let firstSaleDay = Number.POSITIVE_INFINITY
    let sellingDaysInWindow = 0

    if (days) {
      for (const [dayStart, qty] of days) {
        if (dayStart < firstSaleDay) firstSaleDay = dayStart
        qtyAll += qty
        if (dayStart >= windowStart) {
          qty30 += qty
          sellingDaysInWindow += 1
        }
        if (dayStart >= longStart) qty90 += qty
      }
    }

    const hasSales = Number.isFinite(firstSaleDay)
    const liveFrom = hasSales ? Math.max(firstSaleDay, windowStart) : windowStart
    const liveDays = hasSales ? Math.max(1, Math.round((todayStart - liveFrom) / DAY_MS) + 1) : 0
    const liveDaysLong = hasSales
      ? Math.max(1, Math.round((todayStart - Math.max(firstSaleDay, longStart)) / DAY_MS) + 1)
      : 0
    // Pembanding musim memakai seluruh histori, jadi pembaginya seluruh hari
    // sejak produk pertama terjual.
    const liveDaysAll = hasSales
      ? Math.max(1, Math.round((todayStart - firstSaleDay) / DAY_MS) + 1)
      : 0

    const avgDaily30 = liveDays > 0 ? qty30 / liveDays : 0
    const avgDaily90 = liveDaysLong > 0 ? qty90 / liveDaysLong : 0

    // Bandingkan 60 hari ke depan dengan tanggal yang sama tahun lalu.
    // Cara ini menangkap event (akhir tahun, Lebaran) tanpa mengarang faktor.
    let seasonQty = 0
    let seasonDayCount = 0
    if (days) {
      for (const { pastDayStart } of seasonDays) {
        if (!Number.isFinite(pastDayStart)) continue
        const past = days.get(pastDayStart)
        if (past === undefined) continue
        seasonQty += past
        seasonDayCount += 1
      }
    }

    const overallDaily = liveDaysAll > 0 ? qtyAll / liveDaysAll : 0
    const seasonDaily = seasonDayCount > 0 ? seasonQty / seasonDayCount : 0
    const seasonalFactor =
      overallDaily > 0 && seasonDayCount > 0 ? clamp(seasonDaily / overallDaily, 0.5, 2.5) : 1

    const baseDaily = avgDaily30 * 0.7 + avgDaily90 * 0.3
    const projectedDaily = baseDaily * (1 + (seasonalFactor - 1) * 0.3)
    const daysOfCover =
      projectedDaily > 0 ? product.stock / projectedDaily : Number.POSITIVE_INFINITY
    const trendPct = avgDaily90 > 0 ? (avgDaily30 / avgDaily90 - 1) * 100 : 0

    profiles.set(product.id, {
      productId: product.id,
      avgDaily30,
      avgDaily90,
      seasonalFactor,
      upliftPct: (seasonalFactor - 1) * 100,
      projectedDaily,
      daysOfCover: Number.isFinite(daysOfCover) ? daysOfCover : 999,
      trendPct,
      dataDays: liveDays,
      confidence: confidenceForDays(liveDays),
    })
  }

  return profiles
}
