import type { Product, Transaction } from "./types"
import { numberID, startOfDay } from "./format"
import { businessDate, businessDayKey, businessDayStart, DAY_MS } from "./calendar"
import { LEAD_TIME_DAYS, productCategory, type ProductCategory } from "./catalog"
import { computeDemandProfiles, type DemandProfile } from "./demand"
import { computeRestockPlan, type RestockSignal } from "./restock"
import { buildSalesIndex, type SalesIndex } from "./analytics"

export { productCategory }
export { LEAD_TIME_DAYS }
export type { ProductCategory }

export type SeasonName = "Musim hujan" | "Musim kemarau" | "Peralihan"
export type SeasonalConfidence = "rendah" | "sedang" | "tinggi"
export type SeasonalTone = "rain" | "festival" | "payday" | "season" | "neutral"

export interface SeasonalEvent {
  id: string
  label: string
  detail: string
  tone: SeasonalTone
  /** 0 berarti event sedang berlangsung. */
  daysUntil: number
}

export interface SeasonalContext {
  asOf: string
  monthLabel: string
  season: SeasonName
  seasonNote: string
  events: SeasonalEvent[]
  headline: string
  summary: string
  dataDays: number
  confidence: SeasonalConfidence
}

export interface SeasonalSignal {
  productId: string
  name: string
  unit: string
  category: ProductCategory
  stock: number
  minStock: number
  avgDaily30: number
  avgDaily90: number
  seasonalIndex: number
  upliftPct: number
  trendPct: number
  daysOfCover: number
  leadTimeDays: number
  suggestedQty: number
  estimatedCost: number
  estimatedRevenue: number
  reason: string
  score: number
}

export interface SeasonalRecommendation {
  id: string
  kind: "restock" | "display" | "hold" | "idea"
  title: string
  action: string
  reason: string
  productId?: string
  productName?: string
  unit?: string
  suggestedQty?: number
  estimatedCost?: number
  confidence: SeasonalConfidence
  tone: SeasonalTone
}

export interface SeasonalPlan {
  context: SeasonalContext
  recommendations: SeasonalRecommendation[]
  signals: SeasonalSignal[]
  dataDays: number
  generatedAt: string
}

const SEASON_NOTE: Record<SeasonName, string> = {
  "Musim hujan": "Nov–Mar · pembeli mencari makanan dan minuman hangat",
  "Musim kemarau": "Apr–Okt · minuman dingin dan kebutuhan harian naik",
  Peralihan: "Pergantian musim · pola penjualan campuran",
}

const RAMADAN_RANGES = [
  { start: "2026-02-18", end: "2026-03-19" },
  { start: "2027-02-08", end: "2027-03-09" },
  { start: "2028-01-28", end: "2028-02-25" },
  { start: "2029-01-16", end: "2029-02-13" },
  { start: "2030-01-06", end: "2030-02-03" },
]

const EID_RANGES = [
  { start: "2026-03-20", end: "2026-03-22" },
  { start: "2027-03-10", end: "2027-03-12" },
  { start: "2028-02-26", end: "2028-02-28" },
  { start: "2029-02-14", end: "2029-02-16" },
  { start: "2030-02-04", end: "2030-02-06" },
]

