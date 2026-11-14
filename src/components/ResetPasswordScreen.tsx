import { useState, type FormEvent } from "react"
import { useAuth } from "../lib/auth"
import { MIN_PASSWORD_LENGTH } from "../lib/authSession"
import { BrandLogo } from "./BrandLogo"
import { Icon } from "./Icon"

export function ResetPasswordScreen() {
  const { updatePassword, signOut, error, clearError } = useAuth()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    clearError()
    setFormError("")
    if (password !== confirmPassword) {
      setFormError("Konfirmasi password belum sama.")
      return
    }

    setBusy(true)
    try {
      await updatePassword(password)
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    if (busy) return
    setBusy(true)
    try {
      await signOut()
    } catch {
      // Pesan error dari provider ditampilkan di kartu.
    } finally {
      setBusy(false)
    }
  }

  const message = formError || error

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-title">
        <div className="auth-brand">
          <BrandLogo />
          <div>
            <strong>Warung</strong>
            <b>Pintar</b>
          </div>
        </div>

        <span className="auth-kicker">PASSWORD BARU</span>
        <h1 id="reset-title">Buat password baru</h1>
        <p className="auth-copy">
          Link reset berhasil dibuka. Masukkan password baru untuk akun ini, lalu simpan.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Password baru</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`Minimal ${MIN_PASSWORD_LENGTH} karakter`}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>
          <label className="auth-field">
            <span>Ulangi password baru</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Ketik ulang password baru"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan password baru"}
          </button>
        </form>

        {message && (
          <div className="auth-error" role="alert">
            <Icon name="warning" size={17} />
            <span>{message}</span>
          </div>
        )}

        <button type="button" className="auth-link auth-cancel" onClick={() => void handleCancel()}>
          Batal dan kembali ke halaman masuk
        </button>
      </section>
    </main>
  )
}
