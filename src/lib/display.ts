import type { IconName } from "../components/Icon"
import { productLabel, rupiah } from "./format"
import { stockStatus } from "./stats"
import type { Product, TransactionWithProduct } from "./types"

export const statusColor: Record<string, string> = {
  Kritis: "#ef6b50",
  Menipis: "#f1a13c",
  Aman: "#2d9b70",
}

export function greetingForHour(hour: number) {
  if (hour < 11) return "Selamat pagi"
  if (hour < 15) return "Selamat siang"
  if (hour < 19) return "Selamat sore"
  return "Selamat malam"
}

export function transactionTitle(row: TransactionWithProduct) {
  if (row.type === "sale") return `Penjualan ${productLabel(row.product)}`
  if (row.type === "purchase") return `Kulakan ${productLabel(row.product)}`
  return `Penyesuaian ${productLabel(row.product)}`
}

export function transactionAmount(row: TransactionWithProduct) {
  const total = row.qty * row.unit_price
  if (row.type === "sale") return `+${rupiah(total)}`
  if (row.type === "purchase") return `−${rupiah(total)}`
  return rupiah(total)
}

export function transactionTone(row: TransactionWithProduct) {
  return row.type === "sale" ? "green" : "orange"
}

export function transactionIcon(row: TransactionWithProduct): IconName {
  if (row.type === "sale") return "up"
  if (row.type === "purchase") return "down"
  return "edit"
}

export function statusFor(product: Product) {
  return stockStatus(product)
}
