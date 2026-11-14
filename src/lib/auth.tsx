import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "./supabase"
import {
  MIN_PASSWORD_LENGTH,
  authHashError,
  isEmail,
  localUser,
  mapSupabaseUser,
  normalizeEmail,
  parseLocalSession,
  type AuthUser,
} from "./authSession"
import {
  isNetworkOffline,
  readOfflineAuth,
  writeOfflineAuth,
  clearOfflineAuth,
} from "./localAuthCache"
import {
  clearLocalSession,
  createPasswordRecord,
  localAccountMatches,
  readLocalAccount,
  readLocalSession,
  verifyPassword,
  writeLocalAccount,
  writeLocalSession,
} from "./localAccount"

const RECOVERY_FLAG = "warung-pintar-password-recovery"

export interface AuthCredentials {
  email: string
  warungName: string
  sellerName: string
  password: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string
  isLocal: boolean
  passwordRecovery: boolean
  signIn: (credentials: AuthCredentials) => Promise<void>
  signUp: (credentials: AuthCredentials) => Promise<void>
  requestPasswordReset: (email: string) => Promise<boolean>
  updatePassword: (password: string) => Promise<boolean>
  signOut: () => Promise<void>
  /** Ubah nama pemilik dan nama warung. */
  updateProfile: (patch: { name?: string; warungName?: string }) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readRecoveryFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) === "1"
  } catch {
    return false
  }
}

function writeRecoveryFlag(value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(RECOVERY_FLAG, "1")
    else window.sessionStorage.removeItem(RECOVERY_FLAG)
  } catch {
    // sessionStorage bisa diblokir; reset tetap jalan selama tab ini terbuka.
  }
}

function clearAuthUrl() {
  const url = new URL(window.location.href)
  url.hash = ""
  url.searchParams.delete("reset-password")
  if (url.href !== window.location.href) {
    window.history.replaceState({}, "", url.pathname + url.search)
  }
}

function friendlySupabaseError(
  message: string,
  mode: "login" | "register" | "reset",
): string {
  const lower = message.toLowerCase()
  if (lower.includes("invalid login credentials")) {
    return "Email atau password salah."
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Email ini sudah terdaftar. Coba Masuk atau kirim link reset password."
  }
  if (lower.includes("password should be")) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
  }
  if (lower.includes("email not confirmed")) {
    return "Email belum dikonfirmasi. Cek inbox atau kirim ulang konfirmasi dari Supabase."
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi."
  }
  if (lower.includes("invalid email")) {
    return "Email tidak valid. Pakai alamat seperti nama@gmail.com."
  }
  if (mode === "reset") return "Gagal mengirim link reset. Coba lagi."
  if (mode === "register") return "Gagal membuat akun. Coba lagi atau masuk kalau akun sudah ada."
  return "Gagal masuk. Periksa koneksi lalu coba lagi."
}

function validateEmail(email: string): string {
  return isEmail(email) ? "" : "Masukkan email yang valid, misalnya nama@gmail.com."
}

