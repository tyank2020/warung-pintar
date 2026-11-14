import { describe, expect, it } from "vitest"
import { buildDeadStockReport, deadStockHeadline } from "./deadStock"
import type { Product, Transaction } from "./types"

const now = new Date("2026-11-11T10:00:00.000Z")

/**
 * Tanggal N hari lalu, dihitung dari selisih waktu yang persis.
 * Kalau pakai `setDate` lokal, perpindahan daylight saving bisa menggeser
 * hasilnya satu jam dan tesnya jadi gagal di sebagian zona waktu.
 */
function iso(daysAgo: number) {
  return new Date(now.getTime() - daysAgo * 24 * 3_600_000).toISOString()
}

const products: Product[] = [
  {
    id: "p-kopi",
    name: "Kopi Kapal Api",
    unit: "sachet",
    stock: 40,
    min_stock: 10,
    buy_price: 9000,
    sell_price: 11000,
    aliases: [],
  },
  {
    id: "p-madu",
    name: "Madu Hutan",
    unit: "botol",
    stock: 12,
    min_stock: 2,
    buy_price: 45000,
    sell_price: 55000,
    aliases: [],
  },
  {
    id: "p-keripik",
    name: "Keripik Singkong",
    unit: "pcs",
    stock: 60,
    min_stock: 10,
    buy_price: 8000,
    sell_price: 10000,
    aliases: [],
  },
]

const transactions: Transaction[] = [
  {
    id: "t-1",
    type: "sale",
    product_id: "p-kopi",
    qty: 20,
    unit_price: 11000,
    created_at: iso(2),
  },
  {
    id: "t-2",
    type: "sale",
    product_id: "p-keripik",
    qty: 8,
    unit_price: 10000,
    created_at: iso(10),
  },
  {
    id: "t-3",
    type: "sale",
    product_id: "p-madu",
    qty: 2,
    unit_price: 55000,
    created_at: iso(120),
  },
]

describe("modal mati", () => {
  const report = buildDeadStockReport(products, transactions, { now })

  it("menandai barang yang lama tidak laku", () => {
    expect(report.items.map((item) => item.name)).toContain("Madu Hutan")
    expect(report.items.map((item) => item.name)).not.toContain("Kopi Kapal Api")
  })

  it("menghitung nilai modal yang tertahan", () => {
    const madu = report.items.find((item) => item.name === "Madu Hutan")
    expect(madu?.value).toBe(12 * 45000)
    expect(report.totalValue).toBe(12 * 45000)
    expect(report.sharePct).toBeGreaterThan(0)
  })

  it("menyebutkan berapa hari barang tidak laku", () => {
    const madu = report.items.find((item) => item.name === "Madu Hutan")
    expect(madu?.daysSinceLastSale).toBe(120)
    expect(madu?.suggestion).toContain("120 hari")
  })

  it("menyarankan bundling dengan barang yang laku", () => {
    const madu = report.items.find((item) => item.name === "Madu Hutan")
    expect(madu?.suggestion).toContain("Kopi Kapal Api")
  })

  it("menandai nilai terbesar", () => {
    expect(report.items[0].isBiggest).toBe(true)
  })

  it("membuat kalimat ringkas", () => {
    expect(deadStockHeadline(report)).toContain("modal nganggur")
    expect(deadStockHeadline({ ...report, items: [], count: 0 })).toContain("Tidak ada modal")
  })
})
