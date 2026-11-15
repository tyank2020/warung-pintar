import { useEffect, useState } from "react"
import { Icon } from "../components/Icon"
import { UserAvatar } from "../components/UserAvatar"
import { useAuth } from "../lib/auth"
import { useWarung } from "../lib/store"

type Theme = "light" | "dark" | "system"

/** Baca tema yang tersimpan. Aman dipanggil di server atau sebelum DOM siap. */
function readStoredTheme(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem("warung-theme")
  } catch {
    return null
  }
}

export function Settings() {
  const { source, syncError, resetDemo, refresh, products, transactions, sync } = useWarung()
  const { user, isLocal, signOut, updateProfile } = useAuth()
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = readStoredTheme()
    return stored === "dark" || stored === "system" ? stored : "light"
  })
  const [message, setMessage] = useState("")
  const [loggingOut, setLoggingOut] = useState(false)
  const [ownerName, setOwnerName] = useState(user?.name ?? "")
  const [warungName, setWarungName] = useState(user?.warungName ?? "")
  const [busyAccount, setBusyAccount] = useState(false)
  const [accountError, setAccountError] = useState("")

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme
      document.documentElement.dataset.theme = resolved
      window.localStorage.setItem("warung-theme", theme)
    }
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(""), 2200)
  }

  const accountChanged =
    ownerName.trim() !== (user?.name ?? "") || warungName.trim() !== (user?.warungName ?? "")

  const saveAccount = async () => {
    setAccountError("")
    setBusyAccount(true)
    try {
      await updateProfile({ name: ownerName, warungName })
      notify("Data akun berhasil disimpan")
    } catch (saveError) {
      setAccountError(saveError instanceof Error ? saveError.message : "Gagal menyimpan data akun.")
    } finally {
      setBusyAccount(false)
    }
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await signOut()
    } catch {
      notify("Gagal keluar. Periksa koneksi lalu coba lagi.")
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="settings-page">
      <section className="page-title">
        <div>
          <span className="date-label">PREFERENSI APLIKASI</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              ⚙️
            </span>{" "}
            Pengaturan
          </h1>
          <p>Akun, tampilan, sumber data, dan informasi aplikasi.</p>
        </div>
        {message && (
          <span className="settings-toast">
            <Icon name="check" size={16} /> {message}
          </span>
        )}
      </section>

      <div className="settings-layout">
        <section className="settings-card account-settings">
          <div className="settings-card-head account-head">
            <UserAvatar user={user} className="settings-avatar" />
            <div>
              <h2>{user?.name ?? "Pemilik Warung"}</h2>
              <p>{user?.warungName ?? "Warung Saya"}</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong>Status akun</strong>
                <small>
                  {isLocal
                    ? "Akun lokal di perangkat ini. Data tidak dikirim ke cloud."
                    : "Akun Supabase. Nama warung dan penjual dipakai untuk masuk."}
                </small>
              </span>
              <span className={`source-badge ${isLocal ? "demo" : "supabase"}`}>
                {isLocal ? "Lokal" : "Cloud"}
              </span>
            </div>
            <div>
              <span>
                <strong>Sesi login</strong>
                <small>Tetap masuk di perangkat ini sampai Anda menekan tombol keluar.</small>
              </span>
            </div>
          </div>
          <div className="settings-actions account-actions">
            <button
              className="logout-button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <Icon name="logout" size={17} />{" "}
              {loggingOut ? "Sedang keluar..." : "Keluar dari akun"}
            </button>
          </div>
        </section>

        <section className="settings-card appearance-settings">
          <div className="settings-card-head">
            <span className="settings-card-icon">
              <Icon name={theme === "dark" ? "moon" : "sun"} />
            </span>
            <div>
              <h2>Tampilan aplikasi</h2>
              <p>Pilih tema yang nyaman untuk mata Anda.</p>
            </div>
          </div>
          <div className="theme-options">
            {(
              [
                { value: "light", label: "Terang", icon: "sun", preview: "light-preview" },
                { value: "dark", label: "Gelap", icon: "moon", preview: "dark-preview" },
                {
                  value: "system",
                  label: "Ikuti sistem",
                  icon: "settings",
                  preview: "system-preview",
                },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                className={theme === option.value ? "active" : ""}
                onClick={() => setTheme(option.value)}
              >
                <span className={`theme-preview ${option.preview}`}>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <Icon name={option.icon} size={16} />
                  <strong>{option.label}</strong>
                </span>
                <i className="theme-check">
                  <Icon name="check" size={13} />
                </i>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card sync-card">
          <div className="settings-card-head">
            <span className="settings-card-icon blue">
              <Icon name="arrow" />
            </span>
            <div>
              <h2>Data &amp; sinkronisasi</h2>
              <p>Aplikasi tetap jalan tanpa internet — semua perubahan dikirim saat online.</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span className="sync-stat">
                <strong>Status koneksi</strong>
                <small>
                  {sync.status === "offline"
                    ? "Offline — data tersimpan di perangkat ini."
                    : sync.status === "syncing"
                      ? "Sedang mengirim perubahan ke server…"
                      : sync.pending > 0
                        ? `Online, ${sync.pending} perubahan menunggu sinkronisasi.`
                        : "Online dan semua perubahan sudah sinkron."}
                </small>
              </span>
              <span className={`source-badge ${sync.status === "offline" ? "demo" : "supabase"}`}>
                {sync.status === "offline"
                  ? "Offline"
                  : sync.status === "syncing"
                    ? "Syncing"
                    : sync.pending > 0
                      ? `${sync.pending} menunggu`
                      : "Aktif"}
              </span>
            </div>
            <div>
              <span className="sync-stat">
                <strong>Sinkronisasi otomatis</strong>
                <small>Matikan kalau ingin mengirim manual saja (lebih hemat kuota).</small>
              </span>
              <label className="sync-toggle">
                <input
                  type="checkbox"
                  checked={sync.autoSync}
                  onChange={(event) => void sync.setAutoSync(event.target.checked)}
                  aria-label="Sinkronisasi otomatis"
                />
                <span>{sync.autoSync ? "Aktif" : "Nonaktif"}</span>
              </label>
            </div>
            <div>
              <span className="sync-stat">
                <strong>Terakhir sinkron</strong>
                <small>
                  {sync.lastSyncAt
                    ? new Date(sync.lastSyncAt).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Belum pernah sinkron"}
                </small>
              </span>
            </div>
            {sync.lastError && (
              <div className="form-error settings-error">
                <Icon name="warning" size={15} /> {sync.lastError}
              </div>
            )}
          </div>
          <div className="settings-actions">
            <button
              onClick={() => {
                void sync
                  .syncNow()
                  .then(() => notify("Sinkronisasi selesai"))
                  .catch(() => notify("Gagal sinkronisasi — data tetap aman di perangkat"))
              }}
              disabled={sync.syncing || !sync.online}
            >
              <Icon name="arrow" size={17} /> Sync sekarang
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon orange">
              <Icon name="scan" />
            </span>
            <div>
              <h2>Sumber data</h2>
              <p>Status koneksi dan data yang sedang dipakai.</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong>Mode aplikasi</strong>
                <small>
                  {source === "supabase"
                    ? "Terhubung ke Supabase (data cloud)."
                    : "Mode demo lokal (data di browser)."}
                </small>
              </span>
              <span className={`source-badge ${source}`}>
                {source === "supabase" ? "Supabase" : "Demo"}
              </span>
            </div>
            <div>
              <span>
                <strong>Data tersimpan</strong>
                <small>
                  {products.filter((product) => product.archived !== true).length} barang ·{" "}
                  {transactions.length} transaksi
                </small>
              </span>
            </div>
          </div>
          {syncError && (
            <div className="form-error settings-error">
              <Icon name="warning" size={15} /> {syncError}
            </div>
          )}
          <div className="settings-actions">
            <button
              onClick={() => {
                void refresh()
                  .then(() => notify("Data berhasil dimuat ulang"))
                  .catch(() => notify("Gagal memuat ulang data"))
              }}
            >
              <Icon name="arrow" size={17} /> Muat ulang data
            </button>
            <button
              onClick={() => {
                resetDemo()
                notify("Data demo berhasil direset")
              }}
            >
              Reset data demo <span>lokal</span>
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon blue">
              <Icon name="spark" />
            </span>
            <div>
              <h2>Cara kerja angka</h2>
              <p>Aturan yang dipakai aplikasi ini.</p>
            </div>
          </div>
          <div className="settings-list">
            <div>
              <span>
                <strong>Stok</strong>
                <small>
                  Stok awal + pembelian − penjualan − penyesuaian. Satuan mengikuti produk.
                </small>
              </span>
            </div>
            <div>
              <span>
                <strong>Laba kotor</strong>
                <small>Penjualan − modal barang terjual. Bukan laba bersih.</small>
              </span>
            </div>
            <div>
              <span>
                <strong>Saran pembelian</strong>
                <small>
                  Proyeksi terjual per hari × (lead time + 3 hari) − stok saat ini. Proyeksi memakai
                  30 hari terakhir, seasonally, dan bisa disesuaikan sendiri.
                </small>
              </span>
            </div>
            <div>
              <span>
                <strong>Hari dan jam</strong>
                <small>
                  Semua perhitungan hari memakai zona waktu warung (WIB), sama dengan tampilan jam
                  dan angka di database.
                </small>
              </span>
            </div>
          </div>
        </section>

        <section className="settings-card account-settings">
          <div className="settings-card-head">
            <span className="settings-card-icon blue">
              <Icon name="home" />
            </span>
            <div>
              <h2>Akun warung</h2>
              <p>Data warung ini tersimpan sendiri dan tidak bisa dilihat warung lain.</p>
            </div>
          </div>
          <div className="account-fields">
            <label>
              Nama pemilik
              <input
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Contoh: Pak Andi"
              />
            </label>
            <label>
              Nama warung
              <input
                value={warungName}
                onChange={(event) => setWarungName(event.target.value)}
                placeholder="Contoh: Warung Sumber Rejeki"
              />
            </label>
            <label>
              Email
              <input value={user?.email ?? ""} readOnly disabled />
            </label>
          </div>
          <div className="settings-actions">
            <button onClick={() => void saveAccount()} disabled={busyAccount || !accountChanged}>
              {busyAccount ? "Menyimpan…" : "Simpan perubahan akun"}
            </button>
          </div>
          {accountError && <div className="form-error settings-error">{accountError}</div>}
        </section>

        <section className="settings-card about-settings">
          <div className="settings-card-head">
            <span className="settings-card-icon green">
              <Icon name="home" />
            </span>
            <div>
              <h2>Tentang Warung Pintar</h2>
              <p>Asisten pencatatan untuk warung kecil.</p>
            </div>
          </div>
          <div className="about-row">
            <span>Versi aplikasi</span>
            <strong>1.0.0</strong>
          </div>
          <div className="about-row">
            <span>Konfirmasi sebelum simpan</span>
            <strong>Selalu</strong>
          </div>
          <div className="about-row">
            <span>Angka saran restok</span>
            <strong>Satu mesin untuk semua layar</strong>
          </div>
        </section>
      </div>
    </div>
  )
}
