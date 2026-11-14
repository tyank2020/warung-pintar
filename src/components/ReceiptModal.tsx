import { useMemo, useState } from "react"
import type { ConfirmItem, PurchaseNote, ReceiptItem } from "../lib/types"
import { useWarung } from "../lib/store"
import { callScanReceipt } from "../lib/api"
import { isSupabaseConfigured } from "../lib/supabase"
import { findProduct } from "../lib/parser"
import { prepareImage, shrinkDataUrl } from "../lib/image"
import { rupiah } from "../lib/format"
import { Icon } from "./Icon"
import { ConfirmEditor, confirmIsValid, confirmTotal } from "./ConfirmEditor"
import { Modal } from "./Modal"

type Step = "upload" | "scanning" | "review" | "saving" | "saved" | "error"

const SAMPLE_RECEIPT: ReceiptItem[] = [
  { name: "Minyak Goreng", qty: 5, unit: "liter", unit_price: 15000 },
  { name: "Gula Pasir", qty: 10, unit: "kg", unit_price: 14000 },
  { name: "Beras Ramos", qty: 25, unit: "kg", unit_price: 12000 },
]

const SAMPLE_TOTAL = SAMPLE_RECEIPT.reduce(
  (total, item) => total + item.qty * item.unit_price,
  0,
)

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const SCAN_NEEDS_SETUP =
  "Pindai nota membutuhkan Supabase Edge Function dan kunci AI. Untuk demo, gunakan contoh nota di bawah."

/**
 * Depending on `mode`:
 * - "purchase" (default, Stok Barang): scan a supplier/cashier receipt to
 *   restock — creates unknown products, adds stock, prices are the purchase
 *   prices from the nota.
 * - "sale" (Kasir): scan a written order/list to ring up a SALE for the
 *   cashier. Unknown items block the save (adds need to come from Stok
 *   Barang); catalog products sell at their catalog sell_price.
 */
