import { describe, expect, it } from "vitest"
import { confirmIsValid, confirmTotal } from "./ConfirmEditor"
import type { ConfirmItem, Product } from "../lib/types"

const products: Product[] = [
  {
    id: "p-beras",
    name: "Beras Ramos",
    unit: "kg",
    stock: 8,
    min_stock: 5,
    buy_price: 10000,
    sell_price: 15000,
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

describe("confirmTotal", () => {
  it("sums quantity times unit price", () => {
    expect(confirmTotal([row({ qty: 2 }), row({ qty: 3, unitPrice: 10000 })])).toBe(60000)
  })
})

describe("confirmIsValid", () => {
  it("accepts a sale within stock", () => {
    expect(confirmIsValid([row({ qty: 8 })], products, "sale")).toBe(true)
  })

  it("rejects a sale when duplicate rows exceed stock together", () => {
    expect(confirmIsValid([row({ qty: 5 }), row({ qty: 5 })], products, "sale")).toBe(false)
  })

  it("accepts a purchase for a new product with a selling price", () => {
    const item = row({
      productId: "",
      name: "Gula Merah",
      unitPrice: 12000,
      isNew: true,
      newSellPrice: 15000,
    })

    expect(confirmIsValid([item], products, "purchase")).toBe(true)
  })

  it("rejects a purchase for a new product without a cost price", () => {
    const item = row({ productId: "", name: "Gula Merah", unitPrice: 0, isNew: true })

    expect(confirmIsValid([item], products, "purchase")).toBe(false)
  })

  it("rejects an unknown sale row", () => {
    expect(confirmIsValid([row({ productId: "", isNew: true })], products, "sale")).toBe(false)
  })
})
