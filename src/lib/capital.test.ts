import { describe, expect, it } from "vitest"
import { buildCapitalReport, capitalHeadline } from "./capital"
import type { Debt, Product, Transaction } from "./types"

const products: Product[] = [
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

const transactions: Transaction[] = [
  {
    id: "t-1",
    type: "sale",
    product_id: "p-gula",
    qty: 2,
    unit_price: 17000,
    created_at: "2026-11-05T02:00:00.000Z",
  },
  {
    id: "t-2",
    type: "sale",
    product_id: "p-gula",
    qty: 1,
    unit_price: 17000,
    created_at: "2026-10-01T02:00:00.000Z",
  },
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
    created_at: "2026-11-02T02:00:00.000Z",
    settled_at: null,
  },
]

describe("modal awal & untung/rugi", () => {
  const report = buildCapitalReport(
    { amount: 500000, since: "2026-11-01" },
    products,
    transactions,
    debts,
  )

  it("menghitung nilai stok dari harga modal", () => {
    expect(report.stockValue).toBe(10 * 14000)
  })

  it("menghitung laba kotor hanya sejak tanggal modal awal", () => {
    // Transaksi 11/5: 2 × 17.000 − 2 × 14.000 = 6.000 (transaksi Oktober di luar rentang).
    expect(report.grossProfit).toBe(6000)
  })

  it("menjumlahkan utang yang belum lunas sebagai Piutang", () => {
    expect(report.openDebt).toBe(17000)
  })

  it("membandingkan posisi modal sekarang dengan modal awal", () => {
    // 140.000 (stok) + 6.000 (laba) + 17.000 (Piutang) = 163.000
    expect(report.estimatedNow).toBe(163000)
    expect(report.change).toBe(-337000)
    expect(report.verdict).toBe("turun")
    expect(report.message).toContain("berkurang")
  })

  it("menyatakan modal bertambah kalau posisinya naik", () => {
    const naik = buildCapitalReport(
      { amount: 100000, since: "2026-11-01" },
      products,
      transactions,
      debts,
    )
    expect(naik.verdict).toBe("naik")
    expect(naik.message).toContain("bertambah")
  })

  it("menyusun kalimat ringkas", () => {
    expect(capitalHeadline(report)).toContain("Modal awal")
  })
})
