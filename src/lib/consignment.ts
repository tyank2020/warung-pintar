import { numberID, rupiah } from "./format"
import type { Consignment } from "./types"

/**
 * Titip jual (konsinyasi).
 *
 * Warung jadi etalase untuk barang milik orang lain — tetangga, sajadah.
 * Barang itu bukan milik warung, jadi tidak boleh masuk hitungan stok warung
 * sendiri; yang dihitung adalah komisi warung dan bagian yang harus dibayar
 * ke pemilik barang. Semua angka dari catatan titipan.
 */

export interface ConsignmentSale {
  qty: number
  /** Omzet dari penjualan titipan. */
  omzet: number
  /** Komisi untuk warung. */
  komisi: number
  /** Bagian yang harus dibayar ke pemilik barang. */
  bagianPemilik: number
  /** Sisa barang yang belum terjual. */
  remaining: number
}

export function remainingQty(row: Consignment): number {
  return Math.max(0, row.qty - row.soldQty)
}

/** Nilai sisa barang yang belum terjual, dihitung dari harga jual warung. */
export function potentialValue(row: Consignment): number {
  return remainingQty(row) * row.sellPrice
}

/** Hitung efek penjualan titipan sebanyak `qty`. */
export function computeSale(row: Consignment, qty: number): ConsignmentSale {
  const sold = Math.min(Math.max(0, qty), remainingQty(row))
  const omzet = sold * row.sellPrice
  const komisi = Math.round(omzet * (row.commissionPct / 100))
  return {
    qty: sold,
    omzet,
    komisi,
    bagianPemilik: omzet - komisi,
    remaining: remainingQty(row) - sold,
  }
}

export interface ConsignmentStats {
  activeCount: number
  /** Omzet titipan yang sudah terjual. */
  omzet: number
  /** Total komisi warung. */
  komisi: number
  /** Total yang harus dibayar ke pemilik barang. */
  payable: number
  /** Jumlah barang titipan yang sudah terjual. */
  itemsSold: number
  /** Jumlah barang titipan yang masih tersisa di rak. */
  itemsRemaining: number
  /**
   * Total penghasilan yang bisa didapatkan kalau seluruh sisa barang titipan
   * selalu terjual habis — dihitung dari harga jual warung.
   */
  potentialRevenue: number
}

export function consignmentStats(rows: Consignment[]): ConsignmentStats {
  const active = rows.filter((row) => row.status === "active")
  const omzet = active.reduce((sum, row) => sum + row.soldQty * row.sellPrice, 0)
  const komisi = Math.round(
    active.reduce((sum, row) => sum + row.soldQty * row.sellPrice * (row.commissionPct / 100), 0),
  )
  return {
    activeCount: active.length,
    omzet,
    komisi,
    payable: omzet - komisi,
    itemsSold: active.reduce((sum, row) => sum + row.soldQty, 0),
    itemsRemaining: active.reduce((sum, row) => sum + remainingQty(row), 0),
    potentialRevenue: active.reduce((sum, row) => sum + potentialValue(row), 0),
  }
}

/** Ringkasan yang harus dibayar ke pemilik barang (bisa disalin). */
export function buildPayoutText(rows: Consignment[]): string {
  const active = rows.filter((row) => row.status === "active" && row.soldQty > 0)
  if (active.length === 0) return "Belum ada barang titipan yang terjual."

  const lines: string[] = ["Rincian titip jual:"]
  for (const row of active) {
    const omzet = row.soldQty * row.sellPrice
    const komisi = Math.round(omzet * (row.commissionPct / 100))
    lines.push(
      `- ${row.depositor}: ${numberID(row.soldQty)} ${row.unit} ${row.productName} — omzet ${rupiah(omzet)}, komisi warung ${numberID(row.commissionPct)}% (${rupiah(komisi)}), bagian Anda ${rupiah(omzet - komisi)}`,
    )
  }
  const stats = consignmentStats(rows)
  lines.push(`Total bagian pemilik barang: ${rupiah(stats.payable)}.`)
  return lines.join("\n")
}

/** Saran tindakan: sisanya masih di rak, atau sudah bisa dibayar. */
export function consignmentHint(row: Consignment): string {
  const remaining = remainingQty(row)
  if (row.status === "selesai") return "Selesai — sudah dibayar ke pemilik barang."
  if (row.soldQty === 0) return "Belum ada yang terjual."
  if (remaining === 0) {
    return `Semua ${numberID(row.qty)} ${row.unit} terjual — bisa dibayar ke ${row.depositor}.`
  }
  return `${numberID(row.soldQty)} ${row.unit} terjual, sisa ${numberID(remaining)} ${row.unit} masih di rak.`
}
