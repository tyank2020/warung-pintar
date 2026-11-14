import { describe, expect, it } from "vitest"
import { computeCostWatch, suggestSellPrice, type CostMove } from "./costWatch"
import type { Product, Transaction } from "./types"

const telur: Product = {
  id: "p-telur",
  name: "Telur Ayam",
  unit: "papan",
  stock: 6,
  min_stock: 6,
  buy_price: 30000,
  sell_price: 34000,
  aliases: ["telur"],
}

const gula: Product = {
  id: "p-gula",
  name: "Gula Pasir",
  unit: "kg",
  stock: 20,
  min_stock: 8,
  buy_price: 17000,
  sell_price: 19000,
  aliases: ["gula"],
}

function purchase(product: Product, iso: string, unitPrice: number): Transaction {
  return {
    id: `b-${product.id}-${iso}`,
    type: "purchase",
    product_id: product.id,
    qty: 10,
    unit_price: unitPrice,
    created_at: iso,
  }
}

describe("computeCostWatch", () => {
  it("flags a cost jump above the threshold", () => {
    const transactions = [
      purchase(telur, "2026-09-20T09:00:00", 28000),
      purchase(telur, "2026-11-01T09:00:00", 30000),
      purchase(gula, "2026-10-05T09:00:00", 17000),
      purchase(gula, "2026-11-01T09:00:00", 17100),
    ]
    const watch = computeCostWatch([telur, gula], transactions)
    expect(watch.checkedCount).toBe(2)
    expect(watch.moves).toHaveLength(1)
    const move = watch.moves[0]
    expect(move?.name).toBe("Telur Ayam")
    expect(move?.lastCost).toBe(30000)
    expect(move?.prevCost).toBe(28000)
    expect(move?.changePct).toBeGreaterThan(5)
  })

  it("ignores small movements and single purchases", () => {
    const transactions = [
      purchase(telur, "2026-10-05T09:00:00", 30000),
      purchase(telur, "2026-11-01T09:00:00", 30100),
    ]
    const watch = computeCostWatch([telur], transactions)
    expect(watch.hasData).toBe(true)
    expect(watch.moves).toHaveLength(0)
  })

  it("skips products with only one purchase", () => {
    const watch = computeCostWatch([gula], [purchase(gula, "2026-11-01T09:00:00", 17000)])
    expect(watch.checkedCount).toBe(0)
    expect(watch.moves).toHaveLength(0)
  })
})

describe("suggestSellPrice", () => {
  const telurMove: CostMove = {
    productId: "p-telur",
    name: "Telur Ayam",
    unit: "papan",
    lastCost: 30000,
    prevCost: 28000,
    changePct: ((30000 - 28000) / 28000) * 100,
    lastDate: "2026-11-01T09:00:00",
  }

  it("suggests a higher sell price that restores the previous margin", () => {
    const suggestion = suggestSellPrice(34000, telurMove)
    expect(suggestion).not.toBeNull()
    expect(suggestion?.ok).toBe(false)
    // 34000 × 30000/28000 = 36428,6 → dibulatkan ke atas ke kelipatan 100.
    expect(suggestion?.suggestedPrice).toBe(36500)
    expect(suggestion?.currentMarginPct).toBeCloseTo(11.76, 1)
    expect(suggestion?.baselineMarginPct).toBeCloseTo(17.65, 1)
  })

  it("marks the current price as ok when modal turun", () => {
    const turunMove: CostMove = { ...telurMove, lastCost: 27000, prevCost: 28000 }
    const suggestion = suggestSellPrice(34000, turunMove)
    expect(suggestion?.ok).toBe(true)
    // 34000 × 27000/28000 = 32785,7 → 32800, di bawah harga jual sekarang.
    expect(suggestion?.suggestedPrice).toBe(32800)
  })

  it("does not let float noise jump one rounding step", () => {
    // 30000 × (27000/25000) = 32400.000000000004 dalam float; ceil tidak boleh
    // menjadikannya 32500.
    const move: CostMove = { ...telurMove, lastCost: 27000, prevCost: 25000 }
    const suggestion = suggestSellPrice(30000, move)
    expect(suggestion?.suggestedPrice).toBe(32400)
  })

  it("returns null for invalid prices", () => {
    expect(suggestSellPrice(0, telurMove)).toBeNull()
    expect(suggestSellPrice(-5, telurMove)).toBeNull()
    expect(suggestSellPrice(34000, { ...telurMove, prevCost: 0 })).toBeNull()
    expect(suggestSellPrice(34000, { ...telurMove, lastCost: 0 })).toBeNull()
  })
})
