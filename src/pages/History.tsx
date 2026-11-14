import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { useWarung } from "../lib/store"
import { numberID, rupiah, shortDate, timeWIB } from "../lib/format"
import {
  transactionAmount,
  transactionIcon,
  transactionTitle,
  transactionTone,
} from "../lib/display"
import type { TransactionWithProduct } from "../lib/types"

type HistoryFilter = "Semua" | "Penjualan" | "Pembelian"

export function History() {
  const { products, transactions } = useWarung()
  const [filter, setFilter] = useState<HistoryFilter>("Semua")
  const [search, setSearch] = useState("")
  const [visibleCount, setVisibleCount] = useState(100)

  const rows = useMemo(() => {
    const productById = new Map(products.map((product) => [product.id, product]))
    const joined = transactions
      .map((transaction) => {
        const product = productById.get(transaction.product_id)
        return product ? { ...transaction, product } : null
      })
      .filter((row): row is TransactionWithProduct => row !== null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const query = search.toLowerCase().trim()
    return joined.filter((row) => {
      const matchesFilter =
        filter === "Semua" ||
        (filter === "Penjualan" && row.type === "sale") ||
        (filter === "Pembelian" && row.type === "purchase")
      const matchesSearch =
        !query ||
        row.product.name.toLowerCase().includes(query) ||
        (row.product.size ?? "").toLowerCase().includes(query)
      return matchesFilter && matchesSearch
    })
  }, [filter, products, search, transactions])

  const visibleRows = rows.slice(0, visibleCount)
  const salesTotal = rows
    .filter((row) => row.type === "sale")
    .reduce((total, row) => total + row.qty * row.unit_price, 0)
  const purchaseTotal = rows
    .filter((row) => row.type === "purchase")
    .reduce((total, row) => total + row.qty * row.unit_price, 0)

  return (
    <div className="history-page">
      <section className="page-title">
        <div>
          <span className="date-label">JEJAK AKTIVITAS</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🕘
            </span>{" "}
            Riwayat transaksi
          </h1>
          <p>Semua penjualan, pembelian, dan penyesuaian stok yang tersimpan.</p>
        </div>
      </section>

      <section className="history-summary">
        <article>
          <span>Penjualan tampil</span>
          <strong>{rupiah(salesTotal)}</strong>
          <small>{rows.filter((row) => row.type === "sale").length} transaksi</small>
        </article>
        <article>
          <span>Pembelian tampil</span>
          <strong>{rupiah(purchaseTotal)}</strong>
          <small>{rows.filter((row) => row.type === "purchase").length} transaksi</small>
        </article>
        <article>
          <span>Hasil filter</span>
          <strong>{rows.length}</strong>
          <small>{visibleRows.length} baris ditampilkan</small>
        </article>
      </section>

      <section className="history-panel">
        <div className="history-toolbar">
          <label>
            <Icon name="search" size={18} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setVisibleCount(100)
              }}
              placeholder="Cari nama barang..."
            />
          </label>
          <div className="filter-pills">
            {(["Semua", "Penjualan", "Pembelian"] as HistoryFilter[]).map((option) => (
              <button
                key={option}
                className={filter === option ? "active" : ""}
                onClick={() => {
                  setFilter(option)
                  setVisibleCount(100)
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="history-list">
          {visibleRows.map((row) => (
            <div className="history-item" key={row.id}>
              <span className={`transaction-icon ${transactionTone(row)}`}>
                <Icon name={transactionIcon(row)} size={18} />
              </span>
              <div className="history-copy">
                <strong>{transactionTitle(row)}</strong>
                <small>
                  {numberID(row.qty)} {row.product.unit} × {rupiah(row.unit_price)} ·{" "}
                  {shortDate(row.created_at)} {timeWIB(row.created_at)} WIB
                </small>
              </div>
              <b className={transactionTone(row)}>{transactionAmount(row)}</b>
            </div>
          ))}
          {rows.length > visibleRows.length && (
            <button
              className="history-more"
              onClick={() => setVisibleCount((count) => count + 100)}
            >
              Tampilkan 100 transaksi lagi ({rows.length - visibleRows.length} tersisa)
            </button>
          )}
          {rows.length === 0 && (
            <div className="empty-state">
              <Icon name="clock" size={26} />
              <strong>Belum ada transaksi</strong>
              <span>Transaksi yang Anda catat akan muncul di sini.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
