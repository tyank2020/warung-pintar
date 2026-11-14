import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  ConfirmItem,
  Consignment,
  ConsignmentSaleRecord,
  Customer,
  DashboardStats,
  Debt,
  MarketPrice,
  NewProductInput,
  Product,
  PurchaseNote,
  PurchaseNoteItem,
  Transaction,
} from "./types"
import { createDemoMarketPrices, createDemoState, createDemoStocktakeAdjustments } from "./demo"
import type { CartLine } from "./checkout"
import { findDuplicateProduct } from "./parser"
import { computeStatsFromIndex } from "./stats"
import { todayPurchaseExpenses, type ExpenseSummary } from "./expense"
import { buildSalesIndex, type SalesIndex } from "./analytics"
import { computeSeasonalPlanFromIndex, type SeasonalPlan } from "./seasonal"
import { debtGuard, openDebtFor } from "./customers"
import { isSupabaseConfigured } from "./supabase"
import { productLabel } from "./format"
import {
  localDb,
  readLocalSnapshot,
  writeLocalSnapshot,
  ensureLocalScope,
} from "./localDb"
import { useAuth } from "./auth"
import {
  enqueueWrite,
  getSyncState,
  initSyncListeners,
  refreshSyncState,
  setAutoSync,
  subscribeSync,
  syncNow,
  type SyncState,
} from "./sync"

import {
  fetchConsignments,
  fetchCustomers,
  fetchDebts,
  fetchMarketPrices,
  fetchPurchaseNotes,
  fetchWarungData,
} from "./api"

const DEMO_KEY = "warung-pintar-demo-v2"

type DataSource = "demo" | "supabase"

export interface WarungSync {
  online: boolean
  syncing: boolean
  pending: number
  lastSyncAt: string | null
  lastError: string | null
  autoSync: boolean
  status: SyncState["status"]
  syncNow: () => Promise<void>
  setAutoSync: (value: boolean) => Promise<void>
}

interface WarungContextValue {
  /** Status sinkronisasi & antrean transaksi offline. */
  sync: WarungSync
  products: Product[]
  transactions: Transaction[]
  /** Sesi masuk. Null kalau belum masuk (atau mode demo lokal). */
  debts: Debt[]
  /** Riwayat nota belanja (bukti stok masuk). */
  notes: PurchaseNote[]
  /** True kalau ada nota yang hanya tersimpan di perangkat ini. */
  notesLocalOnly: boolean
  /** Buku Piutang (identitas + catatan). */
  customers: Customer[]
  /** Barang titipan milik orang lain (konsinyasi). */
  consignments: Consignment[]
  /** Riwayat penjualan titipan untuk omzet dan komisi laba. */
  consignmentSales: ConsignmentSaleRecord[]
  /** Laporan harga pasar dari warung sekitar (crowd-sourced). */
  marketPrices: MarketPrice[]
  /**
   * Keranjang kasir disimpan di store, bukan di state halaman — jadi tidak
   * hilang kalau pemilikWarung pindah halaman (mis. untuk cek stok).
   */
  cartLines: CartLine[]
  setCartLines: (update: CartLine[] | ((current: CartLine[]) => CartLine[])) => void
  /** Catat laporan harga pasar yang dilihat di sekitar. */
  addMarketPrice: (input: {
    productId: string
    productName: string
    price: number
    sourceName: string
  }) => Promise<MarketPrice>
  /** Tambah Piutang baru (langganan tetap), termasuk batas utang & tenggat. */
  addCustomer: (input: {
    name: string
    phone: string | null
    note: string | null
    maxDebt: number | null
    debtDeadline: string | null
  }) => Promise<Customer>
  /** Ubah data Piutang (telepon, catatan, nama, batas utang & tenggat). */
  updateCustomer: (
    id: string,
    patch: {
      name?: string
      phone?: string | null
      note?: string | null
      maxDebt?: number | null
      debtDeadline?: string | null
    },
  ) => Promise<void>
  /** Catat barang titipan baru dari pemilik barang. */
  addConsignment: (input: {
    depositor: string
    productName: string
    unit: string
    qty: number
    buyPrice: number
    sellPrice: number
    commissionPct: number
    note: string | null
  }) => Promise<Consignment>
  /** Catat penjualan titipan sebanyak qty. */
  sellConsignment: (id: string, qty: number) => Promise<void>
  /** Tutup titipan: sisa dikembalikan, bagian pemilik dibayar. */
  closeConsignment: (id: string) => Promise<void>
  stats: DashboardStats
  /**
   * Pengeluaran belanja hari ini: total biaya stok masuk dari transaksi
   * pembelian, dihitung oleh mesin `expense.ts` (zona waktu warung).
   */
  expenses: ExpenseSummary
  /**
   * Indeks penjualan bersama. Semua halaman yang butuh angka penjualan
   * membaca dari sini, supaya tidak ada layar yang menghitung sendiri.
   */
  index: SalesIndex
  /** Rencana musiman, dihitung dari indeks yang sama. */
  seasonal: SeasonalPlan
  loading: boolean
  source: DataSource
  syncError: string
  saveSale: (items: ConfirmItem[], note?: string) => Promise<void>
  savePurchase: (items: ConfirmItem[]) => Promise<void>
  /** Tambah stok sambil menyimpan bukti nota (foto, isi, dan siapa yang input). */
  savePurchaseWithNote: (
    items: ConfirmItem[],
    note: { addedBy: string; image: string; source: PurchaseNote["source"] },
  ) => Promise<void>
  saveDebt: (items: ConfirmItem[], debtor: string) => Promise<void>
  /**
   * Satu transaksi kasir yang bisa bercampur: sebagian dibayar, sebagian
   * disimpan dulu (utang). Barang yang disimpan dulu tetap keluar dari stok.
   * Barang titipan dibayar langsung — pemilik barang tetap menerima bagiannya.
   */
  saveCheckout: (
    saleItems: ConfirmItem[],
    debtItems: ConfirmItem[],
    debtor: string,
    consignmentItems?: ConfirmItem[],
  ) => Promise<void>
  settleDebt: (id: string) => Promise<void>
  addProduct: (input: NewProductInput) => Promise<Product>
  /** Muat ulang hanya daftar produk (dipakai Kasir supaya selalu sinkron). */
  refreshCatalog: () => Promise<void>
  archiveProduct: (productId: string, archived?: boolean) => Promise<void>
  /** Ubah harga jual satu produk (dipakai saran penjaga margin). */
  setSellPrice: (productId: string, unitPrice: number) => Promise<void>
  /** Ubah batas stok minimum satu produk (batas alarm restok). */
  setMinStock: (productId: string, minStock: number) => Promise<void>
  /**
   * Stok opname: tetapkan stok fisik hasil hitungan. Selisihnya dicatat
   * sebagai transaksi penyesuaian, jadi stok tetap bisa ditelusuri.
   */
  adjustStock: (productId: string, countedQty: number) => Promise<void>
  refresh: () => Promise<void>
  resetDemo: () => void
}