function dateFromISO(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

function isBetween(day: Date, start: Date, end: Date) {
  const time = startOfDay(day).getTime()
  return time >= startOfDay(start).getTime() && time <= startOfDay(end).getTime()
}

function rangeEvent(
  day: Date,
  range: { start: string; end: string },
  id: string,
  label: string,
  detail: string,
): SeasonalEvent | null {
  const start = dateFromISO(range.start)
  const end = dateFromISO(range.end)
  if (isBetween(day, start, end)) {
    return { id, label, detail, tone: "festival", daysUntil: 0 }
  }
  const daysUntil = daysBetween(day, start)
  if (daysUntil > 0 && daysUntil <= 90) {
    return { id, label, detail, tone: "festival", daysUntil }
  }
  return null
}

export function isRamadanDate(date: Date): boolean {
  return RAMADAN_RANGES.some((range) =>
    isBetween(date, dateFromISO(range.start), dateFromISO(range.end)),
  )
}

export function isEidDate(date: Date): boolean {
  return EID_RANGES.some((range) =>
    isBetween(date, dateFromISO(range.start), dateFromISO(range.end)),
  )
}

/** Musim Indonesia: hujan Nov–Mar, kemarau Apr–Okt, dengan masa peralihan. */
export function seasonForDate(date: Date): SeasonName {
  const month = date.getMonth()
  if (month === 10 || month === 11 || month <= 2) return "Musim hujan"
  if (month === 3 || month === 9) return "Peralihan"
  return "Musim kemarau"
}

export function productCategoryFor(product: Product): ProductCategory {
  return productCategory(product)
}

function paydayEvent(day: Date): SeasonalEvent {
  const date = day.getDate()
  if (date >= 25 || date <= 3) {
    return {
      id: "payday",
      label: "Gajian",
      detail: "Tanggal 25–awal bulan · daya beli naik",
      tone: "payday",
      daysUntil: 0,
    }
  }

  const next = new Date(day.getFullYear(), day.getMonth(), 25)
  return {
    id: "payday",
    label: "Gajian",
    detail: "Tanggal 25 · siapkan stok menjelang gajian",
    tone: "payday",
    daysUntil: daysBetween(day, next),
  }
}

function yearEndEvent(day: Date): SeasonalEvent | null {
  const month = day.getMonth()
  if (month === 0 && day.getDate() <= 5) {
    return {
      id: "year-end",
      label: "Awal tahun",
      detail: "Belanja tahun baru · kebutuhan rumah tangga naik",
      tone: "festival",
      daysUntil: 0,
    }
  }

  const start = new Date(day.getFullYear(), 11, 20)
  if (day.getTime() > start.getTime()) {
    if (month === 11) {
      return {
        id: "year-end",
        label: "Akhir tahun",
        detail: "Belanja Natal & Tahun Baru",
        tone: "festival",
        daysUntil: 0,
      }
    }
    return null
  }

  const daysUntil = daysBetween(day, start)
  if (daysUntil <= 60) {
    return {
      id: "year-end",
      label: "Akhir tahun",
      detail: "Belanja Natal & Tahun Baru",
      tone: "festival",
      daysUntil,
    }
  }
  return null
}

function schoolHolidayEvent(day: Date): SeasonalEvent | null {
  const year = day.getFullYear()
  const ranges = [
    { start: new Date(year, 11, 20), end: new Date(year + 1, 0, 5) },
    { start: new Date(year, 5, 20), end: new Date(year, 6, 15) },
  ]
  for (const range of ranges) {
    if (isBetween(day, range.start, range.end)) {
      return {
        id: "school-holiday",
        label: "Libur sekolah",
        detail: "Anak di rumah · camilan dan minuman naik",
        tone: "season",
        daysUntil: 0,
      }
    }
    const daysUntil = daysBetween(day, range.start)
    if (daysUntil > 0 && daysUntil <= 30) {
      return {
        id: "school-holiday",
        label: "Libur sekolah",
        detail: "Anak di rumah · camilan dan minuman naik",
        tone: "season",
        daysUntil,
      }
    }
  }
  return null
}

export function seasonalEvents(now = new Date()): SeasonalEvent[] {
  // Komponen tanggal diambil dari zona waktu warung, bukan zona perangkat.
  const day = startOfDay(businessDate(now.getTime()))
  const season = seasonForDate(day)
  const events: Array<{ event: SeasonalEvent; priority: number }> = [
    {
      event: {
        id: "season",
        label: season,
        detail: SEASON_NOTE[season],
        tone: season === "Musim hujan" ? "rain" : "season",
        daysUntil: 0,
      },
      priority: 0,
    },
  ]

  const payday = paydayEvent(day)
  events.push({ event: payday, priority: payday.daysUntil === 0 ? 2 : 4 })

  const yearEnd = yearEndEvent(day)
  if (yearEnd) events.push({ event: yearEnd, priority: yearEnd.daysUntil === 0 ? 1 : 3 })

  const ramadan = RAMADAN_RANGES.map((range) =>
    rangeEvent(day, range, "ramadan", "Ramadan", "Buka puasa & sahur · sembako naik"),
  ).find((event): event is SeasonalEvent => event !== null)
  if (ramadan) events.push({ event: ramadan, priority: ramadan.daysUntil === 0 ? 1 : 3 })

  const eid = EID_RANGES.map((range) =>
    rangeEvent(day, range, "eid", "Lebaran", "Silaturahmi & masak besar"),
  ).find((event): event is SeasonalEvent => event !== null)
  if (eid) events.push({ event: eid, priority: eid.daysUntil === 0 ? 1 : 3 })

  const christmas = new Date(day.getFullYear(), 11, 25)
  const christmasDays = daysBetween(day, christmas)
  if (christmasDays >= 0 && christmasDays <= 60) {
    events.push({
      event: {
        id: "christmas",
        label: "Natal",
        detail: "Belanja keluarga · makanan & minuman naik",
        tone: "festival",
        daysUntil: christmasDays,
      },
      priority: christmasDays === 0 ? 1 : 5,
    })
  }

  const independence = new Date(day.getFullYear(), 7, 17)
  const independenceDays = daysBetween(day, independence)
  if (independenceDays >= 0 && independenceDays <= 45) {
    events.push({
      event: {
        id: "independence",
        label: "17 Agustus",
        detail: "Acara kampung · minuman dan camilan naik",
        tone: "festival",
        daysUntil: independenceDays,
      },
      priority: independenceDays === 0 ? 1 : 5,
    })
  }

  const school = schoolHolidayEvent(day)
  if (school) events.push({ event: school, priority: 6 })

  return events
    .sort((a, b) => a.priority - b.priority || a.event.daysUntil - b.event.daysUntil)
    .map(({ event }) => event)
    .filter(
      (event, index, list) => list.findIndex((candidate) => candidate.id === event.id) === index,
    )
    .slice(0, 4)
}

function confidenceForDays(dataDays: number): SeasonalConfidence {
  if (dataDays >= 120) return "tinggi"
  if (dataDays >= 45) return "sedang"
  return "rendah"
}

function headlineFor(events: SeasonalEvent[], season: SeasonName): string {
  const labels = events.map((event) => event.label)
  if (labels.includes("Awal tahun")) return `${season} + awal tahun`
  if (labels.includes("Akhir tahun")) return `${season} + akhir tahun`
  if (labels.includes("Ramadan")) return `${season} + persiapan Ramadan`
  if (labels.includes("Lebaran")) return `${season} + suasana Lebaran`
  if (labels.includes("Natal")) return `${season} + Natal`
  if (
    labels.includes("Gajian") &&
    (events.find((event) => event.id === "payday")?.daysUntil ?? 99) <= 7
  ) {
    return `${season} + gajian`
  }
  return season
}

export function buildSeasonalContext(now = new Date(), dataDays = 0): SeasonalContext {
  const day = startOfDay(businessDate(now.getTime()))
  const season = seasonForDate(day)
  const events = seasonalEvents(day)
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    day,
  )

  return {
    asOf: businessDayKey(day.getTime()),
    monthLabel,
    season,
    seasonNote: SEASON_NOTE[season],
    events,
    headline: headlineFor(events, season),
    summary:
      dataDays >= 45
        ? `Pola ${dataDays} hari transaksi sudah terbaca. Saran di bawah memakai angka penjualan, bukan tebakan.`
        : `Data baru ${dataDays} hari. Saran musiman masih kasar; catat lebih banyak transaksi agar makin akurat.`,
    dataDays,
    confidence: confidenceForDays(dataDays),
  }
}

