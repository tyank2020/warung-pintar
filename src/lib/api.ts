import type {
  AdvisorResult,
  AdvisorTip,
  AskWarungResult,
  Consignment,
  Customer,
  Debt,
  MarketPrice,
  NewProductInput,
  Product,
  PurchaseNote,
  PurchaseNoteItem,
  ReceiptScanResult,
  Transaction,
  VoiceParseResult,
} from "./types"
import type { SeasonalPlan } from "./seasonal"
import { seasonalPlanForAi } from "./seasonal"
import { supabase } from "./supabase"


interface ProductRow {
  id: string
  name: string
  unit: string
  stock: number
  min_stock: number
  buy_price: number
  sell_price: number
  /** Ukuran/varian kemasan ("2 Liter"); null = tanpa varian. */
  size?: string | null
  /** Merek barang ("Bimoli"); null = tanpa merek. */
  brand?: string | null
}

interface PurchaseNoteRow {
  id: string
  created_at: string
  added_by: string
  total: number
  item_count: number
  items: PurchaseNoteItem[]
  image_data: string | null
  source: string
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  note: string | null
  max_debt: number | null
  debt_deadline: string | null
  created_at: string
}

interface ConsignmentRow {
  id: string
  depositor: string
  product_name: string
  unit: string
  qty: number
  sold_qty: number
  buy_price: number
  sell_price: number
  commission_pct: number
  status: string
  note: string | null
  created_at: string
  settled_at: string | null
}

interface MarketPriceRow {
  id: string
  product_id: string | null
  product_name: string
  price: number
  source_name: string
  reported_by: string | null
  reported_at: string
}

interface AliasRow {
  product_id: string
  alias: string
}

/**
 * `owner_id` untuk baris yang ditulis aplikasi.
 *
 * Semua baris harus punya pemilik. Kalau belum masuk, prosesnya dihentikan
 * di sini — lebih baik error jelas daripada diam-diam menulis baris tanpa
 * pemilik (yang nanti tidak terlihat oleh siapa pun).
 */
async function ownerId(): Promise<string> {
  // Id pemilik diambil dari sesi Supabase yang aktif. Mode lokal (tanpa
  // Supabase) tidak pernah sampai ke sini karena datanya ada di browser.
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const id = data.session?.user?.id
  if (!id) throw new Error("Belum masuk. Silakan masuk dulu.")
  return id
}

export interface WarungData {
  products: Product[]
  transactions: Transaction[]
}

/**
 * Ambil produk beserta alias-nya.
 *
 * Kalau `ids` diisi, hanya produk itu yang diambil. Ini dipakai setelah
 * menyimpan transaksi supaya tidak memuat ulang seluruh riwayat.
 */
export async function fetchProducts(ids?: string[]): Promise<Product[]> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")

  let productQuery = supabase.from("products").select("*")
  if (ids && ids.length > 0) productQuery = productQuery.in("id", ids)
  const { data: productRows, error: productError } = await productQuery.order("name")
  if (productError) throw productError

  const products = (productRows ?? []) as ProductRow[]
  if (products.length === 0) return []

  const { data: aliasRows, error: aliasError } = await supabase
    .from("product_aliases")
    .select("product_id, alias")
    .in(
      "product_id",
      products.map((product) => product.id),
    )
  if (aliasError) throw aliasError

  const aliases = new Map<string, string[]>()
  for (const row of (aliasRows ?? []) as AliasRow[]) {
    const current = aliases.get(row.product_id) ?? []
    current.push(row.alias)
    aliases.set(row.product_id, current)
  }

  return products.map((row) => ({ ...row, aliases: aliases.get(row.id) ?? [] }))
}

