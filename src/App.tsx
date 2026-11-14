import { useEffect, useState } from "react"
import { AppHeader } from "./components/AppHeader"
import { ChatPanel } from "./components/ChatPanel"
import { DemoBanner } from "./components/DemoBanner"
import { MobileMenu } from "./components/MobileMenu"
import { MobileNav } from "./components/MobileNav"
import { ProductModal } from "./components/ProductModal"
import { ReceiptModal } from "./components/ReceiptModal"
import { Sidebar } from "./components/Sidebar"
import { VoiceModal } from "./components/VoiceModal"
import { useWarung } from "./lib/store"
import type { NavLabel } from "./lib/nav"
import { Dashboard } from "./pages/Dashboard"
import { Cashier } from "./pages/Cashier"
import { Closing } from "./pages/Closing"
import { Customers } from "./pages/Customers"
import { Consignments } from "./pages/Consignments"
import { MarketPrices } from "./pages/MarketPrices"
import { Notes } from "./pages/Notes"
import { Reconcile } from "./pages/Reconcile"
import { History } from "./pages/History"
import { Inventory } from "./pages/Inventory"
import { Reports } from "./pages/Reports"
import { Settings } from "./pages/Settings"

type ModalState = "voice" | "voice-catalog" | "receipt" | "product" | null

const SIDEBAR_KEY = "warung-pintar-sidebar"

export default function App() {
  const { source, syncError, loading, sync } = useWarung()
  const [activeNav, setActiveNav] = useState<NavLabel>("Beranda")
  const [modal, setModal] = useState<ModalState>(null)
  const [inventoryQuery, setInventoryQuery] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed"
    } catch {
      return false
    }
  })

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const stored = window.localStorage.getItem("warung-theme")
      const theme = stored === "dark" || stored === "system" ? stored : "light"
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme
    }
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  const openNav = (next: NavLabel) => {
    setActiveNav(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded")
      } catch {
        // Penyimpanan diblokir: pilihan hanya berlaku di sesi ini.
      }
      return next
    })
  }

  const goToAdvisor = () => {
    openNav("Beranda")
    window.setTimeout(
      () => document.getElementById("advisor")?.scrollIntoView({ behavior: "smooth" }),
      80,
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={activeNav}
        onNavigate={openNav}
        onAdvisor={goToAdvisor}
        onChat={() => setChatOpen(true)}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />

      <main className={sidebarCollapsed ? "sidebar-collapsed" : undefined}>
        <AppHeader
          query={inventoryQuery}
          onQueryChange={setInventoryQuery}
          onNavigate={openNav}
          onChat={() => setChatOpen(true)}
          onMenu={() => setMenuOpen(true)}
        />

        <div className="content">
          <DemoBanner
            source={source}
            syncError={syncError}
            online={sync.online}
            pending={sync.pending}
            onOpenSettings={() => openNav("Pengaturan")}
          />
          {loading ? (
            <div className="loading-screen">
              <span className="scan-spinner" />
              <strong>Menyiapkan warung…</strong>
              <span>Menghitung stok dan transaksi.</span>
            </div>
          ) : (
            <div className="route-transition" key={activeNav}>
              {activeNav === "Kasir" ? (
                <Cashier onVoice={() => setModal("voice")} />
              ) : activeNav === "Beranda" ? (
                <Dashboard
                  onVoice={() => setModal("voice")}
                  onReceipt={() => setModal("receipt")}
                  onNavigate={openNav}
                />
              ) : activeNav === "Stok Barang" ? (
                <Inventory
                  onReceipt={() => setModal("receipt")}
                  onProduct={() => setModal("product")}
                  onVoice={() => setModal("voice-catalog")}
                  onNavigate={openNav}
                  initialSearch={inventoryQuery}
                />
              ) : activeNav === "Piutang" ? (
                <Customers />
              ) : activeNav === "Titip Jual" ? (
                <Consignments />
              ) : activeNav === "Nota Belanja" ? (
                <Notes />
              ) : activeNav === "Cek Stok" ? (
                <Reconcile />
              ) : activeNav === "Harga Pasar" ? (
                <MarketPrices />
              ) : activeNav === "Tutup Buku" ? (
                <Closing />
              ) : activeNav === "Laporan" ? (
                <Reports onNavigate={openNav} />
              ) : activeNav === "Riwayat" ? (
                <History />
              ) : (
                <Settings />
              )}
            </div>
          )}
        </div>
      </main>

      <MobileNav activeNav={activeNav} onNavigate={openNav} />

      {modal === "voice" && <VoiceModal onClose={() => setModal(null)} />}
      {modal === "voice-catalog" && (
        <VoiceModal mode="katalog" onClose={() => setModal(null)} />
      )}
      {modal === "receipt" && <ReceiptModal onClose={() => setModal(null)} />}
      {modal === "product" && <ProductModal onClose={() => setModal(null)} />}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
      {menuOpen && (
        <MobileMenu
          activeNav={activeNav}
          onNavigate={openNav}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}
