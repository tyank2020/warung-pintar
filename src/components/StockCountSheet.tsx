import { useMemo, useState } from "react"
import { Modal } from "./Modal"
import { Icon } from "./Icon"
import { useWarung } from "../lib/store"
import { findNotesWithoutStock, findStockDiscrepancies } from "../lib/reconcile"
import { numberID, productLabel } from "../lib/format"

/**
 * Stok opname: hitung fisik seluruh barang, lalu catat selisihnya.
 * Selisih disimpan sebagai transaksi penyesuaian, jadi kartu stok tetap bisa
 * menelusuri barang hilang.
 */
export function StockCountSheet({ onClose }: { onClose: () => void }) {
  const { products, adjustStock, transactions, notes } = useWarung()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  // Temuan yang muncul setelah opname: selisih fisik vs catatan, plus nota
  // yang tercatat tapi barangnya tidak masuk stok.
  const findings = useMemo(
    () => [
      ...findStockDiscrepancies(products, transactions, notes),
      ...findNotesWithoutStock(products, transactions, notes),
    ],
    [notes, products, transactions],
  )

  const differences = useMemo(
    () =>
      products
        .map((product) => {
          const raw = counts[product.id]
          if (raw === undefined || raw === "") return null
          const counted = Number(raw.replace(/[^\d]/g, "")) || 0
          const delta = counted - product.stock
          return delta === 0 ? null : { product, counted, delta }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [counts, products],
  )

  const handleSave = async () => {
    setBusy(true)
    setError("")
    try {
      for (const difference of differences) {
        await adjustStock(difference.product.id, difference.counted)
      }
      setSaved(
        differences.length === 0
          ? "Tidak ada selisih — stok di gudang sudah sama dengan catatan."
          : `${differences.length} barang disesuaikan dengan hasil hitungan.`,
      )
      setCounts({})
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan hasil hitungan.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label="Stok opname" onClose={onClose}>
      <span className="modal-kicker">STOK OPNAME</span>
      <h2>Hitung stok fisik</h2>
      <p>
        Masukkan jumlah barang yang benar-benar ada di gudang. Selisihnya dicatat sebagai
        penyesuaian supaya bisa ditelusuri.
      </p>

      <ul className="count-list">
        {products.map((product) => {
          const value = counts[product.id] ?? ""
          const delta = value === "" ? 0 : (Number(value.replace(/[^\d]/g, "")) || 0) - product.stock
          return (
            <li key={product.id}>
              <div>
                <strong>{productLabel(product)}</strong>
                <small>
                  Catatan {numberID(product.stock)} {product.unit}
                </small>
              </div>
              <input
                inputMode="numeric"
                value={value}
                placeholder={String(product.stock)}
                aria-label={`Hasil hitung ${productLabel(product)}`}
                onChange={(event) =>
                  setCounts((current) => ({ ...current, [product.id]: event.target.value }))
                }
              />
              {delta !== 0 && (
                <span className={delta < 0 ? "count-delta minus" : "count-delta plus"}>
                  {delta > 0 ? "+" : ""}
                  {numberID(delta, 2)}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {saved && (
        <div className="cashier-saved">
          <Icon name="check" size={16} />
          <span>{saved}</span>
        </div>
      )}
      {saved && findings.length > 0 && (
        <div className="count-findings">
          <strong>{findings.length} temuan untuk diperiksa di halaman Cek Stok</strong>
          {findings.slice(0, 3).map((finding) => (
            <p key={finding.id}>{finding.message}</p>
          ))}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions">
        <button className="secondary-action" onClick={onClose}>
          Tutup
        </button>
        <button
          className="primary-action"
          onClick={() => void handleSave()}
          disabled={busy || differences.length === 0}
        >
          {busy ? "Menyimpan…" : `Simpan ${differences.length} selisih`}
        </button>
      </div>
    </Modal>
  )
}
