import type {
  Consignment,
  Customer,
  Debt,
  MarketPrice,
  Product,
  PurchaseNote,
  Transaction,
} from "./types"
import type { ProductCategory } from "./seasonal"
import { isEidDate, isRamadanDate, seasonForDate } from "./seasonal"
import { addDays, isoDate, startOfDay } from "./format"

interface DemoProductSeed extends Omit<Product, "stock"> {
  /** Rata-rata penjualan harian sebelum faktor musim. */
  baseDaily: number
  startingStock: number
  category: ProductCategory
}

export const DEMO_PRODUCTS: DemoProductSeed[] = [
  {
    id: "p-beras",
    name: "Beras Ramos",
    unit: "kg",
    startingStock: 48,
    min_stock: 15,
    buy_price: 12000,
    sell_price: 14500,
    aliases: ["beras", "beras premium", "br", "beras ramos"],
    baseDaily: 3.2,
    category: "sembako",
  },
  {
    id: "p-minyak",
    name: "Minyak Goreng",
    unit: "liter",
    startingStock: 22,
    min_stock: 8,
    buy_price: 15000,
    sell_price: 18000,
    aliases: ["minyak", "minyak goreng", "mg", "goreng", "minyak sayur"],
    baseDaily: 2.2,
    category: "sembako",
  },
  {
    id: "p-telur",
    name: "Telur Ayam",
    unit: "papan",
    startingStock: 14,
    min_stock: 6,
    buy_price: 25000,
    sell_price: 30000,
    aliases: ["telur", "telor", "ta", "telur ayam", "telur negeri"],
    baseDaily: 1.4,
    category: "sembako",
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    startingStock: 18,
    min_stock: 8,
    buy_price: 14000,
    sell_price: 17000,
    aliases: ["gula", "gulpas", "gula pasir", "gp", "gula putih"],
    baseDaily: 1.6,
    category: "sembako",
  },
  {
    id: "p-mi",
    name: "Mi Instan",
    unit: "bungkus",
    startingStock: 130,
    min_stock: 20,
    buy_price: 2500,
    sell_price: 3500,
    aliases: ["mi", "mie", "mi instan", "mie instan", "indomie", "im"],
    baseDaily: 9,
    category: "instan",
  },
  {
    id: "p-kopi",
    name: "Kopi Kapal Api",
    unit: "sachet",
    startingStock: 72,
    min_stock: 12,
    buy_price: 2000,
    sell_price: 2500,
    aliases: ["kopi", "kopi kapal api", "ka", "kapal api", "kopi sachet"],
    baseDaily: 4.5,
    category: "minuman",
  },
  {
    id: "p-sabun",
    name: "Sabun Mandi",
    unit: "pcs",
    startingStock: 24,
    min_stock: 8,
    buy_price: 4000,
    sell_price: 5500,
    aliases: ["sabun", "sabun mandi", "sm"],
    baseDaily: 1.1,
    category: "rumah tangga",
  },
  {
    id: "p-rokok",
    name: "Rokok Sampoerna",
    unit: "bungkus",
    startingStock: 56,
    min_stock: 10,
    buy_price: 22000,
    sell_price: 25000,
    aliases: ["rokok", "sampoerna", "rokok sampoerna", "rs"],
    baseDaily: 3.8,
    category: "rokok",
  },
  {
    id: "p-teh",
    name: "Teh Botol",
    unit: "botol",
    startingStock: 42,
    min_stock: 12,
    buy_price: 3500,
    sell_price: 5000,
    aliases: ["teh", "teh botol", "teh kemasan", "tb"],
    baseDaily: 2.8,
    category: "minuman",
  },
  {
    id: "p-air",
    name: "Air Mineral",
    unit: "botol",
    startingStock: 50,
    min_stock: 12,
    buy_price: 2500,
    sell_price: 4000,
    aliases: ["air", "air mineral", "air minum", "aqua", "am"],
    baseDaily: 3.2,
    category: "minuman",
  },
  {
    id: "p-tepung",
    name: "Tepung Terigu",
    unit: "kg",
    startingStock: 20,
    min_stock: 5,
    buy_price: 11000,
    sell_price: 13000,
    aliases: ["tepung", "terigu", "tepung terigu", "tt"],
    baseDaily: 1.2,
    category: "sembako",
  },
  {
    id: "p-kecap",
    name: "Kecap Manis",
    unit: "botol",
    startingStock: 12,
    min_stock: 4,
    buy_price: 9000,
    sell_price: 12000,
    aliases: ["kecap", "kecap manis", "km"],
    baseDaily: 0.8,
    category: "bumbu",
  },
]

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function isoAt(date: Date, hour: number, minute: number) {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next.toISOString()
}

