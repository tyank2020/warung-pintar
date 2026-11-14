import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { useWarung } from "../lib/store"
import { buildDailyBook, buildSummaryText } from "../lib/closing"
import {
  buildCashClosing,
  cashClosingVerdict,
  expectedCash,
  readCashClosings,
  summarizeClosings,
  writeCashClosings,
} from "../lib/cashClosing"
import { numberID, rupiah, shortDate } from "../lib/format"

/**
 * Tutup buku hari ini — ritual harian pemilik warung.
 *
 * Semua angka dihitung dari catatan sendiri. Ringkasannya bisa disalin lalu
 * dikirim ke supplier (buat order) atau ke Piutang (tagih utang). */
export function Closing() {
  const { products, transactions, debts, stats } = useWarung()
  const [copied, setCopied] = useState(false)
  const [cashInput, setCashInput] = useState("")
  const [cashClosing, setCashClosing] = useState(() => readCashClosings()[0] ?? null)
  const [closings, setClosings] = useState(() => readCashClosings())

  const book = useMemo(
    () => buildDailyBook(products, transactions, debts, stats),
    [debts, products, stats, transactions],
  )

  // Uang yang seharusnya ada di laci: penjualan hari ini + utang yang
  // dibayar hari ini (diasumsikan tunai).
  const settledToday = useMemo(() => {
    const today = new Date().toDateString()
    return debts
      .filter((debt) => debt.settled_at && new Date(debt.settled_at).toDateString() === today)
      .reduce((sum, debt) => sum + debt.amount, 0)
  }, [debts])

  const expected = expectedCash(book.sales, settledToday)
  const cashSummary = useMemo(() => summarizeClosings(closings), [closings])

  const saveCash = () => {
    const counted = Number(cashInput.replace(/[^\d]/g, "")) || 0
    const closing = buildCashClosing(counted, expected)
    const next = [closing, ...closings].slice(0, 30)
    setCashClosing(closing)
    setClosings(next)
    writeCashClosings(next)
    setCashInput("")
  }

  const copySummary = async () => {
    const text = buildSummaryText(book)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="closing-page">
      <section className="page-title">
        <div>
          <span className="date-label">RITUAL HARIAN</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🌙
            </span>{" "}
            Tutup buku
          </h1>
          <p>Ringkasan hari ini: uang masuk, utang yang jalan, dan yang harus dibeli besok.</p>
        </div>
        <div className="page-actions">
          <button className="secondary-action" onClick={() => void copySummary()}>
            <Icon name={copied ? "check" : "receipt"} size={18} />
            {copied ? "Tersalin" : "Salin ringkasan"}
          </button>
        </div>
      </section>

      <section className="closing-hero">
        <span className="closing-date">{book.label}</span>
        <h2>{book.headline}</h2>
        <div className="closing-metrics">
          <div>
            <small>Penjualan</small>
            <strong>{rupiah(book.sales)}</strong>
          </div>
          <div>
            <small>Laba kotor</small>
            <strong>{rupiah(book.grossProfit)}</strong>
            {stats.todayConsignmentCommission > 0 && (
              <small>Termasuk komisi titipan {rupiah(stats.todayConsignmentCommission)}</small>
            )}
          </div>
          <div>
            <small>Transaksi</small>
            <strong>{book.transactionCount}</strong>
          </div>
          <div>
            <small>Barang terjual</small>
            <strong>{book.itemsSold}</strong>
          </div>
        </div>
      </section>

      <div className="closing-grid">
        <section className="closing-block">
          <div className="closing-block-head">
            <h2>Cek laci uang</h2>
            <span>{rupiah(expected)}</span>
          </div>
          <p className="cash-expected">
            Seharusnya ada di laci <strong>{rupiah(expected)}</strong> dari penjualan hari ini
            {settledToday > 0 ? ` + utang yang dibayar ${rupiah(settledToday)}` : ""}.
          </p>
          <div className="cash-input">
            <input
              inputMode="numeric"
              value={cashInput}
              onChange={(event) => setCashInput(event.target.value)}
              placeholder="Uang yang dihitung di laci"
              aria-label="Uang fisik di laci"
            />
            <button
              className="primary-action"
              onClick={saveCash}
              disabled={cashInput.trim() === ""}
            >
              <Icon name="check" size={16} /> Hitung
            </button>
          </div>

          {cashClosing && (
            <div className={`cash-result ${cashClosingVerdict(cashClosing).tone}`}>
              <strong>{cashClosingVerdict(cashClosing).label}</strong>
              <small>
                Dihitung {rupiah(cashClosing.counted)} · catatan {rupiah(cashClosing.expected)}
              </small>
            </div>
          )}

          {cashSummary.count > 0 && (
            <ul className="cash-history">
              {closings.slice(0, 5).map((closing) => (
                <li key={closing.at}>
                  <span>{shortDate(closing.at)}</span>
                  <span className={cashClosingVerdict(closing).tone}>
                    {closing.diff === 0
                      ? "sesuai"
                      : `${closing.diff > 0 ? "+" : "−"}${rupiah(Math.abs(closing.diff))}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <small className="ask-note">
            Riwayat laci tersimpan di perangkat ini. Selisih belum tentu salah — bisa saja salah
            hitung.
          </small>
        </section>

        <section className="closing-block">
          <div className="closing-block-head">
            <h2>Utang berjalan</h2>
            <span>{rupiah(book.debtTotal)}</span>
          </div>
          {book.debts.length === 0 ? (
            <p className="cashier-empty">Tidak ada utang tersimpan. Bersih.</p>
          ) : (
            <ul className="closing-debts">
              {book.debts.map((debt) => (
                <li key={debt.id}>
                  <div>
                    <strong>{debt.debtor}</strong>
                    <small>
                      {debt.qty} {debt.unit} {debt.productName} · {debt.ageDays} hari
                    </small>
                  </div>
                  {debt.ageDays >= 7 && <span className="closing-flag">Lewat 7 hari</span>}
                  <span className="closing-amount">{rupiah(debt.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {book.overdueDebts.length > 0 && (
            <small className="ask-note">
              {book.overdueDebts.length} catatan sudah lewat 7 hari — bagusnya ditagih besok pagi.
            </small>
          )}
        </section>

        <section className="closing-block">
          <div className="closing-block-head">
            <h2>Besok: yang perlu dibeli</h2>
            <span>{rupiah(book.suggestions.reduce((sum, item) => sum + item.cost, 0))}</span>
          </div>
          {book.suggestions.length === 0 ? (
            <p className="cashier-empty">Stok masih aman untuk beberapa hari ke depan.</p>
          ) : (
            <ul className="closing-buy">
              {book.suggestions.map((item) => (
                <li key={item.name}>
                  <div>
                    <strong>
                      {item.name} · {numberID(item.qty)} {item.unit}
                    </strong>
                    <small>{item.reason}</small>
                  </div>
                  <span className="closing-amount">{rupiah(item.cost)}</span>
                </li>
              ))}
            </ul>
          )}

          {book.lowStock.length > 0 && (
            <div className="closing-stock">
              <strong>Stok menipis</strong>
              <p>
                {book.lowStock
                  .map((item) => `${item.name} ${numberID(item.stock)} ${item.unit}`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {book.modalUp.length > 0 && (
            <div className="closing-stock">
              <strong>Modal naik</strong>
              {book.modalUp.map((item) => (
                <p key={item.name}>
                  {item.name} {item.changePct >= 0 ? "+" : "−"}
                  {numberID(Math.abs(item.changePct), 1)}% (modal {rupiah(item.lastCost)})
                  {item.suggestedPrice
                    ? ` — harga jual disarankan ${rupiah(item.suggestedPrice)}`
                    : ""}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>

      {book.topItems.length > 0 && (
        <section className="closing-block">
          <div className="closing-block-head">
            <h2>Terlaris hari ini</h2>
          </div>
          <div className="closing-top">
            {book.topItems.map((item) => (
              <div key={item.name}>
                <strong>{item.name}</strong>
                <span>
                  {numberID(item.qty)} · {rupiah(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
