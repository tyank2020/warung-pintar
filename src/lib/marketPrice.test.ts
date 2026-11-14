import { describe, expect, it } from "vitest"
import {
  buildMarketSummary,
  marketHeadline,
  priceAdvice,
  type MarketReport,
} from "./marketPrice"
import type { Product } from "./types"

const now = new Date("2026-11-11T10:00:00.000Z")

const products: Product[] = [
  {
    id: "p-minyak",
    name: "Minyak Goreng",
    unit: "liter",
    stock: 20,
    min_stock: 5,
    buy_price: 15000,
    sell_price: 18000,
    aliases: [],
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 10,
    min_stock: 3,
    buy_price: 14000,
    sell_price: 17000,
    aliases: [],
  },
]

function report(overrides: Partial<MarketReport> = {}): MarketReport {
  return {
    id: "m-1",
    productId: "p-minyak",
    productName: "Minyak Goreng",
    price: 16000,
    sourceName: "Warung sebelah",
    reportedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

describe("radar harga pasar", () => {
  it("menyarankan turun kalau pasar lebih murah dan margin masih aman", () => {
    // Modal 14.000, harga pasar 16.000 → margin masih 12,5%, aman diturunkan.
    const advice = priceAdvice(18000, 16000, 14000)
    expect(advice.action).toBe("turunkan")
    expect(advice.suggestedPrice).toBe(16000)
    expect(advice.marginAfter).toBeGreaterThan(10)
  })

  it("menolak turun kalau margin jadi tipis", () => {
    const advice = priceAdvice(16000, 14000, 15000)
    expect(advice.action).toBe("jaga")
    expect(advice.message).toContain("bundling")
  })

  it("menyarankan naik kalau pasar lebih mahal", () => {
    const advice = priceAdvice(18000, 21000, 15000)
    expect(advice.action).toBe("naikkan")
  })

  it("menjaga harga kalau sudah sebanding", () => {
    const advice = priceAdvice(18000, 17800, 15000)
    expect(advice.action).toBe("jaga")
  })

  it("merangkum harga pasar dari laporan terbaru", () => {
    const summary = buildMarketSummary(
      products,
      [
        report({ price: 16000 }),
        report({ id: "m-2", price: 17000, sourceName: "Warung dua", reportedAt: new Date(now.getTime() - 3 * 86400000).toISOString() }),
        report({ id: "m-3", price: 9000, reportedAt: new Date(now.getTime() - 30 * 86400000).toISOString() }),
      ],
      now,
    )
    expect(summary).toHaveLength(1)
    expect(summary[0].reportCount).toBe(2)
    expect(summary[0].sourceCount).toBe(2)
    expect(summary[0].marketPrice).toBe(16500)
  })

  it("membuat kalimat ringkas", () => {
    // Minyak: harga pasar 16.000 vs harga jual 18.000, modal 15.000 → margin
    // tipis kalau ikut turun, jadi sarannya bundling.
    const summary = buildMarketSummary(products, [report()], now)
    expect(marketHeadline(summary)).toContain("bundling")
    // Gula: modal 13.000, harga pasar 15.000 → turun ke 15.000 masih margin 13%.
    const gulaProduk = [{ ...products[1], buy_price: 13000 }]
    const gula = buildMarketSummary(
      gulaProduk,
      [report({ id: "m-9", productId: "p-gula", productName: "Gula Pasir", price: 15000 })],
      now,
    )
    expect(marketHeadline(gula)).toContain("Gula Pasir")
    expect(marketHeadline([])).toContain("Belum ada")
  })
})
