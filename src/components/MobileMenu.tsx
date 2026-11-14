import { useEffect, useRef } from "react"
import { BrandLogo } from "./BrandLogo"
import { Icon } from "./Icon"
import { navGroups, type NavLabel } from "../lib/nav"

/**
 * Menu lengkap untuk HP.
 *
 * Di layar kecil, sidebar disembunyikan dan nav bawah hanya memuat 4 menu
 * utama. Halaman lain (Piutang, Titip Jual, Nota Belanja, Cek Stok, Harga
 * Pasar, Tutup Buku) harus tetap bisa dibuka — lewat menu ini.
 */
export function MobileMenu({
  activeNav,
  onNavigate,
  onClose,
}: {
  activeNav: NavLabel
  onNavigate: (nav: NavLabel) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Dialog harus bisa ditutup dengan Escape dan fokusnya harus masuk ke
  // panel — kalau tidak, pengguna keyboard tersesat di overlay.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    const first = panelRef.current?.querySelector<HTMLElement>("button")
    first?.focus()
    const previous = document.activeElement as HTMLElement | null
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div
      className="mobile-menu-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Menu aplikasi"
      onClick={onClose}
    >
      <nav className="mobile-menu" ref={panelRef} onClick={(event) => event.stopPropagation()}>
        <div className="mobile-menu-head">
          <div className="mobile-menu-title">
            <BrandLogo />
            <strong>Warung Pintar</strong>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Tutup menu">
            <Icon name="close" />
          </button>
        </div>
        <p className="mobile-menu-hint">Semua halaman Warung Pintar.</p>
        <div className="mobile-menu-grid">
          {navGroups.map((group) => (
            <div className="mobile-menu-group" key={group.title}>
              <p className="mobile-menu-group-title">{group.title}</p>
              {group.items.map((item) => (
                <button
                  key={item.label}
                  className={activeNav === item.label ? "active" : ""}
                  onClick={() => {
                    onNavigate(item.label)
                    onClose()
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="mobile-menu-group">
            <p className="mobile-menu-group-title">LAINNYA</p>
            <button
              className={activeNav === "Pengaturan" ? "active" : ""}
              onClick={() => {
                onNavigate("Pengaturan")
                onClose()
              }}
            >
              <Icon name="user" />
              <span>Akun &amp; Pengaturan</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  )
}
