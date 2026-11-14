import { describe, expect, it } from "vitest"
import {
  buildLedgerDigest,
  buildPurchasePlan,
  isPayday,
  ledgerContext,
  ledgerInsights,
} from "./ledger"
import { businessDayStart, DAY_MS } from "./calendar"
import type { Debt, Product, Transaction } from "./types"

const now = new Date("2026-11-11T10:00:00.000Z") // Rabu

const products: Product[] = [
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 3,
    min_stock: 5,
    buy_price: 14000,
    sell_price: 17000,
    aliases: [],
  },
  {
    id: "p-minyak",
    name: "Minyak Goreng",
    unit: "liter",
    stock: 30,
    min_stock: 5,
    buy_price: 15000,
    sell_price: 18000,
    aliases: [],
  },
]

/**
 * Penjualan N hari lalu pada pukul 09:00 waktu warung (WIB).
 * Pakai hari bisnis supaya hasilnya sama di semua zona waktu.
 */
function sale(daysAgo: number, productId: string, qty: number, price: number): Transaction {
  const date = new Date(businessDayStart(now.getTime()) - daysAgo * DAY_MS + 9 * 3_600_000)
  return {
    id: `t-${daysAgo}-${productId}-${qty}`,
    type: "sale",
    product_id: productId,
    qty,
    unit_price: price,
    created_at: date.toISOString(),
  }
}

const transactions: Transaction[] = [
  // Rabu (weekday 3) selalu ramai
  sale(7, "p-gula", 5, 17000),
  sale(14, "p-gula", 6, 17000),
  sale(21, "p-gula", 4, 17000),
  // Senin sepi
  sale(6, "p-minyak", 1, 18000),
  sale(13, "p-minyak", 1, 18000),
  // Transaksi kecil (di bawah 5.000)
  sale(2, "p-minyak", 1, 3000),
  // Harga di bawah modal
  sale(1, "p-gula", 1, 10000),
]

const debts: Debt[] = [
  {
    id: "d-1",
    debtor: "Pak Yono",
    product_name: "Gula Pasir",
    qty: 1,
    unit: "kg",
    amount: 17000,
    note: null,
    created_at: "2026-11-01T02:00:00.000Z",
    settled_at: null,
  },
]

describe("baca buku dagang", () => {
  const digest = buildLedgerDigest(products, transactions, debts, now, 30)

  it("menghitung omzet dan transaksi dalam periode", () => {
    expect(digest.totalTransactions).toBe(7)
    expect(digest.totalSales).toBe(5 * 17000 + 6 * 17000 + 4 * 17000 + 18000 + 18000 + 3000 + 10000)
  })

  it("menghitung rata-rata omzet per hari dalam seminggu", () => {
    // Ekspektasi diturunkan dari transaksi yang sama, jadi bebas timezone.
    const byWeekday = new Map<number, number[]>()
    for (const transaction of transactions) {
      const weekday = new Date(transaction.created_at).getDay()
      const amounts = byWeekday.get(weekday) ?? []
      amounts.push(transaction.qty * transaction.unit_price)
      byWeekday.set(weekday, amounts)
    }
    for (const [weekday, amounts] of byWeekday) {
      const expected = Math.round(
        amounts.reduce((total, amount) => total + amount, 0) / amounts.length,
      )
      expect(digest.weekdayAvg[weekday]).toBe(expected)
    }
  })

  it("mendeteksi transaksi kecil dan harga di bawah modal", () => {
    expect(digest.tinySales).toBe(1)
    // Gula 10.000 (modal 14.000) dan minyak 3.000 (modal 15.000)
    expect(digest.belowCostSales).toBe(2)
  })

  it("mengenali hari gajian tanggal 25 sampai 5", () => {
    expect(isPayday(new Date(2026, 10, 28))).toBe(true)
    expect(isPayday(new Date(2026, 10, 3))).toBe(true)
    expect(isPayday(new Date(2026, 10, 15))).toBe(false)
  })

  it("menyusun temuan yang bisa diperiksa sendiri", () => {
    const insights = ledgerInsights(digest)
    expect(insights.join(" ")).toContain("di bawah")
    expect(insights.join(" ")).toContain("utang")
  })

  it("menyusun konteks AI hanya dari angka yang sudah dihitung", () => {
    const context = ledgerContext(digest)
    expect(context.omzetPeriode).toBe(digest.totalSales)
    expect(context.transaksiNilaiKecil).toBe(1)
    expect(context.penjualanHarian).toHaveLength(30)
  })

  it("menyusun rencana belanja besok dari pola hari", () => {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1) // Kamis
    const plan = buildPurchasePlan(products, digest, tomorrow)
    expect(plan.length).toBeGreaterThan(0)
    const gula = plan.find((item) => item.name === "Gula Pasir")
    expect(gula?.suggestedQty).toBeGreaterThan(0)
    expect(gula?.reason).toContain("Stok")
    expect(plan.every((item) => item.daysOfCover <= 3)).toBe(true)
  })

  it("perkiraan laku memakai laku per barang, bukan porsi barang lain", () => {
    // Gula laku 4 pcs/hari, minyak 0,2 pcs/hari. Minyak tidak boleh mendapat
    // perkiraan laku sebesar gula (dulu semua barang memakai porsi terlaris).
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const manual = {
      ...digest,
      weekdayAvg: [0, 0, 0, 0, 0, 0, 0],
      overallDailyAvg: 1000,
      productDaily: [
        { productId: "p-gula", avgQtyPerDay: 4 },
        { productId: "p-minyak", avgQtyPerDay: 0.2 },
      ],
    }
    const plan = buildPurchasePlan(
      [
        { ...products[0], stock: 1 },
        { ...products[1], stock: 1 },
      ],
      manual,
      tomorrow,
    )
    const gula = plan.find((item) => item.productId === "p-gula")
    const minyak = plan.find((item) => item.productId === "p-minyak")
    expect(gula?.expectedTomorrow).toBe(4)
    expect(minyak?.expectedTomorrow).toBe(1)
  })
})
