import { useEffect, useMemo, useState } from "react"
import { CustomerNameField } from "../components/CustomerNameField"
import {
  addConsignmentLine,
  addLine,
  cartTotal,
  changeQty,
  removeLine,
  setLineDeferred,
  setLinePrice,
  splitCheckout,
} from "../lib/checkout"
import { numberID, productLabel, rupiah } from "../lib/format"
import { useWarung } from "../lib/store"
import type { Consignment, Product } from "../lib/types"
import { Icon } from "../components/Icon"
import { ReceiptModal } from "../components/ReceiptModal"

/**
 * Kasir — jalur utama Warung Pintar.
 *
 * Semua transaksi lahir dari ketukan pemilik warung, jadi tidak pernah ada
 * "hampir benar" yang diam-diam jadi transaksi. Suara tetap tersedia sebagai
 * pintasan (untuk yang barangnya banyak), tapi bukan satu-satunya jalan.
 */
export function Cashier({ onVoice }: { onVoice: () => void }) {
  const {
    products,
    consignments,
    saveCheckout,
    addProduct,
    cartLines: lines,
    setCartLines: setLines,
    refreshCatalog,
  } = useWarung()
  const [query, setQuery] = useState("")
  const [debtor, setDebtor] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<{
    sale: number
    debt: number
    saleTotal: number
    debtTotal: number
    consignment: number
  } | null>(null)
  const [newItem, setNewItem] = useState({ name: "", price: "", stock: "10" })
  const [newItemOpen, setNewItemOpen] = useState(false)
  // Barang titipan dipisah dari barang warung supaya tidak keliru; barang
  // titipan tidak bisa "simpen dulu" — pemilik barang tetap dibayar.
  const [catalogTab, setCatalogTab] = useState<"warung" | "titipan">("warung")

  // Kasir selalu cocok dengan stok terbaru: refresh saat halaman dibuka dan
  // saat jendela kembali fokus — bukan polling 10 detik, supaya kuota
  // internet hemat. Sync server terjadi lewat mesin antrean, bukan di sini.
  useEffect(() => {
    const pull = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void refreshCatalog().catch(() => undefined)
    }
    void refreshCatalog().catch(() => undefined)
    const onFocus = () => pull()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refreshCatalog])

  const [itemAdded, setItemAdded] = useState<string | null>(null)
  /** Foto nota penjualan (mode kasir) — bukan nota belanja/kulakan. */
  const [scanOpen, setScanOpen] = useState(false)

  // Trigger highlight when a line is added
  useEffect(() => {
    if (itemAdded) {
      setTimeout(() => setItemAdded(null), 1800)
    }
  }, [itemAdded])

  const triggerItemHighlight = (key: string) => {
    setItemAdded(key)
  }

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    const active = products.filter((product) => product.archived !== true)
    const list = search
      ? active.filter((product) => {
          const candidates = [product.name, product.size ?? "", ...product.aliases]
            .filter(Boolean)
            .map((value) => value.toLowerCase())
          return candidates.some((candidate) => candidate.includes(search))
        })
      : active
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [products, query])

  const split = useMemo(() => splitCheckout(lines), [lines])
  const hasDebt = split.debt.length > 0

  const addProductToCart = (product: Product) => {
    triggerItemHighlight(product.id)
    setLines((current) => addLine(current, product))
    setError("")
    setSaved(null)
  }

  const addConsignmentToCart = (row: Consignment) => {
    const remaining = Math.max(0, row.qty - row.soldQty)
    if (remaining <= 0) return
    triggerItemHighlight(row.id)
    setLines((current) =>
      addConsignmentLine(current, {
        id: row.id,
        depositor: row.depositor,
        productName: row.productName,
        unit: row.unit,
        sellPrice: row.sellPrice,
        commissionPct: row.commissionPct,
        remaining,
      }),
    )
    setError("")
    setSaved(null)
  }

  const visibleConsignments = useMemo(
    () =>
      consignments
        .filter((row) => row.status === "active" && Math.max(0, row.qty - row.soldQty) > 0)
        .sort((a, b) => a.productName.localeCompare(b.productName)),
    [consignments],
  )

  const handleSave = async () => {
    setError("")
    setSaved(null)
    // Harga wajib berisi: transaksi Rp0 damaging pembukuan tanpa warning.
    const invalid = lines.find((line) => !(line.unitPrice > 0))
    if (invalid) {
      setError(`Harga ${invalid.name} belum diisi. Isi harga jualnya dulu.`)
      return
    }
    setBusy(true)
    try {
      await saveCheckout(split.sale, split.debt, debtor, split.consignment)
      setSaved({
        sale: split.sale.length,
        debt: split.debt.length,
        saleTotal: split.saleTotal,
        debtTotal: split.debtTotal,
        consignment: split.consignment.length,
      })
      setLines([])
      setDebtor("")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan transaksi.")
    } finally {
      setBusy(false)
    }
  }

  const handleAddNewItem = async () => {
    const name = newItem.name.trim()
    const price = Number(newItem.price.replace(/[^\d]/g, "")) || 0
    if (!name) {
      setError("Nama barang wajib diisi.")
      return
    }
    if (price <= 0) {
      setError("Harga jual harus lebih dari nol.")
      return
    }
    setBusy(true)
    try {
      const product = await addProduct({
        name,
        unit: "pcs",
        stock: Number(newItem.stock.replace(/[^\d]/g, "")) || 0,
        min_stock: 0,
        buy_price: 0,
        sell_price: price,
        aliases: [],
      })
      setLines((current) => addLine(current, product))
      setNewItem({ name: "", price: "", stock: "10" })
      setNewItemOpen(false)
      setError("")
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Gagal menambah barang.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cashier-page">
      <section className="page-title">
        <div>
          <span className="date-label">KASIR WARUNG</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🧾
            </span>{" "}
            Kasir
          </h1>
          <p>
            Pilih barang warung atau buka tab titipan. Titipan tidak mengurangi stok sendiri; hanya
            komisinya yang masuk laba.
          </p>
        </div>
        <div className="page-actions">
          <button className="secondary-action" onClick={() => setScanOpen(true)}>
            <Icon name="scan" size={18} /> Foto nota penjualan
          </button>
          <button className="secondary-action" onClick={onVoice}>
            <Icon name="mic" size={18} /> Catat lewat suara
          </button>
        </div>
      </section>

      <div className="cashier-layout">
        <section className="cashier-catalog">
          <div className="cashier-tabs" role="tablist" aria-label="Jenis barang">
            <button
              role="tab"
              aria-selected={catalogTab === "warung"}
              className={catalogTab === "warung" ? "active" : ""}
              onClick={() => setCatalogTab("warung")}
            >
              <Icon name="box" size={15} /> Barang Warung
            </button>
            <button
              role="tab"
              aria-selected={catalogTab === "titipan"}
              className={catalogTab === "titipan" ? "active" : ""}
              onClick={() => setCatalogTab("titipan")}
            >
              <Icon name="spark" size={15} /> Barang Titipan
              {visibleConsignments.length > 0 && <em>{visibleConsignments.length}</em>}
            </button>
          </div>

          <div className="cashier-search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={catalogTab === "warung" ? "Cari barang..." : "Cari barang titipan..."}
              aria-label="Cari barang"
            />
          </div>

          <div className={`cashier-panel ${catalogTab === "warung" ? "active" : ""}`} role="tabpanel" hidden={catalogTab !== "warung"}>
            {visible.length === 0 ? (
              <p className="cashier-empty">Barang tidak ditemukan. Tambah barang baru di bawah.</p>
            ) : (
              <div className="cashier-grid">
                {visible.map((product) => (
                  <button
                    key={product.id}
                    className="cashier-tile"
                    onClick={() => addProductToCart(product)}
                    disabled={product.stock <= 0}
                  >
                    <strong>{productLabel(product)}</strong>
                    <span className="cashier-price">{rupiah(product.sell_price)}</span>
                    <small className={product.stock <= 0 ? "stock-out" : ""}>
                      {product.stock <= 0
                        ? "Stok habis"
                        : `${numberID(product.stock)} ${product.unit} siap`}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`cashier-panel ${catalogTab === "titipan" ? "active" : ""}`} role="tabpanel" hidden={catalogTab !== "titipan"}>
            <div className="cashier-grid">
              {visibleConsignments.length === 0 ? (
                <p className="cashier-empty">
                  Belum ada barang titipan aktif. Tambah dulu lewat menu Titip Jual.
                </p>
              ) : (
                visibleConsignments
                  .filter((row) => {
                    const q = query.trim().toLowerCase()
                    return (
                      !q ||
                      [row.productName, row.depositor, row.unit]
                        .join(" ")
                        .toLowerCase()
                        .includes(q)
                    )
                  })
                  .map((row) => {
                    const remaining = Math.max(0, row.qty - row.soldQty)
                    return (
                      <button
                        key={row.id}
                        className="cashier-tile cashier-tile-titip"
                        onClick={() => addConsignmentToCart(row)}
                        aria-label={`Tambah ${row.productName} barang titipan milik ${row.depositor}`}
                      >
                        <span className="titip-badge">TITIPAN</span>
                        <strong>{row.productName}</strong>
                        <span className="cashier-price">{rupiah(row.sellPrice)}</span>
                        <small>
                          {numberID(remaining)} {row.unit} sisa · dari {row.depositor} · komisi{" "}
                          {numberID(row.commissionPct)}%
                        </small>
                      </button>
                    )
                  })
              )}
            </div>
          </div>

          {newItemOpen ? (
            <div className="cashier-new-item">
              <label>
                Nama barang
                <input
                  value={newItem.name}
                  onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                  placeholder="Contoh: Pisang"
                  autoFocus
                />
              </label>
              <label>
                Harga jual
                <input
                  inputMode="numeric"
                  value={newItem.price}
                  onChange={(event) => setNewItem({ ...newItem, price: event.target.value })}
                  placeholder="17000"
                />
              </label>
              <label>
                Stok awal (perkiraan)
                <input
                  inputMode="numeric"
                  value={newItem.stock}
                  onChange={(event) => setNewItem({ ...newItem, stock: event.target.value })}
                  placeholder="10"
                />
              </label>
              <div className="cashier-new-actions">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setNewItemOpen(false)
                    setError("")
                  }}
                >
                  Batal
                </button>
                <button
                  className="primary-action"
                  onClick={() => void handleAddNewItem()}
                  disabled={busy}
                >
                  <Icon name="plus" size={16} /> Masukkan
                </button>
              </div>
            </div>
          ) : (
            <button className="secondary-action full" onClick={() => setNewItemOpen(true)}>
              <Icon name="plus" size={16} /> Barang belum ada di daftar
            </button>
          )}
        </section>

        <aside className="cashier-cart">
          <div className="cashier-cart-head">
            <h2>Keranjang</h2>
            <span>{lines.length} barang</span>
          </div>

          {lines.length === 0 ? (
            <p className="cashier-empty">
              Belum ada barang. Ketuk barang di sebelah untuk mulai mencatat.
            </p>
          ) : (
            <ul className="cart-list">
              {lines.map((line) => {
                const isTitip = Boolean(line.consignmentId)
                return (
                <li key={line.key} className={`cart-line ${line.deferred ? "deferred" : ""} ${isTitip ? "cart-line-titip" : ""}`}>
                  <div className="cart-line-head">
                    <strong>
                      {isTitip && <span className="titip-badge">TITIPAN</span>} {line.name}
                    </strong>
                    <button
                      className="cart-remove"
                      onClick={() => setLines((current) => removeLine(current, line.key))}
                      aria-label={`Hapus ${line.name}`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="cart-line-body">
                    <div className="qty-stepper">
                      <button
                        onClick={() => setLines((current) => changeQty(current, line.key, -1))}
                        aria-label={`Kurangi ${line.name}`}
                      >
                        −
                      </button>
                      <span>{numberID(line.qty)}</span>
                      <button
                        onClick={() => setLines((current) => changeQty(current, line.key, 1))}
                        aria-label={`Tambah ${line.name}`}
                        disabled={line.maxQty !== undefined && line.qty >= line.maxQty}
                      >
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                    <label className="cart-price">
                      <span>Harga</span>
                      <input
                        inputMode="numeric"
                        value={line.unitPrice || ""}
                        placeholder="0"
                        onChange={(event) =>
                          setLines((current) =>
                            setLinePrice(
                              current,
                              line.key,
                              Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                            ),
                          )
                        }
                      />
                    </label>
                    <span className="cart-total">{rupiah(line.qty * line.unitPrice)}</span>
                  </div>
                  {isTitip ? (
                    <small className="cart-titip-note">
                      Milik {line.depositor ?? "penitip"} — komisi{" "}
                      {numberID(line.commissionPct ?? 0)}% masuk laba; bagian pemilik bukan laba.
                    </small>
                  ) : (
                  <button
                    className={line.deferred ? "cart-defer active" : "cart-defer"}
                    onClick={() =>
                      setLines((current) => setLineDeferred(current, line.key, !line.deferred))
                    }
                  >
                    {line.deferred ? (
                      <>
                        <Icon name="check" size={13} /> Disimpan dulu (utang)
                      </>
                    ) : (
                      "Simpen dulu (ngutang)"
                    )}
                  </button>
                  )}
                </li>
                )
              })}
            </ul>
          )}

          {hasDebt && (
            <CustomerNameField
              id="kasir-debtor"
              label="Nama yang menyimpan"
              value={debtor}
              onChange={setDebtor}
              placeholder="Contoh: Pak Yono"
            />
          )}

          {saved && (
            <div className="cashier-saved">
              <Icon name="check" size={16} />
              <span>
                {saved.sale > 0 && `${saved.sale} barang dibayar ${rupiah(saved.saleTotal)}. `}
                {saved.debt > 0 &&
                  `${saved.debt} barang dicatat di buku utang ${rupiah(saved.debtTotal)}. `}
                {saved.consignment > 0 &&
                  `${saved.consignment} barang titipan tercatat; hanya komisinya masuk laba warung.`}
              </span>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="cashier-totals">
            <div>
              <span>Dibayar sekarang</span>
              <strong>{rupiah(split.saleTotal)}</strong>
            </div>
            <div>
              <span>Disimpan dulu</span>
              <strong>{rupiah(split.debtTotal)}</strong>
            </div>
            {split.consignment.length > 0 && (
              <div className="cashier-total-titip">
                <span>Barang titipan (omzet)</span>
                <strong>{rupiah(split.consignmentTotal)}</strong>
              </div>
            )}
            <div className="cashier-total">
              <span>Total</span>
              <strong>{rupiah(cartTotal(lines))}</strong>
            </div>
          </div>

          <button
            className="primary-action full"
            onClick={() => void handleSave()}
            disabled={busy || lines.length === 0}
          >
            {busy
              ? "Menyimpan…"
              : hasDebt
                ? `Simpan — ${split.sale.length} dibayar, ${split.debt.length} ngutang${
                    split.consignment.length > 0 ? `, ${split.consignment.length} titipan` : ""
                  }`
                : `Simpan ${lines.length} barang${split.consignment.length > 0 ? ` (${split.consignment.length} titipan)` : ""}`}
            {!busy && <Icon name="check" size={16} />}
          </button>
        </aside>
      </div>

      {lines.length > 0 && (
        <button
          className="cashier-sticky-bar"
          onClick={() =>
            document.querySelector(".cashier-cart")?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <span>{lines.length} barang</span>
          <strong>{rupiah(cartTotal(lines))}</strong>
          <span>Lihat keranjang</span>
        </button>
      )}

      {scanOpen && <ReceiptModal mode="sale" onClose={() => setScanOpen(false)} />}
    </div>
  )
}