function signalForProduct(
  product: Product,
  profile: DemandProfile | undefined,
  restock: RestockSignal | undefined,
): SeasonalSignal {
  const category = productCategory(product)
  const leadTimeDays = LEAD_TIME_DAYS[category]
  const suggestedQty = restock?.suggestedQty ?? 0
  const estimatedCost = restock?.estimatedCost ?? 0
  const daysOfCover = profile?.daysOfCover ?? 99
  const upliftPct = profile?.upliftPct ?? 0
  const avgDaily30 = profile?.avgDaily30 ?? 0
  const avgDaily90 = profile?.avgDaily90 ?? 0
  const seasonalIndex = profile?.seasonalFactor ?? 1
  const trendPct = profile?.trendPct ?? 0

  const reason =
    restock?.reason ??
    `Belum ada penjualan 30 hari terakhir. Stok ${numberID(product.stock)} ${product.unit}; minimum ${numberID(product.min_stock)} ${product.unit}.`

  const score =
    (suggestedQty > 0 ? 80 : 0) +
    Math.max(0, 21 - daysOfCover) * 3 +
    Math.max(0, upliftPct) * 0.8 +
    (product.stock <= product.min_stock ? 25 : 0) +
    Math.max(0, trendPct) * 0.2

  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    category,
    stock: product.stock,
    minStock: product.min_stock,
    avgDaily30,
    avgDaily90,
    seasonalIndex,
    upliftPct,
    trendPct,
    daysOfCover,
    leadTimeDays,
    suggestedQty,
    estimatedCost,
    estimatedRevenue: suggestedQty * product.sell_price,
    reason,
    score,
  }
}

