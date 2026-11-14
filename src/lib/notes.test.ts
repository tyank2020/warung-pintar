import { describe, expect, it } from "vitest"
import {
  countByOthers,
  groupNotesByMonth,
  monthKey,
  monthLabel,
  noteSummaryLine,
  noteTotal,
  summarizeNotes,
} from "./notes"
import type { PurchaseNote } from "./types"

function note(overrides: Partial<PurchaseNote> = {}): PurchaseNote {
  return {
    id: "n-1",
    createdAt: "2026-11-05T02:00:00.000Z",
    addedBy: "Pegawai",
    total: 150000,
    items: [
      { name: "Minyak Goreng", qty: 5, unit: "liter", unitPrice: 15000 },
      { name: "Gula Pasir", qty: 10, unit: "kg", unitPrice: 14000 },
    ],
    image: "",
    source: "scan",
    ...overrides,
  }
}

describe("riwayat nota", () => {
  it("menghitung total dari isi nota", () => {
    expect(noteTotal(note().items)).toBe(215000)
  })

  it("mengambil kunci dan label bulan", () => {
    expect(monthKey("2026-11-05T02:00:00.000Z")).toBe("2026-11")
    expect(monthLabel("2026-11")).toBe("November 2026")
  })

  it("memakai tanggal lokal, bukan UTC, untuk kunci bulan", () => {
    // 1 November jam 01:00 WIB = 30 Oktober 17:00 UTC. Kunci bulan harus
    // mengikuti tanggal lokal (November), bukan UTC (Oktober).
    const wib = new Date(2026, 10, 1, 1, 0, 0)
    expect(monthKey(wib.toISOString())).toBe("2026-11")
  })

  it("meringkas nota bulan berjalan dan semua nota", () => {
    const now = new Date("2026-11-10T00:00:00.000Z")
    const summary = summarizeNotes(
      [
        note(),
        note({ id: "n-2", createdAt: "2026-10-02T02:00:00.000Z", total: 90000, items: [] }),
      ],
      now,
    )
    expect(summary.count).toBe(2)
    expect(summary.total).toBe(240000)
    expect(summary.monthCount).toBe(1)
    expect(summary.monthTotal).toBe(150000)
    expect(summary.itemCount).toBe(2)
  })

  it("mengelompokkan nota per bulan terbaru di atas", () => {
    const groups = groupNotesByMonth([
      note(),
      note({ id: "n-2", createdAt: "2026-10-02T02:00:00.000Z", total: 90000 }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe("2026-11")
    expect(groups[1].total).toBe(90000)
  })

  it("membuat ringkasan singkat untuk daftar", () => {
    expect(noteSummaryLine(note())).toBe("2 barang · Rp 150.000")
  })

  it("menghitung nota yang ditambahkan selain pemilik", () => {
    const notes = [note(), note({ id: "n-2", addedBy: "Pak Andi" })]
    expect(countByOthers(notes, "Pak Andi")).toBe(1)
    expect(countByOthers(notes, "Pegawai")).toBe(1)
  })
})
