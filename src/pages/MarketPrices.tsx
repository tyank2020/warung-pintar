import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { useWarung } from "../lib/store"
import { buildMarketSummary, marketHeadline } from "../lib/marketPrice"
import { numberID, productLabel, rupiah, shortDate } from "../lib/format"

/**
 * Radar Harga Pasar.
 *
 * Tidak ada sumber publik yang memberi harga warung sebelah per barang, jadi
 * laporan dikumpulkan dari warung-warung di sekitar (crowd-sourced).
 * Harga pasar dipakai sebagai pembanding; saran harga selalu memperhitungkan
 * margin warung sendiri.
 */
export function MarketPrices() {
  const { products, marketPrices, addMarketPrice, setSellPrice, source } = useWarung()
  const [productId, setProductId] = useState("")
  const [price, setPrice] = useState("")
  const [sourceName, setSourceName] = useState("Warung sebelah")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const summary = useMemo(
    () => buildMarketSummary(products, marketPrices),
    [marketPrices, products],
  )

  const handleAdd = async () => {
    const product = products.find((item) => item.id === productId)
    if (!product) {
      setError("Pilih barangnya dulu.")
      return
    }
    const value = Number(price.replace(/[^\d]/g, "")) || 0
    if (value <= 0) {
      setError("Harga pasar harus lebih dari nol.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await addMarketPrice({
        productId: product.id,
        productName: product.name,
        price: value,
        sourceName: sourceName.trim() || "Warung sebelah",
      })
      setPrice("")
      setSaved(`Laporan ${productLabel(product)} tersimpan.`)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Gagal menyimpan laporan.")
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async (id: string, suggestedPrice: number) => {
    setBusy(true)
    setError("")
    try {
      await setSellPrice(id, suggestedPrice)
      setSaved("Harga jual diperbarui.")
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Gagal mengubah harga.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="market-page">
      <section className="page-title">
        <div>
          <span className="date-label">RADAR HARGA PASAR</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🏷️
            </span>{" "}
            Harga pasar
          </h1>
          <p>
            Lihat harga yang dipakai warung di sekitar, lalu bandingkan dengan harga dan margin Anda
            sendiri.{" "}
          </p>
        </div>
      </section>

      <section className="market-hero">
        <Icon name="spark" size={20} />
        <p>
          {marketHeadline(summary)}{" "}
          {source === "demo"
            ? "Harga di halaman ini merupakan data contoh, bukan laporan pasar nyata."
            : "Data pasar ini dikumpulkan dari laporan warung sekitar — setiap laporan menyimpan sumber dan waktunya, jadi bisa ditelusuri."}
        </p>
      </section>

      <section className="market-report">
        <h2>Catat harga yang Anda lihat</h2>
        <div className="market-form">
          <label>
            Barang
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Pilih barang…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {productLabel(product)} (jual {rupiah(product.sell_price)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Harga di pasar
            <input
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="16000"
            />
          </label>
          <label>
            Sumber
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              placeholder="Warung sebelah"
            />
          </label>
          <button className="primary-action" onClick={() => void handleAdd()} disabled={busy}>
            <Icon name="plus" size={16} /> Catat laporan
          </button>
        </div>
        {saved && <div className="cashier-saved">{saved}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      {summary.length === 0 ? (
        <section className="empty-state">
          <Icon name="spark" size={26} />
          <strong>Belum ada laporan harga pasar</strong>
          <span>
            Catat harga yang Anda lihat di warung sebelah. Makin banyak warung yang melapor, makin
            berguna pembandingnya.
          </span>
        </section>
      ) : (
        <div className="market-list">
          {summary.map((item) => (
            <article className="market-card" key={item.productId}>
              <div className="market-card-head">
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.reportCount} laporan · {item.sourceCount} sumber · terakhir{" "}
                    {shortDate(item.latestAt)}
                  </small>
                </div>
                <span className={`market-action ${item.advice.action}`}>
                  {item.advice.action === "turunkan"
                    ? "Tinjau harga"
                    : item.advice.action === "naikkan"
                      ? "Bisa naik"
                      : "Sebanding"}
                </span>
              </div>
              <div className="market-compare">
                <div>
                  <small>Harga Anda</small>
                  <strong>{rupiah(item.myPrice)}</strong>
                </div>
                <div>
                  <small>Harga pasar</small>
                  <strong>{rupiah(item.marketPrice)}</strong>
                </div>
                <div>
                  <small>Selisih</small>
                  <strong>
                    {item.advice.gap > 0 ? "+" : ""}
                    {rupiah(item.advice.gap)}
                  </strong>
                </div>
                <div>
                  <small>Margin sekarang</small>
                  <strong>{numberID(item.advice.marginBefore, 1)}%</strong>
                </div>
              </div>
              <p className="market-message">{item.advice.message}</p>
              {item.advice.action === "turunkan" && (
                <button
                  className="primary-action"
                  onClick={() => void handleApply(item.productId, item.advice.suggestedPrice)}
                  disabled={busy}
                >
                  <Icon name="check" size={16} /> Turunkan ke {rupiah(item.advice.suggestedPrice)}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
