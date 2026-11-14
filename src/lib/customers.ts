import type { Customer, Debt } from "./types"
import { businessDayKey } from "./calendar"

/**
 * Buku Piutang — murni (tanpa React), supaya bisa diuji.
 *
 * Sumber data: tabel `customers` (identitas: nama, telepon, catatan) plus
 * tabel `debts` (riwayat pinjam). Piutang yang belum pernah pinjam tetap
 * bisa dicatat manual, jadi kartu Piutang tidak sekadar daftar peminjam.
 */

const DAY = 24 * 60 * 60 * 1000

export type CustomerStatus = "lunas" | "utang" | "menunggak"

export interface CustomerProfile {
  /** Id dari tabel customers; null kalau hanya muncul di riwayat utang. */
  id: string | null
  name: string
  phone: string | null
  note: string | null
  /** Total utang yang belum lunas. */
  openDebt: number
  /** Jumlah catatan utang yang belum lunas. */
  openCount: number
  /** Jumlah catatan utang yang sudah lunas. */
  settledCount: number
  /** Total nilai yang pernah dipinjam (lunas + belum). */
  totalBorrowed: number
  favoriteItem: string | null
  items: Array<{ name: string; count: number }>
  lastBorrowAt: string | null
  /** Berapa hari sejak terakhir pinjam; null kalau belum pernah. */
  daysSinceLastBorrow: number | null
  status: CustomerStatus
  /** Batas maksimal utang (Rp) yang diatur pedagang; null = tanpa batas. */
  maxDebt: number | null
  /** Hari terakhir mengembalikkan utang (`yyyy-mm-dd`); null = tanpa batas. */
  debtDeadline: string | null
  /** Utang berjalan sudah menyentuh/melebihi batas maksimal. */
  atDebtLimit: boolean
  /** Sudah lewat hari terakhir dan masih ada utang berjalan. */
  overdue: boolean
}

function key(name: string): string {
  return name.trim().toLowerCase()
}

export function buildCustomerProfiles(
  customers: Customer[],
  debts: Debt[],
  now = new Date(),
): CustomerProfile[] {
  const byName = new Map<string, CustomerProfile>()

  const ensure = (name: string): CustomerProfile => {
    const mapKey = key(name)
    const existing = byName.get(mapKey)
    if (existing) return existing
    const profile: CustomerProfile = {
      id: null,
      name: name.trim(),
      phone: null,
      note: null,
      openDebt: 0,
      openCount: 0,
      settledCount: 0,
      totalBorrowed: 0,
      favoriteItem: null,
      items: [],
      lastBorrowAt: null,
      daysSinceLastBorrow: null,
      status: "lunas",
      maxDebt: null,
      debtDeadline: null,
      atDebtLimit: false,
      overdue: false,
    }
    byName.set(mapKey, profile)
    return profile
  }

  for (const customer of customers) {
    const profile = ensure(customer.name)
    profile.id = customer.id
    profile.phone = customer.phone
    profile.note = customer.note
    profile.maxDebt = customer.maxDebt
    profile.debtDeadline = customer.debtDeadline
  }

  for (const debt of debts) {
    const profile = ensure(debt.debtor)
    profile.totalBorrowed += debt.amount
    if (debt.settled_at) {
      profile.settledCount += 1
    } else {
      profile.openDebt += debt.amount
      profile.openCount += 1
    }

    const current = profile.items.find((item) => item.name === debt.product_name)
    if (current) current.count += debt.qty
    else profile.items.push({ name: debt.product_name, count: debt.qty })

    const time = new Date(debt.created_at).getTime()
    if (!profile.lastBorrowAt || time > new Date(profile.lastBorrowAt).getTime()) {
      profile.lastBorrowAt = debt.created_at
    }
  }

  const today = businessDayKey(now.getTime())
  for (const profile of byName.values()) {
    profile.items.sort((a, b) => b.count - a.count)
    profile.favoriteItem = profile.items[0]?.name ?? null
    profile.daysSinceLastBorrow = profile.lastBorrowAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(profile.lastBorrowAt).getTime()) / DAY))
      : null
    profile.atDebtLimit = profile.maxDebt !== null && profile.openDebt >= profile.maxDebt
    profile.overdue =
      profile.debtDeadline !== null && profile.openDebt > 0 && today > profile.debtDeadline
    // Lewat tenggat (pedagang) mengalah pada aturan 7 hari bawaan.
    const menunggak = profile.daysSinceLastBorrow !== null && profile.daysSinceLastBorrow >= 7
    profile.status =
      profile.openDebt > 0 ? (menunggak || profile.overdue ? "menunggak" : "utang") : "lunas"
  }

  return [...byName.values()].sort((a, b) => {
    // Yang paling menunggak dulu, lalu yang paling besar utangnya.
    const rank = { menunggak: 0, utang: 1, lunas: 2 }
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if (b.openDebt !== a.openDebt) return b.openDebt - a.openDebt
    return a.name.localeCompare(b.name)
  })
}

