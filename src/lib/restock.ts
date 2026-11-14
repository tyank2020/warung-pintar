/**
 * Mesin saran restok — satu-satunya sumber angka "beli berapa".
 *
 * Sebelumnya halaman Dashboard, halaman Stok Barang, kartu musim, dan view SQL
 * memakai empat versi rumus yang berbeda. Satu produk bisa tampil "beli 1 kg"
 * di satu layar dan "beli 4 papan" di layar sebelah. Sekarang semua memakai
 * fungsi ini.
 *
 * Rumus yang dipakai:
 *   proyeksi per hari = laju dasar × faktor musim        (lihat `demand.ts`)
 *   target stok       = proyeksi per hari × (lead time + 3 hari stok)
 *   saran beli        = target − stok, dibatasi minimum stok
 *
 * Lead time pemasok ikut dihitung karena barang harus tersedia sebelum
 * barang itu habis, bukan sesudahnya.
 */

import { leadTimeFor } from "./catalog"
import { numberID, productLabel } from "./format"
import { computeDemandProfiles, type DataConfidence, type DemandProfile } from "./demand"
import type { SalesIndex } from "./analytics"
import type { Product } from "./types"

export type { DataConfidence } from "./demand"

/** Jendela analisis default: 30 hari. Panjang cukup, tidak terlalu basi. */
export const RESTOCK_WINDOW_DAYS = 30

/** Cakupan stok yang disimpan di luar lead time. */
export const RESTOCK_COVER_DAYS = 3

export interface RestockSignal {
  productId: string
  name: string
  unit: string
  stock: number
  minStock: number
  /** Rata-rata terjual per hari (laju dasar, tanpa faktor musim). */
  avgPerDay: number
  /** Rata-rata harian hasil proyeksi (laju dasar + musim). */
  projectedPerDay: number
  /** Jumlah hari stok sekarang cukup menutup penjualan. */
  daysOfCover: number
  /** Saran jumlah beli (0 berarti tidak perlu beli). */
  suggestedQty: number
  estimatedCost: number
  buyPrice: number
  leadTimeDays: number
  /** Jumlah hari data penjualan yang dipakai. */
  dataDays: number
  confidence: DataConfidence
  /** Alasan bahasa Indonesia, selalu menyebut angkanya. */
  reason: string
}

export interface RestockPlan {
  signals: RestockSignal[]
  /** Saran yang perlu dibeli, paling mendesak lebih dulu. */
  purchases: RestockSignal[]
}

export interface RestockOptions {
  /** Panjang jendela analisis dalam hari. */
  windowDays?: number
  /** Profil kebutuhan yang sudah dihitung, supaya tidak dihitung dua kali. */
  demand?: Map<string, DemandProfile>
}

/**
 * Saran restok untuk semua produk.
 *
 * @param windowDays panjang jendela analisis dalam hari.
 */
export function computeRestockPlan(
  products: Product[],
  index: SalesIndex,
  now: number = Date.now(),
  options: RestockOptions = {},
): RestockPlan {
  const windowDays = options.windowDays ?? RESTOCK_WINDOW_DAYS
  // Barang yang tidak dijual lagi tidak ikut dihitung rencana restok.
  const activeProducts = products.filter((product) => product.archived !== true)
  const demand = options.demand ?? computeDemandProfiles(activeProducts, index, now, { windowDays })

  const signals: RestockSignal[] = activeProducts.map((product) => {
    const profile = demand.get(product.id)
    const leadTimeDays = leadTimeFor(product)
    const projected = profile?.projectedDaily ?? 0
    const daysOfCover = profile?.daysOfCover ?? Number.POSITIVE_INFINITY

    // Target: tutup lead time + 3 hari stok.
    const targetStock = projected * (leadTimeDays + RESTOCK_COVER_DAYS)

    // Belum ada satu pun penjualan: tidak ada sinyal permintaan, jadi
    // tidak ada saran beli — walau stok masih di bawah minimum.
    const hasSales = index.sales.length > 0

    let suggestedQty = Math.ceil(targetStock - product.stock)
    if (suggestedQty <= 0 && product.stock < product.min_stock) {
      suggestedQty = Math.max(1, Math.ceil(product.min_stock - product.stock))
    }
    if (suggestedQty < 0) suggestedQty = 0
    if (!hasSales) suggestedQty = 0

    const dataDays = profile?.dataDays ?? 0
    const reason = buildReason({
      product,
      profile,
      leadTimeDays,
      dataDays,
      suggestedQty,
      projected,
      daysOfCover,
    })

    return {
      productId: product.id,
      name: productLabel(product),
      unit: product.unit,
      stock: product.stock,
      minStock: product.min_stock,
      avgPerDay: profile?.avgDaily30 ?? 0,
      projectedPerDay: projected,
      daysOfCover: Number.isFinite(daysOfCover) ? daysOfCover : 999,
      suggestedQty,
      estimatedCost: suggestedQty * product.buy_price,
      buyPrice: product.buy_price,
      leadTimeDays,
      dataDays,
      confidence: profile?.confidence ?? "rendah",
      reason,
    }
  })

  // Urutan: barang yang paling cepat habis dulu. Kalau sama, barang yang
  // paling jauh di bawah stok minimum didahulukan.
  const sorted = [...signals].sort((a, b) => {
    if (a.daysOfCover !== b.daysOfCover) return a.daysOfCover - b.daysOfCover
    const deficitA = Math.max(0, a.minStock - a.stock)
    const deficitB = Math.max(0, b.minStock - b.stock)
    return deficitB - deficitA
  })

  return { signals: sorted, purchases: sorted.filter((signal) => signal.suggestedQty > 0) }
}

interface ReasonInput {
  product: Product
  profile?: DemandProfile
  leadTimeDays: number
  dataDays: number
  suggestedQty: number
  projected: number
  daysOfCover: number
}

function buildReason(input: ReasonInput): string {
  const { product, profile, leadTimeDays, dataDays, suggestedQty, projected, daysOfCover } = input

  if (projected <= 0) {
    return `Belum ada penjualan. Stok ${numberID(product.stock)} ${product.unit}; minimum ${numberID(
      product.min_stock,
    )} ${product.unit}.`
  }

  const rate = `Rata-rata terjual ${numberID(projected, 1)} ${product.unit}/hari`
  const windowText = dataDays < 7 ? ` dari ${dataDays} hari data` : ""
  const coverText = Number.isFinite(daysOfCover)
    ? `stok sekarang ${numberID(product.stock)} ${product.unit} cukup ${numberID(daysOfCover, 1)} hari`
    : `stok sekarang ${numberID(product.stock)} ${product.unit}`

  const seasonText = seasonalNote(profile)

  if (product.stock < product.min_stock) {
    return `${rate}${windowText}; ${coverText}. Masih di bawah minimum ${numberID(
      product.min_stock,
    )} ${product.unit}, jadi saran ${numberID(suggestedQty)} ${product.unit}.${seasonText}`
  }

  return `${rate}${windowText}; ${coverText}. Lead time ${leadTimeDays} hari, jadi siapkan ${numberID(
    suggestedQty,
  )} ${product.unit}.${seasonText}`
}

/** Catatan musim hanya ditampilkan kalau polanya memang beda dari biasanya. */
function seasonalNote(profile?: DemandProfile): string {
  if (!profile) return ""
  const uplift = profile.upliftPct
  if (uplift >= 10) return ` Pola musim ${numberID(uplift)}% lebih tinggi dari biasanya.`
  if (uplift <= -10) return ` Pola musim ${numberID(Math.abs(uplift))}% lebih rendah dari biasanya.`
  return ""
}