function ideaFor(context: SeasonalContext): SeasonalRecommendation {
  const labels = context.events.map((event) => event.label)
  if (labels.includes("Akhir tahun") || labels.includes("Awal tahun")) {
    return {
      id: "idea-year-end",
      kind: "idea",
      title: "Ide musim",
      action: "Buat paket sembako akhir tahun",
      reason:
        "Akhir tahun biasanya belanja rumah tangga naik. Paket berisi beras, minyak, gula, dan telur memakai stok yang sudah ada. Ini ide, bukan angka pasti.",
      confidence: "rendah",
      tone: "festival",
    }
  }
  if (labels.includes("Ramadan") || labels.includes("Lebaran")) {
    return {
      id: "idea-lebaran",
      kind: "idea",
      title: "Ide musim",
      action: "Siapkan paket buka puasa",
      reason:
        "Ramadan dan Lebaran menggeser belanja ke gula, minyak, telur, dan tepung. Paket kecil bisa memakai barang yang sudah ada. Ini ide, bukan angka pasti.",
      confidence: "rendah",
      tone: "festival",
    }
  }
  if (context.season === "Musim hujan") {
    return {
      id: "idea-rain",
      kind: "idea",
      title: "Ide musim",
      action: "Jual paket kopi + mi instan",
      reason:
        "Saat hujan, pembeli cenderung mencari makanan dan minuman hangat. Paket ini memakai barang yang sudah ada. Ini ide, bukan angka pasti.",
      confidence: "rendah",
      tone: "rain",
    }
  }
  if (context.season === "Musim kemarau") {
    return {
      id: "idea-dry",
      kind: "idea",
      title: "Ide musim",
      action: "Jual paket minuman dingin",
      reason:
        "Saat kemarau, minuman dingin lebih sering dicari. Paket air mineral + teh botol memakai stok yang sudah ada. Ini ide, bukan angka pasti.",
      confidence: "rendah",
      tone: "season",
    }
  }
  return {
    id: "idea-neutral",
    kind: "idea",
    title: "Ide musim",
    action: "Tambah varian minuman hangat",
    reason:
      "Pergantian musim membuat selera pembeli campuran. Varian hangat bisa dicoba tanpa menambah banyak stok. Ini ide, bukan angka pasti.",
    confidence: "rendah",
    tone: "neutral",
  }
}

