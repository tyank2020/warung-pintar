import { describe, expect, it } from "vitest"
import { buildDailyBook, buildHeadline, buildSummaryText } from "./closing"
import { businessDayStart, DAY_MS } from "./calendar"
import { computeStats } from "./stats"
import type { Debt, Product, Transaction } from "./types"

const products: Product[] = [
  {
    id: "p-kopi",
    name: "Kopi Kapal Api",
    unit: "sachet",
    stock: 30,
    min_stock: 10,
    buy_price: 9000,
    sell_price: 11000,
    aliases: ["kopi"],
  },
  {
    id: "p-telur",
    name: "Telur Ayam",
    unit: "papan",
    stock: 3,
    min_stock: 5,
    buy_price: 27000,
    sell_price: 30000,
    aliases: ["telur"],
  },
]

const now = new Date("2026-11-11T10:00:00.000Z")

/**
 * Waktu transaksi dalam zona warung (WIB), dihitung dari hari bisnis `now`.
 *
 * Kalau jamnya pakai jam perangkat, hasil tesnya beda di setiap zona waktu:
 * di UTC `iso(0, 11)` jadi satu jam di masa depan dan tidak masuk hitungan
 * "hari ini". Dengan cara ini hasilnya sama di mana pun.
 */
function iso(dayOffset: number, hour = 10) {
  const dayStart = businessDayStart(now.getTime()) + dayOffset * DAY_MS
  return new Date(dayStart + hour * 3_600_000).toISOString()
}

const transactions: Transaction[] = [
  {
    id: "t-1",
    type: "sale",
    product_id: "p-kopi",
    qty: 4,
    unit_price: 11000,
    created_at: iso(0, 9),
  },
  {
    id: "t-2",
    type: "sale",
    product_id: "p-telur",
    qty: 1,
    unit_price: 30000,
    created_at: iso(0, 11),
  },
  {
    id: "t-3",
    type: "purchase",
    product_id: "p-telur",
    qty: 10,
    unit_price: 27000,
    created_at: iso(-6, 8),
  },
  {
    id: "t-4",
    type: "purchase",
    product_id: "p-telur",
    qty: 10,
    unit_price: 25000,
    created_at: iso(-20, 8),
  },
]

const debts: Debt[] = [
  {
    id: "d-1",
    debtor: "Pak Yono",
    product_name: "Rokok Kretek",
    qty: 2,
    unit: "bungkus",
    amount: 40000,
    note: null,
    created_at: iso(-12, 9),
    settled_at: null,
  },
  {
    id: "d-2",
    debtor: "Bu Tini",
    product_name: "Minyak Goreng",
    qty: 1,
    unit: "liter",
    amount: 15000,
    note: null,
    created_at: iso(-2, 9),
    settled_at: null,
  },
  {
    id: "d-3",
    debtor: "Pak Yatmi",
    product_name: "Gula Pasir",
    qty: 1,
    unit: "kg",
    amount: 14000,
    note: null,
    created_at: iso(-30, 9),
    settled_at: iso(-20, 9),
  },
]

describe("tutup buku hari ini", () => {
  const stats = computeStats(products, transactions, now)
  const book = buildDailyBook(products, transactions, debts, stats, now)

  it("merangkum penjualan hari ini dan laba kotor", () => {
    expect(book.sales).toBe(74000)
    expect(book.transactionCount).toBe(2)
    expect(book.itemsSold).toBe(5)
    expect(book.grossProfit).toBe(74000 - (4 * 9000 + 1 * 27000))
  })

  it("menampilkan barang terlaris hari ini", () => {
    expect(book.topItems[0].name).toBe("Kopi Kapal Api")
    expect(book.topItems[0].qty).toBe(4)
  })

  it("menghitung utang yang belum dibayar dan yang lewat 7 hari", () => {
    expect(book.debts).toHaveLength(2)
    expect(book.debtTotal).toBe(55000)
    expect(book.overdueDebts).toHaveLength(1)
    expect(book.overdueDebts[0].debtor).toBe("Pak Yono")
    expect(book.overdueDebts[0].ageDays).toBe(12)
  })

  it("menandai barang yang perlu restok dan modal yang naik", () => {
    expect(book.lowStock.length).toBeGreaterThan(0)
    expect(book.modalUp.length).toBeGreaterThan(0)
    expect(book.modalUp[0].name).toBe("Telur Ayam")
  })

  it("membuat kalimat utama yang bisa dibaca cepat", () => {
    expect(book.headline).toContain("74.000")
    expect(book.headline).toContain("utang")
  })

  it("membuat ringkasan teks untuk disalin", () => {
    const text = buildSummaryText(book)
    expect(text).toContain("Tutup buku")
    expect(text).toContain("Utang berjalan")
    expect(text).toContain("Kopi Kapal Api")
  })

  it("menyusun kalimat berbeda saat belum ada penjualan", () => {
    const kosong = buildDailyBook(products, [], debts, computeStats(products, [], now), now)
    expect(kosong.headline).toContain("Belum ada penjualan")
    expect(buildHeadline({
      sales: 0,
      transactionCount: 0,
      itemsSold: 0,
      debtTotal: 0,
      overdueCount: 0,
      lowStockCount: 0,
      modalUpCount: 0,
    })).toContain("Catatan tetap aman")
  })
})
