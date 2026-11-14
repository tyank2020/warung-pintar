import { describe, expect, it } from "vitest"
import {
  purchaseExpenses,
  todayPurchaseExpenses,
  weeklyPurchaseExpenses,
} from "./expense"
import type { Product, Transaction } from "./types"

const products: Product[] = [
  {
    id: "p-air",
    name: "Air Mineral",
    unit: "botol",
    stock: 50,
    min_stock: 24,
    buy_price: 12000,
    sell_price: 15000,
    aliases: [],
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 10,
    min_stock: 5,
    buy_price: 14000,
    sell_price: 17000,
    aliases: [],
  },
]

function purchase(id: string, product: string, qty: number, unitPrice: number, iso: string): Transaction {
  return { id, type: "purchase", product_id: product, qty, unit_price: unitPrice, created_at: iso }
}

// Sekarang = 9 November 02:00 UTC = 10 November 09:00 WIB.
// Hari ini menurut warung (Asia/Jakarta) adalah 10 November.
const now = Date.parse("2026-11-10T02:00:00Z")

describe("todayPurchaseExpenses", () => {
  it("mencacah pembelian hari ini memakai zona waktu warung, bukan UTC", () => {
    const transactions: Transaction[] = [
      // 16:30 UTC = 23:30 WIB 9 November → kemarin, bukan hari ini.
      purchase("t-yesterday", "p-gula", 5, 14000, "2026-11-09T16:30:00Z"),
      // 18:30 UTC = 01:30 WIB 10 November → hari ini.
      purchase("t-today", "p-air", 10, 12000, "2026-11-09T18:30:00Z"),
    ]

    const summary = todayPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(120000)
    expect(summary.entries).toBe(1)
    expect(summary.items).toBe(10)
    expect(summary.recent[0]).toMatchObject({
      id: "t-today",
      name: "Air Mineral",
      qty: 10,
      unitPrice: 12000,
      total: 120000,
    })
  })

  it("menambah pengeluaran beberapa catatan jadi satu total", () => {
    const transactions: Transaction[] = [
      purchase("a", "p-air", 10, 12000, "2026-11-09T18:00:00Z"),
      purchase("b", "p-gula", 3, 14000, "2026-11-09T19:00:00Z"),
    ]

    const summary = todayPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(120000 + 42000)
    expect(summary.entries).toBe(2)
    // Terbaru di atas.
    expect(summary.recent.map((entry) => entry.id)).toEqual(["b", "a"])
  })

  it("mengabaikan transaksi masa depan dan produk yang sudah hilang", () => {
    const transactions: Transaction[] = [
      // 05:00 UTC = 12:00 WIB → setelah "sekarang" (09:00 WIB).
      purchase("t-future", "p-air", 10, 12000, "2026-11-10T05:00:00Z"),
      purchase("t-ghost", "p-hilang", 10, 12000, "2026-11-09T18:00:00Z"),
    ]

    const summary = todayPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(0)
    expect(summary.entries).toBe(0)
    expect(summary.recent).toHaveLength(0)
  })

  it("tidak memasukkan penjualan dan penyesuaian", () => {
    const transactions: Transaction[] = [
      { id: "s", type: "sale", product_id: "p-air", qty: 20, unit_price: 15000, created_at: "2026-11-09T18:00:00Z" },
      { id: "j", type: "adjustment", product_id: "p-air", qty: -2, unit_price: 0, created_at: "2026-11-09T18:00:00Z" },
    ]

    const summary = todayPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(0)
  })

  it("pembelian tanpa biaya (gratis) tetap tercatat sebagai stok masuk", () => {
    const transactions: Transaction[] = [purchase("t-free", "p-gula", 2, 0, "2026-11-09T18:00:00Z")]
    const summary = todayPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(0)
    expect(summary.entries).toBe(1)
    expect(summary.items).toBe(2)
  })
})

describe("purchaseExpenses periode bebas", () => {
  it("hanya menghitung transaksi di dalam rentang [start, end)", () => {
    const start = Date.parse("2026-11-09T17:00:00Z")
    const end = Date.parse("2026-11-10T17:00:00Z")
    const transactions: Transaction[] = [
      purchase("t-in", "p-air", 5, 12000, "2026-11-09T18:00:00Z"),
      purchase("t-out", "p-air", 5, 12000, "2026-11-10T18:00:00Z"),
    ]

    const summary = purchaseExpenses(products, transactions, start, end, now)
    expect(summary.total).toBe(60000)
  })
})

describe("weeklyPurchaseExpenses", () => {
  it("menjumlah pembelian 7 hari terakhir menurut zona warung", () => {
    const transactions: Transaction[] = [
      // 23:00 UTC 4 November = 06:00 WIB 5 November → 5 hari lalu, masuk.
      purchase("t-in-window", "p-gula", 4, 14000, "2026-11-04T23:00:00Z"),
      // 23:00 UTC 2 November = 06:00 WIB 3 November → 7 hari lalu, di luar jendela.
      purchase("t-out-window", "p-gula", 4, 14000, "2026-11-02T23:00:00Z"),
    ]

    const summary = weeklyPurchaseExpenses(products, transactions, now)
    expect(summary.total).toBe(56000)
    expect(summary.entries).toBe(1)
  })
})