function restockRecommendation(signal: SeasonalSignal): SeasonalRecommendation {
  return {
    id: `restock-${signal.productId}`,
    kind: "restock",
    title: "Tambah stok",
    action: `Siapkan ${numberID(signal.suggestedQty)} ${signal.unit} ${signal.name}`,
    reason: signal.reason,
    productId: signal.productId,
    productName: signal.name,
    unit: signal.unit,
    suggestedQty: signal.suggestedQty,
    estimatedCost: signal.estimatedCost,
    confidence: signal.daysOfCover <= 3 ? "tinggi" : "sedang",
    tone: "rain",
  }
}

function displayRecommendation(signal: SeasonalSignal): SeasonalRecommendation {
  return {
    id: `display-${signal.productId}`,
    kind: "display",
    title: "Pajang di depan",
    action: `Dekatkan ${signal.name} ke kasir`,
    reason: `Permintaan musim ini ${numberID(Math.max(0, signal.upliftPct))}% lebih tinggi dari rata-rata tahun. Stok ${numberID(signal.stock)} ${signal.unit} masih cukup ${numberID(signal.daysOfCover, 1)} hari.`,
    productId: signal.productId,
    productName: signal.name,
    unit: signal.unit,
    confidence: signal.daysOfCover >= 7 ? "sedang" : "rendah",
    tone: "festival",
  }
}

function holdRecommendation(signal: SeasonalSignal): SeasonalRecommendation {
  return {
    id: `hold-${signal.productId}`,
    kind: "hold",
    title: "Tahan pembelian",
    action: `Jangan tambah ${signal.name} dulu`,
    reason: `Rata-rata 30 hari ${numberID(signal.avgDaily30, 1)} ${signal.unit}/hari; stok cukup ${numberID(signal.daysOfCover, 1)} hari. Uang belanja bisa dialihkan ke barang musiman.`,
    productId: signal.productId,
    productName: signal.name,
    unit: signal.unit,
    confidence: "sedang",
    tone: "neutral",
  }
}

/**
 * Rencana musiman.
 *
 * Angka saran restok diambil dari mesin restok yang sama dengan halaman
 * beranda dan halaman stok, jadi satu produk tidak pernah recommending dua
 * jumlah berbeda di dua layar.
 */