function isSchoolHoliday(date: Date) {
  const month = date.getMonth()
  const day = date.getDate()
  return (
    (month === 11 && day >= 20) ||
    (month === 0 && day <= 5) ||
    (month === 5 && day >= 20) ||
    (month === 6 && day <= 15)
  )
}

/**
 * Faktor yang hanya bergantung pada tanggal.
 *
 * Dihitung sekali per hari, bukan sekali per barang per hari. Sebelumnya
 * kalender Ramadan, Lebaran, dan musim dipanggil 12 kali untuk setiap hari,
 * padahal hasilnya sama untuk semua barang.
 */
interface DayFactors {
  weekend: boolean
  payday: boolean
  yearEnd: boolean
  season: ReturnType<typeof seasonForDate>
  ramadan: boolean
  eid: boolean
  schoolHoliday: boolean
}

function dayFactorsFor(date: Date): DayFactors {
  const month = date.getMonth()
  const day = date.getDate()
  const weekday = date.getDay()
  return {
    weekend: weekday === 0 || weekday === 6,
    payday: day >= 25 || day <= 3,
    yearEnd: (month === 11 && day >= 10) || (month === 0 && day <= 10),
    season: seasonForDate(date),
    ramadan: isRamadanDate(date),
    eid: isEidDate(date),
    schoolHoliday: isSchoolHoliday(date),
  }
}

function factorFor(seed: DemoProductSeed, factors: DayFactors, random: () => number) {
  const isHot = /kopi|susu|sirup/.test(seed.name.toLowerCase())
  const isCold = /air|teh botol|es/.test(seed.name.toLowerCase())
  let factor = 1

  if (factors.weekend) {
    factor *=
      seed.category === "minuman" || seed.category === "rokok" || seed.category === "instan"
        ? 1.3
        : 1.12
  }
  if (factors.payday) factor *= 1.22
  if (factors.yearEnd) {
    factor *=
      seed.category === "sembako"
        ? 1.55
        : seed.category === "bumbu"
          ? 1.35
          : seed.category === "instan"
            ? 1.3
            : seed.category === "minuman"
              ? 1.25
              : seed.category === "rumah tangga"
                ? 1.2
                : 1.15
  }
  if (factors.season === "Musim hujan") {
    if (isHot) factor *= 1.45
    if (isCold) factor *= 0.85
    if (seed.category === "instan") factor *= 1.25
    if (seed.category === "sembako") factor *= 1.08
    if (seed.category === "bumbu") factor *= 1.05
  }
  if (factors.season === "Musim kemarau") {
    if (isCold) factor *= 1.4
    if (isHot) factor *= 0.85
    if (seed.category === "instan") factor *= 0.92
  }
  if (factors.ramadan) {
    if (seed.category === "sembako") factor *= 1.6
    if (seed.category === "bumbu") factor *= 1.3
    if (seed.category === "instan") factor *= 1.2
    if (isHot) factor *= 1.2
    if (isCold) factor *= 1.1
  }
  if (factors.eid) {
    if (seed.category === "sembako") factor *= 1.3
    if (seed.category === "bumbu") factor *= 1.2
  }
  if (factors.schoolHoliday) {
    if (seed.category === "instan" || seed.category === "minuman" || seed.category === "rokok") {
      factor *= 1.15
    }
  }
  if (factors.season === "Musim hujan" && (isHot || seed.category === "instan") && random() < 0.3) {
    factor *= 1.25
  }
  return factor
}

function roundQuantity(value: number, random: () => number) {
  const whole = Math.floor(value)
  return whole + (random() < value - whole ? 1 : 0)
}

export interface DemoState {
  products: Product[]
  transactions: Transaction[]
  debts: Debt[]
  notes: PurchaseNote[]
  customers: Customer[]
  consignments: Consignment[]
  generatedAt: string
}

