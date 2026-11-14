import type { ReactNode } from "react"
import { useState } from "react"
import { useAuth } from "../lib/auth"
import { isSignupConfirmationUrl } from "../lib/authSession"
import { AuthScreen } from "./AuthScreen"
import { EmailConfirmedScreen } from "./EmailConfirmedScreen"
import { ResetPasswordScreen } from "./ResetPasswordScreen"

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, passwordRecovery } = useAuth()
  // Landing setelah klik link konfirmasi email (type=signup): jangan tampilkan
  // layar masuk, tunjukkan layar "Selamat, akun berhasil dibuat".
  const [signupConfirmed, setSignupConfirmed] = useState(() =>
    isSignupConfirmationUrl(window.location.href),
  )

  if (signupConfirmed) {
    return (
      <EmailConfirmedScreen
        onContinue={() => {
          try {
            window.history.replaceState(null, "", window.location.pathname)
          } catch {
            // history bisa diblokir; layar tetap bisa ditutup lewat tombol.
          }
          setSignupConfirmed(false)
        }}
      />
    )
  }

  if (loading) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-loading" aria-live="polite">
          <span className="scan-spinner" />
          <strong>Memeriksa sesi login...</strong>
          <p>Menyiapkan akses ke warung Anda.</p>
        </section>
      </main>
    )
  }

  if (passwordRecovery && user) return <ResetPasswordScreen />

  if (!user) return <AuthScreen />

  return <>{children}</>
}