export function computeSeasonalPlanFromIndex(
  products: Product[],
  index: SalesIndex,
  now = new Date(),
): SeasonalPlan {
  const nowMs = now.getTime()
  const today = businessDayStart(nowMs)

  const demand = computeDemandProfiles(products, index, nowMs)
  const restockPlan = computeRestockPlan(products, index, nowMs, { demand })
  const restockByProduct = new Map(restockPlan.signals.map((signal) => [signal.productId, signal]))

  const dataDays = Math.max(1, Math.round((today - businessDayStart(index.earliest)) / DAY_MS) + 1)

  const signals = products
    .filter((product) => product.archived !== true)
    .map((product) =>
      signalForProduct(product, demand.get(product.id), restockByProduct.get(product.id)),
    )
    .sort((a, b) => b.score - a.score)

  const context = buildSeasonalContext(now, dataDays)
  const restockSignals = signals.filter((signal) => signal.suggestedQty > 0)
  const topRestock = restockSignals.slice(0, 2)
  const seasonalStar = signals
    .filter(
      (signal) =>
        signal.seasonalIndex >= 1.08 &&
        signal.avgDaily30 > 0 &&
        !topRestock.some((item) => item.productId === signal.productId),
    )
    .sort((a, b) => b.upliftPct - a.upliftPct)[0]
  const secondStar = signals
    .filter(
      (signal) =>
        signal.seasonalIndex >= 1.05 &&
        signal.avgDaily30 > 0 &&
        signal.productId !== seasonalStar?.productId &&
        !topRestock.some((item) => item.productId === signal.productId),
    )
    .sort((a, b) => b.upliftPct - a.upliftPct)[0]
  const slowMover = signals
    .filter(
      (signal) =>
        signal.avgDaily30 > 0 &&
        signal.daysOfCover >= 14 &&
        signal.seasonalIndex < 0.98 &&
        signal.suggestedQty === 0,
    )
    .sort((a, b) => b.daysOfCover - a.daysOfCover)[0]

  const recommendations: SeasonalRecommendation[] = []
  if (seasonalStar) recommendations.push(displayRecommendation(seasonalStar))
  if (topRestock[0]) recommendations.push(restockRecommendation(topRestock[0]))
  const secondRestock = topRestock[1]
  if (secondStar && (!secondRestock || secondStar.upliftPct >= secondRestock.upliftPct + 5)) {
    recommendations.push(displayRecommendation(secondStar))
  } else if (secondRestock) {
    recommendations.push(restockRecommendation(secondRestock))
  }
  if (recommendations.length < 3 && slowMover) {
    recommendations.push(holdRecommendation(slowMover))
  }
  recommendations.push(ideaFor(context))
  const uniqueRecommendations = recommendations.filter(
    (recommendation, index, list) =>
      list.findIndex((candidate) => candidate.id === recommendation.id) === index,
  )
  const finalRecommendations = uniqueRecommendations.slice(0, 4)

  const restockCount = restockSignals.length
  const safeCount = Math.max(0, signals.length - restockCount)
  const focus = [...signals]
    .filter((signal) => signal.avgDaily30 > 0)
    .sort((a, b) => b.upliftPct - a.upliftPct)
    .slice(0, 3)
    .map((signal) => signal.name)
  const summary =
    dataDays >= 45
      ? `${dataDays} hari data. ${restockCount} barang perlu ditambah; ${safeCount} masih aman. Fokus musim: ${focus.join(", ")}.`
      : `Data baru ${dataDays} hari. Saran musiman masih kasar; catat lebih banyak transaksi.`

  return {
    context: {
      ...context,
      summary,
    },
    recommendations: finalRecommendations,
    signals,
    dataDays,
    generatedAt: now.toISOString(),
  }
}

/** Versi lama yang membangun indeks sendiri. */
export function computeSeasonalPlan(
  products: Product[],
  transactions: Transaction[],
  now = new Date(),
): SeasonalPlan {
  const index = buildSalesIndex(products, transactions, now.getTime())
  return computeSeasonalPlanFromIndex(products, index, now)
}

export function seasonalPlanForAi(plan: SeasonalPlan) {
  return {
    context: {
      asOf: plan.context.asOf,
      season: plan.context.season,
      headline: plan.context.headline,
      events: plan.context.events.map((event) => ({
        label: event.label,
        daysUntil: event.daysUntil,
      })),
      dataDays: plan.dataDays,
    },
    recommendations: plan.recommendations.map((recommendation) => ({
      kind: recommendation.kind,
      title: recommendation.title,
      action: recommendation.action,
      reason: recommendation.reason,
      productName: recommendation.productName ?? null,
      suggestedQty: recommendation.suggestedQty ?? null,
      unit: recommendation.unit ?? null,
      estimatedCost: recommendation.estimatedCost ?? null,
    })),
    signals: plan.signals.slice(0, 8).map((signal) => ({
      name: signal.name,
      unit: signal.unit,
      stock: signal.stock,
      avgDaily30: Number(signal.avgDaily30.toFixed(2)),
      seasonalIndex: Number(signal.seasonalIndex.toFixed(2)),
      upliftPct: Math.round(signal.upliftPct),
      daysOfCover: Number(signal.daysOfCover.toFixed(1)),
      suggestedQty: signal.suggestedQty,
      estimatedCost: signal.estimatedCost,
    })),
  }
}
