/**
 * Kategori produk dan lead time pemasok.
 *
 * Dipisah dari `seasonal.ts` supaya mesin saran restok dan mesin musim memakai
 * satu definisi yang sama. Kalau kategori berubah di satu tempat, angka saran
 * di halaman lain ikut berubah.
 */

import type { Product } from "./types"

export type ProductCategory =
  | "sembako"
  | "instan"
  | "minuman"
  | "rumah tangga"
  | "rokok"
  | "bumbu"
  | "lainnya"

export const CATEGORY_RULES: Array<{ category: ProductCategory; keywords: string[] }> = [
  { category: "rokok", keywords: ["rokok", "sampoerna", "marlboro", "gudang garam"] },
  { category: "rumah tangga", keywords: ["sabun", "deterjen", "shampo", "pasta gigi", "tisu"] },
  { category: "bumbu", keywords: ["kecap", "saus", "garam", "merica", "bumbu", "masako"] },
  { category: "minuman", keywords: ["kopi", "teh", "air", "sirup", "minuman", "susu"] },
  { category: "instan", keywords: ["mi", "mie", "instan", "indomie", "snack", "makanan"] },
  {
    category: "sembako",
    keywords: ["beras", "minyak", "telur", "gula", "tepung", "terigu", "sembako"],
  },
]

/**
 * Lama barang sampai dari pemasok sampai warung, dalam hari.
 * Angka ini menambah cakupan stok: barang harus tersedia sebelum barang itu
 * habis, bukan sesudahnya.
 */
export const LEAD_TIME_DAYS: Record<ProductCategory, number> = {
  sembako: 2,
  instan: 1,
  minuman: 1,
  "rumah tangga": 2,
  rokok: 1,
  bumbu: 2,
  lainnya: 2,
}

export function productCategory(product: Product): ProductCategory {
  const text = `${product.name} ${product.size ?? ""} ${product.aliases.join(" ")}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) return rule.category
  }
  return "lainnya"
}

/**
 * Lead time pemasok untuk sebuah produk.
 *
 * Kalau owning warung sudah menyetel sendiri di layar barang, angka itu yang
 * dipakai. Kalau belum, pakai perkiraan berdasarkan kategori.
 */
export function leadTimeFor(product: Product): number {
  const custom = product.lead_time_days
  if (typeof custom === "number" && Number.isFinite(custom) && custom >= 0) {
    return Math.round(custom)
  }
  return LEAD_TIME_DAYS[productCategory(product)]
}
