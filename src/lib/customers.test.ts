import { describe, expect, it } from "vitest"
import {
  buildCustomerProfiles,
  buildTagihText,
  debtGuard,
  findInactiveCustomers,
  openDebtFor,
} from "./customers"
import type { Customer, Debt } from "./types"

const now = new Date("2026-11-11T10:00:00.000Z")

/**
 * Tanggal N hari lalu, dihitung dari selisih waktu yang persis.
 * Kalau pakai `setDate` lokal, perpindahan daylight saving bisa menggeser
 * hasilnya satu jam dan tesnya jadi gagal di sebagian zona waktu.
 */
function iso(daysAgo: number) {
  return new Date(now.getTime() - daysAgo * 24 * 3_600_000).toISOString()
}

const customers: Customer[] = [
  {
    id: "c-1",
    name: "Pak Yono",
    phone: "0812-1111-2222",
    note: "Suka beli Verified, tagih hari Jumat",
    maxDebt: 50000,
    debtDeadline: "2026-11-01",
    createdAt: iso(200),
  },
  {
    id: "c-2",
    name: "Bu Tini",
    phone: null,
    note: null,
    maxDebt: null,
    debtDeadline: null,
    createdAt: iso(90),
  },
]

const debts: Debt[] = [
  {
    id: "d-1",
    debtor: "Pak Yono",
    product_name: "Rokok Kretek",
    qty: 2,
    unit: "bungkus",
    amount: 40000,
    note: null,
    created_at: iso(12),
    settled_at: null,
  },
  {
    id: "d-2",
    debtor: "Pak Yono",
    product_name: "Rokok Kretek",
    qty: 1,
    unit: "bungkus",
    amount: 20000,
    note: null,
    created_at: iso(40),
    settled_at: iso(30),
  },
  {
    id: "d-3",
    debtor: "Bu Tini",
    product_name: "Minyak Goreng",
    qty: 1,
    unit: "liter",
    amount: 15000,
    note: null,
    created_at: iso(2),
    settled_at: null,
  },
  {
    id: "d-4",
    debtor: "Pakudi",
    product_name: "Gula Pasir",
    qty: 1,
    unit: "kg",
    amount: 14000,
    note: null,
    created_at: iso(30),
    settled_at: null,
  },
]

describe("buku Piutang", () => {
  const profiles = buildCustomerProfiles(customers, debts, now)

  it("menggabungkan data Piutang dan riwayat utang", () => {
    const yono = profiles.find((profile) => profile.name === "Pak Yono")
    expect(yono?.phone).toBe("0812-1111-2222")
    expect(yono?.openDebt).toBe(40000)
    expect(yono?.openCount).toBe(1)
    expect(yono?.settledCount).toBe(1)
    expect(yono?.totalBorrowed).toBe(60000)
  })

  it("menampilkan barang favorit dan kapan terakhir pinjam", () => {
    const yono = profiles.find((profile) => profile.name === "Pak Yono")
    expect(yono?.favoriteItem).toBe("Rokok Kretek")
    expect(yono?.daysSinceLastBorrow).toBe(12)
  })

  it("menandai Piutang yang menunggak lebih dari 7 hari", () => {
    const yono = profiles.find((profile) => profile.name === "Pak Yono")
    expect(yono?.status).toBe("menunggak")
    const tini = profiles.find((profile) => profile.name === "Bu Tini")
    expect(tini?.status).toBe("utang")
  })

  it("menyertakan Piutang yang hanya ada di catatan utang", () => {
    const pake = profiles.find((profile) => profile.name === "Pakudi")
    expect(pake?.id).toBeNull()
    expect(pake?.openDebt).toBe(14000)
  })

  it("memesan Piutang paling menunggak di depan", () => {
    expect(profiles[0].name).toBe("Pak Yono")
  })

  it("mencari Piutang yang lama tidak datang", () => {
    const inactive = findInactiveCustomers(profiles, 21)
    expect(inactive.map((profile) => profile.name)).toContain("Pakudi")
    expect(inactive.map((profile) => profile.name)).not.toContain("Bu Tini")
  })

  it("menyusun teks tagihan dari catatan utang", () => {
    const yono = profiles.find((profile) => profile.name === "Pak Yono")!
    const text = buildTagihText(yono, debts)
    expect(text).toContain("Halo Pak Yono")
    expect(text).toContain("2 bungkus Rokok Kretek")
    expect(text).toContain("40.000")
  })

  it("menyimpan batas maksimal dan tenggat dari data Piutang", () => {
    const yono = profiles.find((profile) => profile.name === "Pak Yono")
    expect(yono?.maxDebt).toBe(50000)
    expect(yono?.debtDeadline).toBe("2026-11-01")
    expect(yono?.atDebtLimit).toBe(false)
    expect(yono?.overdue).toBe(true)
    const tini = profiles.find((profile) => profile.name === "Bu Tini")
    expect(tini?.maxDebt).toBeNull()
    expect(tini?.overdue).toBe(false)
  })

  it("menghitung total utang berjalan per orang", () => {
    expect(openDebtFor(debts, "Pak Yono")).toBe(40000)
    expect(openDebtFor(debts, "pak yono")).toBe(40000)
    expect(openDebtFor(debts, "Bu Tini")).toBe(15000)
    expect(openDebtFor(debts, "Si Tidak Ada")).toBe(0)
  })
})

describe("batas maksimal utang (debtGuard)", () => {
  const yono = { name: "Pak Yono", maxDebt: 50000, openDebt: 40000 }
  const tanpaBatas = { name: "Bu Tini", maxDebt: null, openDebt: 15000 }

  it("membolehkan menambah utang selama belum melewati batas", () => {
    expect(debtGuard(yono, 10000)).toEqual({ ok: true, reason: null })
  })

  it("memblokir nambah utang kalau sudah melewati batas", () => {
    const result = debtGuard(yono, 20000)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("Lunasi dulu")
  })

  it("tidak membatasi kalau tanpa batas", () => {
    expect(debtGuard(tanpaBatas, 1_000_000)).toEqual({ ok: true, reason: null })
  })
})
