import { describe, expect, it } from "vitest"
import {
  buildCashClosing,
  cashClosingVerdict,
  expectedCash,
  summarizeClosings,
} from "./cashClosing"

describe("tutup buku kas", () => {
  it("menghitung uang yang seharusnya ada di laci", () => {
    expect(expectedCash(150000, 40000)).toBe(190000)
    expect(expectedCash(150000, 0)).toBe(150000)
  })

  it("membuat catatan penutupan dengan selisih", () => {
    const closing = buildCashClosing(185000, 190000, new Date("2026-11-11T22:00:00.000Z"))
    expect(closing.date).toBe("2026-11-11")
    expect(closing.diff).toBe(-5000)
    expect(closing.counted).toBe(185000)
  })

  it("menyatakan verdict sesuai, kurang, atau lebih", () => {
    const now = new Date("2026-11-11T22:00:00.000Z")
    expect(cashClosingVerdict(buildCashClosing(100, 100, now)).tone).toBe("sesuai")
    expect(cashClosingVerdict(buildCashClosing(90, 100, now)).tone).toBe("kurang")
    expect(cashClosingVerdict(buildCashClosing(110, 100, now)).tone).toBe("lebih")
    expect(cashClosingVerdict(buildCashClosing(90, 100, now)).label).toContain("kurang")
  })

  it("merangkum riwayat penutupan", () => {
    const now = new Date("2026-11-11T22:00:00.000Z")
    const closings = [
      buildCashClosing(190000, 190000, now),
      buildCashClosing(180000, 190000, new Date("2026-11-10T22:00:00.000Z")),
    ]
    const summary = summarizeClosings(closings)
    expect(summary.count).toBe(2)
    expect(summary.mismatchCount).toBe(1)
    expect(summary.totalDiff).toBe(-10000)
    expect(summary.lastClosing?.date).toBe("2026-11-11")
  })
})
