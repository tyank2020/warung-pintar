import { useEffect, useState, type FormEvent } from "react"
import { useAuth } from "../lib/auth"
import { MIN_PASSWORD_LENGTH } from "../lib/authSession"
import { isSupabaseConfigured } from "../lib/supabase"
import { BrandLogo } from "./BrandLogo"
import { Icon } from "./Icon"

type Mode = "login" | "register" | "forgot"

/** Akun demo yang dipakai bersama untuk presentasi. */
const DEMO_EMAIL = "demo@warungpintar.app"
const DEMO_PASSWORD = "warungpintar2026"

export function AuthScreen() {
  const { signIn, signUp, requestPasswordReset, error, clearError } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [warungName, setWarungName] = useState("")
  const [sellerName, setSellerName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [offlineNow, setOfflineNow] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  )

  // Status internet berubah-ubah — ikuti langsung supaya pesan di layar masuk
  // selalu akurat.
  useEffect(() => {
    const goOnline = () => setOfflineNow(false)
    const goOffline = () => setOfflineNow(true)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  const switchMode = (next: Mode) => {
    if (busy || next === mode) return
    setMode(next)
    setFormError("")
    setInfo("")
    setConfirmPassword("")
    clearError()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    clearError()
    setFormError("")
    setInfo("")
    if (offlineNow) {
      setFormError(
        "Anda sedang offline. Masuk dan buat akun butuh internet — setelah pernah masuk, aplikasi bisa dipakai tanpa internet.",
      )
      return
    }

    if (mode === "forgot") {
      setBusy(true)
      try {
        const sent = await requestPasswordReset(email)
        if (sent) {
          setInfo(
            `Link reset sudah dikirim ke ${email.trim()}. Cek inbox dan folder spam, lalu buka link untuk membuat password baru.`,
          )
        }
      } finally {
        setBusy(false)
      }
      return
    }

    if (mode === "register" && password !== confirmPassword) {
      setFormError("Konfirmasi password belum sama.")
      return
    }

    setBusy(true)
    try {
      const credentials = {
        email: email.trim(),
        warungName: warungName.trim(),
        sellerName: sellerName.trim(),
        password,
      }
      if (mode === "register") {
        await signUp(credentials)
      } else {
        await signIn(credentials)
      }
    } finally {
      setBusy(false)
    }
  }

  const message = formError || error
  const title =
    mode === "login" ? "Masuk ke warung" : mode === "register" ? "Buat akun warung" : "Lupa password?"
  const copy =
    mode === "login"
      ? "Masuk dengan email dan password akun warung Anda."
      : mode === "register"
        ? "Daftarkan email asli agar link reset password bisa dikirim ke inbox Anda."
        : "Masukkan email akun. Kami akan mengirim link untuk membuat password baru."

  /** Masuk ke akun demo yang datanya sudah terisi, buat presentasi. */
  const useDemoAccount = async () => {
    setFormError("")
    setInfo("")
    clearError()
    if (offlineNow) {
      setFormError(
        "Akun demo butuh internet — kembali online sebentar untuk membukanya. Setelah pernah masuk, aplikasi bisa dipakai tanpa internet.",
      )
      return
    }
    setDemoBusy(true)
    try {
      await signIn({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        warungName: "",
        sellerName: "",
      })
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Akun demo tidak bisa dibuka.")
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-hero" aria-hidden="true">
        <div className="auth-hero-inner">
          <span className="auth-hero-kicker">WARUNG PINTAR</span>
          <h1>Warung Anda,<br />makin pintar setiap hari.</h1>
          <p>
            Catat penjualan lewat suara, pindai nota belanja, dan pantau stok serta utang —
            semua di satu layar.
          </p>
          <ul className="auth-hero-points">
            <li>Catat lewat suara</li>
            <li>Pindai nota pakai AI</li>
            <li>Stok &amp; restok otomatis</li>
          </ul>
          <svg
            className="auth-hero-art"
            viewBox="0 0 420 330"
            fill="none"
            role="presentation"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="210" cy="158" r="128" fill="#dbe7ff" />
            <circle cx="316" cy="66" r="26" fill="#f6c065" />
            <ellipse cx="210" cy="300" rx="150" ry="12" fill="#d4deee" />

            <path d="M88 132h244l-14 34H102l-14-34Z" fill="#2f62e8" />
            <path d="M102 166h34l-9 22h-34l9-22Z" fill="#ffffff" />
            <path d="M136 166h34l-9 22h-34l9-22Z" fill="#2f62e8" />
            <path d="M170 166h34l-9 22h-34l9-22Z" fill="#ffffff" />
            <path d="M204 166h34l-9 22h-34l9-22Z" fill="#2f62e8" />
            <path d="M238 166h34l-9 22h-34l9-22Z" fill="#ffffff" />
            <path d="M272 166h34l-9 22h-34l9-22Z" fill="#2f62e8" />

            <rect x="106" y="188" width="208" height="96" rx="10" fill="#1f4fd6" />
            <rect x="132" y="214" width="52" height="70" rx="4" fill="#16347e" />
            <circle cx="172" cy="250" r="3" fill="#7aa8ff" />
            <rect x="204" y="212" width="82" height="10" rx="5" fill="#7aa8ff" opacity="0.6" />
            <rect x="204" y="232" width="82" height="10" rx="5" fill="#7aa8ff" opacity="0.4" />

            <rect x="250" y="254" width="46" height="30" rx="4" fill="#ef8d49" />
            <circle cx="262" cy="250" r="6" fill="#f6c065" />
            <circle cx="274" cy="248" r="6" fill="#f2764b" />
            <circle cx="286" cy="250" r="6" fill="#f6c065" />

            <rect x="118" y="120" width="184" height="22" rx="6" fill="#16347e" />
            <text
              x="210"
              y="135.5"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12.5"
              fontWeight="700"
              letterSpacing="3"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              WARUNG
            </text>
          </svg>
        </div>
      </aside>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <BrandLogo />
          <div>
            <strong>Warung</strong>
            <b>Pintar</b>
          </div>
        </div>

        <span className="auth-kicker">AKSES WARUNG</span>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-copy">{copy}</p>

        {offlineNow && (
          <div className="data-banner warning" role="status">
            <div>
              <strong>Anda sedang offline</strong>
              <span>
                Masuk butuh internet sebentar. Setelah pernah masuk, aplikasi bisa dipakai tanpa
                internet — semua data tersimpan di perangkat ini dan otomatis dikirim saat online.
              </span>
            </div>
          </div>
        )}

        {mode !== "forgot" && (
          <div className="auth-mode" role="group" aria-label="Pilih masuk atau buat akun">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              aria-pressed={mode === "login"}
              onClick={() => switchMode("login")}
            >
              Masuk
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              aria-pressed={mode === "register"}
              onClick={() => switchMode("register")}
            >
              Buat akun
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label className="auth-field">
                <span>Nama warung</span>
                <input
                  value={warungName}
                  onChange={(event) => setWarungName(event.target.value)}
                  placeholder="Contoh: Warung Sumber Rejeki"
                  autoComplete="organization"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Nama penjual</span>
                <input
                  value={sellerName}
                  onChange={(event) => setSellerName(event.target.value)}
                  placeholder="Contoh: Pak Andi"
                  autoComplete="name"
                  required
                />
              </label>
            </>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Contoh: nama@gmail.com"
              autoComplete="email"
              required
            />
          </label>

          {mode !== "forgot" && (
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`Minimal ${MIN_PASSWORD_LENGTH} karakter`}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
          )}

          {mode === "register" && (
            <label className="auth-field">
              <span>Ulangi password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Ketik ulang password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
          )}

          {mode === "login" && (
            <button
              type="button"
              className="auth-link auth-forgot"
              onClick={() => switchMode("forgot")}
            >
              Lupa password?
            </button>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? mode === "login"
                ? "Sedang masuk..."
                : mode === "register"
                  ? "Membuat akun..."
                  : "Mengirim link..."
              : mode === "login"
                ? "Masuk"
                : mode === "register"
                  ? "Buat akun"
                  : "Kirim link reset"}
          </button>
        </form>

        {mode === "login" && isSupabaseConfigured && (
          <>
            <div className="auth-divider">
              <span>atau</span>
            </div>
            <button
              type="button"
              className="auth-demo"
              onClick={() => void useDemoAccount()}
              disabled={busy || demoBusy || offlineNow}
              title={offlineNow ? "Akun demo butuh internet" : undefined}
            >
              {demoBusy ? "Membuka akun demo..." : "Coba akun demo"}
            </button>
            <p className="auth-note">
              Akun demo sudah berisi contoh warung lengkap. Berganti akun kapan saja dari
              menu.
            </p>
          </>
        )}

        <p className="auth-note">
          {isSupabaseConfigured
            ? "Link reset password dikirim ke email Anda lewat Supabase."
            : "Mode lokal: akun dan data disimpan di browser ini. Reset lewat email butuh Supabase."}
        </p>

        {message && (
          <div className="auth-error" role="alert">
            <Icon name="warning" size={17} />
            <span>{message}</span>
          </div>
        )}

        {info && (
          <div className="auth-success" role="status">
            <Icon name="check" size={17} />
            <span>{info}</span>
          </div>
        )}

        {mode === "forgot" ? (
          <button type="button" className="auth-link auth-cancel" onClick={() => switchMode("login")}>
            Kembali ke halaman masuk
          </button>
        ) : (
          <p className="auth-footnote">
            Sesi disimpan di perangkat ini — setelah pernah masuk, aplikasi bisa dibuka tanpa internet.
          </p>
        )}
      </section>
    </main>
  )
}