/** Ambil transaksi yang dibuat sejak waktu tertentu (berhalaman). */
export async function fetchTransactionsSince(since: string): Promise<Transaction[]> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const pageSize = 1000
  const rows: Transaction[] = []
  for (let from = 0; from < 6000; from += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []) as Transaction[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export async function fetchWarungData(): Promise<WarungData> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")

  const [productsResult, aliasesResult] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("product_aliases").select("product_id, alias"),
  ])

  if (productsResult.error) throw productsResult.error
  if (aliasesResult.error) throw aliasesResult.error

  // PostgREST membatasi jumlah baris per request. Ambil bertahap agar saran
  // musiman tetap punya histori panjang, bukan hanya 1.000 transaksi terbaru.
  const pageSize = 1000
  const transactions: Transaction[] = []
  for (let from = 0; from < 6000; from += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as Transaction[]
    transactions.push(...rows)
    if (rows.length < pageSize) break
  }

  const aliases = new Map<string, string[]>()
  for (const row of (aliasesResult.data ?? []) as AliasRow[]) {
    const current = aliases.get(row.product_id) ?? []
    current.push(row.alias)
    aliases.set(row.product_id, current)
  }

  return {
    products: ((productsResult.data ?? []) as ProductRow[]).map((row) => ({
      ...row,
      aliases: aliases.get(row.id) ?? [],
    })),
    transactions,
  }
}

export async function insertTransactions(rows: Array<Omit<Transaction, "id">>) {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const owner = await ownerId()
  const { error } = await supabase
    .from("transactions")
    .insert(rows.map((row) => ({ ...row, owner_id: owner })))
  if (error) throw error
}

export interface NewDebtRow {
  debtor: string
  product_name: string
  qty: number
  unit: string
  amount: number
}

/** Buku utang "simpen dulu". Tabel debts wajib sudah dimigrasi. */
export async function fetchDebts(): Promise<Debt[]> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300)
  if (error) throw error
  return (data ?? []) as Debt[]
}

export async function insertDebts(rows: NewDebtRow[]) {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const owner = await ownerId()
  const { error } = await supabase
    .from("debts")
    .insert(rows.map((row) => ({ ...row, note: null, owner_id: owner })))
  if (error) throw error
}

export async function settleDebtRow(id: string) {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const { error } = await supabase
    .from("debts")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

/**
 * Perbarui harga modal beberapa produk sekaligus.
 *
 * Pakai RPC `set_buy_prices` kalau ada: satu permintaan untuk semua barang.
 * Kalau function-nya belum ada di database (mis. project lama), jatuh ke
 * pembaruan satu per satu.
 */
export async function updateBuyPrices(items: Array<{ productId: string; unitPrice: number }>) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  if (items.length === 0) return

  const { error } = await client.rpc("set_buy_prices", {
    payload: items.map((item) => ({
      productId: item.productId,
      buyPrice: item.unitPrice,
    })),
  })

  // Hanya jatuhkan kalau function-nya memang belum ada. Error lain (payload
  // salah, hak akses, koneksi) harus tetap muncul — kalau dibiarkan diam,
  // harga modal tetap lama dan laba kotor ikut salah.
  if (!error) return
  const missingFunction =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /function .* does not exist|not found/i.test(error.message ?? "")
  if (!missingFunction) throw error

  const results = await Promise.all(
    items.map((item) =>
      client.from("products").update({ buy_price: item.unitPrice }).eq("id", item.productId),
    ),
  )
  // Jangan swallow error: kalau update diam-diam gagal, harga modal tetap
  // lama dan laba kotor ikut salah.
  for (const result of results) {
    if (result.error) throw result.error
  }
}

export async function updateSellPrices(items: Array<{ productId: string; unitPrice: number }>) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const results = await Promise.all(
    items.map((item) =>
      client.from("products").update({ sell_price: item.unitPrice }).eq("id", item.productId),
    ),
  )
  for (const result of results) {
    if (result.error) throw result.error
  }
}

/**
 * Titip jual (konsinyasi). Tabel `consignments` belum tentu sudah dimigrasi.
 */
