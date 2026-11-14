import { useMemo, useState } from "react"
import { Icon } from "./Icon"
import { Modal } from "./Modal"
import { useWarung } from "../lib/store"
import { numberID, productLabel, rupiah } from "../lib/format"
import type { Product } from "../lib/types"

/**
 * Tambah stok manual untuk barang yang sudah ada di inventori.
 *
 * Pedagang memilih barang dari daftar stok, mengisi jumlah masuk dan
 * total biaya belanjanya (mis. 10 botol air mineral Rp120.000). Hasilnya
 * disimpan sebagai transaksi pembelian lewat `savePurchase`, jadi stok naik,
 * harga modal ikut ter-update, dan biayanya muncul di Beranda sebagai
 * pengeluaran belanja hari itu.
 */
export function StockInModal({
  defaultProductId,
  onClose,
}: {
  defaultProductId?: string
  onClose: () => void
}) {
  const { products, stats, savePurchase } = useWarung()
  const [productId, setProductId] = useState(
    defaultProductId ?? products[0]?.id ?? "",
  )
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState("")
  const [error, setError] = useState("")

  const product: Product | undefined = useMemo(
    () => products.find((item) => item.id === productId),
    [products, productId],
  )
  const suggestion = product
    ? stats.suggestions.find((item) => item.productId === product.id)
    : undefined

  // Angka bersih: "12.000" dibaca 12000, bukan 12.
  const parsedQty = Number(qty.replace(/[^\d.]/g, "")) || 0
  const parsedCost = Number(cost.replace(/[^\d.]/g, "")) || 0
  const unitPrice = parsedQty > 0 ? Math.round(parsedCost / parsedQty) : 0
  const nextStock = product ? product.stock + parsedQty : 0

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!product) {
      setError("Pilih dulu barangnya dari daftar stok.")
      return
    }
    if (!(parsedQty > 0)) {
      setError("Jumlah masuk harus lebih dari nol.")
      return
    }
    if (parsedCost < 0) {
      setError("Biaya belanja tidak boleh negatif.")
      return
    }

    setBusy(true)
    setError("")
    try {
      await savePurchase([
        {
          key: `manual-${product.id}`,
          productId: product.id,
          name: product.name,
          qty: parsedQty,
          unit: product.unit,
          unitPrice,
        },
      ])
      setSaved(
        `${numberID(parsedQty)} ${product.unit} ${productLabel(product)} masuk ke stok. ` +
          `Biaya ${rupiah(unitPrice * parsedQty)} tercatat sebagai pengeluaran hari ini di Beranda.`,
      )
      setQty("")
      setCost("")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menambah stok.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label="Tambah stok manual" onClose={onClose}>
      <span className="modal-kicker">TAMBAH STOK</span>
      <h2>Manual stock-in</h2>
      <p>
        Pilih barang yang sudah ada di stok, isi jumlah masuk dan total biayanya — contoh: 10 botol
        air mineral dengan biaya 120000.
      </p>

      {products.filter((product) => product.archived !== true).length === 0 ? (
        <div className="inline-empty">
          <Icon name="box" size={22} />
          <strong>Belum ada barang di stok</strong>
          <span>Tambahkan barang lewat “Tambah barang” dulu, baru bisa kulakan manual.</span>
        </div>
      ) : (
        <form className="product-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Barang di stok
            <select
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value)
                setSaved("")
                setError("")
              }}
            >
              {products
                .filter((product) => product.archived !== true)
                .map((item) => (
                <option key={item.id} value={item.id}>
                  {productLabel(item)} · stok {numberID(item.stock)} {item.unit} · modal{" "}
                  {rupiah(item.buy_price)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label>
              Jumlah masuk
              <input
                inputMode="decimal"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                placeholder={`Contoh: 10 ${product?.unit ?? "pcs"}`}
              />
            </label>
            <label>
              Biaya belanja (Rp)
              <input
                inputMode="numeric"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="Contoh: 120000"
              />
            </label>
          </div>

          {product && parsedQty > 0 && (
            <div className="stock-in-preview">
              <span>
                ≈ <b>{rupiah(unitPrice)}</b> per {product.unit}
              </span>
              <span>
                Biaya total <b>{rupiah(unitPrice * parsedQty)}</b>
              </span>
              <span>
                Stok jadi <b>{numberID(nextStock)}</b> {product.unit}
              </span>
            </div>
          )}
          {suggestion && (
            <small className="ask-note">
              Saran kulakan {numberID(suggestion.suggestedQty)} {suggestion.unit} · perkiraan{" "}
              {rupiah(suggestion.estimatedCost)}. {suggestion.reason}
            </small>
          )}
          {saved && <div className="cashier-saved">{saved}</div>}
          {error && <div className="form-error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? "Menyimpan…" : "Masukkan stok"}
            {!busy && <Icon name="arrow" size={17} />}
          </button>
        </form>
      )}

      <div className="modal-actions">
        <button className="primary-action full" onClick={onClose}>
          Selesai
        </button>
      </div>
    </Modal>
  )
}
