import { rupiah } from "./format"

/**
 * Jawaban cadangan yang dihitung sendiri dari data warung.
 *
 * Dipakai kalau AI sedang tidak tersedia (mode demo, offline, atau limit).
 * Aturannya sama dengan produk: angka selalu dari data, tidak pernah dikarang.
 */

export interface ChatFacts {
  todaySales: number
  todayTransactions: number
  todayProfit: number
  weekSales: number
  weekProfit: number
  weekTransactions: number
  openDebts: number
  debtAmount: number
  topDebtor: { name: string; amount: number } | null
  lowStock: Array<{ name: string; stock: number; unit: string; minStock: number }>
  suggestions: Array<{ name: string; qty: number; unit: string; cost: number }>
  topProduct: { name: string; qty: number; revenue: number } | null
}

function has(question: string, ...words: string[]) {
  return words.some((word) => question.includes(word))
}

/**
 * Kembalikan jawaban singkat dari data, atau null kalau pertanyaannya di luar
 * jangkauan data yang tersedia.
 */
export function fallbackAnswer(question: string, facts: ChatFacts): string | null {
  const q = question.toLowerCase()

  if (has(q, "utang", "ngutang", "bayar nanti", "simpen dulu")) {
    if (facts.openDebts === 0) {
      return "Buku utangnya bersih sekarang — tidak ada barang yang disimpan dulu."
    }
    const top = facts.topDebtor
      ? ` Yang paling besar: ${facts.topDebtor.name} (${rupiah(facts.topDebtor.amount)}).`
      : ""
    return `Ada ${facts.openDebts} barang tersimpan dulu, total ${rupiah(facts.debtAmount)}.${top}`
  }

  if (has(q, "restock", "kulakan", "beli lagi", "belanja apa", "harus beli")) {
    if (facts.suggestions.length === 0) {
      return "Stok semua barang masih aman untuk beberapa hari ke depan, jadi belum ada pembelian mendesak."
    }
    const items = facts.suggestions
      .slice(0, 3)
      .map((item) => `${item.name} ${item.qty} ${item.unit} (${rupiah(item.cost)})`)
      .join(", ")
    return `Prioritas kulakan: ${items}.`
  }

  if (has(q, "stok", "habis", "menipis", "sisa")) {
    if (facts.lowStock.length === 0) return "Semua stok di atas batas minimum."
    const items = facts.lowStock
      .slice(0, 3)
      .map((item) => `${item.name} tinggal ${item.stock} ${item.unit}`)
      .join(", ")
    return `Barang yang perlu perhatian: ${items}.`
  }

  if (has(q, "laba", "untung", "profit", "margin")) {
    return `Laba kotor 7 hari terakhir: ${rupiah(facts.weekProfit)} dari penjualan ${rupiah(facts.weekSales)}. Hari ini ${rupiah(facts.todayProfit)} dari ${facts.todayTransactions} transaksi.`
  }

  if (has(q, "terlaris", "best", "paling laku", "best seller")) {
    if (!facts.topProduct) return "Belum ada data penjualan minggu ini."
    return `Paling laku: ${facts.topProduct.name}, ${facts.topProduct.qty} unit dengan omzet ${rupiah(facts.topProduct.revenue)}.`
  }

  if (has(q, "penjualan", "omzet", "pendapatan", "hari ini", "minggu ini", "berapa")) {
    return `Penjualan hari ini ${rupiah(facts.todaySales)} dari ${facts.todayTransactions} transaksi. 7 hari terakhir ${rupiah(facts.weekSales)} dari ${facts.weekTransactions} transaksi.`
  }

  return null
}
