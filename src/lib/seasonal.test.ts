import { describe, expect, it } from "vitest"
import {
  buildSeasonalContext,
  computeSeasonalPlan,
  isEidDate,
  isRamadanDate,
  productCategory,
  seasonForDate,
} from "./seasonal"
import { createDemoState } from "./demo"
import { businessDayKey, businessDayStart, DAY_MS } from "./calendar"
import type { Product, Transaction } from "./types"

const now = new Date("2026-11-09T12:00:00")

const kopi: Product = {
  id: "p-kopi",
  name: "Kopi Kapal Api",
  unit: "sachet",
  stock: 8,
  min_stock: 12,
  buy_price: 2000,
  sell_price: 2500,
  aliases: ["kopi", "kopi sachet"],
}

function seasonalSales(): Transaction[] {
  const transactions: Transaction[] = []
  // Hari dibuat dalam zona warung (WIB) supaya rentangnya persis 365 hari
  // di semua zona waktu. Kalau pakai jam perangkat, rentangnya bisa jadi 366
  // hari di zona yang beda dan pola musiknyageser.
  const today = businessDayStart(now.getTime())
  for (let offset = -364; offset <= 0; offset += 1) {
    const dayStart = today + offset * DAY_MS
    const month = Number(businessDayKey(dayStart).slice(5, 7)) - 1
    const qty = month === 10 || month === 11 ? 4 : 1
    transactions.push({
      id: `sale-${offset}`,
      type: "sale",
      product_id: kopi.id,
      qty,
      unit_price: kopi.sell_price,
      created_at: new Date(dayStart + 9 * 3_600_000).toISOString(),
    })
  }
  return transactions
}

describe("seasonal calendar", () => {
  it("maps Indonesian seasons", () => {
    expect(seasonForDate(new Date(2026, 10, 9))).toBe("Musim hujan")
    expect(seasonForDate(new Date(2026, 4, 9))).toBe("Musim kemarau")
    expect(seasonForDate(new Date(2026, 3, 9))).toBe("Peralihan")
  })

  it("knows Ramadan and Lebaran windows", () => {
    expect(isRamadanDate(new Date(2027, 1, 10))).toBe(true)
    expect(isRamadanDate(new Date(2027, 4, 10))).toBe(false)
    expect(isEidDate(new Date(2027, 2, 10))).toBe(true)
  })

  it("puts year-end and payday on the November context", () => {
    const context = buildSeasonalContext(now, 200)
    const labels = context.events.map((event) => event.label)
    expect(context.headline).toContain("akhir tahun")
    expect(labels).toContain("Gajian")
    expect(context.confidence).toBe("tinggi")
  })

  it("switches to awal tahun in early January", () => {
    const context = buildSeasonalContext(new Date("2027-01-02T12:00:00"), 200)
    expect(context.headline).toContain("awal tahun")
    expect(context.events.map((event) => event.label)).toContain("Awal tahun")
  })
})

describe("productCategory", () => {
  it("maps products without inventing a new catalog", () => {
    expect(productCategory(kopi)).toBe("minuman")
    expect(productCategory({ ...kopi, name: "Mi Instan", aliases: ["mi", "indomie"] })).toBe(
      "instan",
    )
    expect(productCategory({ ...kopi, name: "Beras Ramos", aliases: ["beras"] })).toBe("sembako")
    expect(productCategory({ ...kopi, name: "Sabun Mandi", aliases: ["sabun"] })).toBe(
      "rumah tangga",
    )
  })
})

describe("computeSeasonalPlan", () => {
  it("finds the seasonal uplift and suggests a restock with real numbers", () => {
    const plan = computeSeasonalPlan([kopi], seasonalSales(), now)
    const signal = plan.signals[0]

    expect(plan.dataDays).toBe(365)
    expect(plan.context.season).toBe("Musim hujan")
    expect(signal.seasonalIndex).toBeGreaterThan(1.5)
    expect(signal.upliftPct).toBeGreaterThan(50)
    expect(signal.suggestedQty).toBeGreaterThan(0)
    expect(signal.estimatedCost).toBe(signal.suggestedQty * kopi.buy_price)

    const restock = plan.recommendations.find((item) => item.kind === "restock")
    expect(restock?.productName).toBe(kopi.name)
    expect(restock?.suggestedQty).toBe(signal.suggestedQty)
    expect(plan.recommendations.length).toBeGreaterThan(0)
    expect(
      plan.recommendations.every((item) => !/laba bersih/i.test(`${item.action} ${item.reason}`)),
    ).toBe(true)
  })

  it("builds a year of deterministic demo data", () => {
    const demo = createDemoState(now)
    const plan = computeSeasonalPlan(demo.products, demo.transactions, now)

    expect(demo.products).toHaveLength(12)
    expect(demo.transactions.length).toBeGreaterThan(3000)
    expect(plan.dataDays).toBeGreaterThan(300)
    expect(plan.signals).toHaveLength(12)
    expect(plan.recommendations.length).toBeGreaterThanOrEqual(2)
    expect(plan.recommendations.length).toBeLessThanOrEqual(4)
    expect(
      plan.signals.every(
        (signal) =>
          Number.isFinite(signal.avgDaily30) &&
          Number.isFinite(signal.seasonalIndex) &&
          Number.isFinite(signal.daysOfCover) &&
          signal.suggestedQty >= 0,
      ),
    ).toBe(true)
  })
})
