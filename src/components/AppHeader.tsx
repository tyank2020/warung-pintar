import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "./Icon"
import { BrandLogo } from "./BrandLogo"
import { UserAvatar } from "./UserAvatar"
import { useAuth } from "../lib/auth"
import { useWarung } from "../lib/store"
import { numberID, productLabel, rupiah, shortDate } from "../lib/format"
import type { NavLabel } from "../lib/nav"

export function AppHeader({
  query,
  onQueryChange,
  onNavigate,
  onChat,
  onMenu,
}: {
  query: string
  onQueryChange: (value: string) => void
  onNavigate: (nav: NavLabel) => void
  onChat: () => void
  onMenu: () => void
}) {
  const { stats, debts, sync } = useWarung()
  const { user } = useAuth()
  const [notice, setNotice] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const openDebts = useMemo(() => {
    const list = debts.filter((debt) => !debt.settled_at)
    return list.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 4)
  }, [debts])
  const hasNotice = stats.lowStockCount > 0 || openDebts.length > 0

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <header>
      <button className="mobile-menu-trigger" onClick={onMenu} aria-label="Buka menu">
        <Icon name="menu" size={20} />
      </button>
      <div className="mobile-brand brand">
        <BrandLogo />
        <div>
          <strong>Warung</strong>
          <b>Pintar</b>
        </div>
      </div>
      <div className="search">
        <Icon name="search" size={19} />
        <input
          ref={searchRef}
          aria-label="Cari barang"
          aria-keyshortcuts="Control+K Meta+K"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onNavigate("Stok Barang")
            }
          }}
          placeholder="Cari barang..."
        />
        <kbd>⌘ K</kbd>
      </div>
      <button
        className={`sync-pill ${sync.status}`}
        onClick={() => void sync.syncNow()}
        disabled={sync.syncing || sync.status === "offline"}
        title={
          sync.status === "offline"
            ? "Offline — data tersimpan di perangkat"
            : sync.pending > 0
              ? `${sync.pending} perubahan menunggu sinkronisasi`
              : sync.status === "failed"
                ? "Sinkronisasi terakhir gagal — klik untuk coba lagi"
                : "Tersinkronisasi"
        }
        aria-label={`Status koneksi: ${
          sync.status === "offline"
            ? "Offline"
            : sync.status === "online"
              ? "Online"
              : sync.status === "syncing"
                ? "Menyinkronkan"
                : sync.status === "failed"
                  ? "Gagal sinkronisasi"
                  : `${sync.pending} perubahan menunggu sinkronisasi`
        }`}
      >
        <span className="sync-dot" aria-hidden="true" />
      </button>
      <div className="header-actions">
        <button className="notification" aria-label="Asisten warung" onClick={onChat}>
          <Icon name="spark" />
        </button>
        <button className="notification" aria-label="Notifikasi" onClick={() => setNotice(!notice)}>
          <Icon name="bell" />
          {hasNotice && <i />}
        </button>
        <button
          className="mini-profile"
          onClick={() => onNavigate("Pengaturan")}
          aria-label="Buka akun dan pengaturan"
        >
          <UserAvatar user={user} />
          <span>
            <b>{user?.name ?? "Pemilik Warung"}</b>
            <small>{user?.warungName ?? "Warung Saya"}</small>
          </span>
        </button>
      </div>
      {notice && (
        <div className="notice-popover">
          <div className="notice-head">
            <strong>Notifikasi</strong>
            <button onClick={() => setNotice(false)} aria-label="Tutup notifikasi">
              <Icon name="close" size={17} />
            </button>
          </div>
          <div className="notice-group">
            <span className="notice-group-label">
              Stok barang
              <em>{stats.lowStockCount > 0 ? `${stats.lowStockCount} perlu dicek` : "aman"}</em>
            </span>
            {stats.lowStock.slice(0, 3).map((product) => (
              <p key={product.id}>
                <span className="alert-dot" /> Stok {productLabel(product)} tinggal{" "}
                {numberID(product.stock)} {product.unit}.
              </p>
            ))}
            {stats.lowStock.length === 0 && (
              <p>
                <span className="info-dot" /> Semua stok berada di atas batas minimum.
              </p>
            )}
          </div>
          <div className="notice-group">
            <span className="notice-group-label">
              Utang
              <em>
                {openDebts.length > 0
                  ? `${openDebts.length} belum lunas`
                  : "tidak ada utang berjalan"}
              </em>
            </span>
            {openDebts.length === 0 ? (
              <p>
                <span className="info-dot" /> Buku utang bersih.
              </p>
            ) : (
              openDebts.map((debt) => (
                <p key={debt.id}>
                  <span className="orange-dot" /> {debt.debtor} simpen {debt.product_name}{" "}
                  {numberID(debt.qty)} {debt.unit} · {shortDate(debt.created_at)} ·{" "}
                  {rupiah(debt.amount)}
                </p>
              ))
            )}
          </div>
          {stats.tips[0] && (
            <p>
              <span className="orange-dot" /> {stats.tips[0].text}
            </p>
          )}
        </div>
      )}
    </header>
  )
}
