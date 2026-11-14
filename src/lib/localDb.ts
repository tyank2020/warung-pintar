/**
 * Database lokal (IndexedDB) — sumber kebenaran saat offline.
 *
 * Semua data warung tersimpan di sini: produk, transaksi, buku utang,
 * Piutang, titip jual, nota, harga pasar, dan catatan penjualan titipan.
 * Ketika internet tersedia, perubahan diantrekan (`outbox`) lalu dikirim
 * ke Supabase satu arah, dengan id yang sama supaya tidak pernah dobel.
 */
import Dexie, { type Table } from "dexie"
import type {
  Consignment,
  ConsignmentSaleRecord,
  Customer,
  Debt,
  MarketPrice,
  NewProductInput,
  Product,
  PurchaseNote,
  Transaction,
} from "./types"

/** Operasi yang menunggu dikirim ke server. */
export interface OutboxEntry {
  /** Id klien — dipakai sebagai idempotency key. */
  id: string
  /** Jenis operasi (nama fungsi di `sync.ts`). */
  kind: string
  /** Payload sesuai signature fungsi terkait. */
  payload: unknown
  /** Berapa kali sudah dicoba. */
  attempts: number
  createdAt: string
  lastError: string | null
}

interface MetaRow {
  key: string
  value: string
}

export class WarungLocalDb extends Dexie {
  products!: Table<Product, string>
  aliases!: Table<{ id?: number; productId: string; alias: string }, number>
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>
  purchaseNotes!: Table<PurchaseNote, string>
  customers!: Table<Customer, string>
  consignments!: Table<Consignment, string>
  marketPrices!: Table<MarketPrice, string>
  consignmentSales!: Table<ConsignmentSaleRecord, string>
  outbox!: Table<OutboxEntry, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super("warung-pintar-local")
    this.version(1).stores({
      products: "id, name, owner_id, archived",
      aliases: "++id, productId",
      transactions: "id, product_id, type, created_at, owner_id",
      debts: "id, debtor, created_at",
      purchaseNotes: "id, created_at, source",
      customers: "id, name",
      consignments: "id, status",
      marketPrices: "id, product_id, reported_at",
      consignmentSales: "id, consignmentId, createdAt",
      outbox: "id, createdAt, kind",
      meta: "key",
    })
  }
}

export const localDb = new WarungLocalDb()

export interface LocalSnapshot {
  products: Product[]
  transactions: Transaction[]
  debts: Debt[]
  notes: PurchaseNote[]
  customers: Customer[]
  consignments: Consignment[]
  marketPrices: MarketPrice[]
  consignmentSales: ConsignmentSaleRecord[]
}

export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const [
    products,
    transactions,
    debts,
    notes,
    customers,
    consignments,
    marketPrices,
    consignmentSales,
  ] = await Promise.all([
    localDb.products.toArray(),
    localDb.transactions.toArray(),
    localDb.debts.toArray(),
    localDb.purchaseNotes.toArray(),
    localDb.customers.toArray(),
    localDb.consignments.toArray(),
    localDb.marketPrices.toArray(),
    localDb.consignmentSales.toArray(),
  ])
  return {
    products,
    transactions,
    debts,
    notes,
    customers,
    consignments,
    marketPrices,
    consignmentSales,
  }
}

/** Simpan snapshot penuh (dipakai setelah tarik data dari server). */
export async function writeLocalSnapshot(snapshot: LocalSnapshot): Promise<void> {
  await localDb.transaction(
    "rw",
    [
      localDb.products,
      localDb.transactions,
      localDb.debts,
      localDb.purchaseNotes,
      localDb.customers,
      localDb.consignments,
      localDb.marketPrices,
      localDb.consignmentSales,
    ],
    async () => {
      await Promise.all([
        localDb.products.clear(),
        localDb.transactions.clear(),
        localDb.debts.clear(),
        localDb.purchaseNotes.clear(),
        localDb.customers.clear(),
        localDb.consignments.clear(),
        localDb.marketPrices.clear(),
        localDb.consignmentSales.clear(),
      ])
      await Promise.all([
        localDb.products.bulkPut(snapshot.products),
        localDb.transactions.bulkPut(snapshot.transactions),
        localDb.debts.bulkPut(snapshot.debts),
        localDb.purchaseNotes.bulkPut(snapshot.notes),
        localDb.customers.bulkPut(snapshot.customers),
        localDb.consignments.bulkPut(snapshot.consignments),
        localDb.marketPrices.bulkPut(snapshot.marketPrices),
        localDb.consignmentSales.bulkPut(snapshot.consignmentSales),
      ])
    },
  )
}

/** Gabungkan data server ke IndexedDB tanpa menghapus yang sudah ada. */
export async function mergeLocalData(partial: Partial<LocalSnapshot>): Promise<void> {
  await localDb.transaction(
    "rw",
    [
      localDb.products,
      localDb.transactions,
      localDb.debts,
      localDb.purchaseNotes,
      localDb.customers,
      localDb.consignments,
      localDb.marketPrices,
    ],
    async () => {
      await Promise.all([
        partial.products ? localDb.products.bulkPut(partial.products) : Promise.resolve(),
        partial.transactions ? localDb.transactions.bulkPut(partial.transactions) : Promise.resolve(),
        partial.debts ? localDb.debts.bulkPut(partial.debts) : Promise.resolve(),
        partial.notes ? localDb.purchaseNotes.bulkPut(partial.notes) : Promise.resolve(),
        partial.customers ? localDb.customers.bulkPut(partial.customers) : Promise.resolve(),
        partial.consignments ? localDb.consignments.bulkPut(partial.consignments) : Promise.resolve(),
        partial.marketPrices ? localDb.marketPrices.bulkPut(partial.marketPrices) : Promise.resolve(),
      ])
    },
  )
}

