import type { Product, PurchaseNote, Transaction } from "./types"
import { productLabel } from "./format"

/**
 * Rekonsiliasi stok: catatan vs kenyataan.
 *
 * Dua arah pemeriksaan:
 * 1. **Selisih stok** — hasil opname tidak cocok dengan catatan. Ditelusuri ke
 *    nota terdekat, supaya owner tahu barang itu masuk dari nota siapa.
 * 2. **Nota tanpa stok** — ada nota yang dicatat, tapi barangnya tidak pernah
 *    masuk stok di sekitar waktu itu.
 *
 * Semua angka berasal dari transaksi dan nota yang sudah ada di database.
 */

export type FindingKind = "selisih-stok" | "nota-tanpa-stok"
export type FindingSeverity = "ringan" | "berat"

export interface StockFinding {
  id: string
  kind: FindingKind
  productId: string
  productName: string
  unit: string
  /** Selisih fisik minus catatan (negatif = barang kurang). */
  delta: number
  /** Nilai selisih dalam rupiah (selalu positif). */
  value: number
  /** Stok menurut catatan saat opname. */
  systemQty: number
  /** Stok hasil hitungan fisik. */
  countedQty: number
  noteId: string | null
  noteAddedBy: string | null
  noteCreatedAt: string | null
  /** Kapan selisih ditemukan (waktu opname). */
  at: string
  severity: FindingSeverity
  message: string
}

export interface ReconcileOptions {
  /** Seberapa jauh nota dianggap terkait dengan opname (hari). */
  noteWindowDays?: number
  /** Seberapa jauh nota dianggap terkait dengan stok masuk (hari). */
  stockWindowDays?: number
  /** Ambang nilai (rupiah) supaya selisih dianggap berat. */
  heavyValue?: number
  now?: Date
}

const DAY = 24 * 60 * 60 * 1000