export function ReceiptModal({ onClose, mode = "purchase" }: { onClose: () => void; mode?: "purchase" | "sale" }) {
  const { products, addProduct, savePurchaseWithNote, saveSale } = useWarung()
  const isSale = mode === "sale"
  const [step, setStep] = useState<Step>("upload")
  const [preview, setPreview] = useState("")
  const [items, setItems] = useState<ConfirmItem[]>([])
  const [notaTotal, setNotaTotal] = useState(0)
  const [error, setError] = useState("")
  const [savedTotal, setSavedTotal] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  // Siapa yang menambah stok — dipakai pemilik untuk memeriksa pegawainya.
  const [addedBy, setAddedBy] = useState("")
  const [source, setSource] = useState<PurchaseNote["source"]>("scan")

  const computedTotal = confirmTotal(items)
  const difference = notaTotal > 0 ? computedTotal - notaTotal : 0

  const toConfirm = (receiptItems: ReceiptItem[]): ConfirmItem[] =>
    receiptItems.map((item, index) => {
      const product = findProduct(products, item.name, item.size, item.brand)
      return {
        key: `receipt-${product?.id ?? index}-${item.name}`,
        productId: product?.id ?? "",
        name: product?.name ?? item.name,
        qty: item.qty,
        unit: product?.unit ?? item.unit,
        // Penjualan: harga dari katalog (nota biasanya tidak memuat harga
        // jual). Kulakan: pakai harga di nota.
        unitPrice: isSale ? (product?.sell_price ?? item.unit_price) : item.unit_price,
        isNew: !product,
        size: product?.size ?? item.size ?? null,
        brand: product?.brand ?? item.brand ?? null,
        newSellPrice: product ? undefined : Math.round(item.unit_price * 1.15),
      }
    })

  const useSample = () => {
    setPreview("")
    setNotaTotal(SAMPLE_TOTAL)
    setItems(toConfirm(SAMPLE_RECEIPT))
    setSource("contoh")
    setError("")
    setStep("review")
  }

  const handleFile = async (file: File) => {
    setError("")
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStep("error")
      setError(
        "Anda sedang offline — pemindaian nota butuh koneksi internet. Gunakan contoh nota untuk melihat hasilnya.",
      )
      return
    }
    if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setStep("error")
      setError(
        "Format foto harus JPEG, PNG, atau WebP. Foto HEIC dari iPhone perlu diubah dulu.",
      )
      return
    }
    if (!isSupabaseConfigured) {
      setStep("error")
      setError(SCAN_NEEDS_SETUP)
      return
    }
    setStep("scanning")
    try {
      const image = await prepareImage(file)
      setPreview(image.dataUrl)
      setSource("scan")
      const result = await callScanReceipt(image.base64, image.mimeType)
      if (!result || !Array.isArray(result.items) || result.items.length === 0) {
        throw new Error(
          "Tidak ada barang yang terbaca. Pastikan seluruh nota terlihat jelas, atau gunakan contoh nota untuk demo.",
        )
      }
      setItems(toConfirm(result.items))
      setNotaTotal(
        typeof result.total === "number" && result.total > 0
          ? result.total
          : result.items.reduce((total, item) => total + item.qty * item.unit_price, 0),
      )
      setStep("review")
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Gagal memindai nota. Coba lagi atau gunakan contoh nota."
      const offline =
        typeof navigator !== "undefined" && !navigator.onLine
      setError(
        offline
          ? "Anda sedang offline — pemindaian nota butuh koneksi internet."
          : message.includes("Supabase") || message.includes("Functions")
            ? SCAN_NEEDS_SETUP
            : message,
      )
      setStep("error")
    }
  }

  const handleSave = async () => {
    setStep("saving")
    setError("")
    try {
      if (isSale) {
        // Penjualan tidak bisa dipakai untuk barang yang belum ada —
        // stoknya tidak akan cukup. Nama barang ditampilkan supaya bisa
        // ditambahkan dulu di Stok Barang.
        const missing = items.filter((item) => !item.productId)
        if (missing.length > 0) {
          throw new Error(
            `Belum ada di stok: ${missing.map((item) => item.name).join(", ")}. Tambahkan dulu lewat Stok Barang (Tambah barang atau Foto nota kulakan), lalu coba lagi.`,
          )
        }
        const prepared = items.map((item) => ({ ...item }))
        await saveSale(prepared, "nota")
        setSavedTotal(confirmTotal(prepared))
        setSavedCount(prepared.length)
        setStep("saved")
        return
      }

      // Cek dulu semua nama yang bentrok: kalau tidak, produk yang sudah
      // terlanjur dibuat akan menggantung (yatim) tanpa muncul di daftar.
      for (const item of items) {
        if (item.isNew && findProduct(products, item.name, item.size, item.brand)) {
          const existing = findProduct(products, item.name, item.size, item.brand)
          throw new Error(
            `"${item.name}${item.size ? ` · ${item.size}` : ""}${item.brand ? ` · ${item.brand}` : ""}" sudah ada sebagai "${existing?.name}". Perbarui baris itu dulu sebelum menyimpan.`,
          )
        }
      }

      const prepared: ConfirmItem[] = []
      for (const item of items) {
        if (item.isNew) {
          const product = await addProduct({
            name: item.name.trim(),
            size: item.size?.trim() || null,
            brand: item.brand?.trim() || null,
            unit: item.unit,
            stock: 0,
            min_stock: 0,
            buy_price: item.unitPrice,
            sell_price: item.newSellPrice ?? Math.round(item.unitPrice * 1.15),
            aliases: [],
          })
          prepared.push({
            ...item,
            productId: product.id,
            name: product.name,
            size: product.size ?? item.size ?? null,
            brand: product.brand ?? item.brand ?? null,
            isNew: false,
          })
        } else {
          prepared.push(item)
        }
      }
      const total = confirmTotal(prepared)
      const count = prepared.length
      // Foto nota disimpan versi kecil supaya riwayat tidak berat.
      const thumb = await shrinkDataUrl(preview)
      await savePurchaseWithNote(prepared, {
        addedBy: addedBy.trim() || "Pemilik warung",
        image: thumb,
        source,
      })
      setSavedTotal(total)
      setSavedCount(count)
      setStep("saved")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan nota.")
      setStep("review")
    }
  }

  const reset = () => {
    setStep("upload")
    setPreview("")
    setItems([])
    setNotaTotal(0)
    setSource("scan")
    setError("")
  }

  const totalLabel = useMemo(() => {
    if (notaTotal <= 0) return null
    return (
      <div className="receipt-total-compare">
        <div>
          <span>Total di nota</span>
          <strong>{rupiah(notaTotal)}</strong>
        </div>
        <div>
          <span>Total baris yang dikonfirmasi</span>
          <strong>{rupiah(computedTotal)}</strong>
        </div>
        {Math.abs(difference) >= 1 && (
          <p className={difference > 0 ? "danger" : "warning"}>
            <Icon name="warning" size={14} />
            Selisih {rupiah(Math.abs(difference))}. Periksa jumlah atau harga barang.
          </p>
        )}
      </div>
    )
  }, [computedTotal, difference, notaTotal])

  return (
    <Modal label={isSale ? "Foto nota penjualan" : "Pindai nota belanja"} onClose={onClose}>
      {step === "saved" ? (
          <div className="modal-success">
            <span className="success-orb">
              <Icon name="check" size={30} />
            </span>
            <span className="modal-kicker">{isSale ? "TERCATAT" : "TERSIMPAN"}</span>
            <h2>{isSale ? "Penjualan dari nota tercatat!" : "Nota berhasil dicatat!"}</h2>
            <p>
              {isSale ? (
                <>
                  {savedCount} barang terjual · {rupiah(savedTotal)}. Stok berkurang otomatis dan
                  omzetnya ikut terhitung.
                </>
              ) : (
                <>
                  {savedCount} barang masuk · {rupiah(savedTotal)}. Stok dan harga modal sudah
                  diperbarui.
                </>
              )}
            </p>
            {!isSale && (
              <p className="ask-note">
                Nota tersimpan di riwayat nota — pemilik bisa melihat kapan pun bukti belanjanya.
              </p>
            )}
            <button className="primary-action full" onClick={onClose}>
              Selesai <Icon name="check" size={17} />
            </button>
          </div>
        ) : step === "review" || step === "saving" ? (
          <>
            <span className="modal-kicker">PERIKSA DULU, LALU SIMPAN</span>
            <h2>{isSale ? "Apakah isi penjualan sudah benar?" : "Apakah isi nota sudah benar?"}</h2>
            <p>
              AI hanya mengusulkan. Periksa nama barang, jumlah, dan{" "}
              {isSale ? "harga jual" : "harga modal"} sebelum menyimpan.
            </p>
            {preview && (
              <div className="receipt-preview">
                <img src={preview} alt="Pratinjau nota yang dipindai" />
                <span>Foto nota</span>
              </div>
            )}
            {!preview && (
              <div className="sample-badge">
                <Icon name="receipt" size={16} /> Contoh nota demo
              </div>
            )}
            <ConfirmEditor items={items} products={products} mode={isSale ? "sale" : "purchase"} onChange={setItems} />
            {isSale && items.some((item) => item.isNew) && (
              <div className="data-banner warning" role="status">
                <div>
                  <strong>Ada barang yang belum ada di stok</strong>
                  <span>
                    {items.filter((item) => item.isNew).map((item) => item.name).join(", ")} —
                    tambahkan dulu lewat Stok Barang (Tambah barang / Foto nota kulakan), lalu
                    pindai lagi. Barang baru ditambahkan dari sana supaya harganya bisa diatur.
                  </span>
                </div>
              </div>
            )}
            {!isSale && (
              <div className="debtor-field">
                <label htmlFor="note-added-by">Siapa yang menambah stok?</label>
                <input
                  id="note-added-by"
                  value={addedBy}
                  onChange={(event) => setAddedBy(event.target.value)}
                  placeholder="Contoh: Pegawai toko"
                />
                <small className="ask-note">
                  Nama ini tersimpan di riwayat nota, jadi pemilik bisa melihat siapa yang menambah
                  stok.
                </small>
              </div>
            )}
            {!isSale && totalLabel}
            {error && <div className="form-error">{error}</div>}
            <div className="confirm-total">
              <span>{isSale ? "Total penjualan" : "Total belanja"}</span>
              <strong>{rupiah(computedTotal)}</strong>
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={reset} disabled={step === "saving"}>
                <Icon name="camera" size={16} /> Ganti foto
              </button>
              <button
                className="primary-action"
                onClick={() => void handleSave()}
                disabled={step === "saving" || !confirmIsValid(items, products, isSale ? "sale" : "purchase")}
              >
                {step === "saving"
                  ? "Menyimpan…"
                  : isSale
                    ? "Simpan penjualan"
                    : "Simpan ke stok"}
                {step !== "saving" && <Icon name="check" size={16} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="modal-kicker">{isSale ? "NOTA PENJUALAN" : "NOTA BELANJA"}</span>
            <h2>{isSale ? "Foto atau unggah nota penjualan" : "Foto atau unggah nota"}</h2>
            <p>
              {isSale
                ? "Misalnya daftar pesanan tertulis pelanggan. Barang yang terjual tercatat sebagai penjualan dan stok langsung berkurang."
                : "Misalnya nota dari pemasok atau bukti kulakan. Barang yang terpindai bisa dipakai untuk restock — barang baru maupun restock barang lama."}
            </p>

            <label className={`scan-area ${step === "scanning" ? "scanning" : ""}`}>
              {step === "scanning" ? (
                <>
                  <span className="scan-spinner" />
                  <strong>Sedang membaca nota…</strong>
                  <span>Biasanya 3–10 detik. Jangan tutup layar ini.</span>
                </>
              ) : (
                <>
                  <Icon name="camera" size={42} />
                  <strong>Ambil foto nota</strong>
                  <span>atau pilih foto dari galeri</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void handleFile(file)
                      event.target.value = ""
                    }}
                  />
                </>
              )}
            </label>

            {error && <div className="form-error">{error}</div>}

            <small className="ask-note receipt-scan-note">
              <Icon name="warning" size={13} /> {SCAN_NEEDS_SETUP}
            </small>

            <div className="receipt-demo">
              <div>
                <strong>Belum ada foto nota?</strong>
                <span>Coba alur lengkapnya dengan contoh nota demo.</span>
              </div>
              <button className="secondary-action" onClick={useSample} disabled={step === "scanning"}>
                <Icon name="receipt" size={16} /> Gunakan contoh nota
              </button>
            </div>
          </>
        )}
    </Modal>
  )
}