/** Piutang yang belum datang lama — kandidat untuk ditagih atauzar again. */
export function findInactiveCustomers(
  profiles: CustomerProfile[],
  minDays = 21,
): CustomerProfile[] {
  return profiles.filter(
    (profile) => profile.daysSinceLastBorrow !== null && profile.daysSinceLastBorrow >= minDays,
  )
}

/** Total utang berjalan untuk satu orang, dicocokkan per nama (abaikan huruf besar/kecil). */
export function openDebtFor(debts: Debt[], name: string): number {
  const target = key(name)
  return debts
    .filter((debt) => !debt.settled_at && key(debt.debtor) === target)
    .reduce((sum, debt) => sum + debt.amount, 0)
}

/**
 * Apakah boleh menambah utang sebesar `newAmount` untuk orang ini?
 * Kalau batas maksimal (yang diatur pedagang) sudah tercapai, nambah utang
 * ditolak sampai utangnya dilunasi. Ini satu-satunya aturan pembatas.
 */
export function debtGuard(
  profile: Pick<CustomerProfile, "name" | "maxDebt" | "openDebt">,
  newAmount: number,
): { ok: boolean; reason: string | null } {
  if (profile.maxDebt === null || profile.maxDebt <= 0) {
    return { ok: true, reason: null }
  }
  const projected = profile.openDebt + newAmount
  if (projected > profile.maxDebt) {
    return {
      ok: false,
      reason: `${profile.name} sudah ${formatRupiah(profile.openDebt)} dari batas ${formatRupiah(profile.maxDebt)}. Lunasi dulu sebelum nambah utang.`,
    }
  }
  return { ok: true, reason: null }
}

/**
 * Teks tagihan siap kirim ke Piutang (WhatsApp/SMS).
 * Angka diambil dari catatan utang, tidak ada yang dikarang.
 */
export function buildTagihText(profile: CustomerProfile, debts: Debt[]): string {
  const open = debts.filter((debt) => !debt.settled_at && key(debt.debtor) === key(profile.name))
  const lines: string[] = []
  lines.push(`Halo ${profile.name},`)
  lines.push(
    open.length === 1
      ? `Di warung ada yang belum dibayar: ${open[0].qty} ${open[0].unit} ${open[0].product_name} (${formatRupiah(open[0].amount)}).`
      : `Di warung ada ${open.length} barang yang belum dibayar:`,
  )
  if (open.length > 1) {
    for (const debt of open) {
      lines.push(`- ${debt.qty} ${debt.unit} ${debt.product_name} — ${formatRupiah(debt.amount)}`)
    }
    lines.push(`Total ${formatRupiah(profile.openDebt)}.`)
  }
  lines.push("Kalau sudah bayar, sebut ya biar saya catat. Terima kasih!")
  return lines.join("\n")
}

function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`
}
