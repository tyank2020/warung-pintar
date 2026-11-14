import { describe, expect, it } from "vitest"
import {
  addLine,
  addConsignmentLine,
  cartTotal,
  changeQty,
  removeLine,
  setLineDeferred,
  setLinePrice,
  splitCheckout,
  stockOutByProduct,
  type CartLine,
} from "./checkout"
import type { Product } from "./types"

const products: Product[] = [
  {
    id: "p-rokok",
    name: "Rokok Kretek",
    unit: "bungkus",
    stock: 10,
    min_stock: 3,
    buy_price: 18000,
    sell_price: 20000,
    aliases: ["rokok"],
  },
  {
    id: "p-pisang",
    name: "Pisang",
    unit: "kg",
    stock: 5,
    min_stock: 2,
    buy_price: 14000,
    sell_price: 17000,
    aliases: [],
  },
]

describe("keranjang kasir", () => {
  it("menambah barang dan menggabungkan barang yang sama", () => {
    const one = addLine([], products[0])
    const two = addLine(one, products[0])
    expect(two).toHaveLength(1)
    expect(two[0]).toMatchObject({ productId: "p-rokok", qty: 2, unitPrice: 20000 })
  })

  it("tidak menimpa harga yang sudah diubah sendiri", () => {
    const lines = addLine([], products[0])
    const customized = setLinePrice(lines, lines[0].key, 19500)
    const again = addLine(customized, products[0])
    expect(again[0].qty).toBe(2)
    expect(again[0].unitPrice).toBe(19500)
  })

  it("mengubah jumlah dan menghapus baris saat jumlah habis", () => {
    const lines = addLine([], products[1])
    const plus = changeQty(lines, lines[0].key, 2)
    expect(plus[0].qty).toBe(3)
    const minus = changeQty(plus, lines[0].key, -3)
    expect(minus).toHaveLength(0)
  })

  it("menghapus baris secara eksplisit", () => {
    const lines = addLine([], products[1])
    expect(removeLine(lines, lines[0].key)).toHaveLength(0)
  })

  it("mengubah harga per baris", () => {
    const lines = addLine([], products[0])
    const updated = setLinePrice(lines, lines[0].key, 19500)
    expect(updated[0].unitPrice).toBe(19500)
    expect(cartTotal(updated)).toBe(19500)
  })

  it("memisahkan barang dibayar dan barang disimpan dulu", () => {
    let lines = addLine([], products[0])
    lines = addLine(lines, products[1])
    lines = setLineDeferred(lines, lines[1].key, true)

    const split = splitCheckout(lines)
    expect(split.sale).toHaveLength(1)
    expect(split.debt).toHaveLength(1)
    expect(split.sale[0].name).toBe("Rokok Kretek")
    expect(split.debt[0].name).toBe("Pisang")
    expect(split.saleTotal).toBe(20000)
    expect(split.debtTotal).toBe(17000)
    expect(split.total).toBe(37000)
  })

  it("menghitung barang yang keluar dari stok per produk", () => {
    let lines: CartLine[] = addLine([], products[1])
    lines = changeQty(lines, lines[0].key, 2)
    lines = setLineDeferred(lines, lines[0].key, true)
    const map = stockOutByProduct(lines)
    expect(map.get("p-pisang")).toBe(3)
  })

  it("memisahkan titipan dari stok warung dan membatasi jumlah sesuai sisa", () => {
    const titipan = addConsignmentLine([], {
      id: "c-1",
      depositor: "Bu Rina",
      productName: "Keripik",
      unit: "bungkus",
      sellPrice: 7000,
      commissionPct: 10,
      remaining: 2,
    })
    const plus = changeQty(titipan, titipan[0].key, 1)
    const split = splitCheckout(plus)

    expect(plus[0].qty).toBe(2)
    expect(split.sale).toHaveLength(0)
    expect(split.consignment).toHaveLength(1)
    expect(split.consignmentTotal).toBe(14000)
    expect(stockOutByProduct(plus).size).toBe(0)
  })
})