const WarungContext = createContext<WarungContextValue | null>(null)

function readDemoState() {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      products?: Product[]
      transactions?: Transaction[]
      debts?: Debt[]
      notes?: PurchaseNote[]
      customers?: Customer[]
      consignments?: Consignment[]
    }
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.transactions)) return null
    return {
      products: parsed.products,
      transactions: parsed.transactions,
      debts: Array.isArray(parsed.debts) ? parsed.debts : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      consignments: Array.isArray(parsed.consignments) ? parsed.consignments : [],
    }
  } catch {
    return null
  }
}

function writeDemoState(
  products: Product[],
  transactions: Transaction[],
  debts: Debt[],
  notes: PurchaseNote[],
  customers: Customer[],
  consignments: Consignment[],
) {
  try {
    window.localStorage.setItem(
      DEMO_KEY,
      JSON.stringify({
        products,
        transactions,
        debts,
        notes,
        customers,
        consignments,
        generatedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // Penyimpanan penuh/terblokir: state in-memory tetap jalan. Jangan
    // melempar error di sini — kalau melempar, transaksi bisa tercatat dua kali.
  }
}

const CONSIGNMENT_SALES_KEY = "warung-pintar-titip-sales-v1"

function readConsignmentSales(): ConsignmentSaleRecord[] {
  try {
    const raw = window.localStorage.getItem(CONSIGNMENT_SALES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ConsignmentSaleRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeConsignmentSales(sales: ConsignmentSaleRecord[]) {
  try {
    window.localStorage.setItem(CONSIGNMENT_SALES_KEY, JSON.stringify(sales.slice(0, 500)))
  } catch {
    // Penyimpanan penuh: biarkan in-memory.
  }
}

const MARKET_KEY = "warung-pintar-market-v1"

/**
 * Laporan harga pasar disimpan di perangkat kalau tabel cloud belum siap.
 */
function readLocalMarketPrices(): MarketPrice[] {
  try {
    const raw = window.localStorage.getItem(MARKET_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MarketPrice[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalMarketPrices(prices: MarketPrice[]) {
  try {
    window.localStorage.setItem(MARKET_KEY, JSON.stringify(prices.slice(0, 200)))
  } catch {
    // Penyimpanan penuh: laporan tetap tampil di memori.
  }
}

function getDemoMarketPrices() {
  const localPrices = readLocalMarketPrices().filter(
    (price) => !price.id.startsWith("demo-market-"),
  )
  return [...createDemoMarketPrices(), ...localPrices].sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
  )
}

export function WarungProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [notes, setNotes] = useState<PurchaseNote[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [consignments, setConsignments] = useState<Consignment[]>([])
  const [consignmentSales, setConsignmentSales] = useState<ConsignmentSaleRecord[]>(() =>
    readConsignmentSales(),
  )
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>(() => readLocalMarketPrices())
  const [cartLines, setCartLines] = useState<CartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<DataSource>(isSupabaseConfigured ? "supabase" : "demo")
  const [syncError, setSyncError] = useState("")
  const [syncState, setSyncState] = useState<SyncState>(() => getSyncState())

  // Refs keep async actions working with the newest state, even when two
  // actions run in the same event (for example: create product, then purchase).
  const productsRef = useRef<Product[]>([])
  const transactionsRef = useRef<Transaction[]>([])
  const debtsRef = useRef<Debt[]>([])
  const notesRef = useRef<PurchaseNote[]>([])
  const customersRef = useRef<Customer[]>([])
  const consignmentsRef = useRef<Consignment[]>([])
  const consignmentSalesRef = useRef<ConsignmentSaleRecord[]>(consignmentSales)
  // Token urut refresh, supaya respons lama tidak menimpa data baru.

  const applyDemoState = useCallback(
    (
      nextProducts: Product[],
      nextTransactions: Transaction[],
      nextDebts: Debt[],
      nextNotes: PurchaseNote[] = notesRef.current,
      nextCustomers: Customer[] = customersRef.current,
      nextConsignments: Consignment[] = consignmentsRef.current,
    ) => {
      productsRef.current = nextProducts
      transactionsRef.current = nextTransactions
      debtsRef.current = nextDebts
      notesRef.current = nextNotes
      customersRef.current = nextCustomers
      consignmentsRef.current = nextConsignments
      setProducts(nextProducts)
      setTransactions(nextTransactions)
      setDebts(nextDebts)
      setNotes(nextNotes)
      setCustomers(nextCustomers)
      setConsignments(nextConsignments)
      writeDemoState(
        nextProducts,
        nextTransactions,
        nextDebts,
        nextNotes,
        nextCustomers,
        nextConsignments,
      )
      // Cermin permanen ke IndexedDB supaya aplikasi tetap hidup tanpa internet.
      void localDb.transaction(
        "rw",
        [
          localDb.products,
          localDb.transactions,
          localDb.debts,
          localDb.purchaseNotes,
          localDb.customers,
          localDb.consignments,
        ],
        async () => {
          await Promise.all([
            localDb.products.clear(),
            localDb.transactions.clear(),
            localDb.debts.clear(),
            localDb.purchaseNotes.clear(),
            localDb.customers.clear(),
            localDb.consignments.clear(),
          ])
          await Promise.all([
            localDb.products.bulkPut(nextProducts),
            localDb.transactions.bulkPut(nextTransactions),
            localDb.debts.bulkPut(nextDebts),
            localDb.purchaseNotes.bulkPut(nextNotes),
            localDb.customers.bulkPut(nextCustomers),
            localDb.consignments.bulkPut(nextConsignments),
          ])
        },
      )
    },
    [],
  )

  const retainConsignmentSales = useCallback((rows: Consignment[]) => {
    const ids = new Set(rows.map((row) => row.id))
    const next = consignmentSalesRef.current.filter((sale) => ids.has(sale.consignmentId))
    if (next.length === consignmentSalesRef.current.length) return
    consignmentSalesRef.current = next
    setConsignmentSales(next)
    writeConsignmentSales(next)
  }, [])

  const loadDemo = useCallback(() => {
    const stored = readDemoState()
    if (stored) {
      const existingIds = new Set(stored.transactions.map((transaction) => transaction.id))
      const missingAdjustments = createDemoStocktakeAdjustments()
        .filter(
          (adjustment) =>
            !existingIds.has(adjustment.id) &&
            stored.products.some((product) => product.id === adjustment.product_id),
        )
        .map((adjustment) => {
          const product = stored.products.find((item) => item.id === adjustment.product_id)
          const qty =
            product && adjustment.qty < 0
              ? -Math.min(product.stock, Math.abs(adjustment.qty))
              : adjustment.qty
          return { ...adjustment, qty }
        })
        .filter((adjustment) => adjustment.qty !== 0)
      const adjustmentByProduct = new Map<string, number>()
      for (const adjustment of missingAdjustments) {
        adjustmentByProduct.set(
          adjustment.product_id,
          (adjustmentByProduct.get(adjustment.product_id) ?? 0) + adjustment.qty,
        )
      }
      const products = stored.products.map((product) => {
        const adjustment = adjustmentByProduct.get(product.id) ?? 0
        return adjustment === 0
          ? product
          : { ...product, stock: Math.max(0, product.stock + adjustment) }
      })
      const transactions = [...stored.transactions, ...missingAdjustments].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      const needsSectionSamples =
        stored.notes.length === 0 ||
        stored.customers.length === 0 ||
        stored.consignments.length === 0
      const sectionSamples = needsSectionSamples
        ? createDemoState(new Date(), { days: 30, includeDemoExamples: false })
        : null
      applyDemoState(
        products,
        transactions,
        stored.debts,
        stored.notes.length > 0 ? stored.notes : (sectionSamples?.notes ?? []),
        stored.customers.length > 0 ? stored.customers : (sectionSamples?.customers ?? []),
        stored.consignments.length > 0 ? stored.consignments : (sectionSamples?.consignments ?? []),
      )
      retainConsignmentSales(
        stored.consignments.length > 0
          ? stored.consignments
          : (sectionSamples?.consignments ?? []),
      )
      const prices = getDemoMarketPrices()
      setMarketPrices(prices)
      void localDb.marketPrices.bulkPut(prices)
      setSource("demo")
      return
    }
    const demo = createDemoState()
    applyDemoState(
      demo.products,
      demo.transactions,
      demo.debts,
      demo.notes,
      demo.customers,
      demo.consignments,
    )
    retainConsignmentSales(demo.consignments)
    const prices = getDemoMarketPrices()
    setMarketPrices(prices)
    void localDb.marketPrices.bulkPut(prices)
    setSource("demo")
  }, [applyDemoState, retainConsignmentSales])

  const loadCustomers = useCallback(async () => {
    // Tabel customers belum tentu sudah dimigrasi; buku Piutang harus tetap
    // jalan dari riwayat utang saja.
    try {
      const nextCustomers = await fetchCustomers()
      customersRef.current = nextCustomers
      setCustomers(nextCustomers)
    } catch (error) {
      console.warn("Buku Piutang belum tersedia, memakai daftar kosong:", error)
      customersRef.current = []
      setCustomers([])
    }
  }, [])

  const loadConsignments = useCallback(async () => {
    try {
      const nextConsignments = await fetchConsignments()
      consignmentsRef.current = nextConsignments
      setConsignments(nextConsignments)
      retainConsignmentSales(nextConsignments)
    } catch (error) {
      console.warn("Titip jual belum tersedia, memakai daftar kosong:", error)
      consignmentsRef.current = []
      setConsignments([])
    }
  }, [retainConsignmentSales])

  // Terapkan snapshot IndexedDB ke state (satu kode untuk online & offline).
  const applySnapshotToState = useCallback((snapshot: Awaited<ReturnType<typeof readLocalSnapshot>>) => {
    productsRef.current = snapshot.products
    transactionsRef.current = snapshot.transactions
    debtsRef.current = snapshot.debts
    notesRef.current = snapshot.notes
    customersRef.current = snapshot.customers
    consignmentsRef.current = snapshot.consignments
    consignmentSalesRef.current = snapshot.consignmentSales
    setProducts(snapshot.products)
    setTransactions(snapshot.transactions)
    setDebts(snapshot.debts)
    setNotes(snapshot.notes)
    setCustomers(snapshot.customers)
    setConsignments(snapshot.consignments)
    setConsignmentSales(snapshot.consignmentSales)
    setMarketPrices(snapshot.marketPrices)
    setSource(isSupabaseConfigured ? "supabase" : "demo")
    setSyncError("")
  }, [])

  const refresh = useCallback(async () => {
    const useCloud =
      isSupabaseConfigured && typeof navigator !== "undefined" && navigator.onLine
    if (useCloud) {
      try {
        // Kirim dulu yang belum tersinkron; kalau tidak, snapshot server akan
        // menimpa perubahan lokal yang masih di antrean.
        const queued = await refreshSyncState()
        if (queued.pending > 0) await syncNow()
        const [data, nextDebts, nextNotes, nextCustomers, nextConsignments, nextMarketPrices] =
          await Promise.all([
            fetchWarungData(),
            fetchDebts(),
            fetchPurchaseNotes(),
            fetchCustomers(),
            fetchConsignments(),
            fetchMarketPrices(),
          ])
        await writeLocalSnapshot({
          products: data.products,
          transactions: data.transactions,
          debts: nextDebts,
          notes: nextNotes,
          customers: nextCustomers,
          consignments: nextConsignments,
          marketPrices: nextMarketPrices,
          consignmentSales: consignmentSalesRef.current,
        })
      } catch (error) {
        console.warn("Gagal refresh dari server, memakai data lokal:", error)
      }
    }
    const snapshot = await readLocalSnapshot()
    applySnapshotToState(snapshot)
    await refreshSyncState()
  }, [applySnapshotToState])

  // Dengarkan perubahan status sinkronisasi sejak mount.
  useEffect(() => {
    let initialized = false
    const unsubscribe = subscribeSync((next) => {
      setSyncState(next)
      // Setelah sinkronisasi selesai, muat ulang snapshot agar stok
      // server-side ikut (misal: perangkat lain mencatat penjualan).
      if (initialized && next.status === "online" && next.lastSyncAt && !next.syncing && next.pending === 0) {
        void refresh()
      }
      initialized = true
    })
    void initSyncListeners()
    void refreshSyncState().then((next) => {
      if (next.online && next.pending > 0 && next.autoSync) void syncNow()
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Muat data warung.
   *
   * Urutan: (1) migrasi sekali dari localStorage ke IndexedDB, (2) kalau
   * online dan Supabase ada, tarik dari server lalu simpan ke IndexedDB,
   * (3) selalu baca dari IndexedDB — satu code path untuk online dan offline.
   */
  useEffect(() => {
    let cancelled = false

    const hydrateFromLocalDb = async () => {
      const snapshot = await readLocalSnapshot()
      if (cancelled) return
      applySnapshotToState(snapshot)
    }

    const load = async () => {
      // (0) Satu perangkat bisa dipakai beberapa akun. Kalau pemilik yang
      // masuk berbeda, data lokal (termasuk antrean) dibersihkan supaya tidak
      // tercampur atau terkirim ke warung yang salah.
      const scope = user?.id ?? "demo"
      try {
        const switched = await ensureLocalScope(scope)
        if (switched) console.info("Data lokal diganti untuk akun warung ini.")
      } catch (error) {
        console.warn("Gagal menyiapkan penyimpanan lokal:", error)
      }

      // (1) Mode demo: seed contoh sekali kalau perangkat masih kosong.
      if (!isSupabaseConfigured) {
        const count = await localDb.products.count()
        if (count === 0) loadDemo()
        else await hydrateFromLocalDb()
        if (!cancelled) setLoading(false)
        return
      }

      // (2) Selalu tampilkan data lokal dulu — aplikasi langsung bisa dipakai.
      const localCount = await localDb.products.count()
      if (localCount > 0) {
        await hydrateFromLocalDb()
        if (!cancelled) setLoading(false)
      }

      if (typeof navigator === "undefined" || !navigator.onLine) {
        if (!cancelled) setLoading(false)
        return
      }

      // (3) Kirim antrean lokal DULU, baru tarik data server. Kalau urutannya
      // dibalik, snapshot server akan menimpa perubahan yang belum terkirim.
      try {
        await refreshSyncState()
        if (getSyncState().pending > 0) await syncNow()
      } catch (error) {
        console.warn("Antrean sinkronisasi gagal dikirim:", error)
      }

      // (4) Tarik data server, simpan ke IndexedDB, lalu tampilkan.
      try {
        const [data, nextDebts, nextNotes, nextCustomers, nextConsignments, nextMarketPrices] =
          await Promise.all([
            fetchWarungData(),
            fetchDebts(),
            fetchPurchaseNotes(),
            fetchCustomers(),
            fetchConsignments(),
            fetchMarketPrices(),
          ])
        if (cancelled) return
        await writeLocalSnapshot({
          products: data.products,
          transactions: data.transactions,
          debts: nextDebts,
          notes: nextNotes,
          customers: nextCustomers,
          consignments: nextConsignments,
          marketPrices: nextMarketPrices,
          consignmentSales: consignmentSalesRef.current,
        })
        await hydrateFromLocalDb()
      } catch (error) {
        console.warn("Gagal tarik data dari server, memakai data lokal:", error)
      }
      if (!cancelled) setLoading(false)
      void refreshSyncState()
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySnapshotToState, loadDemo, user?.id])

  /**
   * Cek stok sebelum menyimpan: sama untuk mode cloud dan demo, supaya
   * pesan error-nya ramah (bukan error Postgres mentah) dan tidak pernah
   * membuat stok minus.
   */
  const assertStockAvailable = useCallback((items: ConfirmItem[]) => {
    const requested = new Map<string, number>()
    for (const item of items) {
      requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.qty)
    }
    for (const [productId, qty] of requested) {
      const product = productsRef.current.find((candidate) => candidate.id === productId)
      if (!product) throw new Error("Barang tidak ditemukan.")
      if (product.stock < qty) {
        throw new Error(`Stok ${productLabel(product)} tinggal ${product.stock} ${product.unit}.`)
      }
    }
  }, [])

  /**
   * Setelah menulis ke Supabase, jangan muat ulang seluruh riwayat.
   *
   * `refresh()` memuat produk, alias, ribuan transaksi, utang, nota, Piutang,
   * titip, dan harga pasar — sekitar 13 permintaan. Satu penjualan cukup butuh
   * produk yang berubah dan baris transaksi barunya, jadi dua permintaan.
   */
  const saveSale = useCallback(
    async (items: ConfirmItem[], note?: string) => {
      const validItems = items.filter(
        (item) => item.productId && item.qty > 0 && Number.isFinite(item.qty),
      )
      if (validItems.length === 0) throw new Error("Tidak ada barang yang bisa disimpan.")

      const rows = validItems.map((item) => ({
        type: "sale" as const,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        ...(note ? { note } : {}),
        created_at: new Date().toISOString(),
      }))

      // Validasi stok lebih dulu di kedua mode. Tanpa ini, mode cloud
      // menampilkan error Postgres mentah saat stok kurang.
      assertStockAvailable(validItems)

      const newTransactionRows = rows.map((row) => ({ ...row, id: crypto.randomUUID() }))

      const currentProducts = productsRef.current
      const requested = new Map<string, number>()
      for (const item of validItems) {
        requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.qty)
      }

      const nextProducts = currentProducts.map((product) => {
        const sold = requested.get(product.id) ?? 0
        return sold > 0 ? { ...product, stock: Math.max(0, product.stock - sold) } : product
      })
      const nextTransactions: Transaction[] = [
        ...transactionsRef.current,
        ...newTransactionRows,
      ]
      applyDemoState(nextProducts, nextTransactions, debtsRef.current)
      await enqueueWrite("insertTransactions", { rows: newTransactionRows })
    },
    [applyDemoState, assertStockAvailable, refresh, source],
  )

  const savePurchaseWithNote = useCallback(
    async (
      items: ConfirmItem[],
      note?: {
        addedBy: string
        image: string
        source: PurchaseNote["source"]
      },
    ) => {
      const validItems = items.filter(
        (item) => item.productId && item.qty > 0 && Number.isFinite(item.qty),
      )
      if (validItems.length === 0) throw new Error("Tidak ada barang yang bisa disimpan.")

      const rows = validItems.map((item) => ({
        type: "purchase" as const,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        created_at: new Date().toISOString(),
      }))
      const newTransactionRows = rows.map((row) => ({ ...row, id: crypto.randomUUID() }))

      const noteItems: PurchaseNoteItem[] = validItems.map((item) => ({
        name: item.size ? `${item.name} · ${item.size}` : item.name,
        qty: item.qty,
        unit: item.unit || "pcs",
        unitPrice: item.unitPrice,
        size: item.size ?? null,
      }))

      const nextProducts = productsRef.current.map((product) => {
        const incoming = validItems.filter((item) => item.productId === product.id)
        if (incoming.length === 0) return product
        const qty = incoming.reduce((total, item) => total + item.qty, 0)
        const latestPrice = incoming[incoming.length - 1].unitPrice
        return {
          ...product,
          stock: product.stock + qty,
          buy_price: latestPrice > 0 ? latestPrice : product.buy_price,
        }
      })
      const nextTransactions: Transaction[] = [
        ...transactionsRef.current,
        ...newTransactionRows,
      ]

      const createdNoteRow = note
        ? {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            addedBy: note.addedBy,
            total: noteItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
            items: noteItems,
            image: note.image,
            source: note.source,
          }
        : null

      const nextNotes: PurchaseNote[] = createdNoteRow ? [createdNoteRow, ...notesRef.current] : notesRef.current

      applyDemoState(nextProducts, nextTransactions, debtsRef.current, nextNotes)
      await enqueueWrite("insertTransactions", { rows: newTransactionRows })
      // A free/sample purchase may have price 0 — do not overwrite the
      // product's cost price with 0 that would break gross profit.
      const priceUpdates = validItems
        .filter((item) => item.unitPrice > 0)
        .map((item) => ({ productId: item.productId, unitPrice: item.unitPrice }))
      for (const update of priceUpdates) {
        await enqueueWrite("updateBuyPrices", update)
      }
      if (createdNoteRow) {
        await enqueueWrite("insertPurchaseNote", {
          id: createdNoteRow.id,
          added_by: createdNoteRow.addedBy,
          total: createdNoteRow.total,
          items: createdNoteRow.items,
          image_data: createdNoteRow.image || null,
          source: createdNoteRow.source,
          created_at: createdNoteRow.createdAt,
        })
      }
    },
    [applyDemoState, refresh, source],
  )

  const savePurchase = useCallback(
    async (items: ConfirmItem[]) => {
      await savePurchaseWithNote(items)
    },
    [savePurchaseWithNote],
  )

  const addProduct = useCallback(
    async (input: NewProductInput) => {
      const name = input.name.trim()
      if (!name) throw new Error("Nama barang wajib diisi.")
      if (!Number.isFinite(input.sell_price) || input.sell_price <= 0) {
        throw new Error("Harga jual harus lebih dari nol.")
      }
      if (!Number.isFinite(input.buy_price) || input.buy_price < 0) {
        throw new Error("Harga modal tidak boleh negatif.")
      }

      const aliases = [...new Set(input.aliases.map((alias) => alias.trim()).filter(Boolean))]
      const duplicate = findDuplicateProduct(productsRef.current, name, aliases, input.size)
      if (duplicate) {
        throw new Error(
          duplicate.archived
            ? `"${name}" sudah ada sebagai "${duplicate.name}" (diarsipkan). Buka Stok Barang → tab Arsip → aktifkan kembali barang itu, jangan buat baru.`
            : `"${name}" sudah ada sebagai "${duplicate.name}". Tambahkan alias ke barang itu, bukan membuat barang baru.`,
        )
      }

      const cleanInput: NewProductInput = { ...input, name, aliases }

      const product: Product = {
        id: crypto.randomUUID(),
        ...cleanInput,
      }
      const nextProducts = [...productsRef.current, product]
      applyDemoState(nextProducts, transactionsRef.current, debtsRef.current)
      await enqueueWrite("insertProduct", {
        product: { ...product },
        aliases,
      })
      return product
    },
    [applyDemoState, refresh, source],
  )

  const saveDebt = useCallback(
    async (items: ConfirmItem[], debtor: string) => {
      const cleanDebtor = debtor.trim()
      if (!cleanDebtor) throw new Error("Nama pihak yang menyimpan wajib diisi.")
      const validItems = items.filter(
        (item) => item.productId && item.name.trim() && item.qty > 0 && Number.isFinite(item.qty),
      )
      const rows = validItems.map((item) => ({
        debtor: cleanDebtor,
        product_name: item.size ? `${item.name.trim()} · ${item.size}` : item.name.trim(),
        qty: item.qty,
        unit: item.unit || "pcs",
        amount: Math.round(item.qty * item.unitPrice),
      }))
      if (rows.length === 0) throw new Error("Tidak ada barang yang bisa dicatat di buku utang.")

      // Batas maksimal utang per orang (aturan tunggal di debtGuard). Kalau
      // sudah menyentuh batas, tidak bisa nambah lagi kecuali dilunasi dulu.
      const newTotal = rows.reduce((sum, row) => sum + row.amount, 0)
      const debtorCustomer = customersRef.current.find(
        (customer) => customer.name.trim().toLowerCase() === cleanDebtor.toLowerCase(),
      )
      const openNow = openDebtFor(debtsRef.current, cleanDebtor)
      const guard = debtGuard(
        { name: cleanDebtor, maxDebt: debtorCustomer?.maxDebt ?? null, openDebt: openNow },
        newTotal,
      )
      if (!guard.ok && guard.reason) throw new Error(guard.reason)

      const createdAt = new Date().toISOString()
      // Barang "simpen dulu" memang terjual: barang keluar dari rak dan
      // harganya dihitung ke penjualan (omzet). Yang ditahan hanya uangnya —
      // itu yang dicatat sebagai utang di buku Piutang. Jadi dicatat
      // sebagai SALE, supaya penjualan & laba ikut terhitung. Stok tetap
      // akurat karena sale mengurangi stok persis sekali (tidak dobel).
      const saleRows = validItems.map((item) => ({
        type: "sale" as const,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        created_at: createdAt,
      }))

      // Validasi stok untuk kedua mode: kalau tidak, mode demo menerima
      // operasi yang ditolak mode cloud dan bukunya jadi tidak sinkron.
      assertStockAvailable(validItems)

      const newSaleRows = saleRows.map((row) => ({ ...row, id: crypto.randomUUID() }))
      const newDebtRows = rows.map((row) => ({
        id: crypto.randomUUID(),
        ...row,
        note: null as string | null,
        created_at: createdAt,
        settled_at: null as string | null,
      }))
      const outgoing = new Map<string, number>()
      for (const item of validItems) {
        outgoing.set(item.productId, (outgoing.get(item.productId) ?? 0) + item.qty)
      }
      const nextProducts = productsRef.current.map((product) => {
        const qty = outgoing.get(product.id) ?? 0
        return qty > 0 ? { ...product, stock: Math.max(0, product.stock - qty) } : product
      })
      const nextTransactions: Transaction[] = [
        ...transactionsRef.current,
        ...newSaleRows,
      ]
      const nextDebts: Debt[] = [...debtsRef.current, ...newDebtRows]
      applyDemoState(nextProducts, nextTransactions, nextDebts)
      await enqueueWrite("insertDebts", { rows: newDebtRows })
      await enqueueWrite("insertTransactions", { rows: newSaleRows })
    },
    [applyDemoState, refresh, source],
  )

  /**
   * Catat penjualan barang titipan: validasi sisa di rak, tambah `soldQty`,
   * dan simpan baris `ConsignmentSaleRecord` supaya komisi masuk hitungan
   * keuntungan hari ini. Mengembalikan baris yang diperbarui.
   */
  const applyConsignmentSales = useCallback(
    async (items: ConfirmItem[]) => {
      const clean = items.filter(
        (item) => item.consignmentId && item.qty > 0 && Number.isFinite(item.qty),
      )
      if (clean.length === 0) return consignmentsRef.current

      const current = consignmentsRef.current
      const deltas = new Map<string, number>()
      for (const item of clean) {
        const id = item.consignmentId as string
        deltas.set(id, (deltas.get(id) ?? 0) + item.qty)
      }
      for (const [id, qty] of deltas) {
        const row = current.find((item) => item.id === id)
        if (!row) throw new Error("Barang titipan tidak ditemukan.")
        const remaining = Math.max(0, row.qty - row.soldQty)
        if (qty > remaining) {
          throw new Error(`Sisa ${row.productName} tinggal ${remaining} ${row.unit}.`)
        }
      }

      const createdAt = new Date().toISOString()
      const sales: ConsignmentSaleRecord[] = []
      for (const item of clean) {
        const id = item.consignmentId as string
        const row = current.find((entry) => entry.id === id)!
        const omzet = item.qty * item.unitPrice
        sales.push({
          id: `${crypto.randomUUID()}`,
          consignmentId: id,
          depositor: row.depositor,
          productName: row.productName,
          qty: item.qty,
          unitPrice: item.unitPrice,
          omzet,
          commission: Math.round((omzet * row.commissionPct) / 100),
          createdAt,
        })
      }

      const nextConsignments = current.map((row) => {
        const add = deltas.get(row.id)
        return add ? { ...row, soldQty: row.soldQty + add } : row
      })

      applyDemoState(
        productsRef.current,
        transactionsRef.current,
        debtsRef.current,
        notesRef.current,
        customersRef.current,
        nextConsignments,
      )

      for (const [id, qty] of deltas) {
        const row = current.find((entry) => entry.id === id)!
        await enqueueWrite("updateConsignmentRow", {
          id,
          patch: { sold_qty: row.soldQty + qty },
        })
      }

      setConsignmentSales((previous) => {
        const next = [...previous, ...sales]
        consignmentSalesRef.current = next
        writeConsignmentSales(next)
        void localDb.consignmentSales.bulkPut(sales)
        return next
      })

      return nextConsignments
    },
    [applyDemoState],
  )

  /**
   * Pre-validasi barang titipan: lempar error SEBELUM transaksi apa pun
   * ditulis kalau stok rak titipan kurang.
   */
  const assertConsignmentAvailable = useCallback((items: ConfirmItem[]) => {
    const totals = new Map<string, number>()
    for (const item of items) {
      if (!item.consignmentId) continue
      totals.set(item.consignmentId, (totals.get(item.consignmentId) ?? 0) + item.qty)
    }
    for (const [id, qty] of totals) {
      const row = consignmentsRef.current.find((entry) => entry.id === id)
      if (!row) throw new Error("Barang titipan tidak ditemukan.")
      const remaining = Math.max(0, row.qty - row.soldQty)
      if (qty > remaining) {
        throw new Error(`Sisa ${row.productName} tinggal ${remaining} ${row.unit}.`)
      }
    }
  }, [])

  const saveCheckout = useCallback(
    async (
      saleItems: ConfirmItem[],
      debtItems: ConfirmItem[],
      debtor: string,
      consignmentItems: ConfirmItem[] = [],
    ) => {
      const cleanSale = saleItems.filter(
        (item) => item.productId && !item.consignmentId && item.qty > 0 && Number.isFinite(item.qty),
      )
      const cleanDebt = debtItems.filter(
        (item) => item.productId && !item.consignmentId && item.qty > 0 && Number.isFinite(item.qty),
      )
      const cleanConsignment = consignmentItems.filter(
        (item) => item.consignmentId && item.qty > 0 && Number.isFinite(item.qty),
      )
      if (cleanSale.length === 0 && cleanDebt.length === 0 && cleanConsignment.length === 0) {
        throw new Error("Keranjang masih kosong.")
      }
      if (cleanDebt.length > 0 && !debtor.trim()) {
        throw new Error("Nama pihak yang menyimpan wajib diisi.")
      }
      // Batas maksimal utang juga berlaku untuk "simpen dulu" di kasir.
      if (cleanDebt.length > 0) {
        const newTotal = cleanDebt.reduce(
          (sum, item) => sum + Math.round(item.qty * item.unitPrice),
          0,
        )
        const debtorCustomer = customersRef.current.find(
          (customer) => customer.name.trim().toLowerCase() === debtor.trim().toLowerCase(),
        )
        const guard = debtGuard(
          {
            name: debtor.trim(),
            maxDebt: debtorCustomer?.maxDebt ?? null,
            openDebt: openDebtFor(debtsRef.current, debtor),
          },
          newTotal,
        )
        if (!guard.ok && guard.reason) throw new Error(guard.reason)
      }

      const createdAt = new Date().toISOString()
      const saleRows = cleanSale.map((item) => ({
        type: "sale" as const,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        created_at: createdAt,
      }))
      // Yang disimpan dulu juga penjualan: barang keluar rak dan harganya
      // ikut omzet. Utangnya (uang yang belum masuk) tercatat terpisah.
      const debtSaleRows = cleanDebt.map((item) => ({
        type: "sale" as const,
        product_id: item.productId,
        qty: item.qty,
        unit_price: item.unitPrice,
        created_at: createdAt,
      }))

      const newSaleRows = saleRows.map((row) => ({ ...row, id: crypto.randomUUID() }))
      const newDebtSaleRows = debtSaleRows.map((row) => ({ ...row, id: crypto.randomUUID() }))
      const newDebtRows = cleanDebt.map((item) => ({
        id: crypto.randomUUID(),
        debtor: debtor.trim(),
        product_name: item.size ? `${item.name.trim()} · ${item.size}` : item.name.trim(),
        qty: item.qty,
        unit: item.unit || "pcs",
        amount: Math.round(item.qty * item.unitPrice),
        note: null as string | null,
        created_at: createdAt,
        settled_at: null as string | null,
      }))

      // Semua barang keluar dari stok, baik yang dibayar maupun yang
      // disimpan dulu — satu produk bisa terjual dan dipinjam sekaligus.
      assertStockAvailable([...cleanSale, ...cleanDebt])
      // Titipan divalidasi dulu, supaya error muncul sebelum transaksi apa pun ditulis.
      assertConsignmentAvailable(cleanConsignment)

      const outgoing = new Map<string, number>()
      for (const item of [...cleanSale, ...cleanDebt]) {
        outgoing.set(item.productId, (outgoing.get(item.productId) ?? 0) + item.qty)
      }
      const nextProducts = productsRef.current.map((product) => {
        const qty = outgoing.get(product.id) ?? 0
        return qty > 0 ? { ...product, stock: Math.max(0, product.stock - qty) } : product
      })
      const nextTransactions: Transaction[] = [
        ...transactionsRef.current,
        ...newSaleRows,
        ...newDebtSaleRows,
      ]
      const nextDebts: Debt[] =
        cleanDebt.length === 0 ? debtsRef.current : [...debtsRef.current, ...newDebtRows]
      applyDemoState(nextProducts, nextTransactions, nextDebts)
      await applyConsignmentSales(cleanConsignment)
      if (newSaleRows.length > 0) await enqueueWrite("insertTransactions", { rows: newSaleRows })
      if (newDebtSaleRows.length > 0)
        await enqueueWrite("insertTransactions", { rows: newDebtSaleRows })
      if (newDebtRows.length > 0) await enqueueWrite("insertDebts", { rows: newDebtRows })
    },
    [applyConsignmentSales, applyDemoState, assertConsignmentAvailable, assertStockAvailable, refresh, source],
  )

  /**
   * Muat ulang katalog produk dan barang titipan. Dipakai Kasir supaya stok
   * dan sisa titipan dari perangkat lain ikut tersinkron tanpa memuat ulang
   * seluruh riwayat transaksi.
   */
  const refreshCatalog = useCallback(async () => {
    // Semua sumber data ada di IndexedDB — tinggal dibaca; sinkronisasi
    // ditarik lewat tombol "Sync sekarang" atau saat kembali online.
    const [storedProducts, storedConsignments] = await Promise.all([
      localDb.products.toArray(),
      localDb.consignments.toArray(),
    ])
    productsRef.current = storedProducts
    consignmentsRef.current = storedConsignments
    setProducts(storedProducts)
    setConsignments(storedConsignments)
  }, [])

  const setMinStock = useCallback(
    async (productId: string, minStock: number) => {
      if (!Number.isFinite(minStock) || minStock < 0) {
        throw new Error("Stok minimum tidak boleh negatif.")
      }
      const nextProducts = productsRef.current.map((product) =>
        product.id === productId ? { ...product, min_stock: minStock } : product,
      )
      applyDemoState(nextProducts, transactionsRef.current, debtsRef.current)
      await enqueueWrite("updateMinStocks", { id: productId, minStock })
    },
    [applyDemoState, refresh, source],
  )

  /**
   * Arsipkan barang yang tidak dijual lagi.
   *
   * Baris barang tidak dihapus — transaksi lama still mereferensikan
   * barang ini — barang hanya disembunyikan dari Kasir, Stok Barang,
   * saran restok, dan suara.
   */
  const archiveProduct = useCallback(
    async (productId: string, archived = true) => {
      const nextProducts = productsRef.current.map((product) =>
        product.id === productId ? { ...product, archived } : product,
      )
      applyDemoState(nextProducts, transactionsRef.current, debtsRef.current)
      if (archived) {
        // Barang yang diarsipkan tidak boleh tetap ada di keranjang —
        // kiriman arsip juga menghapusnya dari kasir.
        setCartLines((current) => current.filter((line) => line.productId !== productId))
      }
      await enqueueWrite("archiveProduct", { id: productId, archived })
    },
    [applyDemoState, refresh, source],
  )

  const adjustStock = useCallback(
    async (productId: string, countedQty: number) => {
      if (!Number.isFinite(countedQty) || countedQty < 0) {
        throw new Error("Hasil hitung stok tidak boleh negatif.")
      }
      const product = productsRef.current.find((candidate) => candidate.id === productId)
      if (!product) throw new Error("Barang tidak ditemukan.")

      const delta = countedQty - product.stock
      if (delta === 0) return

      const createdAt = new Date().toISOString()
      const adjustmentRow = {
        type: "adjustment" as const,
        product_id: productId,
        qty: delta,
        unit_price: product.buy_price,
        created_at: createdAt,
        id: crypto.randomUUID(),
        note: "opname",
      }

      const nextProducts = productsRef.current.map((candidate) =>
        candidate.id === productId ? { ...candidate, stock: countedQty } : candidate,
      )
      const nextTransactions: Transaction[] = [
        ...transactionsRef.current,
        adjustmentRow as Transaction,
      ]
      applyDemoState(nextProducts, nextTransactions, debtsRef.current)
      await enqueueWrite("insertTransactions", { rows: [adjustmentRow] })
    },
    [applyDemoState, refresh, source],
  )

  const settleDebt = useCallback(
    async (id: string) => {
      const settledAt = new Date().toISOString()
      const nextDebts = debtsRef.current.map((debt) =>
        debt.id === id ? { ...debt, settled_at: settledAt } : debt,
      )
      applyDemoState(productsRef.current, transactionsRef.current, nextDebts)
      await enqueueWrite("settleDebt", { id, settledAt })
    },
    [applyDemoState, refresh, source],
  )

  const setSellPrice = useCallback(
    async (productId: string, unitPrice: number) => {
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error("Harga jual harus lebih dari nol.")
      }
      const nextProducts = productsRef.current.map((product) =>
        product.id === productId ? { ...product, sell_price: unitPrice } : product,
      )
      applyDemoState(nextProducts, transactionsRef.current, debtsRef.current)
      await enqueueWrite("updateSellPrices", { productId, unitPrice })
    },
    [applyDemoState, refresh, source],
  )

  const addCustomer = useCallback(
    async (input: {
      name: string
      phone: string | null
      note: string | null
      maxDebt: number | null
      debtDeadline: string | null
    }) => {
      const name = input.name.trim()
      if (!name) throw new Error("Nama Piutang wajib diisi.")
      const duplicate = customersRef.current.find(
        (customer) => customer.name.trim().toLowerCase() === name.toLowerCase(),
      )
      if (duplicate) {
        throw new Error(`"${name}" sudah ada di buku Piutang.`)
      }

      const customer: Customer = {
        id: crypto.randomUUID(),
        name,
        phone: input.phone?.trim() || null,
        note: input.note?.trim() || null,
        maxDebt: input.maxDebt,
        debtDeadline: input.debtDeadline,
        createdAt: new Date().toISOString(),
      }
      applyDemoState(
        productsRef.current,
        transactionsRef.current,
        debtsRef.current,
        notesRef.current,
        [customer, ...customersRef.current],
      )
      await enqueueWrite("insertCustomer", {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          note: customer.note,
          max_debt: customer.maxDebt,
          debt_deadline: customer.debtDeadline,
          created_at: customer.createdAt,
        },
      })
      return customer
    },
    [applyDemoState, loadCustomers, source],
  )

  const updateCustomer = useCallback(
    async (
      id: string,
      patch: {
        name?: string
        phone?: string | null
        note?: string | null
        maxDebt?: number | null
        debtDeadline?: string | null
      },
    ) => {
      const current = customersRef.current.find((customer) => customer.id === id)
      const nextName = patch.name?.trim()
      // Buang key yang nilainya undefined: kalau tidak, spread akan menimpa
      // nama Piutang jadi undefined dan bikin seluruh halaman crash.
      const cleanPatch: {
        name?: string
        phone?: string | null
        note?: string | null
        maxDebt?: number | null
        debtDeadline?: string | null
      } = {}
      if (nextName) cleanPatch.name = nextName
      if (patch.phone !== undefined) cleanPatch.phone = patch.phone
      if (patch.note !== undefined) cleanPatch.note = patch.note
      if (patch.maxDebt !== undefined) cleanPatch.maxDebt = patch.maxDebt
      if (patch.debtDeadline !== undefined) cleanPatch.debtDeadline = patch.debtDeadline
      if (Object.keys(cleanPatch).length === 0) return

      const nextCustomers = customersRef.current.map((customer) =>
        customer.id === id ? { ...customer, ...cleanPatch } : customer,
      )
      const nextDebts =
        current && nextName && nextName !== current.name
          ? debtsRef.current.map((debt) =>
              debt.debtor === current.name ? { ...debt, debtor: nextName } : debt,
            )
          : debtsRef.current
      applyDemoState(
        productsRef.current,
        transactionsRef.current,
        nextDebts,
        notesRef.current,
        nextCustomers,
      )
      await enqueueWrite("updateCustomerRow", {
        id,
        patch: {
          ...(nextName ? { name: nextName } : {}),
          ...(cleanPatch.phone !== undefined ? { phone: cleanPatch.phone } : {}),
          ...(cleanPatch.note !== undefined ? { note: cleanPatch.note } : {}),
          ...(cleanPatch.maxDebt !== undefined ? { max_debt: cleanPatch.maxDebt } : {}),
          ...(cleanPatch.debtDeadline !== undefined ? { debt_deadline: cleanPatch.debtDeadline } : {}),
        },
      })
      if (current && nextName && nextName !== current.name) {
        await enqueueWrite("updateDebtorName", { oldName: current.name, newName: nextName })
      }
    },
    [applyDemoState, loadCustomers, source],
  )

  const addConsignment = useCallback(
    async (input: {
      depositor: string
      productName: string
      unit: string
      qty: number
      buyPrice: number
      sellPrice: number
      commissionPct: number
      note: string | null
    }) => {
      const depositor = input.depositor.trim()
      const productName = input.productName.trim()
      if (!depositor) throw new Error("Nama pemilik barang wajib diisi.")
      if (!productName) throw new Error("Nama barang titipan wajib diisi.")
      if (input.qty <= 0) throw new Error("Jumlah titipan harus lebih dari nol.")
      if (!Number.isFinite(input.commissionPct) || input.commissionPct < 0) {
        throw new Error("Komisi warung tidak boleh negatif.")
      }
      // Di atas 100% berarti bagian pemilik barang jadi minus — tolak.
      if (input.commissionPct > 100) {
        throw new Error("Komisi warung tidak boleh lebih dari 100%.")
      }

      const consignment: Consignment = {
        id: crypto.randomUUID(),
        depositor,
        productName,
        unit: input.unit || "pcs",
        qty: input.qty,
        soldQty: 0,
        buyPrice: input.buyPrice,
        sellPrice: input.sellPrice,
        commissionPct: input.commissionPct,
        status: "active",
        note: input.note?.trim() || null,
        createdAt: new Date().toISOString(),
        settledAt: null,
      }
      applyDemoState(
        productsRef.current,
        transactionsRef.current,
        debtsRef.current,
        notesRef.current,
        customersRef.current,
        [consignment, ...consignmentsRef.current],
      )
      await enqueueWrite("insertConsignment", {
        row: {
          id: consignment.id,
          depositor: consignment.depositor,
          product_name: consignment.productName,
          unit: consignment.unit,
          qty: consignment.qty,
          sold_qty: consignment.soldQty,
          buy_price: consignment.buyPrice,
          sell_price: consignment.sellPrice,
          commission_pct: consignment.commissionPct,
          status: consignment.status,
          note: consignment.note,
          created_at: consignment.createdAt,
          settled_at: consignment.settledAt,
        },
      })
      return consignment
    },
    [applyDemoState, loadConsignments, source],
  )

  const sellConsignment = useCallback(
    async (id: string, qty: number) => {
      const row = consignmentsRef.current.find((item) => item.id === id)
      if (!row) throw new Error("Titipan tidak ditemukan.")
      const sold = Math.min(Math.max(0, qty), Math.max(0, row.qty - row.soldQty))
      if (sold <= 0) throw new Error("Tidak ada barang titipan yang bisa dijual.")

      await applyConsignmentSales([
        {
          key: `titip-${id}`,
          productId: `titip-${id}`,
          name: row.productName,
          qty: sold,
          unit: row.unit,
          unitPrice: row.sellPrice,
          consignmentId: id,
          depositor: row.depositor,
        },
      ])
    },
    [applyConsignmentSales],
  )

  const closeConsignment = useCallback(
    async (id: string) => {
      const settledAt = new Date().toISOString()
      const nextConsignments = consignmentsRef.current.map((item) =>
        item.id === id ? { ...item, status: "selesai" as const, settledAt } : item,
      )
      applyDemoState(
        productsRef.current,
        transactionsRef.current,
        debtsRef.current,
        notesRef.current,
        customersRef.current,
        nextConsignments,
      )
      await enqueueWrite("updateConsignmentRow", {
        id,
        patch: { status: "selesai", settled_at: settledAt },
      })
    },
    [applyDemoState, loadConsignments, source],
  )

  const addMarketPrice = useCallback(
    async (input: {
      productId: string
      productName: string
      price: number
      sourceName: string
    }) => {
      if (input.price <= 0 || !Number.isFinite(input.price)) {
        throw new Error("Harga pasar harus lebih dari nol.")
      }

      const report: MarketPrice = {
        id: crypto.randomUUID(),
        productId: input.productId,
        productName: input.productName,
        price: input.price,
        sourceName: input.sourceName.trim() || "Warung sebelah",
        reportedAt: new Date().toISOString(),
      }
      setMarketPrices((current) => {
        const next = [report, ...current]
        writeLocalMarketPrices(next.filter((item) => !item.id.startsWith("demo-market-")))
        return next
      })
      void localDb.marketPrices.put(report)
      await enqueueWrite("insertMarketPrice", {
        row: {
          id: report.id,
          product_id: report.productId,
          product_name: report.productName,
          price: report.price,
          source_name: report.sourceName,
          reported_by: null,
          reported_at: report.reportedAt,
        },
      })
      return report
    },
    [source],
  )

  const resetDemo = useCallback(() => {
    const demo = createDemoState()
    applyDemoState(
      demo.products,
      demo.transactions,
      demo.debts,
      demo.notes,
      demo.customers,
      demo.consignments,
    )
    consignmentSalesRef.current = []
    setConsignmentSales([])
    writeConsignmentSales([])
    void localDb.consignmentSales.clear()
    retainConsignmentSales(demo.consignments)
    const prices = getDemoMarketPrices()
    setMarketPrices(prices)
    void localDb.marketPrices.bulkPut(prices)
    setSource("demo")
    setSyncError("")
  }, [applyDemoState, retainConsignmentSales])

  /**
   * Satu indeks penjualan untuk semua halaman. Halaman beranda, laporan,
   * halaman stok, dan kartu musim membaca indeks yang sama, jadi angkanya
   * tidak mungkin berbeda antar layar.
   */
  const index = useMemo(
    () => buildSalesIndex(products, transactions, Date.now()),
    [products, transactions],
  )
  const stats = useMemo(
    () => computeStatsFromIndex(products, index, Date.now(), consignmentSales),
    [products, index, consignmentSales],
  )
  const expenses = useMemo(
    () => todayPurchaseExpenses(products, transactions),
    [products, transactions],
  )
  const seasonal = useMemo(() => computeSeasonalPlanFromIndex(products, index), [products, index])

  // Nota terbaru di atas.
  const mergedNotes = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [notes],
  )

  const value: WarungContextValue = {
    sync: {
      ...syncState,
      syncNow: async () => {
        await syncNow()
      },
      setAutoSync: async (value: boolean) => {
        await setAutoSync(value)
      },
    },
    products,
    transactions,
    debts,
    notes: mergedNotes,
    notesLocalOnly: false,
    customers,
    consignments,
    consignmentSales,
    marketPrices,
    cartLines,
    setCartLines,
    addMarketPrice,
    addCustomer,
    updateCustomer,
    addConsignment,
    sellConsignment,
    closeConsignment,
    stats,
    expenses,
    index,
    seasonal,
    loading,
    source,
    syncError,
    saveSale,
    savePurchase,
    savePurchaseWithNote,
    saveDebt,
    saveCheckout,
    settleDebt,
    addProduct,
    setSellPrice,
    archiveProduct,
    refreshCatalog,
    setMinStock,
    adjustStock,
    refresh,
    resetDemo,
  }

  return <WarungContext.Provider value={value}>{children}</WarungContext.Provider>
}

export function useWarung() {
  const context = useContext(WarungContext)
  if (!context) throw new Error("useWarung harus dipakai di dalam WarungProvider.")
  return context
}
