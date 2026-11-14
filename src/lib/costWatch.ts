// Alarm modal naik: membandingkan harga kulakan terakhir dengan kulakan
// sebelumnya per produk. Margin warung sering tergerus diam-diam karena
// harga jual belum diikuti naiknya modal.
import type { Product, Transaction, TransactionWithProduct } from "./types"
import { productLabel } from "./format"
import { withProduct } from "./stats"

export interface CostMove {
  productId: string
  name: string
  unit: string
  /** Harga kulakan terakhir. */
  lastCost: number
  /** Harga kulakan sebelum terakhir. */
  prevCost: number
  changePct: number
  /** Tanggal kulakan terakhir (ISO). */
  lastDate: string
}

export interface CostWatch {
  hasData: boolean
  /** Banyaknya produk yang punya cukup histori kulakan untuk dibandingkan. */
  checkedCount: number
  moves: CostMove[]
}

export function computeCostWatch(
  products: Product[],
  transactions: Transaction[],
  thresholdPct = 5,
): CostWatch {
  const joined = withProduct(products, transactions)
  const purchases = joined
    .filter((row) => row.type === "purchase")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const perProduct = new Map<string, TransactionWithProduct[]>()
  for (const row of purchases) {
    const list = perProduct.get(row.product_id) ?? []
    list.push(row)
    perProduct.set(row.product_id, list)
  }

  const moves: CostMove[] = []
  for (const [productId, list] of perProduct) {
    if (list.length < 2) continue
    const last = list[list.length - 1]
    const prev = list[list.length - 2]
    if (prev.unit_price <= 0) continue
    const changePct = ((last.unit_price - prev.unit_price) / prev.unit_price) * 100
    if (Math.abs(changePct) < thresholdPct) continue
    moves.push({
      productId,
      name: productLabel(last.product),
      unit: last.product.unit,
      lastCost: last.unit_price,
      prevCost: prev.unit_price,
      changePct,
      lastDate: last.created_at,
    })
  }

  moves.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))

  let checkedCount = 0
  for (const list of perProduct.values()) {
    if (list.length >= 2) checkedCount += 1
  }

  return {
    hasData: purchases.length > 0,
    checkedCount,
    moves: moves.slice(0, 3),
  }
}

export interface SellPriceSuggestion {
  /** Harga jual sekarang. */
  currentPrice: number
  /** Saran harga jual agar margin persen tetap seperti sebelum modal bergerak. */
  suggestedPrice: number
  /** Margin % sebelum modal bergerak (pakai prevCost). */
  baselineMarginPct: number
  /** Margin % sekarang bila harga jual tidak diubah (pakai lastCost). */
  currentMarginPct: number
  /** True bila harga jual sekarang masih cukup — tidak perlu diubah. */
  ok: boolean
}

/**
 * Saran harga jual murni dari data: naikkan harga sebanding dengan pergeseran
 * modal supaya margin persen kembali ke tingkat sebelumnya, dibulatkan ke atas
 * ke kelipatan 100 agar wajar untuk warung. Bukan karangan AI.
 */
export function suggestSellPrice(
  sellPrice: number,
  move: CostMove,
): SellPriceSuggestion | null {
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return null
  if (!Number.isFinite(move.prevCost) || move.prevCost <= 0) return null
  if (!Number.isFinite(move.lastCost) || move.lastCost <= 0) return null

  const baselineMarginPct = ((sellPrice - move.prevCost) / sellPrice) * 100
  const currentMarginPct = ((sellPrice - move.lastCost) / sellPrice) * 100
  // Bulatkan dulu ke rupiah terdekat supaya sisa float (mis. 32400.000000000004)
  // tidak membawa ceil melompat satu kelipatan.
  const raw = Math.round(sellPrice * (move.lastCost / move.prevCost))
  const suggestedPrice = Math.ceil(raw / 100) * 100

  return {
    currentPrice: sellPrice,
    suggestedPrice,
    baselineMarginPct,
    currentMarginPct,
    ok: suggestedPrice <= sellPrice,
  }
}
