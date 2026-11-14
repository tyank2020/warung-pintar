import { describe, expect, it } from "vitest"
import {
  applyAdjustmentToStock,
  applyPurchaseToStock,
  applySaleToStock,
  requestedByProduct,
  validItems,
} from "./inventory"
import type { ConfirmItem, Product } from "./types"

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
]

const row = (overrides: Partial<ConfirmItem> = {}): ConfirmItem => ({
  key: crypto.randomUUID(),
  productId: "p-beras",
  name: "Beras Ramos",
  qty: 1,
  unit: "kg",
  unitPrice: 15000,
  isNew: false,
  ...overrides,
})

describe("validItems", () => {
  it("membuang baris tanpa produk, jumlah nol, atau jumlah tidak valid", () => {
    const items = [
      row(),
      row({ productId: "" }),
      row({ qty: 0 }),
      row({ qty: Number.NaN }),
    ]
    expect(validItems(items)).toHaveLength(1)
  })
})

describe("requestedByProduct", () => {
  it("menjumlahkan baris untuk produk yang sama", () => {
    const requested = requestedByProduct([row({ qty: 2 }), row({ qty: 3 })])
    expect(requested.get("p-beras")).toBe(5)
  })
})

describe("applySaleToStock", () => {
  it("mengurangi stok sesuai jumlah yang terjual", () => {
    const next = applySaleToStock(products, [row({ qty: 4 })])
    expect(next[0].stock).toBe(6)
    expect(next[1].stock).toBe(3)
  })

  it("menolak penjualan yang melebihi stok", () => {
    expect(() => applySaleToStock(products, [row({ qty: 11 })])).toThrow(/tinggal 10 kg/)
  })

  it("menghitung baris kembar sebagai satu permintaan", () => {
    expect(() => applySaleToStock(products, [row({ qty: 6 }), row({ qty: 6 })])).toThrow(
      /tinggal 10 kg/,
    )
  })

  it("tidak mengubah input", () => {
    const before = products[0].stock
    applySaleToStock(products, [row({ qty: 4 })])
    expect(products[0].stock).toBe(before)
  })
})

describe("applyPurchaseToStock", () => {
  it("menambah stok dan memperbarui harga modal", () => {
    const next = applyPurchaseToStock(products, [
      row({ productId: "p-gula", qty: 10, unitPrice: 13000 }),
    ])
    expect(next[1].stock).toBe(13)
    expect(next[1].buy_price).toBe(13000)
  })

  it("tidak menimpa harga modal dengan nol", () => {
    const next = applyPurchaseToStock(products, [
      row({ productId: "p-gula", qty: 5, unitPrice: 0 }),
    ])
    expect(next[1].buy_price).toBe(12000)
  })
})

describe("applyAdjustmentToStock", () => {
  it("mengurangi stok untuk barang hilang", () => {
    const next = applyAdjustmentToStock(products, "p-beras", -2)
    expect(next[0].stock).toBe(8)
  })

  it("menambah stok untuk barang ditemukan saat opname", () => {
    const next = applyAdjustmentToStock(products, "p-beras", 5)
    expect(next[0].stock).toBe(15)
  })

  it("menolak pengurangan yang melebihi stok", () => {
    expect(() => applyAdjustmentToStock(products, "p-beras", -11)).toThrow(/tidak bisa dikurangi/)
  })

  it("menolak penyesuaian nol", () => {
    expect(() => applyAdjustmentToStock(products, "p-beras", 0)).toThrow(/lebih dari nol/)
  })
})
