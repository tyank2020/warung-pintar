/**
 * Sinkronisasi dua arah (satu arah: perangkat → server) untuk mode hybrid.
 *
 * Prinsip:
 * - Semua perubahan ditulis ke IndexedDB dulu (offline-first), lalu masuk
 *   `outbox` dan baru dikirim ke Supabase.
 * - Setiap baris membawa id buatan klien; server menolak duplikat secara
 *   diam-diam sehingga transaksi tidak pernah dobel walau dikirim ulang.
 * - Tidak ada request saat tidak ada internet, dan tidak ada polling berkala
 *   — antrean hanya diproses saat ada perubahan atau tombol Sync ditekan.
 */
import { isSupabaseConfigured, supabase } from "./supabase"
import {
  enqueueOutbox,
  outboxCount,
  readOutbox,
  readSyncSettings,
  removeOutbox,
  markOutboxAttempt,
  readMeta,
  writeMeta,
  writeSyncSettings,
  type OutboxEntry,
} from "./localDb"
import { localDb } from "./localDb"

export type SyncStatus =
  | "online"       // terhubung, tidak ada yang menunggu
  | "offline"      // tidak ada koneksi
  | "syncing"      // sedang mengirim antrean
  | "pending"      // ada perubahan menunggu sinkronisasi
  | "failed"       // antrean gagal terakhir kali

export interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  lastSyncAt: string | null
  lastError: string | null
  autoSync: boolean
  status: SyncStatus
}

type Listener = (state: SyncState) => void

const listeners = new Set<Listener>()
let state: SyncState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  autoSync: true,
  status: "online",
}

function emit() {
  state = { ...state }
  for (const listener of [...listeners]) listener(state)
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function getSyncState(): SyncState {
  return state
}

export async function refreshSyncState(): Promise<SyncState> {
  const [pending, lastSyncAt, settings] = await Promise.all([
    outboxCount(),
    readMeta("sync.lastSyncAt"),
    readSyncSettings(),
  ])
  const online = typeof navigator === "undefined" ? true : navigator.onLine
  state = {
    ...state,
    online,
    pending,
    lastSyncAt,
    autoSync: settings.autoSync,
  }
  state = { ...state, status: deriveStatus(state) }
  emit()
  return state
}

function deriveStatus(current: SyncState): SyncStatus {
  if (!current.online) return "offline"
  if (current.syncing) return "syncing"
  if (current.lastError && current.pending > 0) return "failed"
  if (current.pending > 0) return "pending"
  return "online"
}

function setOnline(online: boolean) {
  state = { ...state, online }
  state = { ...state, status: deriveStatus(state) }
  emit()
}

async function ownerId(): Promise<string> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.")
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const id = data.session?.user?.id
  if (!id) throw new Error("Belum masuk. Silakan masuk dulu.")
  return id
}

async function execute(entry: OutboxEntry): Promise<void> {
  const client = supabase
  if (!client) throw new Error("Supabase belum dikonfigurasi.")
  const owner = await ownerId()
  const payload = entry.payload as Record<string, unknown> & { rows?: unknown[] }

  switch (entry.kind) {
    case "insertTransactions":
      await client
        .from("transactions")
        .upsert(
          (payload.rows as object[]).map((row) => ({ ...(row as object), owner_id: owner })),
          { onConflict: "id", ignoreDuplicates: true },
        )
        .throwOnError()
      return
    case "insertDebts":
      await client
        .from("debts")
        .upsert(
          (payload.rows as object[]).map((row) => ({ ...(row as object), owner_id: owner, note: null })),
          { onConflict: "id", ignoreDuplicates: true },
        )
        .throwOnError()
      return
    case "settleDebt":
      await client
        .from("debts")
        .update({ settled_at: payload.settledAt })
        .eq("id", payload.id as string)
        .throwOnError()
      return
    case "insertProduct": {
      const product = payload.product as Record<string, unknown>
      await client
        .from("products")
        .upsert([{ ...product, owner_id: owner }], { onConflict: "id", ignoreDuplicates: true })
        .throwOnError()
      const aliases = (payload.aliases ?? []) as string[]
      for (const alias of aliases) {
        // Duplikat (kode 23505) berarti alias sudah ada — lewati saja.
        const { error } = await client
          .from("product_aliases")
          .insert({ product_id: product.id, alias, owner_id: owner })
        if (error && error.code !== "23505") throw new Error(error.message)
      }
      return
    }
    case "updateMinStocks":
      await client
        .from("products")
        .update({ min_stock: payload.minStock })
        .eq("id", payload.id as string)
        .throwOnError()
      return
    case "updateBuyPrices":
    case "updateSellPrices":
      await client
        .from("products")
        .update(
          entry.kind === "updateBuyPrices"
            ? { buy_price: payload.unitPrice }
            : { sell_price: payload.unitPrice },
        )
        .eq("id", payload.productId as string)
        .throwOnError()
      return
    case "archiveProduct":
      await client
        .from("products")
        .update({ archived: payload.archived ?? true })
        .eq("id", payload.id as string)
        .throwOnError()
      return
    case "insertPurchaseNote":
      await client
        .from("purchase_notes")
        .upsert([{ ...(payload as object), owner_id: owner }], { onConflict: "id", ignoreDuplicates: true })
        .throwOnError()
      return
    case "insertCustomer":
      await client
        .from("customers")
        .upsert([{ ...(payload.customer as object), owner_id: owner }], { onConflict: "id", ignoreDuplicates: true })
        .throwOnError()
      return
    case "updateCustomerRow":
      await client
        .from("customers")
        .update(payload.patch as object)
        .eq("id", payload.id as string)
        .throwOnError()
      return
    case "updateDebtorName":
      await client
        .from("debts")
        .update({ debtor: payload.newName })
        .eq("debtor", payload.oldName as string)
        .throwOnError()
      return
    case "insertConsignment":
      await client
        .from("consignments")
        .upsert([{ ...(payload.row as object), owner_id: owner }], { onConflict: "id", ignoreDuplicates: true })
        .throwOnError()
      return
    case "updateConsignmentRow":
      await client
        .from("consignments")
        .update(payload.patch as object)
        .eq("id", payload.id as string)
        .throwOnError()
      return
    case "insertMarketPrice":
      await client
        .from("market_prices")
        .upsert([{ ...(payload.row as object), owner_id: owner }], { onConflict: "id", ignoreDuplicates: true })
        .throwOnError()
      return
    default:
      throw new Error(`Operasi sinkronisasi tidak dikenal: ${entry.kind}.`)
  }
}

