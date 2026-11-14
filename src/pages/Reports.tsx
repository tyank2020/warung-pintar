import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { useWarung } from "../lib/store"
import { compactRupiah, numberID, productLabel, rupiah } from "../lib/format"
import { useAnimatedNumber } from "../lib/useAnimatedNumber"
import { reportSeriesFromIndex, reportSummaryFromIndex, type ReportPeriod } from "../lib/stats"
import type { NavLabel } from "../lib/nav"

export function Reports({ onNavigate }: { onNavigate: (nav: NavLabel) => void }) {
  const { products, index, consignmentSales } = useWarung()
  const [period, setPeriod] = useState<ReportPeriod>("7 Hari")
  const [selectedBar, setSelectedBar] = useState(6)

  // Grafik dan ringkasan membaca satu indeks yang sama, jadi angkanya
  // selalu cocok dan tidak perlu menghitung ulang dari nol.
  const series = useMemo(
    () => reportSeriesFromIndex(index, period, Date.now(), consignmentSales),
    [consignmentSales, index, period],
  )
  const summary = useMemo(
    () => reportSummaryFromIndex(products, index, period, Date.now(), consignmentSales),
    [consignmentSales, products, index, period],
  )
  const animatedSales = useAnimatedNumber(summary.sales)
  const animatedProfit = useAnimatedNumber(summary.grossProfit)
  const animatedTransactions = useAnimatedNumber(summary.transactions)
  const animatedItems = useAnimatedNumber(summary.itemsSold)

  const maxSales = Math.max(...series.map((point) => point.sales), 1)
  const topDay = series.reduce((best, point) => (point.sales > best.sales ? point : best))
  const animatedTopDay = useAnimatedNumber(topDay?.sales ?? 0)
  const margin = summary.sales > 0 ? (summary.grossProfit / summary.sales) * 100 : 0

  const colors = ["var(--green)", "#ed9a51", "#5e94c4", "#dce3df"]
  const productsById = new Map(products.map((product) => [product.id, product]))
  const labelFor = (productId: string, fallback: string) => {
    const product = productsById.get(productId)
    return product ? productLabel(product) : fallback
  }
  const top = summary.topProducts
  const topRevenue = top.reduce((total, product) => total + product.revenue, 0)
  let accumulated = 0
  const gradientStops = top.map((product, index) => {
    const percentage = summary.sales > 0 ? (product.revenue / summary.sales) * 100 : 0
    const start = accumulated
    accumulated += percentage
    return `${colors[index] ?? "#dce3df"} ${start}% ${Math.min(100, accumulated)}%`
  })
  if (accumulated < 100) {
    gradientStops.push(`#dce3df ${Math.min(100, accumulated)}% 100%`)
  }

  const choosePeriod = (next: ReportPeriod) => {
    setPeriod(next)
    setSelectedBar(next === "7 Hari" ? 6 : next === "30 Hari" ? 9 : 11)
  }

  return (
    <div className="reports-page">
      <section className="page-title">
        <div>
          <span className="date-label">PERFORMA USAHA</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              📈
            </span>{" "}
            Laporan warung
          </h1>
          <p>Lihat pola penjualan, laba kotor, dan produk yang paling diminati.</p>
        </div>
        <div className="period-tabs">
          {(["7 Hari", "30 Hari", "3 Bulan"] as ReportPeriod[]).map((option) => (
            <button
              key={option}
              className={period === option ? "active" : ""}
              onClick={() => choosePeriod(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="report-metrics" aria-label="Ringkasan performa">
        <article>
          <span>Total penjualan</span>
          <strong>{rupiah(Math.round(animatedSales))}</strong>
          <small className="metric-up">
            <Icon name="up" size={13} /> {summary.transactions} transaksi
          </small>
        </article>
        <article>
          <span>Laba kotor</span>
          <strong>{rupiah(Math.round(animatedProfit))}</strong>
          <small className="metric-up">
            <Icon name="chart" size={13} /> Margin {numberID(margin, 1)}%
          </small>
          {summary.consignmentCommission > 0 && (
            <small>Termasuk komisi titipan {rupiah(summary.consignmentCommission)}</small>
          )}
        </article>
        <article>
          <span>Transaksi</span>
          <strong>{Math.round(animatedTransactions)}</strong>
          <small>
            Rata-rata {rupiah(summary.transactions > 0 ? summary.sales / summary.transactions : 0)}
          </small>
        </article>
        <article>
          <span>Barang terjual</span>
          <strong>{numberID(Math.round(animatedItems))}</strong>
          <small>{top.length} produk berkontribusi</small>
        </article>
      </section>

      <div className="report-grid">
        <section className="report-panel sales-chart">
          <div className="report-heading">
            <div>
              <h2>Tren penjualan</h2>
              <p>Klik batang untuk melihat detail periode.</p>
            </div>
            <span>
              <i /> Penjualan
            </span>
          </div>
          <div className="chart-area">
            <div className="chart-scale">
              <span>{compactRupiah(maxSales)}</span>
              <span>{compactRupiah(maxSales * 0.66)}</span>
              <span>{compactRupiah(maxSales * 0.33)}</span>
              <span>0</span>
            </div>
            <div className="bar-chart">
              {series.map((point, index) => (
                <button
                  key={`${point.label}-${index}`}
                  className={selectedBar === index ? "active" : ""}
                  onClick={() => setSelectedBar(index)}
                  aria-label={`${point.label}, penjualan ${rupiah(point.sales)}`}
                >
                  <span className="bar-tooltip">{rupiah(point.sales)}</span>
                  <i
                    style={{
                      height: `${Math.max(3, Math.round((point.sales / maxSales) * 100))}%`,
                    }}
                  />
                  <small>{point.label}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <span>Penjualan tertinggi</span>
            <strong>
              {topDay?.label ?? "—"} · {rupiah(Math.round(animatedTopDay))}
            </strong>
          </div>
        </section>

        <section className="report-panel profit-panel">
          <div className="report-heading">
            <div>
              <h2>Komposisi omzet</h2>
              <p>Barang titipan masuk omzet, tetapi tidak dicampur ke daftar stok warung.</p>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(${gradientStops.join(", ")})`,
              }}
            >
              <div>
                <strong>{compactRupiah(summary.sales)}</strong>
                <small>Total omzet</small>
              </div>
            </div>
            <div className="donut-legend">
              {top.map((product, index) => (
                <p key={product.productId}>
                  <i style={{ background: colors[index] ?? "#dce3df" }} />
                  <span>{labelFor(product.productId, product.name)}</span>
                  <strong>
                    {numberID(summary.sales > 0 ? (product.revenue / summary.sales) * 100 : 0, 0)}%
                  </strong>
                </p>
              ))}
              {top.length > 0 && topRevenue < summary.sales && (
                <p>
                  <i className="legend-gray" />
                  <span>Lainnya</span>
                  <strong>
                    {Math.max(0, 100 - Math.round((topRevenue / Math.max(1, summary.sales)) * 100))}
                    %
                  </strong>
                </p>
              )}
              {top.length === 0 && (
                <p>
                  <i className="legend-gray" />
                  <span>Belum ada penjualan</span>
                  <strong>0%</strong>
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="report-panel top-products">
          <div className="report-heading">
            <div>
              <h2>Produk terlaris</h2>
              <p>Kontribusi terhadap penjualan</p>
            </div>
          </div>
          {top.map((product, index) => (
            <div className="top-product" key={product.productId}>
              <span>{index + 1}</span>
              <div>
                <p>
                  <strong>{labelFor(product.productId, product.name)}</strong>
                  <small>
                    {numberID(product.qty)} {product.unit}
                  </small>
                </p>
                <div>
                  <i
                    style={{
                      width: `${Math.max(
                        3,
                        (product.revenue / Math.max(1, top[0]?.revenue ?? 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <b>{compactRupiah(product.revenue)}</b>
            </div>
          ))}
          {top.length === 0 && (
            <div className="inline-empty">
              <Icon name="chart" size={22} />
              <strong>Belum ada penjualan</strong>
              <span>Catat penjualan untuk melihat produk terlaris.</span>
            </div>
          )}
        </section>

        <section className="report-panel ai-report">
          <span className="ai-orb">
            <Icon name="spark" size={22} />
          </span>
          <div>
            <small>RINGKASAN ASISTEN</small>
            <h2>{summary.sales > 0 ? "Angka dari transaksi Anda" : "Belum ada data"}</h2>
            <p>
              {summary.sales > 0
                ? `Omzet ${period} ${rupiah(summary.sales)} dengan laba kotor ${rupiah(
                    summary.grossProfit,
                  )}. Margin ${numberID(margin, 1)}%.`
                : "Catat penjualan pertama agar laporan bisa dihitung."}
            </p>
          </div>
          <button aria-label="Buka stok" onClick={() => onNavigate("Stok Barang")}>
            <Icon name="arrow" />
          </button>
        </section>
      </div>

      <p className="dashboard-footnote">
        Semua angka dihitung dari transaksi tersimpan. Laba kotor barang warung ditambah komisi
        titipan; bagian pemilik barang titipan tidak dihitung sebagai laba.
      </p>
    </div>
  )
}