export async function fetchConsignments(): Promise<Consignment[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("consignments")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw error
  return ((data ?? []) as ConsignmentRow[]).map((row) => ({
    id: row.id,
    depositor: row.depositor,
    productName: row.product_name,
    unit: row.unit,
    qty: Number(row.qty ?? 0),
    soldQty: Number(row.sold_qty ?? 0),
    buyPrice: Number(row.buy_price ?? 0),
    sellPrice: Number(row.sell_price ?? 0),
    commissionPct: Number(row.commission_pct ?? 0),
    status: (row.status as Consignment["status"]) ?? "active",
    note: row.note ?? null,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? null,
  }))
}

export interface NewConsignmentInput {
  depositor: string
  productName: string
  unit: string
  qty: number
  buyPrice: number
  sellPrice: number
  commissionPct: number
  note: string | null
}

export async function insertConsignment(input: NewConsignmentInput): Promise<Consignment> {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await client
    .from("consignments")
    .insert({
      depositor: input.depositor,
      product_name: input.productName,
      unit: input.unit,
      qty: input.qty,
      sold_qty: 0,
      buy_price: input.buyPrice,
      sell_price: input.sellPrice,
      commission_pct: input.commissionPct,
      status: "active",
      note: input.note,
      owner_id: await ownerId(),
    })
    .select()
    .single()
  if (error) throw error
  const row = data as ConsignmentRow
  return {
    id: row.id,
    depositor: row.depositor,
    productName: row.product_name,
    unit: row.unit,
    qty: Number(row.qty ?? 0),
    soldQty: 0,
    buyPrice: Number(row.buy_price ?? 0),
    sellPrice: Number(row.sell_price ?? 0),
    commissionPct: Number(row.commission_pct ?? 0),
    status: "active",
    note: row.note ?? null,
    createdAt: row.created_at,
    settledAt: null,
  }
}

export async function updateConsignmentRow(
  id: string,
  patch: {
    sold_qty?: number
    status?: "active" | "selesai"
    settled_at?: string | null
  },
) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { error } = await client.from("consignments").update(patch).eq("id", id)
  if (error) throw error
}

/**
 * Harga pasar (crowd-sourced). Tabel `market_prices` belum tentu sudah
 * dimigrasi, jadi pemanggil harus siap menerima error.
 */
export async function fetchMarketPrices(limit = 200): Promise<MarketPrice[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("market_prices")
    .select("*")
    .order("reported_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as MarketPriceRow[]).map((row) => ({
    id: row.id,
    productId: row.product_id ?? "",
    productName: row.product_name,
    price: Number(row.price ?? 0),
    sourceName: row.source_name ?? "Warung sebelah",
    reportedAt: row.reported_at,
  }))
}

export interface NewMarketPrice {
  productId: string
  productName: string
  price: number
  sourceName: string
}

export async function insertMarketPrice(input: NewMarketPrice): Promise<MarketPrice> {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await client
    .from("market_prices")
    .insert({
      product_id: input.productId || null,
      product_name: input.productName,
      price: input.price,
      source_name: input.sourceName,
      owner_id: await ownerId(),
    })
    .select()
    .single()
  if (error) throw error
  const row = data as MarketPriceRow
  return {
    id: row.id,
    productId: row.product_id ?? "",
    productName: row.product_name,
    price: Number(row.price ?? 0),
    sourceName: row.source_name ?? "Warung sebelah",
    reportedAt: row.reported_at,
  }
}

/**
 * Buku Piutang. Tabel `customers` belum tentu sudah dimigrasi, jadi
 * pemanggil harus siap menerima error.
 */
export async function fetchCustomers(): Promise<Customer[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true })
  if (error) throw error
  return ((data ?? []) as CustomerRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    note: row.note ?? null,
    maxDebt: row.max_debt ?? null,
    debtDeadline: row.debt_deadline ?? null,
    createdAt: row.created_at,
  }))
}

