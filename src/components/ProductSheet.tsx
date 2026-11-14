import { useEffect, useMemo, useState } from "react"
import { Modal } from "./Modal"
import { Icon } from "./Icon"
import { useWarung } from "../lib/store"
import { numberID, productLabel, rupiah, shortDate, timeWIB } from "../lib/format"
import type { Product, Transaction } from "../lib/types"

function ledgerLabel(transaction: Transaction) {
  if (transaction.type === "sale") return { text: "Keluar", tone: "out" }
  if (transaction.type === "purchase") return { text: "Masuk", tone: "in" }
  return { text: "Penyesuaian", tone: "adjust" }
}

/**
 * Kartu stok satu barang: riwayat masuk/keluar, batas stok minimum, hitung
 * ulang fisik (opname), dan restok cepat.
 */
export function ProductSheet({
  product,
  onClose,
}: {
  product: Product
  onClose: () => void
}) {
  const { stats, transactions, setMinStock, adjustStock, savePurchase, archiveProduct } =
    useWarung()
  const [minStock, setMinStockValue] = useState(String(product.min_stock))
  const [counted, setCounted] = useState(String(product.stock))
  const [restockQty, setRestockQty] = useState("")
  const [restockPrice, setRestockPrice] = useState(String(product.buy_price || ""))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const [confirmArchive, setConfirmArchive] = useState(false)
  const isArchived = product.archived === true

  // Field hitung fisik harus ikut stok terbaru: kalau baru restok, angka
  // lamanya akan membatalkan restok saat tombol "Sesuaikan stok" ditekan.
  useEffect(() => {
    setCounted(String(product.stock))
  }, [product.stock])

  const ledger = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.product_id === product.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20),
    [transactions, product.id],
  )

  const suggestion = stats.suggestions.find((item) => item.productId === product.id)
  const soldLast7 = stats.topProducts.find((item) => item.productId === product.id)

  const handleArchive = async () => {
    setBusy(true)
    setError("")
    try {
      await archiveProduct(product.id, !isArchived)
      onClose()
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Gagal mengubah status barang.",
      )
      setBusy(false)
      setConfirmArchive(false)
    }
  }

  const handleSaveMinStock = async () => {
    setBusy(true)
    setError("")
    try {
      await setMinStock(product.id, Number(minStock.replace(/[^\d]/g, "")) || 0)
      setSaved("Batas stok minimum disimpan.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan batas stok.")
    } finally {
      setBusy(false)
    }
  }

  const handleCount = async () => {
    // Field kosong berarti belum diisi — bukan berarti stoknya nol.
    if (counted.trim() === "") {
      setError("Isi dulu hasil hitung fisiknya.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await adjustStock(product.id, Number(counted.replace(/[^\d]/g, "")) || 0)
      setSaved("Stok disesuaikan dengan hasil hitungan.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyesuaikan stok.")
    } finally {
      setBusy(false)
    }
  }

  const handleRestock = async () => {
    const qty = Number(restockQty.replace(/[^\d]/g, "")) || 0
    if (qty <= 0) {
      setError("Jumlah kulakan harus lebih dari nol.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await savePurchase([
        {
          key: `restock-${product.id}`,
          productId: product.id,
          name: product.name,
          qty,
          unit: product.unit,
          unitPrice: Number(restockPrice.replace(/[^\d]/g, "")) || 0,
        },
      ])
      setRestockQty("")
      setSaved(`${qty} ${product.unit} ${productLabel(product)} masuk ke stok.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menambah stok.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label={`Kartu stok ${productLabel(product)}`} onClose={onClose}>
      <span className="modal-kicker">KARTU STOK</span>
      <h2>{productLabel(product)}</h2>
      <p>
        Stok sekarang <strong>{numberID(product.stock)} {product.unit}</strong> · jual{" "}
        {rupiah(product.sell_price)}/{product.unit} · modal {rupiah(product.buy_price)}/{product.unit}
      </p>

      {suggestion && (
        <div className="price-hint">
          <span>
            Saran kulakan {numberID(suggestion.suggestedQty)} {suggestion.unit} · sekitar{" "}
            {rupiah(suggestion.estimatedCost)}.
          </span>
          <span>{suggestion.reason}</span>
        </div>
      )}

      <div className="stock-sheet-grid">
        <section className="stock-sheet-block">
          <h3>Batas stok minimum</h3>
          <label className="stock-field">
            <span>Minimum {product.unit}</span>
            <input
              inputMode="numeric"
              value={minStock}
              onChange={(event) => setMinStockValue(event.target.value)}
            />
          </label>
          <button className="secondary-action" onClick={() => void handleSaveMinStock()} disabled={busy}>
            Simpan batas
          </button>
        </section>

        <section className="stock-sheet-block">
          <h3>Hitung ulang (opname)</h3>
          <label className="stock-field">
            <span>Hasil hitung fisik</span>
            <input
              inputMode="numeric"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
            />
          </label>
          <button className="secondary-action" onClick={() => void handleCount()} disabled={busy}>
            Sesuaikan stok
          </button>
        </section>
      </div>

      <section className="stock-sheet-block">
        <h3>Restok cepat</h3>
        <div className="stock-sheet-row">
          <label className="stock-field">
            <span>Jumlah masuk</span>
            <input
              inputMode="numeric"
              value={restockQty}
              onChange={(event) => setRestockQty(event.target.value)}
              placeholder="Contoh: 24"
            />
          </label>
          <label className="stock-field">
            <span>Harga modal</span>
            <input
              inputMode="numeric"
              value={restockPrice}
              onChange={(event) => setRestockPrice(event.target.value)}
              placeholder="25000"
            />
          </label>
          <button className="primary-action" onClick={() => void handleRestock()} disabled={busy}>
            <Icon name="plus" size={16} /> Masukkan
          </button>
        </div>
      </section>

      {saved && <div className="cashier-saved">{saved}</div>}
      {error && <div className="form-error">{error}</div>}

      <section className="stock-ledger">
        <h3>Kartu stok</h3>
        {ledger.length === 0 ? (
          <p className="cashier-empty">Belum ada riwayat barang ini.</p>
        ) : (
          <ul>
            {ledger.map((transaction) => {
              const label = ledgerLabel(transaction)
              const qty =
                transaction.type === "sale" || transaction.qty < 0
                  ? -Math.abs(transaction.qty)
                  : Math.abs(transaction.qty)
              return (
                <li key={transaction.id}>
                  <span className={`ledger-badge ${label.tone}`}>{label.text}</span>
                  <strong>
                    {qty > 0 ? "+" : ""}
                    {numberID(qty, 2)} {product.unit}
                  </strong>
                  <span className="ledger-date">
                    {shortDate(transaction.created_at)} {timeWIB(transaction.created_at)}
                  </span>
                  <span className="ledger-price">{rupiah(transaction.unit_price)}</span>
                </li>
              )
            })}
          </ul>
        )}
        {soldLast7 && (
          <small className="ask-note">
            7 hari terakhir terjual {numberID(soldLast7.qty)} {product.unit} dengan omzet{" "}
            {rupiah(soldLast7.revenue)}.
          </small>
        )}
      </section>

      <section className={`stock-sheet-danger ${isArchived ? "is-archived" : ""}`}>
        <h3>{isArchived ? "Barang ini tidak dijual" : "Tidak dijual lagi?"}</h3>
        <p>
          {isArchived
            ? "Barang disembunyikan dari Kasir, Stok Barang, saran restok, dan suara. Riwayat transaksinya tersimpan."
            : "Arsipkan: barang hilang dari Kasir, Stok Barang, saran restok, dan suara, tapi riwayat transaksinya tetap tersimpan."}
        </p>
        {!isArchived && product.stock > 0 && (
          <small className="ask-note">
            Masih ada {numberID(product.stock)} {product.unit} di stok — stoknya tidak ikut
            dihapus; hanya barangnya yang diarsipkan.
          </small>
        )}
        {!confirmArchive ? (
          <button className="danger-action" onClick={() => setConfirmArchive(true)} disabled={busy}>
            {isArchived ? "Aktifkan kembali" : "Arsipkan barang ini"}
          </button>
        ) : (
          <div className="danger-confirm">
            <p>
              {isArchived ? (
                <>
                  Tampilkan lagi <strong>{productLabel(product)}</strong> di kasir dan stok?
                </>
              ) : (
                <>
                  Arsipkan <strong>{productLabel(product)}</strong>? Anda bisa mengaktifkannya kembali dari
                  tab Arsip.
                </>
              )}
            </p>
            <div className="modal-actions">
              <button
                className="secondary-action"
                onClick={() => setConfirmArchive(false)}
                disabled={busy}
              >
                Batal
              </button>
              <button className="danger-action" onClick={() => void handleArchive()} disabled={busy}>
                {busy ? "Menyimpan…" : isArchived ? "Ya, aktifkan" : "Ya, arsipkan"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="modal-actions">
        <button className="primary-action full" onClick={onClose}>
          Selesai
        </button>
      </div>
    </Modal>
  )
}