export async function enqueueOutbox(kind: string, payload: unknown, id?: string): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: id ?? crypto.randomUUID(),
    kind,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastError: null,
  }
  await localDb.outbox.put(entry)
  return entry
}

export async function readOutbox(): Promise<OutboxEntry[]> {
  return localDb.outbox.orderBy("createdAt").toArray()
}

export async function removeOutbox(id: string): Promise<void> {
  await localDb.outbox.delete(id)
}

export async function markOutboxAttempt(id: string, error: string): Promise<void> {
  await localDb.outbox.update(id, (entry) => {
    entry.attempts += 1
    entry.lastError = error
  })
}

export async function outboxCount(): Promise<number> {
  return localDb.outbox.count()
}

export async function readMeta(key: string): Promise<string | null> {
  const row = await localDb.meta.get(key)
  return row?.value ?? null
}

export async function writeMeta(key: string, value: string): Promise<void> {
  await localDb.meta.put({ key, value })
}

/**
 * Pastikan IndexedDB hanya berisi data milik satu warung.
 *
 * Satu perangkat bisa dipakai lebih dari satu akun. Kalau pemilik yang masuk
 * berbeda dari pemilik data yang tersimpan, seluruh data lokal (termasuk
 * antrean yang belum terkirim) dibuang — kalau tidak, data warung A bisa
 * terkirim ke akun warung B saat sinkronisasi.
 */
export async function ensureLocalScope(scope: string): Promise<boolean> {
  const current = await readMeta("local.scope")
  if (current === scope) return false
  await localDb.transaction(
    "rw",
    [
      localDb.products,
      localDb.aliases,
      localDb.transactions,
      localDb.debts,
      localDb.purchaseNotes,
      localDb.customers,
      localDb.consignments,
      localDb.marketPrices,
      localDb.consignmentSales,
      localDb.outbox,
      localDb.meta,
    ],
    async () => {
      await Promise.all([
        localDb.products.clear(),
        localDb.aliases.clear(),
        localDb.transactions.clear(),
        localDb.debts.clear(),
        localDb.purchaseNotes.clear(),
        localDb.customers.clear(),
        localDb.consignments.clear(),
        localDb.marketPrices.clear(),
        localDb.consignmentSales.clear(),
        localDb.outbox.clear(),
        localDb.meta.clear(),
      ])
      await localDb.meta.put({ key: "local.scope", value: scope })
    },
  )
  return true
}

/** Hapus seluruh data warung di perangkat (dipakai saat reset/ganti akun). */
export async function clearLocalDb(): Promise<void> {
  await localDb.transaction(
    "rw",
    [
      localDb.products,
      localDb.aliases,
      localDb.transactions,
      localDb.debts,
      localDb.purchaseNotes,
      localDb.customers,
      localDb.consignments,
      localDb.marketPrices,
      localDb.consignmentSales,
      localDb.outbox,
      localDb.meta,
    ],
    async () => {
      await Promise.all([
        localDb.products.clear(),
        localDb.aliases.clear(),
        localDb.transactions.clear(),
        localDb.debts.clear(),
        localDb.purchaseNotes.clear(),
        localDb.customers.clear(),
        localDb.consignments.clear(),
        localDb.marketPrices.clear(),
        localDb.consignmentSales.clear(),
        localDb.outbox.clear(),
        localDb.meta.clear(),
      ])
    },
  )
}

/** Impor sekali data lama dari localStorage (mode demo sebelum IndexedDB). */
export async function importLegacyDemoData(snapshot: {
  products?: Product[]
  transactions?: Transaction[]
  debts?: Debt[]
  notes?: PurchaseNote[]
  customers?: Customer[]
  consignments?: Consignment[]
}): Promise<number> {
  let imported = 0
  await localDb.transaction(
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
      const existing = await localDb.products.count()
      if (existing > 0) return
      const put = async <T extends { id: string }>(
        table: Table<T, string>,
        rows?: T[],
      ) => {
        if (rows && rows.length > 0) {
          await table.bulkPut(rows)
          imported += rows.length
        }
      }
      await put(localDb.products, snapshot.products)
      await put(localDb.transactions, snapshot.transactions)
      await put(localDb.debts, snapshot.debts)
      await put(localDb.purchaseNotes, snapshot.notes ?? [])
      await put(localDb.customers, snapshot.customers)
      await put(localDb.consignments, snapshot.consignments)
    },
  )
  return imported
}

export interface SyncSettings {
  /** Sinkronisasi otomatis aktif? */
  autoSync: boolean
}

export async function readSyncSettings(): Promise<SyncSettings> {
  const raw = await readMeta("sync.settings")
  if (!raw) return { autoSync: true }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSettings>
    return { autoSync: parsed.autoSync !== false }
  } catch {
    return { autoSync: true }
  }
}

export async function writeSyncSettings(settings: SyncSettings): Promise<void> {
  await writeMeta("sync.settings", JSON.stringify(settings))
}

/** Kursor utk sinkronisasi incremental (opsional; dipakai nanti). */
export async function readSyncCursor(): Promise<string | null> {
  return readMeta("sync.lastTransactionAt")
}

export async function writeSyncCursor(cursor: string): Promise<void> {
  await writeMeta("sync.lastTransactionAt", cursor)
}

export type { NewProductInput }