function demoConsignments(now: Date): Consignment[] {
  return [
    {
      id: "demo-consignment-1",
      depositor: "Pak Hendra",
      productName: "Keripik Singkong",
      unit: "pcs",
      qty: 40,
      soldQty: 12,
      buyPrice: 8000,
      sellPrice: 10000,
      commissionPct: 10,
      status: "active",
      note: "Titip 2 minggu",
      createdAt: isoAt(addDays(startOfDay(now), -12), 9, 0),
      settledAt: null,
    },
    {
      id: "demo-consignment-2",
      depositor: "Bu Tini",
      productName: "Kue Lapis",
      unit: "pcs",
      qty: 20,
      soldQty: 5,
      buyPrice: 5000,
      sellPrice: 7000,
      commissionPct: 12,
      status: "active",
      note: null,
      createdAt: isoAt(addDays(startOfDay(now), -5), 10, 0),
      settledAt: null,
    },
  ]
}

export function createDemoStocktakeAdjustments(now = new Date()): Transaction[] {
  return [
    {
      id: "demo-opname-minyak",
      type: "adjustment",
      product_id: "p-minyak",
      qty: -2,
      unit_price: 0,
      created_at: isoAt(addDays(startOfDay(now), -1), 12, 0),
      note: "opname",
    },
    {
      id: "demo-opname-mi",
      type: "adjustment",
      product_id: "p-mi",
      qty: 4,
      unit_price: 0,
      created_at: isoAt(addDays(startOfDay(now), -3), 9, 0),
      note: "opname",
    },
  ]
}

export function createDemoMarketPrices(now = new Date()): MarketPrice[] {
  const day = 24 * 60 * 60 * 1000
  const reports: Array<Omit<MarketPrice, "id" | "reportedAt"> & { daysAgo: number }> = [
    {
      productId: "p-beras",
      productName: "Beras Ramos",
      price: 14900,
      sourceName: "Warung demo A",
      daysAgo: 1,
    },
    {
      productId: "p-beras",
      productName: "Beras Ramos",
      price: 15100,
      sourceName: "Warung demo B",
      daysAgo: 2,
    },
    {
      productId: "p-minyak",
      productName: "Minyak Goreng",
      price: 15500,
      sourceName: "Warung demo A",
      daysAgo: 1,
    },
    {
      productId: "p-minyak",
      productName: "Minyak Goreng",
      price: 16000,
      sourceName: "Warung demo B",
      daysAgo: 3,
    },
    {
      productId: "p-mi",
      productName: "Mi Instan",
      price: 3000,
      sourceName: "Warung demo A",
      daysAgo: 1,
    },
    {
      productId: "p-mi",
      productName: "Mi Instan",
      price: 3200,
      sourceName: "Warung demo B",
      daysAgo: 2,
    },
    {
      productId: "p-kopi",
      productName: "Kopi Kapal Api",
      price: 3000,
      sourceName: "Warung demo A",
      daysAgo: 2,
    },
    {
      productId: "p-kopi",
      productName: "Kopi Kapal Api",
      price: 3200,
      sourceName: "Warung demo B",
      daysAgo: 3,
    },
  ]

  return reports.map(({ daysAgo, ...report }, index) => ({
    ...report,
    id: `demo-market-${report.productId}-${index + 1}`,
    reportedAt: new Date(now.getTime() - daysAgo * day).toISOString(),
  }))
}

function demoCustomers(now: Date): Customer[] {
  return [
    {
      id: "demo-customer-1",
      name: "Pak Yono",
      phone: "0812 3456 7890",
      note: "Langganan tetap, hutang dibayar minggu depan",
      maxDebt: 300000,
      debtDeadline: isoDate(addDays(startOfDay(now), 14)),
      createdAt: isoAt(addDays(startOfDay(now), -180), 8, 0),
    },
    {
      id: "demo-customer-2",
      name: "Bu Tini",
      phone: null,
      note: "Tagih hari Jumat",
      maxDebt: null,
      debtDeadline: null,
      createdAt: isoAt(addDays(startOfDay(now), -90), 9, 0),
    },
  ]
}

/**
 * Placeholder nota (SVG) untuk mode demo: pemilik bisa lihat struk nota
 * tanpa perlu foto asli.
 */
