import { describe, expect, it } from "vitest"
import { createDemoMarketPrices, createDemoState } from "./demo"
import { buildMarketSummary } from "./marketPrice"
import { findStockDiscrepancies } from "./reconcile"

describe("data contoh untuk halaman pendukung", () => {
  const now = new Date("2026-11-14T10:00:00.000Z")

  it("mengisi harga pasar, cek stok, nota, titip jual, dan Piutang", () => {
    const demo = createDemoState(now, { days: 30 })
    const marketSummary = buildMarketSummary(demo.products, createDemoMarketPrices(now), now)

    expect(marketSummary).toHaveLength(4)
    expect(findStockDiscrepancies(demo.products, demo.transactions, demo.notes)).toHaveLength(2)
    expect(demo.notes.length).toBeGreaterThan(0)
    expect(demo.consignments.length).toBeGreaterThan(0)
    expect(demo.customers.length).toBeGreaterThan(0)
  })

  it("tidak menambahkan temuan stok contoh ke data akun cloud baru", () => {
    const demo = createDemoState(now, { days: 30, includeDemoExamples: false })

    expect(demo.transactions.some((transaction) => transaction.id.startsWith("demo-opname-"))).toBe(
      false,
    )
  })
})
