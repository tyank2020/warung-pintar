import { useEffect, useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { ProductSheet } from "../components/ProductSheet"
import { StockCountSheet } from "../components/StockCountSheet"
import { StockInModal } from "../components/StockInModal"
import { useWarung } from "../lib/store"
import { compactRupiah, numberID, productInitials, productLabel, rupiah } from "../lib/format"
import { useAnimatedNumber } from "../lib/useAnimatedNumber"
import { statusFor } from "../lib/display"
import { buildDeadStockReport, deadStockHeadline } from "../lib/deadStock"
import { buildLedgerDigest, buildPurchasePlan } from "../lib/ledger"
import { computeRestockPlan } from "../lib/restock"
import type { NavLabel } from "../lib/nav"

const inventoryFilters = ["Semua", "Perlu restok", "Stok aman", "Arsip"] as const

export function Inventory({
  onReceipt,
  onProduct,
  onVoice,
  onNavigate,
  initialSearch,
}: {
  onReceipt: () => void
  onProduct: () => void
  onVoice: () => void
  onNavigate: (nav: NavLabel) => void
  initialSearch: string
}) {
  const { products, transactions, stats, index } = useWarung()
  const [search, setSearch] = useState(initialSearch)
  const [filter, setFilter] = useState<(typeof inventoryFilters)[number]>("Semua")
  const [countOpen, setCountOpen] = useState(false)
  const [activeProductId, setActiveProductId] = useState<string | null>(null)
  const [stockInOpen, setStockInOpen] = useState(false)
  const [stockInProductId, setStockInProductId] = useState<string | undefined>(undefined)
  /** Urutan tabel: status (Kritis dulu) atau modal/omzet terbesar. */
  const [sortMode, setSortMode] = useState<"status" | "value" | "revenue">("status")

  const openStockIn = (productId?: string) => {
    setStockInProductId(productId)
    setStockInOpen(true)
  }
  const closeStockIn = () => {
    setStockInOpen(false)
    setStockInProductId(undefined)
  }

  const deadStock = useMemo(
    () => buildDeadStockReport(products, transactions),
    [products, transactions],
  )

  // Belanja besok: pola per hari dalam seminggu + hari gajian dari 30 hari data.
  const tomorrow = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date
  }, [])
  const tomorrowLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(
        tomorrow,
      ),
    [tomorrow],
  )
  const tomorrowWeekday = useMemo(
    () => new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(tomorrow),
    [tomorrow],
  )
  const purchasePlan = useMemo(() => {
    const digest = buildLedgerDigest(products, transactions, [])
    // Jumlah beli diambil dari mesin restok yang sama dengan Beranda dan kartu
    // musim, supaya "belanja besok" tidakoffer angka berbeda untuk produk yang
    // sama.
    const restock = computeRestockPlan(products, index, Date.now())
    const byProduct = new Map(restock.signals.map((signal) => [signal.productId, signal]))
    return buildPurchasePlan(products, digest, tomorrow, byProduct)
  }, [index, products, tomorrow, transactions])

  useEffect(() => {
    setSearch(initialSearch)
  }, [initialSearch])

  // Jumlah terjual 7 hari diambil dari indeks yang sudah dihitung, bukan
  // menyaring seluruh transaksi setiap kali filter berubah.
  const soldLast7 = useMemo(() => {
    const map = new Map<string, number>()
    for (const [productId, value] of index.window.byProduct) {
      map.set(productId, value.qty)
    }
    return map
  }, [index])

  const restockTip = useMemo(
    () => new Map(stats.suggestions.map((suggestion) => [suggestion.productId, suggestion])),
    [stats.suggestions],
  )

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? null,
    [activeProductId, products],
  )

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim()
    return products
      .filter((product) => {
        if (filter === "Arsip") return product.archived === true
        if (product.archived === true) return false
        const matchesSearch =
          !query ||
          product.name.toLowerCase().includes(query) ||
          (product.size ?? "").toLowerCase().includes(query) ||
          product.aliases.some((alias) => alias.toLowerCase().includes(query))
        const status = statusFor(product)
        const matchesFilter =
          filter === "Semua" ||
          (filter === "Perlu restok"
            ? status.label !== "Aman"
            : status.label === "Aman")
        return matchesSearch && matchesFilter
      })
      .sort((a, b) => {
        if (sortMode === "value") {
          return b.stock * b.buy_price - a.stock * a.buy_price
        }
        if (sortMode === "revenue") {
          return b.stock * b.sell_price - a.stock * a.sell_price
        }
        const statusA = statusFor(a)
        const statusB = statusFor(b)
        const order = { Kritis: 0, Menipis: 1, Aman: 2 }
        return order[statusA.label] - order[statusB.label] || a.name.localeCompare(b.name)
      })
  }, [filter, products, search, sortMode])

  // Arsip tidak dihitung sebagai persediaan aktif.
  const sellable = products.filter((product) => product.archived !== true)
  const inventoryValue = sellable.reduce(
    (total, product) => total + product.stock * product.buy_price,
    0,
  )
  const potentialRevenue = sellable.reduce(
    (total, product) => total + product.stock * product.sell_price,
    0,
  )
  const potentialProfit = potentialRevenue - inventoryValue
  const animatedCount = useAnimatedNumber(sellable.length)
  const animatedLowStock = useAnimatedNumber(stats.lowStockCount)
  const animatedInventoryValue = useAnimatedNumber(inventoryValue)
  const animatedPotentialRevenue = useAnimatedNumber(potentialRevenue)
  const animatedPotentialProfit = useAnimatedNumber(potentialProfit)

  return (
    <div className="inventory-page">
      <section className="page-title">
        <div>
          <span className="date-label">INVENTORI WARUNG</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              📦
            </span>{" "}
            Stok barang
          </h1>
          <p>Pantau persediaan dan rencanakan pembelian tanpa menebak.</p>
        </div>
        <div className="page-actions">
          <button className="secondary-action" onClick={() => setCountOpen(true)}>
            <Icon name="edit" size={18} /> Hitung stok
          </button>
          <button className="secondary-action" onClick={() => openStockIn()}>
            <Icon name="box" size={18} /> Tambah stok
          </button>
          <button className="secondary-action" onClick={onReceipt}>
            <Icon name="scan" size={18} /> Foto nota kulakan
          </button>
          <button className="secondary-action" onClick={() => onNavigate("Nota Belanja")}>
            <Icon name="receipt" size={18} /> Riwayat nota
          </button>
          <button className="secondary-action" onClick={() => onNavigate("Cek Stok")}>
            <Icon name="warning" size={18} /> Cek stok
          </button>
          <button className="secondary-action voice-entry" onClick={onVoice}>
            <Icon name="mic" size={18} /> Tambah lewat suara
          </button>
          <button className="primary-action" onClick={onProduct}>
            <Icon name="plus" size={18} /> Tambah barang
          </button>
        </div>
      </section>

      <section className="inventory-summary" aria-label="Ringkasan persediaan">
        <button
          type="button"
          className="inventory-summary-card"
          onClick={() => {
            setFilter("Semua")
            setSearch("")
            setSortMode("status")
          }}
          title="Tampilkan semua barang"
        >
          <span className="summary-icon green">
            <Icon name="box" />
          </span>
          <span className="summary-body">
            <small>Total persediaan</small>
            <strong>
              {Math.round(animatedCount)} <em>jenis barang</em>
            </strong>
          </span>
        </button>
        <button
          type="button"
          className={`inventory-summary-card${filter === "Perlu restok" ? " is-active" : ""}`}
          onClick={() => setFilter(filter === "Perlu restok" ? "Semua" : "Perlu restok")}
          aria-pressed={filter === "Perlu restok"}
          title="Tampilkan barang yang perlu dibeli ulang"
        >
          <span className="summary-icon orange">
            <Icon name="warning" />
          </span>
          <span className="summary-body">
            <small>Perlu restok</small>
            <strong>
              {Math.round(animatedLowStock)} <em>barang</em>
            </strong>
          </span>
        </button>
        <button
          type="button"
          className={`inventory-summary-card${sortMode === "value" ? " is-active" : ""}`}
          onClick={() => setSortMode(sortMode === "value" ? "status" : "value")}
          aria-pressed={sortMode === "value"}
          title="Urutkan dari modal terbesar — ketuk lagi untuk kembali ke urutan status"
        >
          <span className="summary-icon blue">Rp</span>
          <span className="summary-body">
            <small>Nilai persediaan</small>
            <strong>{compactRupiah(animatedInventoryValue)}</strong>
            <span className="summary-sub">{sortMode === "value" ? "Diurutkan: modal terbesar ↓" : "Modal yang tertahan di rak"}</span>
          </span>
        </button>
        <button
          type="button"
          className={`inventory-summary-card${sortMode === "revenue" ? " is-active" : ""}`}
          onClick={() => setSortMode(sortMode === "revenue" ? "status" : "revenue")}
          aria-pressed={sortMode === "revenue"}
          title="Urutkan dari omzet terbesar — ketuk lagi untuk kembali ke urutan status"
        >
          <span className="summary-icon purple">
            <Icon name="up" />
          </span>
          <span className="summary-body">
            <small>Potensi omzet</small>
            <strong>{compactRupiah(animatedPotentialRevenue)}</strong>
            <span className="summary-sub">
              ≈ laba kotor {compactRupiah(Math.max(0, animatedPotentialProfit))}
            </span>
          </span>
        </button>
      </section>

      <section className="inventory-workspace">
        <div className="inventory-toolbar">
          <label>
            <Icon name="search" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama barang atau alias..."
            />
          </label>
          <div className="filter-pills">
            {inventoryFilters.map((option) => (
              <button
                key={option}
                className={filter === option ? "active" : ""}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {sortMode !== "status" && (
            <button
              type="button"
              className="sort-reset"
              onClick={() => setSortMode("status")}
              title="Kembalikan urutan ke status stok"
            >
              Urutan: {sortMode === "value" ? "Modal terbesar" : "Omzet terbesar"} ×
            </button>
          )}
        </div>

        <div className="inventory-table">
          <div className="inventory-row table-head">
            <span>Barang</span>
            <span>Stok saat ini</span>
            <span>Nilai stok</span>
            <span>Status</span>
            <span />
          </div>
          {filtered.map((product) => {
            const status = statusFor(product)
            return (
              <div className="inventory-row" key={product.id}>
                <div className="inventory-product">
                  <span className="product-code">{productInitials(product.name)}</span>
                  <div>
                    <button
                      className="product-name-button"
                      onClick={() => setActiveProductId(product.id)}
                    >
                      {productLabel(product)}
                    </button>
                    <small>
                      {numberID(soldLast7.get(product.id) ?? 0)} {product.unit} terjual 7 hari ·
                      minimum {numberID(product.min_stock)} {product.unit}
                    </small>
                  </div>
                </div>
                <div className="stock-amount">
                  <strong>
                    {numberID(product.stock)} <small>{product.unit}</small>
                  </strong>
                  <span>
                    Jual {rupiah(product.sell_price)} / {product.unit}
                  </span>
                  {restockTip.has(product.id) && (
                    <small className="restock-tip">
                      Saran kulakan {numberID(restockTip.get(product.id)?.suggestedQty ?? 0)}{" "}
                      {product.unit}
                    </small>
                  )}
                </div>
                <strong className="stock-value">
                  {compactRupiah(product.stock * product.buy_price)}
                </strong>
                <span className={`status-pill ${status.tone}`}>{status.label}</span>
                <div className="row-actions">
                  <button
                    className="row-action"
                    onClick={() => openStockIn(product.id)}
                    aria-label={`Tambah stok ${productLabel(product)}`}
                  >
                    <Icon name="plus" size={17} /> <span>Restok</span>
                  </button>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="empty-state">
              <Icon name="search" size={26} />
              <strong>Barang tidak ditemukan</strong>
              <span>Coba kata kunci atau filter yang lain.</span>
            </div>
          )}
        </div>
      </section>

      <section className="stock-insight dead-stock-panel">
        <div className="insight-copy">
          <span>Modal nganggur</span>
          <h2>Uang yang diam di rak</h2>
          <p>{deadStockHeadline(deadStock)}</p>
        </div>
        {deadStock.items.length > 0 ? (
          <div className="insight-items">
            {deadStock.items.slice(0, 3).map((item, index) => (
              <div key={item.productId}>
                <span>{index + 1}</span>
                <p>
                  <strong>
                    {item.name} · {numberID(item.stock)} {item.unit}
                  </strong>
                  <small>
                    {item.daysSinceLastSale === null
                      ? "Belum pernah laku"
                      : `Tidak laku ${item.daysSinceLastSale} hari`}{" "}
                    · modal {rupiah(item.value)}
                  </small>
                </p>
                <span className="dead-stock-value">{rupiah(item.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <span>
              <Icon name="check" size={13} />
            </span>
            <p>
              <strong>Semua barang bergerak</strong>
              <small>Tidak ada modal yang tertahan di rak.</small>
            </p>
          </div>
        )}
      </section>

      <section className="stock-insight tomorrow-panel">
        <div className="insight-copy">
          <span>Belanja besok</span>
          <h2>Besok dagang {tomorrowLabel}</h2>
          <p>
            {purchasePlan.length > 0
              ? `${purchasePlan.length} barang perlu dibeli besok. Dihitung dari pola hari ${tomorrowWeekday} dan hari gajian, bukan tebakan.`
              : "Stok semua barang masih aman untuk beberapa hari ke depan."}
          </p>
        </div>
        {purchasePlan.length > 0 ? (
          <div className="insight-items">
            {purchasePlan.map((item) => (
              <div key={item.productId}>
                <span>{item.priority === "tinggi" ? "!" : "•"}</span>
                <p>
                  <strong>
                    {item.name} · {numberID(item.suggestedQty)} {item.unit}
                  </strong>
                  <small>{item.reason}</small>
                </p>
                <span className="dead-stock-value">{rupiah(item.estimatedCost)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <span>
              <Icon name="check" size={13} />
            </span>
            <p>
              <strong>Belum ada kebutuhan besok</strong>
              <small>Stok masih menutupi beberapa hari ke depan.</small>
            </p>
          </div>
        )}
      </section>

      <section className="stock-insight">
        <div className="insight-copy">
          <span>Saran stok hari ini</span>
          <h2>Belanja lebih tepat, modal tetap sehat</h2>
          <p>
            {stats.suggestions[0]
              ? `Prioritaskan ${stats.suggestions[0].name}. ${stats.suggestions[0].reason}`
              : "Stok saat ini masih aman untuk beberapa hari ke depan. Tidak ada pembelian mendesak."}
          </p>
        </div>
        <div className="insight-items">
          {stats.suggestions.map((suggestion, index) => (
            <div key={suggestion.productId}>
              <span>{index + 1}</span>
              <p>
                <strong>{suggestion.name}</strong>
                <small>
                  Beli {numberID(suggestion.suggestedQty)} {suggestion.unit} · Est.{" "}
                  {rupiah(suggestion.estimatedCost)}
                </small>
              </p>
              <button onClick={() => setActiveProductId(suggestion.productId)}>Restok</button>
            </div>
          ))}
          {stats.suggestions.length === 0 && (
            <div>
              <span>
                <Icon name="check" size={13} />
              </span>
              <p>
                <strong>Semua aman</strong>
                <small>Belum ada saran pembelian.</small>
              </p>
            </div>
          )}
        </div>
      </section>

      {countOpen && <StockCountSheet onClose={() => setCountOpen(false)} />}
      {stockInOpen && <StockInModal defaultProductId={stockInProductId} onClose={closeStockIn} />}
      {activeProduct && (
        <ProductSheet product={activeProduct} onClose={() => setActiveProductId(null)} />
      )}
    </div>
  )
}