function rupiahText(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`
}

function severityFor(value: number, heavyValue: number): FindingSeverity {
  return value >= heavyValue ? "berat" : "ringan"
}

function productFor(products: Product[], name: string): Product | undefined {
  const query = name.trim().toLowerCase()
  return products.find((product) => {
    const candidates = [product.name, ...product.aliases].map((value) => value.toLowerCase())
    return candidates.some((candidate) => candidate === query || candidate.includes(query))
  })
}

/**
 * Temukan opname yang menghasilkan selisih, lalu kaitkan ke nota terdekat
 * yang memuat barang yang sama.
 */
export function findStockDiscrepancies(
  products: Product[],
  transactions: Transaction[],
  notes: PurchaseNote[],
  options: ReconcileOptions = {},
): StockFinding[] {
  const noteWindowDays = options.noteWindowDays ?? 30
  const heavyValue = options.heavyValue ?? 100000
  const findings: StockFinding[] = []

  const adjustments = transactions.filter(
    (transaction) =>
      transaction.type === "adjustment" && transaction.note !== "simpen-dulu",
  )

  for (const adjustment of adjustments) {
    const product = products.find((candidate) => candidate.id === adjustment.product_id)
    if (!product) continue
    if (adjustment.qty === 0) continue

    const at = new Date(adjustment.created_at).getTime()

    // Perubahan stok setelah opname: supaya stok "menurut catatan" saat
    // dihitung bisa direkonstruksi dari stok sekarang.
    let netChangeAfter = 0
    for (const transaction of transactions) {
      if (transaction.product_id !== product.id) continue
      const time = new Date(transaction.created_at).getTime()
      if (time <= at) continue
      if (transaction.type === "sale") netChangeAfter -= transaction.qty
      else if (transaction.type === "purchase") netChangeAfter += transaction.qty
      else netChangeAfter += transaction.qty
    }

    // Stok sekarang = hasil hitungan fisik + perubahan setelahnya.
    // Jadi hasil hitungan = stok sekarang − perubahan sesudahnya.
    const countedQty = Math.max(0, product.stock - netChangeAfter)
    // Selisih dicatat sebagai delta: delta = fisik − catatan.
    const delta = adjustment.qty
    const systemQty = Math.max(0, countedQty - delta)
    const value = Math.abs(delta) * product.buy_price

    // Nota terdekat yang memuat barang sama, dalam batas waktu tertentu.
    let relatedNote: PurchaseNote | null = null
    for (const candidate of notes) {
      const noteTime = new Date(candidate.createdAt).getTime()
      if (noteTime > at) continue
      if (at - noteTime > noteWindowDays * DAY) continue
      const memuatBarang = candidate.items.some((item) => {
        const match = productFor(products, item.name)
        return match
          ? match.id === product.id
          : item.name.toLowerCase() === product.name.toLowerCase()
      })
      if (!memuatBarang) continue
      if (!relatedNote || noteTime > new Date(relatedNote.createdAt).getTime()) {
        relatedNote = candidate
      }
    }

    const severity = severityFor(value, heavyValue)
    const kurang = delta < 0
    const selisih = `${Math.abs(delta)} ${product.unit}`
    const message = relatedNote
      ? `${productLabel(product)} ${kurang ? "kurang" : "lebih"} ${selisih} dari catatan (${rupiahText(value)}). Barang ini masuk dari nota ${new Date(relatedNote.createdAt).toLocaleDateString("id-ID")} — cek nota itu (${relatedNote.addedBy}).`
      : `${productLabel(product)} ${kurang ? "kurang" : "lebih"} ${selisih} dari catatan (${rupiahText(value)}), dan tidak ada nota yang menjelaskan.`

    findings.push({
      id: `selisih-${adjustment.id}`,
      kind: "selisih-stok",
      productId: product.id,
      productName: productLabel(product),
      unit: product.unit,
      delta,
      value,
      systemQty,
      countedQty,
      noteId: relatedNote?.id ?? null,
      noteAddedBy: relatedNote?.addedBy ?? null,
      noteCreatedAt: relatedNote?.createdAt ?? null,
      at: adjustment.created_at,
      severity,
      message,
    })
  }

  return findings.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}

/**
 * Nota yang tercatat, tapi barangnya tidak terlihat masuk stok di sekitar
 * waktu nota itu dibuat.
 */
export function findNotesWithoutStock(
  products: Product[],
  transactions: Transaction[],
  notes: PurchaseNote[],
  options: ReconcileOptions = {},
): StockFinding[] {
  const stockWindowDays = options.stockWindowDays ?? 3
  const heavyValue = options.heavyValue ?? 100000
  const findings: StockFinding[] = []

  for (const note of notes) {
    const noteTime = new Date(note.createdAt).getTime()
    for (const item of note.items) {
      const product = productFor(products, item.name)
      if (!product) continue

      const matched = transactions.some((transaction) => {
        if (transaction.product_id !== product.id) return false
        if (transaction.type !== "purchase") return false
        const time = new Date(transaction.created_at).getTime()
        if (time < noteTime - DAY) return false
        if (time > noteTime + stockWindowDays * DAY) return false
        return transaction.qty >= item.qty * 0.8
      })
      if (matched) continue

      const value = item.qty * item.unitPrice
      findings.push({
        id: `nota-${note.id}-${item.name}`,
        kind: "nota-tanpa-stok",
        productId: product.id,
        productName: item.name,
        unit: item.unit,
        delta: -item.qty,
        value,
        systemQty: 0,
        countedQty: 0,
        noteId: note.id,
        noteAddedBy: note.addedBy,
        noteCreatedAt: note.createdAt,
        at: note.createdAt,
        severity: severityFor(value, heavyValue),
        message: `Nota ${new Date(note.createdAt).toLocaleDateString("id-ID")} (${note.addedBy}) mencatat ${item.qty} ${item.unit} ${item.name}, tapi tidak ada stok masuk dalam ${stockWindowDays} hari berikutnya.`,
      })
    }
  }

  return findings.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}

export interface FindingsSummary {
  count: number
  heavyCount: number
  totalValue: number
  linkedToNotes: number
}

export function summarizeFindings(findings: StockFinding[]): FindingsSummary {
  return {
    count: findings.length,
    heavyCount: findings.filter((finding) => finding.severity === "berat").length,
    totalValue: findings.reduce((sum, finding) => sum + finding.value, 0),
    linkedToNotes: findings.filter((finding) => finding.noteId !== null).length,
  }
}

/** Temuan yang terkait dengan sebuah nota. */
export function findingsForNote(findings: StockFinding[], noteId: string): StockFinding[] {
  return findings.filter((finding) => finding.noteId === noteId)
}

/** Kelompokkan temuan per bulan, terbaru di atas. */
export interface FindingMonthGroup {
  key: string
  label: string
  findings: StockFinding[]
  total: number
}

export function groupFindingsByMonth(findings: StockFinding[]): FindingMonthGroup[] {
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ]
  const groups = new Map<string, StockFinding[]>()
  for (const finding of findings) {
    const key = finding.at.slice(0, 7)
    const current = groups.get(key) ?? []
    current.push(finding)
    groups.set(key, current)
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: `${months[Number(key.slice(5, 7)) - 1] ?? key} ${key.slice(0, 4)}`,
      findings: items,
      total: items.reduce((sum, finding) => sum + finding.value, 0),
    }))
}
