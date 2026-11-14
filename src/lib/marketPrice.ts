import { numberID, rupiah } from "./format"
import type { Product } from "./types"

/**
 * Radar harga pasar — versi yang jujur.
 *
 * Tidak ada sumber publik yang memberi harga warung sebelah per barang, jadi
 * data pasar dikumpulkan dari warung-warung yang memakai aplikasi ini
 * (crowd-sourced). Setiap laporan dicatat dengan sumber dan waktunya, jadi
 * bisa ditelusuri. Angka pasar dipakai sebagai **pembanding**, dan saran
 * harga selalu dihitung dari margin milik warung sendiri.
 */

const DAY = 24 * 60 * 60 * 1000

export interface MarketReport {
  id: string
  productId: string
  productName: string
  /** Harga yang dilaporkan di pasar. */
  price: number
  /** Nama sumber, mis. "Warung sebelah". */
  sourceName: string
  reportedAt: string
}

export type PriceAction = "turunkan" | "naikkan" | "jaga"

export interface PriceAdvice {
  action: PriceAction
  /** Harga yang disarankan (sama dengan harga sekarang kalau "jaga"). */
  suggestedPrice: number
  /** Selisih harga Anda vs harga pasar. */
  gap: number
  marginBefore: number
  marginAfter: number
  message: string
}

/**
 * Saran harga dari perbandingan harga pasar + harga modal sendiri.
 * Kalau harga pasar lebih dari 10% di bawah harga Anda, sarankan turun —
 * tapi hanya kalau margin masih aman (minimal 10%).
 */
export function priceAdvice(
  mySellPrice: number,
  marketPrice: number,
  buyPrice: number,
): PriceAdvice {
  const gap = mySellPrice - marketPrice
  const marginBefore = mySellPrice > 0 ? ((mySellPrice - buyPrice) / mySellPrice) * 100 : 0
  const ratio = mySellPrice > 0 ? marketPrice / mySellPrice : 1

  if (marketPrice <= 0 || mySellPrice <= 0) {
    return {
      action: "jaga",
      suggestedPrice: mySellPrice,
      gap: 0,
      marginBefore,
      marginAfter: marginBefore,
      message: "Belum ada harga pasar yang bisa dibandingkan.",
    }
  }

  if (ratio >= 1.1) {
    return {
      action: "naikkan",
      suggestedPrice: mySellPrice,
      gap,
      marginBefore,
      marginAfter: marginBefore,
      message: `Harga pasar ${rupiah(marketPrice)} lebih tinggi dari harga Anda (${rupiah(mySellPrice)}) — ada ruang naik.`,
    }
  }

  if (ratio <= 0.9) {
    const candidate = Math.max(buyPrice, marketPrice)
    const marginAfter = candidate > 0 ? ((candidate - buyPrice) / candidate) * 100 : 0
    if (marginAfter >= 10) {
      return {
        action: "turunkan",
        suggestedPrice: Math.round(candidate / 100) * 100,
        gap,
        marginBefore,
        marginAfter,
        message: `Harga pasar ${rupiah(marketPrice)} lebih murah dari harga Anda (${rupiah(mySellPrice)}). Turunkan ke ${rupiah(Math.round(candidate / 100) * 100)} — margin masih ${numberID(marginAfter, 1)}%.`,
      }
    }
    return {
      action: "jaga",
      suggestedPrice: mySellPrice,
      gap,
      marginBefore,
      marginAfter: marginBefore,
      message: `Harga pasar ${rupiah(marketPrice)} lebih murah, tapi kalau ikut turun margin tinggal ${numberID(marginAfter, 1)}% — pakai bundling, bukan potong harga.`,
    }
  }

  return {
    action: "jaga",
    suggestedPrice: mySellPrice,
    gap,
    marginBefore,
    marginAfter: marginBefore,
    message: `Harga Anda ${rupiah(mySellPrice)} sudah sebanding dengan harga pasar ${rupiah(marketPrice)}.`,
  }
}

export interface MarketProduct {
  productId: string
  name: string
  unit: string
  myPrice: number
  buyPrice: number
  /** Harga pasar terbaru yang dilaporkan. */
  marketPrice: number
  /** Berapa laporan yang dipakai untuk menghitung. */
  reportCount: number
  /** Berapa sumber berbeda yang melapor. */
  sourceCount: number
  latestAt: string
  advice: PriceAdvice
}

/**
 * Rangkuman per barang: harga pasar terbaru (median laporan 7 hari
 * terakhir), jumlah laporan, jumlah sumber, dan sarannya.
 */
export function buildMarketSummary(
  products: Product[],
  reports: MarketReport[],
  now = new Date(),
  windowDays = 7,
): MarketProduct[] {
  const from = now.getTime() - windowDays * DAY
  const byProduct = new Map<string, MarketReport[]>()

  for (const report of reports) {
    if (new Date(report.reportedAt).getTime() < from) continue
    const list = byProduct.get(report.productId) ?? []
    list.push(report)
    byProduct.set(report.productId, list)
  }

  const summary: MarketProduct[] = []
  for (const product of products) {
    const list = byProduct.get(product.id)
    if (!list || list.length === 0) continue

    const sorted = [...list].sort(
      (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
    )
    const prices = list.map((report) => report.price).sort((a, b) => a - b)
    const middle = Math.floor(prices.length / 2)
    const marketPrice =
      prices.length % 2 === 0
        ? Math.round((prices[middle - 1] + prices[middle]) / 2)
        : prices[middle]

    summary.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      myPrice: product.sell_price,
      buyPrice: product.buy_price,
      marketPrice,
      reportCount: list.length,
      sourceCount: new Set(list.map((report) => report.sourceName.toLowerCase())).size,
      latestAt: sorted[0].reportedAt,
      advice: priceAdvice(product.sell_price, marketPrice, product.buy_price),
    })
  }

  return summary.sort((a, b) => Math.abs(b.advice.gap) - Math.abs(a.advice.gap))
}

/** Ringkasan satu kalimat untuk ditampilkan di panel. */
export function marketHeadline(summary: MarketProduct[]): string {
  if (summary.length === 0) return "Belum ada laporan harga pasar."
  const turun = summary.filter((item) => item.advice.action === "turunkan")
  const naik = summary.filter((item) => item.advice.action === "naikkan")
  const bundling = summary.filter((item) => item.advice.message.includes("bundling"))

  const first = turun[0] ?? naik[0]
  if (!first) {
    if (bundling.length > 0) {
      return `${bundling.length} barang marginnya tipis — pakai bundling, bukan potong harga.`
    }
    return `${summary.length} barang sudah sebanding dengan harga pasar.`
  }

  const gap = Math.abs(first.advice.gap)
  return first.advice.action === "turunkan"
    ? `${first.name} ${rupiah(gap)} lebih mahal dari harga pasar — tinjau harga jualnya.`
    : `${first.name} bisa dinaikkan ${rupiah(gap)} di atas harga pasar.`
}