function sampleNoteImage(title: string, lines: string[]): string {
  const rowHeight = 26
  const height = 120 + lines.length * rowHeight
  const body = lines
    .map(
      (line, index) =>
        `<text x="28" y="${150 + index * rowHeight}" font-family="monospace" font-size="15" fill="#20302a">${line}</text>`,
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" viewBox="0 0 420 ${height}"><rect width="420" height="${height}" fill="#fdfdf8"/><rect x="14" y="14" width="392" height="${height - 28}" fill="none" stroke="#c9d6ce" stroke-dasharray="6 4"/><text x="28" y="60" font-family="sans-serif" font-size="20" font-weight="700" fill="#1d2b24">${title}</text><text x="28" y="86" font-family="monospace" font-size="13" fill="#6b7a72">WARUNG SUMBER REJEKI</text><line x1="28" y1="106" x2="392" y2="106" stroke="#dde5e0"/>${body}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function demoNotes(now: Date): PurchaseNote[] {
  const yesterday = isoAt(addDays(startOfDay(now), -1), 9, 25)
  const lastWeek = isoAt(addDays(startOfDay(now), -6), 15, 5)
  return [
    {
      id: "demo-note-1",
      createdAt: yesterday,
      addedBy: "Pegawai toko",
      total: 215000,
      items: [
        { name: "Minyak Goreng", qty: 5, unit: "liter", unitPrice: 15000 },
        { name: "Gula Pasir", qty: 10, unit: "kg", unitPrice: 14000 },
      ],
      image: sampleNoteImage("NOTA BELANJA", [
        "Minyak Goreng   5 liter  15.000",
        "Gula Pasir     10 kg     14.000",
        "TOTAL                   215.000",
      ]),
      source: "scan",
    },
    {
      id: "demo-note-2",
      createdAt: lastWeek,
      addedBy: "Pak Andi",
      total: 300000,
      items: [{ name: "Beras Ramos", qty: 25, unit: "kg", unitPrice: 12000 }],
      image: sampleNoteImage("NOTA BELANJA", [
        "Beras Ramos    25 kg     12.000",
        "TOTAL                   300.000",
      ]),
      source: "scan",
    },
  ]
}

export interface DemoStateOptions {
  /**
   * Berapa hari riwayat yang dibuat. Default 365 (satu tahun).
   * Akun baru cukup 30 hari supaya pendaftaran tidak berat, tapi tetap cukup
   * untuk saran stok dan musim bekerja.
   */
  days?: number
  /** Jangan sertakan temuan stok contoh saat data dipakai untuk akun cloud. */
  includeDemoExamples?: boolean
}

export function createDemoState(now = new Date(), options: DemoStateOptions = {}): DemoState {
  const days = options.days ?? 365
  const transactions: Transaction[] = []
  const today = startOfDay(now)
  const stock = new Map(DEMO_PRODUCTS.map((product) => [product.id, product.startingStock]))

  // Satu tahun penjualan dengan pola hari kerja, gajian, musim hujan,
  // Ramadan/Lebaran, dan akhir tahun. Pembelian mingguan menjaga stok tetap
  // realistis. Semua angka deterministik supaya demo bisa diulang.
  for (let dayOffset = -(days - 1); dayOffset <= 0; dayOffset += 1) {
    const date = addDays(today, dayOffset)
    // Faktor tanggal dihitung sekali per hari, dipakai untuk semua barang.
    const factors = dayFactorsFor(date)
    DEMO_PRODUCTS.forEach((seed, index) => {
      const random = seededRandom((dayOffset + 500) * 131 + index * 17)
      let current = stock.get(seed.id) ?? 0
      const threshold = Math.max(seed.min_stock, seed.baseDaily * 3)
      if (current <= threshold) {
        const purchaseQty = Math.ceil(seed.baseDaily * 10)
        const createdAt = dayOffset === 0 ? isoAt(date, 0, 1) : isoAt(date, 6, 10 + (index % 20))
        transactions.push({
          id: `demo-purchase-${dayOffset}-${index}`,
          type: "purchase",
          product_id: seed.id,
          qty: purchaseQty,
          unit_price: seed.buy_price,
          created_at: createdAt,
        })
        current += purchaseQty
      }

      const factor = factorFor(seed, factors, random)
      const noise = 0.82 + random() * 0.36
      const todayBoost = dayOffset === 0 ? 1.15 : 1
      let qty = roundQuantity(seed.baseDaily * factor * noise * todayBoost, random)
      qty = Math.min(qty, Math.floor(current))
      if (qty <= 0 && dayOffset === 0 && current >= 1 && seed.baseDaily >= 1) qty = 1
      if (qty <= 0) {
        stock.set(seed.id, current)
        return
      }

      const createdAt =
        dayOffset === 0
          ? new Date(
              // Selalu di masa lalu, supaya transaksi hari ini tidak terbuang
              // kalau aplikasi dibuka tepat tengah malam.
              Math.min(
                now.getTime() - 60_000,
                Math.max(today.getTime() + 2 * 60_000, now.getTime() - (index + 1) * 7 * 60 * 1000),
              ),
            ).toISOString()
          : isoAt(date, 7 + (index % 12), (index * 11) % 60)
      transactions.push({
        id: `demo-sale-${dayOffset}-${index}`,
        type: "sale",
        product_id: seed.id,
        qty,
        unit_price: seed.sell_price,
        created_at: createdAt,
      })
      current -= qty
      stock.set(seed.id, current)
    })
  }

  // Kulakan demo: Telur Ayam naik modal 25.000 → 27.000 (+8%) supaya kartu
  // "Modal bergerak" dan saran harga jual hidup saat demo; Gula stabil sebagai
  // pembanding yang diperiksa tapi tidak bergerak.
  const purchases: Transaction[] = [
    {
      id: "demo-purchase-telur-1",
      type: "purchase",
      product_id: "p-telur",
      qty: 10,
      unit_price: 25000,
      created_at: isoAt(addDays(today, -28), 7, 0),
    },
    {
      id: "demo-purchase-telur-2",
      type: "purchase",
      product_id: "p-telur",
      qty: 10,
      unit_price: 27000,
      created_at: isoAt(addDays(today, -7), 7, 30),
    },
    {
      id: "demo-purchase-gula-1",
      type: "purchase",
      product_id: "p-gula",
      qty: 8,
      unit_price: 14000,
      created_at: isoAt(addDays(today, -24), 8, 0),
    },
    {
      id: "demo-purchase-gula-2",
      type: "purchase",
      product_id: "p-gula",
      qty: 8,
      unit_price: 14000,
      created_at: isoAt(addDays(today, -5), 8, 15),
    },
  ]

  // Kulakan ini harus ikut dihitung di stok. Kalau tidak, stok yang
  // ditampilkan tidak sama dengan riwayatnya — dan di database, trigger
  // `transactions_apply_stock` tetap menambahkannya.
  for (const purchase of purchases) {
    stock.set(purchase.product_id, (stock.get(purchase.product_id) ?? 0) + purchase.qty)
  }

  const stocktakeAdjustments =
    options.includeDemoExamples === false ? [] : createDemoStocktakeAdjustments(now)
  for (const adjustment of stocktakeAdjustments) {
    stock.set(adjustment.product_id, (stock.get(adjustment.product_id) ?? 0) + adjustment.qty)
  }

  const products = DEMO_PRODUCTS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    unit: seed.unit,
    stock: Math.max(0, stock.get(seed.id) ?? 0),
    min_stock: seed.min_stock,
    buy_price: seed.buy_price,
    sell_price: seed.sell_price,
    aliases: seed.aliases,
  }))

  // Buku utang demo: dua catatan "simpen dulu" yang belum lunas, supaya
  // panel Simpen Dulu langsung hidup saat demo tanpa perlu memasukkan utang dulu.
  const debts: Debt[] = [
    {
      id: "demo-debt-yono",
      debtor: "Pak Yono",
      product_name: "Rokok",
      qty: 2,
      unit: "bungkus",
      amount: 62000,
      note: null,
      created_at: addDays(today, -3).toISOString(),
      settled_at: null,
    },
    {
      id: "demo-debt-tuti",
      debtor: "Bu Tuti",
      product_name: "Beras Ramos",
      qty: 3,
      unit: "kg",
      amount: 43500,
      note: null,
      created_at: addDays(today, -6).toISOString(),
      settled_at: null,
    },
  ]

  return {
    products,
    transactions: transactions
      .concat(purchases)
      .concat(stocktakeAdjustments)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    debts,
    notes: demoNotes(now),
    customers: demoCustomers(now),
    consignments: demoConsignments(now),
    generatedAt: now.toISOString(),
  }
}