function validatePassword(password: string): string {
  return password.length >= MIN_PASSWORD_LENGTH
    ? ""
    : `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
}

function validateSignUp(credentials: AuthCredentials): string {
  if (!credentials.warungName.trim() || !credentials.sellerName.trim()) {
    return "Isi nama warung dan nama penjual."
  }
  return validateEmail(credentials.email) || validatePassword(credentials.password)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    let active = true
    const hashError = authHashError(window.location.hash)
    if (hashError) {
      setError(hashError)
      clearAuthUrl()
    }

    if (!supabase) {
      const session = readLocalSession()
      const account = readLocalAccount()
      const local = parseLocalSession(
        session ? JSON.stringify(session) : null,
        account ? JSON.stringify(account) : null,
      )
      if (!local) clearLocalSession()
      if (active) {
        setUser(local)
        setLoading(false)
      }
      return () => {
        active = false
      }
    }

    // Sesi lokal tidak boleh melewati login Supabase saat cloud aktif.
    clearLocalSession()

    /**
     * Internet hanya dibutuhkan untuk MASUK. Setelah pernah masuk, aplikasi
     * dibuka dengan penanda sesi tersimpan di perangkat ini walau tanpa
     * internet — identitas yang dipakai tetap id pengguna yang sama, jadi
     * antrean sinkronisasi tetap punya `owner_id` yang benar.
     */
    const applyOfflineFallback = (): boolean => {
      if (!isNetworkOffline()) return false
      const marker = readOfflineAuth()
      if (!marker) return false
      setUser(marker)
      setLoading(false)
      return true
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === "PASSWORD_RECOVERY") {
        writeRecoveryFlag(true)
        setPasswordRecovery(true)
      }
      if (event === "SIGNED_OUT") {
        clearOfflineAuth()
        writeRecoveryFlag(false)
        setPasswordRecovery(false)
      }
      if (session) writeOfflineAuth(mapSupabaseUser(session.user))
      setUser(session ? mapSupabaseUser(session.user) : null)
      setLoading(false)
      if (session) {
        setError("")
        clearAuthUrl()
      }
    })

    void supabase.auth
      .getSession()
      .then(({ data: sessionData, error: sessionError }) => {
        if (!active) return
        if (sessionData.session) {
          const mapped = mapSupabaseUser(sessionData.session.user)
          writeOfflineAuth(mapped)
          setUser(mapped)
          if (readRecoveryFlag()) setPasswordRecovery(true)
          clearAuthUrl()
          setLoading(false)
          return
        }
        if (sessionError) setError(sessionError.message)
        // Offline & sesi server tidak bisa diperiksa: buka dengan penanda.
        if (applyOfflineFallback()) return
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (!active) return
        // Periksa sesi gagal (mis. offline & token kedaluwarsa) — masih bisa
        // buka aplikasi dengan penanda sesi tersimpan.
        if (applyOfflineFallback()) return
        setError(cause instanceof Error ? cause.message : "Gagal memeriksa sesi login.")
        setUser(null)
        setLoading(false)
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (credentials: AuthCredentials) => {
    setError("")
    const email = normalizeEmail(credentials.email)
    const validation = validateEmail(email) || validatePassword(credentials.password)
    if (validation) {
      setError(validation)
      return
    }

    if (supabase) {
      try {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: credentials.password,
        })
        if (signInError) {
          setError(friendlySupabaseError(signInError.message, "login"))
          return
        }
        if (data.user) setUser(mapSupabaseUser(data.user))
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Gagal masuk. Coba lagi.")
      }
      return
    }

    const account = readLocalAccount()
    if (!account || !localAccountMatches(account, email)) {
      setError("Email atau password salah.")
      return
    }
    if (!(await verifyPassword(credentials.password, account.password))) {
      setError("Email atau password salah.")
      return
    }

    writeLocalSession({ email: account.email })
    setUser(localUser(account.email, account.warungName, account.sellerName))
  }, [])

  const signUp = useCallback(async (credentials: AuthCredentials) => {
    setError("")
    const email = normalizeEmail(credentials.email)
    const validation = validateSignUp(credentials)
    if (validation) {
      setError(validation)
      return
    }

    const warungName = credentials.warungName.trim()
    const sellerName = credentials.sellerName.trim()

    if (supabase) {
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: credentials.password,
          options: {
            data: {
              warung_name: warungName,
              seller_name: sellerName,
              full_name: sellerName,
            },
          },
        })
        if (signUpError) {
          setError(friendlySupabaseError(signUpError.message, "register"))
          return
        }
        if (!data.session) {
          setError("Akun dibuat. Cek email untuk konfirmasi, lalu masuk.")
          return
        }
        if (data.user) setUser(mapSupabaseUser(data.user))
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Gagal membuat akun. Coba lagi.")
      }
      return
    }

    const existing = readLocalAccount()
    if (existing) {
      if (
        localAccountMatches(existing, email) &&
        (await verifyPassword(credentials.password, existing.password))
      ) {
        writeLocalSession({ email: existing.email })
        setUser(localUser(existing.email, existing.warungName, existing.sellerName))
        return
      }
      setError("Email sudah terdaftar di perangkat ini. Masuk dengan password yang benar.")
      return
    }

    const account = {
      email,
      warungName,
      sellerName,
      password: await createPasswordRecord(credentials.password),
      createdAt: new Date().toISOString(),
    }
    writeLocalAccount(account)
    writeLocalSession({ email: account.email })
    setUser(localUser(account.email, account.warungName, account.sellerName))
  }, [])

  const requestPasswordReset = useCallback(async (emailInput: string) => {
    setError("")
    const email = normalizeEmail(emailInput)
    const validation = validateEmail(email)
    if (validation) {
      setError(validation)
      return false
    }
    if (!supabase) {
      setError(
        "Reset lewat email hanya tersedia saat Supabase terhubung. Di mode lokal, akun tersimpan di browser ini.",
      )
      return false
    }

    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}?reset-password=1`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      if (resetError) {
        setError(friendlySupabaseError(resetError.message, "reset"))
        return false
      }
      return true
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Gagal mengirim link reset. Coba lagi.")
      return false
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    setError("")
    const validation = validatePassword(password)
    if (validation) {
      setError(validation)
      return false
    }
    if (!supabase) {
      setError("Reset password hanya tersedia saat Supabase terhubung.")
      return false
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(friendlySupabaseError(updateError.message, "reset"))
        return false
      }
      writeRecoveryFlag(false)
      setPasswordRecovery(false)
      clearAuthUrl()
      return true
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Gagal mengganti password. Coba lagi.")
      return false
    }
  }, [])

  const signOut = useCallback(async () => {
    setError("")
    writeRecoveryFlag(false)
    setPasswordRecovery(false)
    clearLocalSession()
    clearOfflineAuth()

    if (supabase && !isNetworkOffline()) {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setError(signOutError.message)
        throw signOutError
      }
    }
    // Offline: keluar tetap bisa lewat pembersihan lokal; sesi server ikut
    // berakhir otomatis saat token kedaluwarsa.

    setUser(null)
  }, [])

  /**
   * Ubah nama pemilik dan nama warung.
   *
   * Di Supabase, keduanya disimpan di `user_metadata` supaya ikut saat
   * perangkat lain masuk dengan akun yang sama. Di mode lokal, cukup
   * disimpan di browser.
   */
  const updateProfile = useCallback(async (patch: { name?: string; warungName?: string }) => {
    setError("")
    const current = user
    if (!current) throw new Error("Belum masuk. Silakan masuk dulu.")

    const sellerName = patch.name !== undefined ? patch.name.trim() : current.name
    const warungName = patch.warungName !== undefined ? patch.warungName.trim() : current.warungName

    if (supabase && isNetworkOffline()) {
      const message =
        "Ganti nama dan nama warung membutuhkan internet sebentar. Coba lagi saat online."
      setError(message)
      throw new Error(message)
    }

    if (supabase) {
      // `seller_name` dan `warung_name` mengikuti konvensi yang dipakai
      // `mapSupabaseUser`, jadi perubahan langsung terbaca saat memuat ulang.
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: { seller_name: sellerName, full_name: sellerName, warung_name: warungName },
      })
      if (updateError) {
        setError(updateError.message)
        throw updateError
      }
      if (data.user) {
        setUser(mapSupabaseUser(data.user))
        return
      }
    }

    setUser(localUser(current.email ?? "", warungName, sellerName))
    const account = readLocalAccount()
    if (account) {
      writeLocalAccount({ ...account, warungName, sellerName })
    }
  }, [user])

  const clearError = useCallback(() => setError(""), [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isLocal: user?.provider === "local",
        passwordRecovery,
        signIn,
        signUp,
        requestPasswordReset,
        updatePassword,
        signOut,
        updateProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth harus dipakai di dalam AuthProvider.")
  return context
}
