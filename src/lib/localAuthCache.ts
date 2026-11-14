/**
 * Sesi "offline" untuk Warung Pintar.
 *
 * Kebutuhan produk: internet hanya dibutuhkan untuk MASUK (sekali, untuk
 * membuat/menemukan akun di Supabase). Setelah itu, aplikasi harus bisa
 * dibuka dan dipakai tanpa internet — mencatat barang terjual dan stok masuk,
 * lalu tersinkron saat online lagi.
 *
 * Cara kerjanya: setelah sesi Supabase aktif sekali di perangkat ini, profil
 * pengguna disalin ke localStorage sebagai penanda ("warung-pintar-offline-
 * auth"). Saat aplikasi dibuka tanpa internet dan sesi server tidak bisa
 * diperiksa, penanda itu yang dipakai untuk membuka aplikasi — dengan
 * identitas yang SAMA PERSIS (id pengguna), jadi antrean sinkronisasi yang
 * terbuat saat offline tetap dikirim dengan `owner_id` yang benar saat online.
 *
 * Ini BUKAN kredensial: penanda hanya membuktikan "pernah masuk di perangkat
 * ini". Operasi tulis ke server tetap melalui sesi Supabase yang asli, dan
 * data antar warung tetap dipisah RLS. Keluar dari aplikasi menghapus penanda.
 */
import type { AuthUser } from "./authSession"

const KEY = "warung-pintar-offline-auth"
const SHAPE_VERSION = 1

interface OfflineAuthRecord {
  v: number
  user: AuthUser
  cachedAt: string
}

/** True kalau perangkat sedang tidak punya internet. */
export function isNetworkOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine
}

export function writeOfflineAuth(user: AuthUser): void {
  try {
    if (typeof window === "undefined") return
    const record: OfflineAuthRecord = {
      v: SHAPE_VERSION,
      user,
      cachedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Penyimpanan penuh/diblokir: aplikasi offline jatuh balik ke layar
    // masuk, bukan gagal total.
  }
}

export function readOfflineAuth(): AuthUser | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as Partial<OfflineAuthRecord> | null
    const user = record?.user
    if (!user || record?.v !== SHAPE_VERSION) return null
    if (typeof user.id !== "string" || !user.id.trim()) return null
    if (typeof user.name !== "string" || !user.name.trim()) return null
    return {
      id: user.id,
      name: user.name,
      email: typeof user.email === "string" ? user.email : null,
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null,
      provider: "supabase",
      warungName:
        typeof user.warungName === "string" && user.warungName.trim()
          ? user.warungName
          : "Warung Saya",
    }
  } catch {
    return null
  }
}

/** Hapus penanda — dipakai saat keluar (sign out). */
export function clearOfflineAuth(): void {
  try {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(KEY)
  } catch {
    // Penyimpanan diblokir; tidak ada yang bisa dihapus.
  }
}
