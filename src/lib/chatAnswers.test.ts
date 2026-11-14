import { describe, expect, it } from "vitest"
import { fallbackAnswer, type ChatFacts } from "./chatAnswers"

const facts: ChatFacts = {
  todaySales: 150000,
  todayTransactions: 8,
  todayProfit: 40000,
  weekSales: 1200000,
  weekProfit: 320000,
  weekTransactions: 60,
  openDebts: 3,
  debtAmount: 85000,
  topDebtor: { name: "Pak Yono", amount: 40000 },
  lowStock: [{ name: "Telur Ayam", stock: 2, unit: "papan", minStock: 5 }],
  suggestions: [{ name: "Telur Ayam", qty: 4, unit: "papan", cost: 100000 }],
  topProduct: { name: "Kopi Kapal Api", qty: 30, revenue: 450000 },
}

describe("jawaban cadangan chat", () => {
  it("menjawab pertanyaan utang dari data", () => {
    const answer = fallbackAnswer("siapa yang paling banyak utang?", facts)
    expect(answer).toContain("Pak Yono")
    expect(answer).toContain("85.000")
  })

  it("menjawab pertanyaan kulakan dari saran stok", () => {
    const answer = fallbackAnswer("kapan sebaiknya kulakan?", facts)
    expect(answer).toContain("Telur Ayam")
  })

  it("menjawab laba dengan sebutan laba kotor", () => {
    const answer = fallbackAnswer("berapa laba minggu ini?", facts)
    expect(answer).toContain("Laba kotor")
  })

  it("menjawab penjualan hari ini", () => {
    const answer = fallbackAnswer("penjualan hari ini berapa?", facts)
    expect(answer).toContain("150.000")
  })

  it("mengembalikan null untuk pertanyaan di luar data", () => {
    expect(fallbackAnswer("apa kabar cuaca besok?", facts)).toBeNull()
  })

  it("menjawab buku utang yang bersih", () => {
    const clean = { ...facts, openDebts: 0, debtAmount: 0, topDebtor: null }
    expect(fallbackAnswer("berapa utang saya?", clean)).toContain("bersih")
  })
})