async function flushOnce(): Promise<{ sent: number; failed: number; failures: string[] }> {
  const queue = await readOutbox()
  let sent = 0
  const failures: string[] = []
  for (const entry of queue) {
    try {
      await execute(entry)
      await removeOutbox(entry.id)
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengirim data."
      await markOutboxAttempt(entry.id, message)
      failures.push(`${entry.kind}: ${message}`)
      // Error auth (token kedaluwarsa, sesi hilang) hampir pasti menggagalkan
      // semua entri — hentikan lebih awal, bukan mencoba 50 kali berturut-turut.
      if (/jwt|token|masuk|session|unauthorized|401/i.test(message)) break
      // Entri rusak tidak boleh memblokir antrean; sisanya tetap dikirim.
    }
  }
  return { sent, failed: failures.length, failures }
}

/** Ubah preferensi sinkronisasi otomatis. */
export async function setAutoSync(value: boolean): Promise<SyncState> {
  await writeSyncSettings({ autoSync: value })
  state = { ...state, autoSync: value }
  emit()
  return state
}

export async function syncNow(): Promise<SyncState> {
  if (!isSupabaseConfigured) {
    state = {
      ...state,
      pending: 0,
      online: true,
      syncing: false,
      lastError: null,
      status: "online",
    }
    emit()
    return state
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    state = { ...state, online: false, status: "offline", syncing: false }
    emit()
    return state
  }
  if (inFlight) return inFlight
  state = { ...state, syncing: true, status: "syncing" }
  emit()
  inFlight = (async () => {
    try {
      const result = await flushOnce()
      await writeMeta("sync.lastSyncAt", new Date().toISOString())
      const pending = await outboxCount()
      const now = new Date().toISOString()
      const failureSummary =
        result.failures.length > 0 ? result.failures.join(" · ").slice(0, 220) : null
      state = {
        ...state,
        online: true,
        syncing: false,
        pending,
        lastSyncAt: now,
        lastError: failureSummary,
      }
      state = {
        ...state,
        status: pending === 0 ? "online" : failureSummary ? "failed" : "pending",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sinkronisasi gagal."
      const pending = await outboxCount().catch(() => state.pending)
      state = {
        ...state,
        syncing: false,
        pending,
        lastError: message,
        status: pending > 0 ? "failed" : "online",
      }
    } finally {
      inFlight = null
      emit()
    }
    return state
  })()
  return inFlight
}

let inFlight: Promise<SyncState> | null = null
let kickTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Dipanggil setelah setiap tulisan lokal.
 *
 * Ditunda sebentar dan digabung supaya satu transaksi kasir (yang menulis
 * beberapa baris sekaligus) hanya menghasilkan satu rangkaian request.
 */
export function kickSync() {
  if (!isSupabaseConfigured) return
  if (typeof navigator !== "undefined" && !navigator.onLine) return
  if (!state.autoSync) return
  if (kickTimer) return
  kickTimer = setTimeout(() => {
    kickTimer = null
    void syncNow().catch(() => undefined)
  }, 1200)
}

export function initSyncListeners() {
  if (typeof window === "undefined") return () => undefined
  const onOnline = () => {
    setOnline(true)
    void refreshSyncState().then(() => {
      if (state.autoSync) void syncNow().catch(() => undefined)
    })
  }
  const onOffline = () => {
    setOnline(false)
  }
  const onVisible = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void refreshSyncState().then(() => {
        if (state.autoSync) void syncNow().catch(() => undefined)
      })
    }
  }
  window.addEventListener("online", onOnline)
  window.addEventListener("offline", onOffline)
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    window.removeEventListener("online", onOnline)
    window.removeEventListener("offline", onOffline)
    document.removeEventListener("visibilitychange", onVisible)
  }
}

export async function enqueueWrite(kind: string, payload: unknown, id?: string): Promise<void> {
  // Mode demo lokal: tidak ada server, jadi tidak perlu antrean.
  if (!isSupabaseConfigured) return
  await enqueueOutbox(kind, payload, id)
  await refreshSyncState()
  kickSync()
}

/** Impor sekali data demo warung yang masih tersimpan di localStorage ke IDB. */
export async function getPendingCount(): Promise<number> {
  return outboxCount()
}

export async function clearAllLocalData(): Promise<void> {
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
  await refreshSyncState()
}
