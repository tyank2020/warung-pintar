/**
 * Perhitungan stok murni.
 *
 * Dipisah dari komponen React supaya bisa diuji tanpa browser. Semua fungsi di
 * sini mengembalikan produk baru dan tidak mengubah input.
 */

import type { ConfirmItem, Product } from "./types"
import { productLabel } from "./format"

/** Baris yang benar-benar bisa disimpan. */
export function validItems(items: ConfirmItem[]): ConfirmItem[] {
  return items.filter((item) => item.productId && item.qty > 0 && Number.isFinite(item.qty))
}

/** Jumlah yang diminta per produk. */
export function requestedByProduct(items: ConfirmItem[]): Map<string, number> {
  const requested = new Map<string, number>()
  for (const item of items) {
    if (!item.productId) continue
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.qty)
  }
  return requested
}

/**
 * Kurangi stok karena penjualan.
 * Melempar error kalau stok tidak cukup, supaya transaksi tidak pernah
 * membuat stok negatif.
 */
export function applySaleToStock(products: Product[], items: ConfirmItem[]): Product[] {
  const requested = requestedByProduct(validItems(items))

  for (const [productId, qty] of requested) {
    const product = products.find((candidate) => candidate.id === productId)
    if (!product) throw new Error("Barang tidak ditemukan.")
    if (product.stock < qty) {
      throw new Error(`Stok ${productLabel(product)} tinggal ${product.stock} ${product.unit}.`)
    }
  }

  return products.map((product) => {
    const sold = requested.get(product.id) ?? 0
    return sold > 0 ? { ...product, stock: product.stock - sold } : product
  })
}

/**
 * Tambah stok karena pembelian.
 * Harga modal ikut diperbarui kalau baris punya harga lebih dari nol, karena
 * harga modal 0 akan merusak perhitungan laba kotor.
 */
export function applyPurchaseToStock(products: Product[], items: ConfirmItem[]): Product[] {
  const valid = validItems(items)
  return products.map((product) => {
    const incoming = valid.filter((item) => item.productId === product.id)
    if (incoming.length === 0) return product
    const qty = incoming.reduce((total, item) => total + item.qty, 0)
    const latestPrice = incoming[incoming.length - 1].unitPrice
    return {
      ...product,
      stock: product.stock + qty,
      buy_price: latestPrice > 0 ? latestPrice : product.buy_price,
    }
  })
}

/**
 * Terapkan penyesuaian stok: barang rusak, hilang, atau selisih opname.
 * `qty` positif menambah stok, negatif mengurangi.
 */
export function applyAdjustmentToStock(
  products: Product[],
  productId: string,
  qty: number,
): Product[] {
  const product = products.find((candidate) => candidate.id === productId)
  if (!product) throw new Error("Barang tidak ditemukan.")
  if (!Number.isFinite(qty) || qty === 0) {
    throw new Error("Jumlah penyesuaian harus lebih dari nol.")
  }
  if (product.stock + qty < 0) {
    throw new Error(
      `Stok ${productLabel(product)} tinggal ${product.stock} ${product.unit}, tidak bisa dikurangi ${Math.abs(
        qty,
      )}.`,
    )
  }

  return products.map((candidate) =>
    candidate.id === productId ? { ...candidate, stock: candidate.stock + qty } : candidate,
  )
}
