import { describe, expect, it } from "vitest"
import { buildSalesIndex } from "./analytics"
import {
  computeStats,
  computeStatsFromIndex,
  reportSeries,
  reportSeriesFromIndex,
  reportSummary,
  reportSummaryFromIndex,
  stockStatus,
} from "./stats"
import type { ConsignmentSaleRecord, Product, Transaction } from "./types"

const products: Product[] = [
  {
    id: "p-beras",
    name: "Beras Ramos",
    unit: "kg",
    stock: 10,
    min_stock: 5,
    buy_price: 10000,
    sell_price: 15000,
    aliases: [],
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 3,
    min_stock: 5,
    buy_price: 12000,
    sell_price: 16000,
    aliases: [],
  },
  {
    id: "p-kopi",
    name: "Kopi Kapal Api",
    unit: "sachet",
    stock: 2,
    min_stock: 10,
    buy_price: 2000,
    sell_price: 2500,
    aliases: [],
  },
]

const now = new Date("2026-11-09T12:00:00Z")

const transactions: Transaction[] = [
  {
    id: "t-1",
    type: "sale",
    product_id: "p-beras",
    qty: 2,
    unit_price: 15000,
    created_at: "2026-11-09T10:00:00Z",
  },
  {
    id: "t-2",
    type: "sale",
    product_id: "p-gula",
    qty: 1,
    unit_price: 16000,
    created_at: "2026-11-09T11:00:00Z",
  },
  {
    id: "t-3",
    type: "purchase",
    product_id: "p-gula",
    qty: 5,
    unit_price: 12000,
    created_at: "2026-11-08T09:00:00Z",
  },
  {
    id: "t-4",
    type: "sale",
    product_id: "p-kopi",
    qty: 1,
    unit_price: 2500,
    created_at: "2026-11-07T09:00:00Z",
  },
]

describe("stockStatus", () => {
  it("marks stock below half the minimum as critical", () => {
    expect(stockStatus(products[2])).toMatchObject({ label: "Kritis", tone: "kritis" })
  })

  it("marks stock at or below the minimum as low", () => {
    expect(stockStatus(products[1])).toMatchObject({ label: "Menipis", tone: "menipis" })
  })

  it("marks healthy stock as safe", () => {
    expect(stockStatus(products[0])).toMatchObject({ label: "Aman", tone: "aman" })
  })
})

describe("computeStats", () => {
  const stats = computeStats(products, transactions, now)

  it("computes today's sales and gross profit", () => {
    expect(stats.todaySales).toBe(46000)
    expect(stats.todayGrossProfit).toBe(14000)
    expect(stats.todayTransactions).toBe(2)
  })

  it("computes the last 7 days", () => {
    expect(stats.weekSales).toBe(48500)
    expect(stats.weekGrossProfit).toBe(14500)
    expect(stats.weekTransactions).toBe(3)
  })

  it("counts low stock products", () => {
    expect(stats.lowStockCount).toBe(2)
    expect(stats.lowStock.map((product) => product.id)).toEqual(["p-kopi", "p-gula"])
  })

  it("tetap menampilkan barang kritis/menipis walau belum ada penjualan", () => {
    const empty = computeStats(products, [], now)
    expect(empty.lowStockCount).toBe(2)
    expect(empty.lowStock.map((product) => product.id)).toEqual(["p-kopi", "p-gula"])
    expect(empty.suggestions).toEqual([])
  })

  it("builds restock suggestions with reasons", () => {
    expect(stats.suggestions).toHaveLength(2)
    // Urutan mengikuti "yang paling cepat habis dulu": Gula terjual 1/912 hari
    // dengan stok 3, Kopi terjual 1/7 hari dengan stok 2. Gula habis lebih dulu.
    expect(stats.suggestions[0]).toMatchObject({
      productId: "p-gula",
      suggestedQty: 2,
      estimatedCost: 24000,
    })
    expect(stats.suggestions[1]).toMatchObject({
      productId: "p-kopi",
      suggestedQty: 8,
      estimatedCost: 16000,
    })
    expect(stats.suggestions[0].reason).toContain("Rata-rata terjual")
  })

  it("does not divide a new shop's sales by seven", () => {
    const sales = [
      {
        id: "t-1",
        type: "sale" as const,
        product_id: "p-beras",
        qty: 10,
        unit_price: 15000,
        created_at: "2026-11-09T10:00:00Z",
      },
    ]
    const newShop = computeStats([{ ...products[0], stock: 2, min_stock: 5 }], sales, now)

    // Satu hari data: 10 kg/hari, bukan 10/7. Kalau dibagi 7, sarannya jadi
    // kecil saja dan warung justru kekurangan stok.
    expect(newShop.suggestions[0].avgPerDay).toBeCloseTo(10, 5)
    // Target = 10 kg/hari × (lead time 2 hari + 3 hari stok) = 50 kg.
    // Stok 2 kg → siapkan 48 kg.
    expect(newShop.suggestions[0].suggestedQty).toBe(48)
  })

  it("never returns net profit terminology", () => {
    expect(stats.tips.every((tip) => !/laba bersih/i.test(tip.text))).toBe(true)
  })
})

describe("reports", () => {
  it("sums the 7-day series", () => {
    const series = reportSeries(products, transactions, "7 Hari", now)
    expect(series).toHaveLength(7)
    expect(series.reduce((total, point) => total + point.sales, 0)).toBe(48500)
    expect(series.reduce((total, point) => total + point.profit, 0)).toBe(14500)
  })

  it("summarizes sales, cogs, and top products", () => {
    const summary = reportSummary(products, transactions, "7 Hari", now)
    expect(summary).toMatchObject({
      sales: 48500,
      cogs: 34000,
      grossProfit: 14500,
      transactions: 3,
      itemsSold: 4,
    })
    expect(summary.topProducts.map((product) => product.productId)).toEqual([
      "p-beras",
      "p-gula",
      "p-kopi",
    ])
  })

  it("memasukkan omzet titipan ke penjualan dan hanya komisinya ke laba", () => {
    const consignmentSales: ConsignmentSaleRecord[] = [
      {
        id: "cs-1",
        consignmentId: "c-1",
        depositor: "Bu Rina",
        productName: "Keripik",
        qty: 2,
        unitPrice: 10000,
        omzet: 20000,
        commission: 2000,
        createdAt: "2026-11-09T10:00:00Z",
      },
    ]
    const index = buildSalesIndex(products, transactions, now.getTime())
    const stats = computeStatsFromIndex(products, index, now, consignmentSales)
    const series = reportSeriesFromIndex(index, "7 Hari", now, consignmentSales)
    const summary = reportSummaryFromIndex(products, index, "7 Hari", now, consignmentSales)

    expect(stats.todaySales).toBe(66000)
    expect(stats.todayGrossProfit).toBe(16000)
    expect(stats.todayConsignmentPayable).toBe(18000)
    expect(stats.todayConsignmentItems).toBe(2)
    expect(stats.salesByDay[6]).toMatchObject({ sales: 66000, profit: 16000, transactions: 3 })
    expect(series.reduce((total, point) => total + point.sales, 0)).toBe(68500)
    expect(series.reduce((total, point) => total + point.profit, 0)).toBe(16500)
    expect(summary).toMatchObject({
      sales: 68500,
      cogs: 52000,
      grossProfit: 16500,
      consignmentCommission: 2000,
      transactions: 4,
      itemsSold: 6,
    })
  })
})
