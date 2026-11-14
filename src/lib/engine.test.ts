import { describe, expect, it } from "vitest"
import { buildSalesIndex } from "./analytics"
import { computeStatsFromIndex, reportSeriesFromIndex, reportSummaryFromIndex } from "./stats"
import { computeSeasonalPlanFromIndex } from "./seasonal"
import { buildLedgerDigest, buildPurchasePlan } from "./ledger"
import { createDemoState } from "./demo"
import { convertQty, mergeVoiceItems, toConfirmItems } from "./parser"
import type { Product, Transaction, VoiceItem } from "./types"

const now = new Date("2026-11-09T12:00:00")

function demoPlan() {
  const demo = createDemoState(now)
  const index = buildSalesIndex(demo.products, demo.transactions, now.getTime())
  return {
    demo,
    index,
    stats: computeStatsFromIndex(demo.products, index, now.getTime()),
    seasonal: computeSeasonalPlanFromIndex(demo.products, index, now),
  }
}

describe("saran restok konsisten antar layar", () => {
  it("beranda dan kartu musim memberi jumlah yang sama untuk produk yang sama", () => {
    const { stats, seasonal } = demoPlan()

    const statsMap = new Map(stats.suggestions.map((s) => [s.productId, s.suggestedQty]))
    const seasonalRestock = seasonal.recommendations.filter((r) => r.kind === "restock")

    expect(seasonalRestock.length).toBeGreaterThan(0)
    for (const recommendation of seasonalRestock) {
      const productId = recommendation.productId
      expect(productId).toBeDefined()
      const fromDashboard = statsMap.get(productId as string)
      expect(fromDashboard).toBeDefined()
      // Ini yang dulu salah: kartu musim bisa bilang 4 papan sementara
      // beranda says 1 papan untuk produk yang sama.
      expect(fromDashboard).toBe(recommendation.suggestedQty)
    }
  })

  it("jumlah saran selalu sama dengan mesin restok", () => {
    const { demo, index, stats } = demoPlan()
    const plan = computeSeasonalPlanFromIndex(demo.products, index, now)

    for (const signal of plan.signals) {
      const fromDashboard = stats.suggestions.find((s) => s.productId === signal.productId)
      if (!fromDashboard) continue
      expect(fromDashboard.suggestedQty).toBe(signal.suggestedQty)
    }
  })

  it("selalu menyebut alasannya", () => {
    const { stats } = demoPlan()
    for (const suggestion of stats.suggestions) {
      expect(suggestion.reason.length).toBeGreaterThan(10)
      expect(suggestion.reason).toMatch(/terjual|minimum/i)
    }
  })

  it("belanja besok memakai jumlah yang sama dengan saran stok", () => {
    const { demo, stats } = demoPlan()
    const digest = buildLedgerDigest(demo.products, demo.transactions, [])
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const plan = buildPurchasePlan(demo.products, digest, tomorrow)

    for (const item of plan) {
      const suggestion = stats.suggestions.find((s) => s.productId === item.productId)
      if (!suggestion) continue
      // Dua panel ini menjawab pertanyaan berbeda (hari besok vs stok 3
      // hari), tapi jumlah beli untuk produk yang sama tidak boleh beda.
      expect(item.suggestedQty).toBe(suggestion.suggestedQty)
    }
  })
})

