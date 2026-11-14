export type AuthSource = "supabase" | "local"

export interface AuthUser {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  provider: AuthSource
  warungName: string
}

export interface SupabaseUserLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: { provider?: string } | null
}

export const MIN_PASSWORD_LENGTH = 6

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Apakah URL saat ini adalah landing setelah klik link konfirmasi email (type=signup)? */
export function isSignupConfirmationUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""))
    if (hashParams.get("type") === "signup") return true
    return parsed.searchParams.get("konfirmasi") === "1"
  } catch {
    return false
  }
}

/** Rapikan nama untuk dibandingkan tanpa peduli spasi dan huruf besar/kecil. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Baca error dari hash link Supabase (mis. link reset kedaluwarsa). */
export function authHashError(hash: string): string | null {
  if (!hash) return null
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  const description = params.get("error_description") ?? params.get("error")
  if (!description) return null
  const lower = description.toLowerCase()
  if (lower.includes("expired")) return "Link reset sudah kedaluwarsa. Minta link baru."
  if (lower.includes("invalid")) return "Link reset tidak valid. Minta link baru."
  return "Link reset tidak bisa dipakai. Minta link baru."
}

/** Map the Supabase user shape to the small profile the UI needs. */
export function mapSupabaseUser(user: SupabaseUserLike): AuthUser {
  const metadata = user.user_metadata ?? {}
  const email = nonEmpty(user.email)
  const name =
    nonEmpty(metadata.seller_name) ??
    nonEmpty(metadata.full_name) ??
    nonEmpty(metadata.name) ??
    email?.split("@")[0] ??
    "Pemilik Warung"
  const warungName = nonEmpty(metadata.warung_name) ?? "Warung Saya"

  return {
    id: user.id,
    name,
    email,
    avatarUrl: nonEmpty(metadata.avatar_url) ?? nonEmpty(metadata.picture),
    provider: "supabase",
    warungName,
  }
}

/** Sesi lokal hanya berlaku kalau akun lokalnya masih ada dan emailnya cocok. */
export function parseLocalSession(
  rawSession: string | null,
  rawAccount: string | null,
): AuthUser | null {
  if (!rawSession || !rawAccount) return null
  try {
    const session = JSON.parse(rawSession) as { email?: unknown } | null
    const account = JSON.parse(rawAccount) as {
      email?: unknown
      warungName?: unknown
      sellerName?: unknown
    } | null
    const email = nonEmpty(session?.email)
    const accountEmail = nonEmpty(account?.email)
    const warungName = nonEmpty(account?.warungName)
    const sellerName = nonEmpty(account?.sellerName)
    if (!email || !accountEmail || !warungName || !sellerName) return null
    if (normalizeEmail(email) !== normalizeEmail(accountEmail)) return null

    return localUser(accountEmail, warungName, sellerName)
  } catch {
    return null
  }
}

export function localUser(email: string, warungName: string, sellerName: string): AuthUser {
  return {
    id: `local:${normalizeEmail(email)}`,
    name: sellerName,
    email,
    avatarUrl: null,
    provider: "local",
    warungName,
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "WP"
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}
