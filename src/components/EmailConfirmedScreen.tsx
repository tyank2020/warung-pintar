import { Icon } from "./Icon"

/**
 * Layar setelah pengguna klik link konfirmasi email (type=signup).
 * Berdiri sendiri, bukan bagian dari alur login — isinya hanya
 * memberi tahu bahwa akun sudah aktif.
 */
export function EmailConfirmedScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="confirm-email-page">
      <section className="confirm-email-card" aria-labelledby="confirm-email-title">
        <div className="confirm-email-art" aria-hidden="true">
          <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="160" cy="104" r="86" fill="#dbe7ff" />
            <ellipse cx="160" cy="212" rx="120" ry="10" fill="#d4deee" />

            <path d="M64 104h192l-11 27H75l-11-27Z" fill="#2f62e8" />
            <path d="M75 131h27l-7 18H68l7-18Z" fill="#ffffff" />
            <path d="M102 131h27l-7 18h-27l7-18Z" fill="#2f62e8" />
            <path d="M129 131h27l-7 18h-27l7-18Z" fill="#ffffff" />
            <path d="M156 131h27l-7 18h-27l7-18Z" fill="#2f62e8" />
            <path d="M183 131h27l-7 18h-27l7-18Z" fill="#ffffff" />
            <path d="M210 131h27l-7 18h-27l7-18Z" fill="#2f62e8" />

            <rect x="80" y="149" width="160" height="60" rx="8" fill="#1f4fd6" />
            <rect x="98" y="167" width="36" height="42" rx="3" fill="#16347e" />
            <rect x="146" y="167" width="66" height="8" rx="4" fill="#7aa8ff" opacity="0.6" />
            <rect x="146" y="183" width="66" height="8" rx="4" fill="#7aa8ff" opacity="0.4" />

            <circle cx="238" cy="52" r="30" fill="#2f62e8" />
            <circle cx="238" cy="52" r="30" stroke="#ffffff" strokeWidth="6" />
            <path d="M226.5 52.5 235 61l23.5-23" stroke="#ffffff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <span className="auth-kicker">EMAIL TERKONFIRMASI</span>
        <h1 id="confirm-email-title">Selamat!</h1>
        <p className="confirm-email-copy">
          Anda berhasil membuat akun. Silakan kembali ke aplikasi dan masuk dengan akun
          yang sudah Anda buat.
        </p>

        <button type="button" className="auth-submit" onClick={onContinue}>
          Kembali ke aplikasi <Icon name="arrow" size={16} />
        </button>
        <p className="auth-note">
          Setelah keluar dari halaman ini, buka kembali aplikasi seperti biasa — Anda
          bisa masuk langsung tanpa daftar lagi.
        </p>
      </section>
    </main>
  )
}
