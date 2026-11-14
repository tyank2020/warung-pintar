import { describe, expect, it } from "vitest"
import {
  findNotesWithoutStock,
  findStockDiscrepancies,
  findingsForNote,
  summarizeFindings,
} from "./reconcile"
import type { Product, PurchaseNote, Transaction } from "./types"

const products: Product[] = [
  {
    id: "p-telur",
    name: "Telur Ayam",
    unit: "papan",
    stock: 8,
    min_stock: 5,
    buy_price: 27000,
    sell_price: 30000,
    aliases: ["telur"],
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 20,
    min_stock: 5,
    buy_price: 14000,
    sell_price: 17000,
    aliases: [],
  },
]

function note(overrides: Partial<PurchaseNote> = {}): PurchaseNote {
  return {
    id: "n-1",
    createdAt: "2026-11-05T02:00:00.000Z",
    addedBy: "Pegawai toko",
    total: 270000,
    items: [{ name: "Telur Ayam", qty: 10, unit: "papan", unitPrice: 27000 }],
    image: "",
    source: "scan",
    ...overrides,
  }
}

describe("rekonsiliasi stok", () => {
  it("menemukan selisih opname dan mengaitkannya ke nota terdekat", () => {
    const transactions: Transaction[] = [
      {
        id: "t-purchase",
        type: "purchase",
        product_id: "p-telur",
        qty: 10,
        unit_price: 27000,
        created_at: "2026-11-05T02:00:00.000Z",
      },
      {
        id: "t-adjust",
        type: "adjustment",
        product_id: "p-telur",
        qty: -2,
        unit_price: 27000,
        created_at: "2026-11-06T02:00:00.000Z",
      },
    ]

    const findings = findStockDiscrepancies(products, transactions, [note()])
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("selisih-stok")
    expect(findings[0].delta).toBe(-2)
    expect(findings[0].value).toBe(54000)
    expect(findings[0].noteId).toBe("n-1")
    expect(findings[0].noteAddedBy).toBe("Pegawai toko")
    expect(findings[0].message).toContain("cek nota")
  })

  it("menghitung stok menurut catatan saat opname", () => {
    const transactions: Transaction[] = [
      {
        id: "t-adjust",
        type: "adjustment",
        product_id: "p-telur",
        qty: -2,
        unit_price: 27000,
        created_at: "2026-11-06T02:00:00.000Z",
      },
      // Setelah opname, barang laku 4 papan.
      {
        id: "t-sale",
        type: "sale",
        product_id: "p-telur",
        qty: 4,
        unit_price: 30000,
        created_at: "2026-11-07T02:00:00.000Z",
      },
    ]

    const findings = findStockDiscrepancies(products, transactions, [])
    // Catatan saat itu 14, fisik 12 → kurang 2 (kemudian laku 4, sisa 8).
    expect(findings[0].systemQty).toBe(14)
    expect(findings[0].countedQty).toBe(12)
    expect(findings[0].delta).toBe(-2)
  })

  it("tidak menandai barang yang opname-nya cocok", () => {
    const transactions: Transaction[] = [
      {
        id: "t-adjust",
        type: "adjustment",
        product_id: "p-telur",
        qty: 0,
        unit_price: 27000,
        created_at: "2026-11-06T02:00:00.000Z",
      },
    ]
    expect(findStockDiscrepancies(products, transactions, [])).toHaveLength(0)
  })

  it("tidak menganggap barang simpen-dulu sebagai selisih opname", () => {
    const transactions: Transaction[] = [
      {
        id: "t-debt-out",
        type: "adjustment",
        product_id: "p-telur",
        qty: -2,
        unit_price: 27000,
        created_at: "2026-11-06T02:00:00.000Z",
        note: "simpen-dulu",
      },
    ]
    expect(findStockDiscrepancies(products, transactions, [])).toHaveLength(0)
  })

  it("menandai nota yang tidak punya stok masuk", () => {
    const findings = findNotesWithoutStock(products, [], [note()])
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe("nota-tanpa-stok")
    expect(findings[0].noteId).toBe("n-1")
    expect(findings[0].value).toBe(270000)
    expect(findings[0].severity).toBe("berat")
  })

  it("tidak menandai nota yang cocok dengan stok masuk", () => {
    const transactions: Transaction[] = [
      {
        id: "t-purchase",
        type: "purchase",
        product_id: "p-telur",
        qty: 10,
        unit_price: 27000,
        created_at: "2026-11-05T03:00:00.000Z",
      },
    ]
    expect(findNotesWithoutStock(products, transactions, [note()])).toHaveLength(0)
  })

  it("merangkum temuan dan memfilter per nota", () => {
    const transactions: Transaction[] = [
      {
        id: "t-adjust",
        type: "adjustment",
        product_id: "p-telur",
        qty: -2,
        unit_price: 27000,
        created_at: "2026-11-06T02:00:00.000Z",
      },
    ]
    const findings = findStockDiscrepancies(products, transactions, [note()])
    const summary = summarizeFindings(findings)
    expect(summary.count).toBe(1)
    expect(summary.totalValue).toBe(54000)
    expect(summary.linkedToNotes).toBe(1)
    expect(findingsForNote(findings, "n-1")).toHaveLength(1)
    expect(findingsForNote(findings, "lain")).toHaveLength(0)
  })
})