export interface NewCustomerInput {
  name: string
  phone: string | null
  note: string | null
  maxDebt: number | null
  debtDeadline: string | null
}

export async function insertCustomer(input: NewCustomerInput): Promise<Customer> {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await client
    .from("customers")
    .insert({
      name: input.name,
      phone: input.phone,
      note: input.note,
      max_debt: input.maxDebt,
      debt_deadline: input.debtDeadline,
      owner_id: await ownerId(),
    })
    .select()
    .single()
  if (error) throw error
  const row = data as CustomerRow
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    note: row.note ?? null,
    maxDebt: row.max_debt ?? null,
    debtDeadline: row.debt_deadline ?? null,
    createdAt: row.created_at,
  }
}

export async function updateCustomerRow(
  id: string,
  patch: {
    name?: string
    phone?: string | null
    note?: string | null
    maxDebt?: number | null
    debtDeadline?: string | null
  },
) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const dbPatch: Record<string, unknown> = {}
  if (patch.name !== undefined) dbPatch.name = patch.name
  if (patch.phone !== undefined) dbPatch.phone = patch.phone
  if (patch.note !== undefined) dbPatch.note = patch.note
  if (patch.maxDebt !== undefined) dbPatch.max_debt = patch.maxDebt
  if (patch.debtDeadline !== undefined) dbPatch.debt_deadline = patch.debtDeadline
  const { error } = await client.from("customers").update(dbPatch).eq("id", id)
  if (error) throw error
}

/**
 * Kalau nama Piutang diganti, catatan utangnya ikut diperbarui supaya
 * riwayat tidak terbelah jadi dua Piutang.
 */
export async function updateDebtorName(oldName: string, newName: string) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { error } = await client.from("debts").update({ debtor: newName }).eq("debtor", oldName)
  if (error) throw error
}

/**
 * Riwayat nota belanja. Tabel `purchase_notes` belum tentu sudah dimigrasi,
 * jadi pemanggil harus siap menerima error.
 */
export async function fetchPurchaseNotes(limit = 60): Promise<PurchaseNote[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("purchase_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as PurchaseNoteRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    addedBy: row.added_by,
    total: Number(row.total ?? 0),
    items: (row.items ?? []) as PurchaseNoteItem[],
    image: row.image_data ?? "",
    source: (row.source as PurchaseNote["source"]) ?? "scan",
  }))
}

export interface NewPurchaseNote {
  addedBy: string
  total: number
  items: PurchaseNoteItem[]
  image: string
  source: PurchaseNote["source"]
  createdAt?: string
}

export async function insertPurchaseNote(note: NewPurchaseNote) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { error } = await client.from("purchase_notes").insert({
    owner_id: await ownerId(),
    added_by: note.addedBy,
    total: note.total,
    item_count: note.items.length,
    items: note.items,
    image_data: note.image || null,
    source: note.source,
    created_at: note.createdAt ?? new Date().toISOString(),
  })
  if (error) throw error
}

/**
 * Arsipkan / aktifkan kembali barang. Baris barang tidak dihapus —
 * transaksi lama masih butuh mereferensikan barang ini.
 */
export async function archiveProduct(id: string, archived = true) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { error } = await client.from("products").update({ archived }).eq("id", id)
  if (error) throw error
}

export async function updateMinStocks(items: Array<{ productId: string; minStock: number }>) {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const results = await Promise.all(
    items.map((item) =>
      client.from("products").update({ min_stock: item.minStock }).eq("id", item.productId),
    ),
  )
  for (const result of results) {
    if (result.error) throw result.error
  }
}