describe("batas window", () => {
  it("transaksi bertanggal di masa depan tidak masuk hitungan 7 hari", () => {
    const products: Product[] = [
      {
        id: "p-x",
        name: "Beras",
        unit: "kg",
        stock: 10,
        min_stock: 5,
        buy_price: 10000,
        sell_price: 15000,
        aliases: [],
      },
    ]
    const transactions: Transaction[] = [
      {
        id: "future",
        type: "sale",
        product_id: "p-x",
        qty: 5,
        unit_price: 15000,
        created_at: "2026-11-20T10:00:00Z",
      },
    ]
    const stats = computeStatsFromIndex(
      products,
      buildSalesIndex(products, transactions, now.getTime()),
      now.getTime(),
    )

    expect(stats.weekSales).toBe(0)
    expect(stats.weekTransactions).toBe(0)
    expect(stats.todaySales).toBe(0)
  })

  it("grafik dan ringkasan menutup periode yang sama", () => {
    const { demo, index } = demoPlan()
    for (const period of ["7 Hari", "30 Hari", "3 Bulan"] as const) {
      const series = reportSeriesFromIndex(index, period, now.getTime())
      const summary = reportSummaryFromIndex(demo.products, index, period, now.getTime())
      const seriesTotal = series.reduce((total, point) => total + point.sales, 0)
      expect(Math.round(seriesTotal)).toBe(Math.round(summary.sales))
    }
  })
})

describe("parser suara", () => {
  const products: Product[] = [
    {
      id: "p-gula",
      name: "Gula Pasir",
      unit: "kg",
      stock: 10,
      min_stock: 5,
      buy_price: 10000,
      sell_price: 15000,
      aliases: ["gulpas", "gula"],
    },
    {
      id: "p-minyak",
      name: "Minyak Goreng",
      unit: "liter",
      stock: 10,
      min_stock: 5,
      buy_price: 10000,
      sell_price: 15000,
      aliases: ["minyak"],
    },
  ]

  it("mengubah satuan yang sebanding", () => {
    expect(convertQty(500, "gram", "kg")).toBe(0.5)
    expect(convertQty(2, "kg", "gram")).toBe(2000)
    expect(convertQty(1000, "ml", "liter")).toBe(1)
    // Satuan yang tidak sebanding tidak boleh dikonversi.
    expect(convertQty(5, "pcs", "kg")).toBeNull()
    expect(convertQty(5, "kg", "pcs")).toBeNull()
  })

  it("menerjemahkan satuan suara ke satuan produk", () => {
    const items = toConfirmItems(
      [{ name: "Gula Pasir", qty: 500, unit: "gram", confidence: 0.9 }],
      products,
      "sale",
    )
    expect(items[0].qty).toBe(0.5)
    expect(items[0].unit).toBe("kg")
  })

  it("menggabungkan parser lokal dan AI tanpa kehilangan baris", () => {
    const local: VoiceItem[] = [{ name: "Gula Pasir", qty: 2, unit: "kg", confidence: 0.95 }]
    const remote: VoiceItem[] = [
      { name: "Gula Pasir", qty: 2, unit: "kg", confidence: 0.6 },
      { name: "Minyak Goreng", qty: 3, unit: "liter", confidence: 0.8 },
    ]

    const merged = mergeVoiceItems(local, remote, products)
    expect(merged).toHaveLength(2)
    const gula = merged.find((item) => item.name === "Gula Pasir")
    const minyak = merged.find((item) => item.name === "Minyak Goreng")
    // Baris yang sama dipakai pembacaan paling yakin.
    expect(gula?.qty).toBe(2)
    expect(gula?.confidence).toBe(0.95)
    // Baris yang hanya ada di AI tetap masuk.
    expect(minyak?.qty).toBe(3)
  })

  it("tidak salah cocok karena alias pendek di tengah kata", () => {
    const withAir: Product[] = [
      {
        id: "p-air",
        name: "Air Mineral",
        unit: "botol",
        stock: 10,
        min_stock: 5,
        buy_price: 2000,
        sell_price: 4000,
        aliases: ["air"],
      },
      {
        id: "p-telur",
        name: "Telur Ayam",
        unit: "papan",
        stock: 10,
        min_stock: 5,
        buy_price: 25000,
        sell_price: 30000,
        aliases: ["telur"],
      },
    ]
    // "Telur" tidak boleh tertukar dengan "Air Mineral".
    const found = toConfirmItems(
      [{ name: "telur ayam", qty: 2, unit: "papan", confidence: 0.9 }],
      withAir,
      "sale",
    )
    expect(found[0].productId).toBe("p-telur")
  })
})
