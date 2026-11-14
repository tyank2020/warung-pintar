import { Icon } from "./Icon"
import { BrandLogo } from "./BrandLogo"
import { UserAvatar } from "./UserAvatar"
import { useAuth } from "../lib/auth"
import { navGroups, type NavLabel } from "../lib/nav"

export function Sidebar({
  activeNav,
  onNavigate,
  onAdvisor,
  onChat,
  collapsed,
  onToggle,
}: {
  activeNav: NavLabel
  onNavigate: (nav: NavLabel) => void
  onAdvisor: () => void
  onChat: () => void
  collapsed: boolean
  onToggle: () => void
}) {
  const { user } = useAuth()

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <button
        className="sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? "Buka menu" : "Tutup menu"}
        aria-expanded={!collapsed}
        title={collapsed ? "Buka menu" : "Tutup menu"}
      >
        <Icon name="arrow" size={16} />
      </button>
      <div className="brand">
        <BrandLogo />
        <div>
          <strong>Warung</strong>
          <b>Pintar</b>
        </div>
      </div>
      <nav className="side-nav" aria-label="Navigasi utama">
        {navGroups.map((group) => (
          <div className="side-nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map((item) => (
              <button
                className={activeNav === item.label ? "active" : ""}
                onClick={() => onNavigate(item.label)}
                key={item.label}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
        <p className="second-label">Lainnya</p>
        <button onClick={onChat}>
          <Icon name="spark" />
          <span>Asisten AI</span>
        </button>
        <button
          className={activeNav === "Pengaturan" ? "active" : ""}
          onClick={() => onNavigate("Pengaturan")}
        >
          <Icon name="settings" />
          <span>Pengaturan</span>
        </button>
      </nav>
      <div className="help-card">
        <div className="help-icon">
          <Icon name="spark" size={19} />
        </div>
        <strong>Butuh bantuan?</strong>
        <span>Catat penjualan lewat suara, lalu periksa hasilnya.</span>
        <button onClick={onAdvisor}>
          Lihat saran <Icon name="arrow" size={16} />
        </button>
      </div>
      <button
        className="profile"
        onClick={() => onNavigate("Pengaturan")}
        aria-label="Buka akun dan pengaturan"
      >
        <UserAvatar user={user} />
        <div>
          <strong>{user?.name ?? "Pemilik Warung"}</strong>
          <span>{user?.warungName ?? "Warung Saya"}</span>
        </div>
        <span className="profile-more" aria-hidden="true">
          •••
        </span>
      </button>
    </aside>
  )
}
