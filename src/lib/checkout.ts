import type { ConfirmItem, Product } from "./types"
import { productLabel } from "./format"

/**
 * Logika keranjang kasir — murni (tanpa React), supaya bisa diuji.
 *
 * Bedanya dengan alur suara: kasir sengaja tidak menebak. Semua baris
 * keranjang lahir dari ketukan pemilik warung, jadi tidak ada "hampir benar"
 * yang diam-diam jadi transaksi.
 */

/** Satu baris di keranjang kasir. */
export interface CartLine {
  key: string
  productId: string
  name: string
  unit: string
  qty: number
  unitPrice: number
  /** Barang disimpan dulu (dicatat di buku utang), bukan dibayar. */
  deferred: boolean
  /** Barang titipan milik orang lain — bukan stok warung. */
  consignmentId?: string | null
  depositor?: string
  commissionPct?: number
  /** Batas jumlah untuk barang titipan, berdasarkan sisa titipan. */
  maxQty?: number
}

export function cartKey(productId: string): string {
  return `kasir-${productId}`
}

export function consignmentKey(consignmentId: string): string {
  return `kasir-titip-${consignmentId}`
}

/** Tambah barang menitip (bukan stok warung) ke keranjang. */
export function addConsignmentLine(
  lines: CartLine[],
  row: {
    id: string
    depositor: string
    productName: string
    unit: string
    sellPrice: number
    commissionPct: number
    remaining: number
  },
): CartLine[] {
  const key = consignmentKey(row.id)
  const existing = lines.find((line) => line.key === key)
  if (existing) {
    return lines.map((line) =>
      line.key === key
        ? {
            ...line,
            qty: Math.min(line.qty + 1, row.remaining),
            maxQty: row.remaining,
            commissionPct: row.commissionPct,
          }
        : line,
    )
  }
  return [
    ...lines,
    {
      key,
      productId: key,
      name: row.productName,
      unit: row.unit,
      qty: Math.min(1, row.remaining),
      unitPrice: row.sellPrice,
      deferred: false,
      consignmentId: row.id,
      depositor: row.depositor,
      commissionPct: row.commissionPct,
      maxQty: row.remaining,
    },
  ]
}

/** Tambah satu barang ke keranjang. Barang yang sama digabung, bukan diduplikasi. */
export function addLine(lines: CartLine[], product: Product): CartLine[] {
  const existing = lines.find((line) => line.productId === product.id)
  if (existing) {
    return lines.map((line) =>
      line.productId === product.id ? { ...line, qty: line.qty + 1 } : line,
    )
  }
  return [
    ...lines,
    {
      key: cartKey(product.id),
      productId: product.id,
      name: productLabel(product),
      unit: product.unit,
      qty: 1,
      unitPrice: product.sell_price,
      deferred: false,
    },
  ]
}

/** Ubah jumlah baris. Jumlah yang habis memunculkan baris dari keranjang. */
export function changeQty(lines: CartLine[], key: string, delta: number): CartLine[] {
  const target = lines.find((line) => line.key === key)
  if (!target) return lines
  const qty =
    target.maxQty === undefined
      ? target.qty + delta
      : Math.min(target.maxQty, target.qty + delta)
  if (qty <= 0) return lines.filter((line) => line.key !== key)
  return lines.map((line) => (line.key === key ? { ...line, qty } : line))
}

/** Ubah harga jual per baris (misal harga khusus untuk satu Piutang). */
export function setLinePrice(lines: CartLine[], key: string, unitPrice: number): CartLine[] {
  return lines.map((line) => (line.key === key ? { ...line, unitPrice } : line))
}

/** Tandai barang sebagai "simpen dulu" (dicatat di buku utang). */
export function setLineDeferred(
  lines: CartLine[],
  key: string,
  deferred: boolean,
): CartLine[] {
  return lines.map((line) => (line.key === key ? { ...line, deferred } : line))
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => line.key !== key)
}

export function lineTotal(line: CartLine): number {
  return line.qty * line.unitPrice
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + lineTotal(line), 0)
}

export interface CheckoutSplit {
  /** Barang warung dibayar saat ini. */
  sale: ConfirmItem[]
  /** Barang warung disimpan dulu (utang). */
  debt: ConfirmItem[]
  /** Barang titipan (milik orang lain) yang dibayar saat ini. */
  consignment: ConfirmItem[]
  saleTotal: number
  debtTotal: number
  consignmentTotal: number
  total: number
}

function toConfirmItem(line: CartLine): ConfirmItem {
  return {
    key: line.key,
    productId: line.productId,
    name: line.name,
    qty: line.qty,
    unit: line.unit,
    unitPrice: line.unitPrice,
    consignmentId: line.consignmentId ?? null,
    depositor: line.depositor,
  }
}

/**
 * Pecah keranjang: barang warung (dibayar & disimpan dulu) dan barang
 * titipan. Titipan tidak bisa "simpen dulu" — pemilik barang tetap dibayar,
 * apa pun pembayarannya.
 */
export function splitCheckout(lines: CartLine[]): CheckoutSplit {
  const own = lines.filter((line) => !line.consignmentId)
  const sale = own.filter((line) => !line.deferred).map(toConfirmItem)
  const debt = own.filter((line) => line.deferred).map(toConfirmItem)
  const consignment = lines.filter((line) => line.consignmentId).map(toConfirmItem)
  return {
    sale,
    debt,
    consignment,
    saleTotal: sale.reduce((total, item) => total + item.qty * item.unitPrice, 0),
    debtTotal: debt.reduce((total, item) => total + item.qty * item.unitPrice, 0),
    consignmentTotal: consignment.reduce((total, item) => total + item.qty * item.unitPrice, 0),
    total: cartTotal(lines),
  }
}

/** Jumlah barang yang akan keluar dari stok (dibayar + disimpan dulu). */
export function stockOutByProduct(lines: CartLine[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of lines) {
    if (line.consignmentId) continue
    map.set(line.productId, (map.get(line.productId) ?? 0) + line.qty)
  }
  return map
}
