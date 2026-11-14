import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { useWarung } from "../lib/store"
import {
  buildPayoutText,
  computeSale,
  consignmentHint,
  consignmentStats,
  potentialValue,
  remainingQty,
} from "../lib/consignment"
import { numberID, rupiah } from "../lib/format"
import type { Consignment } from "../lib/types"

/**
 * Titip Jual (konsinyasi).
 *
 * Warung jadi etalase untuk barang milik orang lain. Yang dihitung bukan stok
 * warung, tapi komisi warung dan bagian yang harus dibayar ke pemilik barang.
 */
export function Consignments() {
  const { consignments, addConsignment, sellConsignment, closeConsignment } = useWarung()
  const [newOpen, setNewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [sellFor, setSellFor] = useState<Consignment | null>(null)
  const [sellQty, setSellQty] = useState("")
  const [form, setForm] = useState({
    depositor: "",
    productName: "",
    unit: "pcs",
    qty: "",
    buyPrice: "",
    sellPrice: "",
    commissionPct: "10",
  })

  const stats = useMemo(() => consignmentStats(consignments), [consignments])
  const active = consignments.filter((row) => row.status === "active")
  const selesai = consignments.filter((row) => row.status === "selesai")

  const handleAdd = async () => {
    setBusy(true)
    setError("")
    try {
      const depositor = form.depositor.trim()
      const productName = form.productName.trim()
      const qty = Number(form.qty.replace(/[^\d]/g, "")) || 0
      const buyPrice = Number(form.buyPrice.replace(/[^\d]/g, "")) || 0
      const sellPrice = Number(form.sellPrice.replace(/[^\d]/g, "")) || 0

      const validationError = !depositor
        ? "Nama penitip wajib diisi."
        : !productName
          ? "Nama barang wajib diisi."
          : qty <= 0
            ? "Jumlah barang titipan wajib diisi — kalau 0, tidak ada yang bisa dijual atau dilunasi."
            : buyPrice <= 0
              ? "Harga modal penitip wajib diisi — dipakai untuk menghitung bagian yang dibayar."
              : sellPrice <= 0
                ? "Harga jual wajib diisi — dipakai menghitung total penghasilan dari stok ini."
                : ""
      if (validationError) {
        setError(validationError)
        setBusy(false)
        return
      }

      await addConsignment({
        depositor,
        productName,
        unit: form.unit,
        qty,
        buyPrice,
        sellPrice,
        commissionPct: Math.min(
          100,
          Math.max(0, Number(form.commissionPct.replace(",", ".").replace(/[^\d.]/g, "")) || 0),
        ),
        note: null,
      })
      setForm({
        depositor: "",
        productName: "",
        unit: "pcs",
        qty: "",
        buyPrice: "",
        sellPrice: "",
        commissionPct: "10",
      })
      setNewOpen(false)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Gagal menambah titipan.")
    } finally {
      setBusy(false)
    }
  }

  const handleSell = async () => {
    if (!sellFor) return
    const qty = Number(sellQty.replace(/[^\d]/g, "")) || 0
    if (qty <= 0) {
      setError("Jumlah yang terjual harus lebih dari nol.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await sellConsignment(sellFor.id, qty)
      setSellFor(null)
      setSellQty("")
    } catch (sellError) {
      setError(sellError instanceof Error ? sellError.message : "Gagal mencatat penjualan.")
    } finally {
      setBusy(false)
    }
  }

  const copyPayout = async () => {
    try {
      await navigator.clipboard.writeText(buildPayoutText(consignments))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="consignments-page">
      <section className="page-title">
        <div>
          <span className="date-label">TITIP JUAL</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🤝
            </span>{" "}
            Barang titipan
          </h1>
          <p>
            Warung jadi etalase barang milik orang lain. Hitung komisi warung dan bagian yang harus
            dibayar ke pemilik barang.
          </p>
        </div>
        <div className="page-actions">
          <button className="secondary-action" onClick={() => void copyPayout()}>
            <Icon name={copied ? "check" : "receipt"} size={18} />
            {copied ? "Tersalin" : "Rincian pembayaran"}
          </button>
          <button className="primary-action" onClick={() => setNewOpen(true)}>
            <Icon name="plus" size={18} /> Tambah titipan
          </button>
        </div>
      </section>

      <section className="inventory-summary">
        <article>
          <span className="summary-icon green">
            <Icon name="box" />
          </span>
          <div>
            <small>Omzet titipan</small>
            <strong>{rupiah(stats.omzet)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon orange">
            <Icon name="spark" />
          </span>
          <div>
            <small>Komisi warung</small>
            <strong>{rupiah(stats.komisi)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon blue">
            <Icon name="receipt" />
          </span>
          <div>
            <small>Harus dibayar ke pemilik</small>
            <strong>{rupiah(stats.payable)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon purple">
            <Icon name="user" />
          </span>
          <div>
            <small>Sisa di rak</small>
            <strong>
              {stats.itemsRemaining} <em>barang</em>
            </strong>
          </div>
        </article>
      </section>

      {consignments.length > 0 && (
        <div className="consignments-potential" role="status">
          <span className="potential-icon"><Icon name="chart" size={20} /></span>
          <div>
            <small>Potensi omzet titipan</small>
            <strong>{rupiah(stats.potentialRevenue)}</strong>
            <span>
              Perkiraan omzet kotor jika semua barang terjual; laba warung hanya komisi, sisanya
              hak pemilik barang.
            </span>
          </div>
        </div>
      )}

      {consignments.length === 0 ? (
        <section className="empty-state">
          <Icon name="box" size={26} />
          <strong>Belum ada barang titipan</strong>
          <span>
            Warung sering dititipi barang tetangga. Catat di sini supaya komisi dan bagian pemilik
            barang tidak tertukar.
          </span>
        </section>
      ) : (
        <div className="consignments-list">
          {active.map((row) => {
            const remaining = remainingQty(row)
            const omzet = row.soldQty * row.sellPrice
            const komisi = Math.round(omzet * (row.commissionPct / 100))
            return (
              <article className="consignment-card" key={row.id}>
                <div className="consignment-head">
                  <div>
                    <strong>{row.productName}</strong>
                    <small>
                      dari {row.depositor} · {numberID(row.qty)} {row.unit} · komisi{" "}
                      {numberID(row.commissionPct)}%
                    </small>
                  </div>
                  <span className="consignment-sisa">
                    sisa {numberID(remaining)} {row.unit}
                  </span>
                </div>
                <div className="consignment-metrics">
                  <div>
                    <small>Terjual</small>
                    <strong>
                      {numberID(row.soldQty)} {row.unit}
                    </strong>
                  </div>
                  <div>
                    <small>Omzet</small>
                    <strong>{rupiah(omzet)}</strong>
                  </div>
                  <div>
                    <small>Komisi warung</small>
                    <strong>{rupiah(komisi)}</strong>
                  </div>
                  <div>
                    <small>Bagian pemilik</small>
                    <strong>{rupiah(omzet - komisi)}</strong>
                  </div>
                  <div>
                    <small>Potensi (sisa × harga jual)</small>
                    <strong>{rupiah(potentialValue(row))}</strong>
                  </div>
                </div>
                <p className="consignment-hint">{consignmentHint(row)}</p>
                <div className="consignment-actions">
                  <button
                    className="secondary-action"
                    onClick={() => {
                      setSellFor(row)
                      setSellQty("")
                      setError("")
                    }}
                    disabled={remaining <= 0}
                  >
                    <Icon name="plus" size={15} /> Catat yang terjual
                  </button>
                  <button
                    className="row-action"
                    onClick={() => void closeConsignment(row.id)}
                    disabled={busy}
                  >
                    <Icon name="check" size={14} /> Selesai &amp; bayar
                  </button>
                </div>
              </article>
            )
          })}

          {selesai.length > 0 && (
            <section className="consignment-done">
              <h2>Sudah selesai</h2>
              {selesai.map((row) => (
                <p key={row.id}>
                  {row.productName} dari {row.depositor} — {numberID(row.soldQty)} {row.unit} laku,
                  bagian pemilik{" "}
                  {rupiah(
                    row.soldQty * row.sellPrice -
                      Math.round(row.soldQty * row.sellPrice * (row.commissionPct / 100)),
                  )}
                  .
                </p>
              ))}
            </section>
          )}
        </div>
      )}

      {newOpen && (
        <Modal label="Tambah barang titipan" onClose={() => setNewOpen(false)}>
          <span className="modal-kicker">BARANG TITIPAN</span>
          <h2>Siapa yang menitipkan?</h2>
          <p>
            Barang titipan tidak masuk stok warung. Yang dicatat: komisi warung dan bagian yang
            harus dibayar ke pemilik barang. <strong>Kedua harga wajib diisi</strong> —
            harga modal penitip (untuk pelunasan) dan harga jual warung (dipakai menghitung
            omzet; laba warung hanya komisinya).
          </p>
          <div className="customer-form">
            <label>
              Nama pemilik barang *
              <input
                required
                value={form.depositor}
                onChange={(event) => setForm({ ...form, depositor: event.target.value })}
                placeholder="Contoh: Pak Hendra"
              />
            </label>
            <label>
              Nama barang *
              <input
                required
                value={form.productName}
                onChange={(event) => setForm({ ...form, productName: event.target.value })}
                placeholder="Contoh: Keripik Singkong"
              />
            </label>
            <label>
              Satuan
              <input
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                placeholder="pcs"
              />
            </label>
            <label>
              Jumlah titipan *
              <input
                required
                inputMode="numeric"
                value={form.qty}
                onChange={(event) => setForm({ ...form, qty: event.target.value })}
                placeholder="40"
              />
            </label>
            <label>
              Harga modal penitip *
              <input
                required
                inputMode="numeric"
                value={form.buyPrice}
                onChange={(event) => setForm({ ...form, buyPrice: event.target.value })}
                placeholder="8000"
              />
            </label>
            <label>
              Harga jual (untuk konsumen) *
              <input
                required
                inputMode="numeric"
                value={form.sellPrice}
                onChange={(event) => setForm({ ...form, sellPrice: event.target.value })}
                placeholder="10000"
              />
            </label>
            <label>
              Komisi warung (%)
              <input
                inputMode="numeric"
                value={form.commissionPct}
                onChange={(event) => setForm({ ...form, commissionPct: event.target.value })}
                placeholder="10"
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-action" onClick={() => setNewOpen(false)}>
              Batal
            </button>
            <button className="primary-action" onClick={() => void handleAdd()} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan titipan"}
            </button>
          </div>
        </Modal>
      )}

      {sellFor && (
        <Modal
          label={`Catat yang terjual: ${sellFor.productName}`}
          onClose={() => setSellFor(null)}
        >
          <span className="modal-kicker">PENJUALAN TITIPAN</span>
          <h2>Berapa yang terjual?</h2>
          <p>
            Sisa titipan {numberID(remainingQty(sellFor))} {sellFor.unit} dari {sellFor.depositor}.
          </p>
          <div className="customer-form">
            <label>
              Jumlah terjual
              <input
                inputMode="numeric"
                value={sellQty}
                onChange={(event) => setSellQty(event.target.value)}
                placeholder="Contoh: 5"
                autoFocus
              />
            </label>
          </div>
          {sellQty !== "" &&
            (() => {
              const sale = computeSale(sellFor, Number(sellQty.replace(/[^\d]/g, "")) || 0)
              return (
                <div className="consignment-preview">
                  <p>
                    Omzet {rupiah(sale.omzet)} · komisi warung {rupiah(sale.komisi)} · bagian
                    pemilik {rupiah(sale.bagianPemilik)}
                  </p>
                </div>
              )
            })()}
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-action" onClick={() => setSellFor(null)}>
              Batal
            </button>
            <button className="primary-action" onClick={() => void handleSell()} disabled={busy}>
              {busy ? "Menyimpan…" : "Catat yang terjual"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