export async function insertProduct(input: NewProductInput): Promise<Product> {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await client
    .from("products")
    .insert({
      name: input.name,
      unit: input.unit,
      stock: input.stock,
      min_stock: input.min_stock,
      buy_price: input.buy_price,
      sell_price: input.sell_price,
      lead_time_days: input.lead_time_days ?? 2,
      size: input.size?.trim() || null,
      brand: input.brand?.trim() || null,
      owner_id: await ownerId(),
    })
    .select()
    .single()

  if (error) throw error

  if (input.aliases.length > 0) {
    const owner = await ownerId()
    const { error: aliasError } = await client.from("product_aliases").insert(
      input.aliases.map((alias) => ({
        product_id: (data as ProductRow).id,
        alias,
        owner_id: owner,
      })),
    )
    if (aliasError) {
      // Baris produk sudah tersimpan. Alias yang bentrok tidak boleh membuat
      // seluruh operasi gagal — kalau gagal, produk jadi ada di server tapi
      // tidak pernah tampil di aplikasi.
      console.warn("Alias gagal disimpan:", aliasError)
    }
  }

  return { ...(data as ProductRow), aliases: input.aliases }
}

export async function callParseVoice(
  transcript: string,
  products: Product[],
): Promise<VoiceParseResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke("parse-voice", {
    body: {
      transcript,
      products: products.map((product) => ({
        name: product.name,
        unit: product.unit,
        aliases: product.aliases,
        size: product.size ?? null,
        brand: product.brand ?? null,
      })),
    },
  })
  if (error) throw error
  return (data as VoiceParseResult) ?? null
}

export async function callScanReceipt(
  imageBase64: string,
  mimeType: string,
): Promise<ReceiptScanResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke("scan-receipt", {
    body: { imageBase64, mimeType },
  })
  if (error) throw error
  return (data as ReceiptScanResult) ?? null
}

/**
 * Pertanyaan bebas tentang kondisi warung. Angka sudah dihitung di klien dari
 * database dan dikirim sebagai konteks; AI hanya menyusun jawabannya.
 */
export async function callAskWarung(
  question: string,
  context: Record<string, unknown>,
): Promise<AskWarungResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke("ask-warung", {
    body: { question, context },
  })
  if (error) throw error
  return (data as AskWarungResult) ?? null
}

export async function callAdvisor(payload: {
  tips: AdvisorTip[]
  weekSales: number
  weekCogs: number
  lowStock: Array<{ name: string; stock: number; unit: string; min_stock: number }>
}): Promise<AdvisorResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke("advisor", {
    body: payload,
  })
  if (error) throw error
  return (data as AdvisorResult) ?? null
}

/**
 * Kirim rencana musiman yang sudah dihitung ke Edge Function. Function khusus
 * `seasonal-advisor` dipakai kalau sudah dideploy; kalau belum, fallback ke
 * `advisor` yang sudah aktif. Keduanya hanya merapikan bahasa dan prioritas,
 * bukan menghitung angka baru.
 */
export async function callSeasonalAdvisor(
  plan: SeasonalPlan,
  financials: { weekSales: number; weekCogs: number },
): Promise<AdvisorResult | null> {
  if (!supabase) return null

  const body = {
    ...seasonalPlanForAi(plan),
    weekSales: financials.weekSales,
    weekCogs: financials.weekCogs,
    lowStock: plan.signals
      .filter((signal) => signal.stock <= signal.minStock)
      .slice(0, 10)
      .map((signal) => ({
        name: signal.name,
        stock: signal.stock,
        unit: signal.unit,
        min_stock: signal.minStock,
      })),
    tips: plan.recommendations.map((recommendation) => ({
      text: recommendation.action,
      reason: recommendation.reason,
    })),
  }

  try {
    const { data, error } = await supabase.functions.invoke("seasonal-advisor", { body })
    if (!error) return (data as AdvisorResult) ?? null
  } catch {
    // Function baru belum tentu sudah dideploy. Lanjut ke advisor lama.
  }

  const { data, error } = await supabase.functions.invoke("advisor", { body })
  if (error) throw error
  return (data as AdvisorResult) ?? null
}
