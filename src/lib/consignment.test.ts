import { describe, expect, it } from "vitest"
import {
  buildPayoutText,
  computeSale,
  consignmentHint,
  consignmentStats,
  potentialValue,
  remainingQty,
} from "./consignment"
import type { Consignment } from "./types"

function row(overrides: Partial<Consignment> = {}): Consignment {
  return {
    id: "k-1",
    depositor: "Pak Hendra",
    productName: "Keripik Singkong",
    unit: "pcs",
    qty: 40,
    soldQty: 12,
    buyPrice: 8000,
    sellPrice: 10000,
    commissionPct: 10,
    status: "active",
    note: null,
    createdAt: "2026-11-01T02:00:00.000Z",
    settledAt: null,
    ...overrides,
  }
}

describe("titip jual", () => {
  it("menghitung sisa barang titipan", () => {
    expect(remainingQty(row())).toBe(28)
  })

  it("menghitung potensi penghasilan dari sisa barang × harga jual", () => {
    expect(potentialValue(row())).toBe(28 * 10000)
    expect(potentialValue(row({ soldQty: 40 }))).toBe(0)
  })

  it("menghitung omzet, komisi, dan bagian pemilik barang", () => {
    const sale = computeSale(row(), 10)
    expect(sale.omzet).toBe(100000)
    expect(sale.komisi).toBe(10000)
    expect(sale.bagianPemilik).toBe(90000)
    expect(sale.remaining).toBe(18)
  })

  it("tidak bisa menjual lebih dari stok titipan", () => {
    const sale = computeSale(row(), 999)
    expect(sale.qty).toBe(28)
    expect(sale.remaining).toBe(0)
  })

  it("merangkum omzet, komisi, yang harus dibayar, dan potensi penghasilan", () => {
    const stats = consignmentStats([row()])
    expect(stats.activeCount).toBe(1)
    expect(stats.omzet).toBe(120000)
    expect(stats.komisi).toBe(12000)
    expect(stats.payable).toBe(108000)
    expect(stats.itemsSold).toBe(12)
    expect(stats.itemsRemaining).toBe(28)
    expect(stats.potentialRevenue).toBe(28 * 10000)
  })

  it("membuat ringkasan pembayaran ke pemilik barang", () => {
    const text = buildPayoutText([row()])
    expect(text).toContain("Pak Hendra")
    expect(text).toContain("108.000")
  })

  it("memberi saran tindakan per titipan", () => {
    expect(consignmentHint(row())).toContain("sisa 28 pcs")
    expect(consignmentHint(row({ soldQty: 40 }))).toContain("bisa dibayar")
    expect(consignmentHint(row({ soldQty: 0 }))).toContain("Belum ada")
  })
})
