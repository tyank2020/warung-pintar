import { Icon } from "./Icon"
import { mobileNav, type NavLabel } from "../lib/nav"

export function MobileNav({
  activeNav,
  onNavigate,
}: {
  activeNav: NavLabel
  onNavigate: (nav: NavLabel) => void
}) {
  return (
    <nav className="mobile-nav" aria-label="Navigasi mobile">
      {mobileNav.map((item) => (
        <button
          key={item.label}
          onClick={() => onNavigate(item.label)}
          className={activeNav === item.label ? "active" : ""}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
      <button
        onClick={() => onNavigate("Pengaturan")}
        className={activeNav === "Pengaturan" ? "active" : ""}
      >
        <Icon name="user" />
        <span>Akun</span>
      </button>
    </nav>
  )
}
