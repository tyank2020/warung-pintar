import { describe, expect, it } from "vitest"
import { computeMonthRhythm, monthWindowKey } from "./monthRhythm"
import type { Product, Transaction } from "./types"

const kopi: Product = {
  id: "p-kopi",
  name: "Kopi Kapal Api",
  unit: "sachet",
  stock: 8,
  min_stock: 12,
  buy_price: 2000,
  sell_price: 2500,
  aliases: ["kopi"],
}

const beras: Product = {
  id: "p-beras",
  name: "Beras Ramos",
  unit: "kg",
  stock: 40,
  min_stock: 10,
  buy_price: 12000,
  sell_price: 14000,
  aliases: ["beras"],
}

function sale(product: Product, year: number, month: number, day: number, qty: number): Transaction {
  return {
    id: `s-${product.id}-${month}-${day}`,
    type: "sale",
    product_id: product.id,
    qty,
    unit_price: product.sell_price,
    created_at: new Date(year, month, day, 10, 0, 0).toISOString(),
  }
}

describe("monthWindowKey", () => {
  it("splits the month into three phases", () => {
    expect(monthWindowKey(1)).toBe("awal")
    expect(monthWindowKey(10)).toBe("awal")
    expect(monthWindowKey(11)).toBe("tengah")
    expect(monthWindowKey(20)).toBe("tengah")
    expect(monthWindowKey(21)).toBe("tua")
    expect(monthWindowKey(31)).toBe("tua")
  })
})

describe("computeMonthRhythm", () => {
  it("sees higher sales in the tanggal tua phase", () => {
    const transactions: Transaction[] = []
    for (const month of [8, 9, 10]) {
      for (let day = 1; day <= 10; day += 1) {
        transactions.push(sale(kopi, 2026, month, day, 1))
      }
      for (let day = 21; day <= 28; day += 1) {
        transactions.push(sale(kopi, 2026, month, day, 3))
      }
    }
    const rhythm = computeMonthRhythm([kopi], transactions)
    expect(rhythm.hasData).toBe(true)
    expect(rhythm.tuaVsAwalPct).not.toBeNull()
    expect(rhythm.tuaVsAwalPct!).toBeGreaterThan(0)
    const tua = rhythm.windows.find((window) => window.key === "tua")
    expect(tua?.avgDailySales).toBeCloseTo(3 * kopi.sell_price, 5)
  })

  it("detects products that rise during tanggal tua", () => {
    const transactions: Transaction[] = []
    for (const month of [8, 9, 10]) {
      for (let day = 1; day <= 10; day += 1) {
        transactions.push(sale(kopi, 2026, month, day, 1))
        transactions.push(sale(beras, 2026, month, day, 2))
      }
      for (let day = 21; day <= 28; day += 1) {
        transactions.push(sale(kopi, 2026, month, day, 4))
        transactions.push(sale(beras, 2026, month, day, 2))
      }
    }
    const rhythm = computeMonthRhythm([kopi, beras], transactions)
    expect(rhythm.shifts.length).toBeGreaterThan(0)
    expect(rhythm.shifts[0]?.name).toBe("Kopi Kapal Api")
    expect(rhythm.shifts[0]?.changePct).toBeGreaterThan(0)
  })

  it("returns hasData false when there is barely any data", () => {
    const rhythm = computeMonthRhythm([kopi], [sale(kopi, 2026, 10, 2, 1)])
    expect(rhythm.hasData).toBe(false)
    expect(rhythm.tuaVsAwalPct).toBeNull()
    expect(rhythm.shifts).toHaveLength(0)
  })
})
