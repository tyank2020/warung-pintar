import { useEffect, useMemo, useRef, useState } from "react"
import type { ConfirmItem } from "../lib/types"
import { useWarung } from "../lib/store"
import { openDebtFor } from "../lib/customers"
import { CustomerNameField } from "./CustomerNameField"
import { mergeVoiceItems, parseCatalogText, parseVoiceText, toConfirmItems, isPurchaseIntent, findProduct } from "../lib/parser"
import { callParseVoice } from "../lib/api"
import { isSupabaseConfigured } from "../lib/supabase"
import { rupiah } from "../lib/format"
import { Icon } from "./Icon"
import { ConfirmEditor, confirmIsValid, confirmTotal } from "./ConfirmEditor"
import { Modal } from "./Modal"

type Step = "idle" | "listening" | "review" | "saving" | "saved"

interface CatalogDraft {
  key: string
  name: string
  unit: string
  /** Ukuran/varian ("2 Liter"); kosong = tanpa varian. */
  size: string | null
  /** Merek barang ("Bimoli"); kosong = tanpa merek tercatat. */
  brand: string | null
  stock: number
  sellPrice: number
  /** Barang yang sudah ada di katalog — akan ditambah stoknya, bukan dibuat baru. */
  existingId: string | null
}

const CATALOG_UNITS = [
  "pcs",
  "kg",
  "gram",
  "liter",
  "ml",
  "bungkus",
  "papan",
  "sachet",
  "botol",
  "dus",
  "karung",
  "batang",
  "ons",
]

export function VoiceModal({
  onClose,
  mode = "sale",
}: {
  onClose: () => void
  mode?: "sale" | "katalog"
}) {
  const { products, customers, debts, saveSale, savePurchase, saveDebt, addProduct } = useWarung()
  const [step, setStep] = useState<Step>("idle")
  const [transcript, setTranscript] = useState("")
  const [interim, setInterim] = useState("")
  const [items, setItems] = useState<ConfirmItem[]>([])
  const [debtor, setDebtor] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<CatalogDraft[]>([])
  const [error, setError] = useState("")
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  )
  /** AI tidak terjangkau; jawaban memakai pembacaan lokal di perangkat. */
  const [aiFallback, setAiFallback] = useState(false)
  const [savedTotal, setSavedTotal] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [savedDebtor, setSavedDebtor] = useState("")
  const [skippedCount, setSkippedCount] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef("")

  const isCatalog = mode === "katalog"

  // Ikuti status internet: browser butuh online untuk pengenalan suara
  // dan untuk memanggil AI. Saat offline, mic dinonaktifkan dan kolom
  // manual tetap tersedia.
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  // Batas maksimal utang (aturan tunggal di debtGuard, dicek dulu di layar
  // supaya input yang lewat batas langsung ditolak + dinotifikasi, bukan
  // baru tahu saat menyimpan).
  const debtorName = debtor?.trim() ?? ""
  const debtorCustomer = useMemo(
    () =>
      debtorName
        ? customers.find(
            (customer) => customer.name.trim().toLowerCase() === debtorName.toLowerCase(),
          )
        : undefined,
    [customers, debtorName],
  )
  const openDebtNow = useMemo(
    () => (debtorName ? openDebtFor(debts, debtorName) : 0),
    [debts, debtorName],
  )
  const projectedDebt = openDebtNow + (debtor ? confirmTotal(items) : 0)
  const overLimit =
    debtorName !== "" &&
    debtorCustomer?.maxDebt != null &&
    debtorCustomer.maxDebt > 0 &&
    projectedDebt > debtorCustomer.maxDebt

  const supported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
  }, [])

  const processTranscript = async (text: string) => {
    const clean = text.trim()
    if (!clean) {
      setError("Belum ada suara yang terdengar. Coba lagi atau ketik manual.")
      setStep("idle")
      return
    }

    setTranscript(clean)
    setError("")
    setAiFallback(false)

    if (isCatalog) {
      // Parser katalog sengaja lokal dan deterministik: warung tetap bisa
      // mendaftar barang tanpa internet, dan angka tidak dikarang AI.
      const parsed = parseCatalogText(clean, products)
      if (parsed.length === 0) {
        setError(
          "Saya belum bisa menemukan nama barangnya. Coba sebutkan seperti “beras 14 ribu, gula 17 ribu dan mi instan 3rb”.",
        )
        setStep("idle")
        return
      }
      setDrafts(
        parsed.map((item, index) => ({
          key: `katalog-${index}`,
          name: item.name,
          unit: item.unit,
          size: item.size ?? null,
          brand: item.brand ?? null,
          stock: item.qty,
          sellPrice: item.sellPrice,
          existingId: item.matchId,
        })),
      )
      setStep("review")
      return
    }

    const local = parseVoiceText(clean, products)
    let nextItems = toConfirmItems(local.items, products, "sale")
    let nextDebtor: string | null = local.debtor ?? null

    if (isSupabaseConfigured) {
      try {
        const remote = await callParseVoice(clean, products)
        if (remote?.items?.length) {
          // Parser lokal dan AI digabung, bukan saling menggantikan. Parser
          // lokal tahu daftar alias barang persis, AI lebih pandai membaca
          // kalimat yang rumit. Kalau hasil AI tidak lengkap, barang yang
          // benar-benar disebut tidak ikut hilang.
          const merged = mergeVoiceItems(local.items, remote.items, products)
          nextItems = toConfirmItems(merged, products, "sale")
        }
        if (remote?.debtor) nextDebtor = remote.debtor
      } catch (remoteError) {
        console.warn("parse-voice tidak tersedia, memakai parser lokal:", remoteError)
        setAiFallback(true)
      }
    }

    if (nextItems.length === 0) {
      setError(
        "Saya belum bisa menemukan barang dan jumlahnya. Coba sebutkan seperti “terjual beras 10 kilo dan telur 2 papan”.",
      )
      setStep("idle")
      return
    }

    setItems(nextItems)
    setDebtor(nextDebtor)
    setStep("review")
  }

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setError("Browser ini belum mendukung pengenalan suara. Silakan ketik manual di bawah.")
      return
    }

    const recognition = new Recognition()
    recognition.lang = "id-ID"
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    transcriptRef.current = ""
    setTranscript("")
    setInterim("")
    setError("")
    setStep("listening")

    recognition.onresult = (event) => {
      let finalText = ""
      let interimText = ""
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
        else interimText += result[0].transcript
      }
      transcriptRef.current = finalText || interimText
      setTranscript(finalText)
      setInterim(interimText)
    }

    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "Izin mikrofon ditolak. Aktifkan izin mikrofon di browser.",
        "no-speech": "Tidak ada suara yang terdengar. Coba lagi.",
        network: "Koneksi internet bermasalah saat mengenali suara.",
        aborted: "",
      }
      const message = messages[event.error] ?? "Pengenalan suara gagal. Coba lagi."
      if (message) setError(message)
      setStep("idle")
    }

    recognition.onend = () => {
      const text = transcriptRef.current
      if (text.trim()) {
        void processTranscript(text)
      } else {
        setStep((current) => (current === "listening" ? "idle" : current))
      }
    }

    try {
      recognition.start()
    } catch {
      setError("Mikrofon sedang dipakai. Tunggu sebentar lalu coba lagi.")
      setStep("idle")
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
  }

  const updateDraft = (key: string, patch: Partial<CatalogDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  const removeDraft = (key: string) => {
    setDrafts((current) => current.filter((draft) => draft.key !== key))
  }

  const addDraftRow = () => {
    setDrafts((current) => [
      ...current,
      {
        key: `katalog-manual-${current.length}-${Date.now()}`,
        name: "",
        unit: "pcs",
        size: null,
        brand: null,
        stock: 0,
        sellPrice: 0,
        existingId: null,
      },
    ])
  }

  const validDrafts = drafts.filter(
    (draft) => draft.name.trim() && draft.stock >= 0 && draft.sellPrice >= 0,
  )

  const handleSave = async () => {
    setError("")
    if (isCatalog) {
      setStep("saving")
      try {
        // Barang yang namanya (atau aliasnya) sudah ada di katalog: tambah
        // stoknya, jangan dibuat barang baru. Ukuran harus ikut cocok —
        // "minyak 2 liter" bukan "Minyak Goreng · 1 Liter".
        const isExisting = (draft: CatalogDraft) => {
          if (draft.existingId) return draft.existingId
          return findProduct(products, draft.name, draft.size, draft.brand)?.id ?? null
        }
        const restockItems: ConfirmItem[] = []
        const freshDrafts: CatalogDraft[] = []
        for (const draft of validDrafts) {
          const existingId = isExisting(draft)
          if (existingId) {
            const product = products.find((candidate) => candidate.id === existingId)
            if (product && draft.stock > 0) {
              restockItems.push({
                key: `voice-restock-${existingId}-${Date.now()}-${Math.random()}`,
                productId: existingId,
                name: product.name,
                qty: draft.stock,
                unit: product.unit,
                unitPrice: product.buy_price,
                confidence: 0.9,
                isNew: false,
                size: product.size ?? draft.size ?? null,
                brand: product.brand ?? draft.brand ?? null,
              })
              continue
            }
            // Barang ada tapi jumlahnya kosong — jangan diisi 1 diam-diam.
            continue
          }
          freshDrafts.push(draft)
        }

        if (restockItems.length > 0) {
          await savePurchase(restockItems)
        }
        for (const draft of freshDrafts) {
          await addProduct({
            name: draft.name.trim(),
            size: draft.size?.trim() || null,
            brand: draft.brand?.trim() || null,
            unit: draft.unit || "pcs",
            stock: draft.stock,
            min_stock: 0,
            buy_price: 0,
            sell_price: draft.sellPrice,
            aliases: [],
          })
        }
        setSavedCount(freshDrafts.length)
        setSkippedCount(restockItems.length)
        setStep("saved")
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : "Gagal menyimpan barang baru.",
        )
        setStep("review")
      }
      return
    }

    setStep("saving")
    try {
      // Barang yang tidak ada di katalog (hasil suara) harus dibuat dulu,
      // kalau tidak saveDebt membuangnya diam-diam sementara layar tetap
      // bilang sukses.
      const prepared: ConfirmItem[] = []
      for (const item of items) {
        if (!item.productId && item.name.trim()) {
          const product = await addProduct({
            name: item.name.trim(),
            size: item.size?.trim() || null,
            brand: item.brand?.trim() || null,
            unit: item.unit || "pcs",
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
      // Arah beli/stok masuk: ucapan “saya membeli …” dicatat sebagai stok
      // masuk, bukan penjualan.
      const isPurchase = isPurchaseIntent(transcript)
      if (isPurchase) {
        setSavedDebtor("")
        await savePurchase(prepared)
      } else if (debtor && debtor.trim()) {
        await saveDebt(prepared, debtor)
        setSavedDebtor(debtor.trim())
      } else {
        setSavedDebtor("")
        await saveSale(prepared)
      }
      setSavedTotal(total)
      setSavedCount(count)
      setStep("saved")
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Gagal menyimpan transaksi.",
      )
      setStep("review")
    }
  }

  const reset = () => {
    setStep("idle")
    setTranscript("")
    setInterim("")
    setItems([])
    setDebtor(null)
    setDrafts([])
    setError("")
  }

  const speechIsPurchase = !isCatalog && isPurchaseIntent(transcript)

  return (
    <Modal
      label={isCatalog ? "Daftarkan barang dengan suara" : "Catat penjualan dengan suara"}
      onClose={onClose}
    >
      {step === "saved" ? (
        isCatalog ? (
          <div className="modal-success">
            <span className="success-orb">
              <Icon name="check" size={30} />
            </span>
            <span className="modal-kicker">
              {skippedCount > 0 ? "STOK MASUK + KATALOG" : "KATALOG BARU"}
            </span>
            <h2>
              {skippedCount > 0 && savedCount > 0
                ? "Stok ditambah & barang baru terdaftar!"
                : skippedCount > 0
                  ? "Stok berhasil ditambahkan!"
                  : savedCount > 0
                    ? "Barang terdaftar!"
                    : "Selesai!"}
            </h2>
            <p>
              {skippedCount > 0 && savedCount > 0 ? (
                <>
                  {skippedCount} barang sudah ada (stoknya ditambahkan) dan {savedCount} barang
                  baru terdaftar.
                </>
              ) : skippedCount > 0 ? (
                `${skippedCount} barang sudah ada di katalog — stoknya ditambahkan.`
              ) : savedCount > 0 ? (
                <>
                  {savedCount} barang baru terdaftar. Harga jual bisa diubah kapan saja di Stok
                  Barang.
                </>
              ) : (
                "Tidak ada barang yang disimpan."
              )}
            </p>
            <button className="primary-action full" onClick={onClose}>
              Selesai <Icon name="check" size={17} />
            </button>
          </div>
        ) : (
          <div className="modal-success">
            <span className="success-orb">
              <Icon name="check" size={30} />
            </span>
            <span className="modal-kicker">
              {speechIsPurchase
                ? "STOK MASUK"
                : savedDebtor
                  ? "TERCATAT DI BUKU UTANG"
                  : "TERSIMPAN"}
            </span>
            <h2>
              {speechIsPurchase
                ? "Stok berhasil ditambahkan!"
                : savedDebtor
                  ? `Utang ${savedDebtor} dicatat!`
                  : "Penjualan berhasil dicatat!"}
            </h2>
            <p>
              {savedCount} barang · {rupiah(savedTotal)}.
              {speechIsPurchase
                ? " Stok dan harga modal sudah diperbarui."
                : savedDebtor
                  ? " Tinggal tandai lunas di panel Simpen Dulu."
                  : " Stok sudah diperbarui otomatis."}
            </p>
            <button className="primary-action full" onClick={onClose}>
              Selesai <Icon name="check" size={17} />
            </button>
          </div>
        )
      ) : step === "review" || step === "saving" ? (
        isCatalog ? (
          <>
            <span className="modal-kicker">PERIKSA DULU, LALU SIMPAN</span>
            <h2>Stok &amp; barang dari suara</h2>
            <p>
              Barang yang sudah ada di katalog (ditandai hijau) hanya ditambah stoknya.
              Sisanya didaftarkan sebagai barang baru.
            </p>
            <div className="transcript-box">
              <Icon name="mic" size={15} />
              <span>“{transcript}”</span>
            </div>
            <div className="catalog-list">
              {drafts.map((draft) => {
                const liveMatch = draft.existingId ??
                  findProduct(products, draft.name, draft.size, draft.brand)?.id ??
                  null
                return (
                <div className={`catalog-row ${liveMatch ? "catalog-row-existing" : ""}`} key={draft.key}>
                  <label>
                    Nama barang
                    {liveMatch && <span className="catalog-existing-badge">Ada di katalog · stok ditambah</span>}
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft(draft.key, { name: event.target.value, existingId: null })}
                      placeholder="Contoh: Beras Ramos"
                    />
                  </label>
                  <div className="catalog-row-grid">
                    <label>
                      Merek (opsional)
                      <input
                        value={draft.brand ?? ""}
                        placeholder="Bimoli"
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            brand: event.target.value.trim() ? event.target.value : null,
                            existingId: null,
                          })
                        }
                      />
                    </label>
                    <label>
                      Ukuran / varian (opsional)
                      <input
                        value={draft.size ?? ""}
                        placeholder="2 Liter"
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            size: event.target.value.trim() ? event.target.value : null,
                            existingId: null,
                          })
                        }
                      />
                    </label>
                    <label>
                      Satuan
                      <select
                        value={draft.unit}
                        onChange={(event) => updateDraft(draft.key, { unit: event.target.value })}
                      >
                        {CATALOG_UNITS.map((unit) => (
                          <option key={unit}>{unit}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Stok awal
                      <input
                        inputMode="numeric"
                        value={draft.stock === 0 ? "" : String(draft.stock)}
                        placeholder="0"
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            stock: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                          })
                        }
                      />
                    </label>
                    <label>
                      Harga jual
                      <input
                        inputMode="numeric"
                        value={draft.sellPrice === 0 ? "" : String(draft.sellPrice)}
                        placeholder="0"
                        disabled={liveMatch !== null}
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            sellPrice: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="row-action"
                    onClick={() => removeDraft(draft.key)}
                    aria-label={`Hapus ${draft.name || "baris"}`}
                  >
                    <Icon name="close" size={14} /> Hapus
                  </button>
                </div>
                )
              })}
              <button className="row-action catalog-add" onClick={addDraftRow}>
                <Icon name="plus" size={14} /> Tambah baris
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="secondary-action" onClick={reset} disabled={step === "saving"}>
                <Icon name="mic" size={16} /> Ulangi
              </button>
              <button
                className="primary-action"
                onClick={() => void handleSave()}
                disabled={step === "saving" || validDrafts.length === 0}
              >
                {step === "saving"
                  ? "Menyimpan…"
                  : `Simpan ${validDrafts.length} barang`}
                {step !== "saving" && <Icon name="check" size={16} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="modal-kicker">
              {speechIsPurchase
                ? "STOK MASUK — PERIKSA DULU, LALU SIMPAN"
                : debtor
                  ? "SIMPEN DULU — PERIKSA DULU, LALU SIMPAN"
                  : "PERIKSA DULU, LALU SIMPAN"}
            </span>
            <h2>{speechIsPurchase ? "Tambah stok dari suara?" : debtor ? `Utang untuk ${debtor}?` : "Apakah sudah benar?"}</h2>
            <p>
              {speechIsPurchase
                ? "Ucapan “membeli/beli” dicatat sebagai stok masuk, bukan penjualan."
                : "AI hanya mengusulkan. Periksa nama barang, jumlah, dan harga sebelum menyimpan."}
            </p>
            {aiFallback && (
              <small className="ask-note receipt-scan-note">
                AI belum terhubung saat ini — hasil di bawah memakai pembacaan lokal di perangkat.
              </small>
            )}
            <div className="transcript-box">
              <Icon name="mic" size={15} />
              <span>“{transcript}”</span>
            </div>
            {debtor !== null && (
              <CustomerNameField
                id="debtor-name"
                label="Nama pihak yang menyimpan"
                value={debtor}
                onChange={setDebtor}
              />
            )}
            <ConfirmEditor
              items={items}
              products={products}
              mode={debtor ? "utang" : "sale"}
              onChange={setItems}
            />
            {overLimit && debtorCustomer && debtorCustomer.maxDebt != null && (
              <div className="form-error">
                <Icon name="warning" size={15} />
                <span>
                  <b>{debtorCustomer.name}</b> sudah mencapai batas limit maksimal utang (
                  {rupiah(debtorCustomer.maxDebt)}): belum lunas {rupiah(openDebtNow)} + utang baru{" "}
                  {rupiah(confirmTotal(items))} = {rupiah(projectedDebt)}. Mohon lunasi utangnya
                  dahulu, utang ini tidak dicatat.
                </span>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="confirm-total">
              <span>{speechIsPurchase ? "Total belanja" : debtor ? "Total utang" : "Total penjualan"}</span>
              <strong>{rupiah(confirmTotal(items))}</strong>
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={reset} disabled={step === "saving"}>
                <Icon name="mic" size={16} /> Ulangi
              </button>
              <button
                className="primary-action"
                onClick={() => void handleSave()}
                disabled={
                  step === "saving" ||
                  overLimit ||
                  !confirmIsValid(items, products, debtor ? "utang" : "sale")
                }
              >
                {step === "saving"
                  ? "Menyimpan…"
                  : speechIsPurchase
                    ? "Tambah stok"
                    : debtor
                      ? "Catat utang"
                      : "Simpan penjualan"}
                {step !== "saving" && <Icon name="check" size={16} />}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <span className="modal-kicker">
            {isCatalog ? "DAFTARKAN BARANG" : "CATAT PENJUALAN"}
          </span>
          <h2>
            {step === "listening"
              ? "Saya sedang mendengarkan…"
              : isCatalog
                ? "Sebutkan barang di warung"
                : "Sebutkan barang yang terjual"}
          </h2>
          {!online && (
            <div className="data-banner warning" role="status">
              <div>
                <strong>Anda sedang offline</strong>
                <span>
                  Mikrofon butuh internet untuk mengenali suara. Ketik manual di bawah,
                  atau coba lagi saat internet kembali.
                </span>
              </div>
            </div>
          )}
          <p>
            {isCatalog ? (
              <>
                Contoh: “Beras 14 ribu, gula 17 ribu dan mi instan 3rb.” Bisa sekalian stok:
                “Beras 20 kilo 14 ribu.” Hasilnya bisa Anda periksa dan ubah.
              </>
            ) : (
              <>
                Contoh: “Terjual beras 10 kilo dan telur 2 papan.” Setelah selesai, hasilnya bisa
                Anda periksa dan ubah.
              </>
            )}
          </p>

          <button
            className={`mic-button ${step === "listening" ? "listening" : ""}`}
            onClick={step === "listening" ? stopListening : startListening}
            aria-label={step === "listening" ? "Berhenti merekam" : "Mulai merekam suara"}
            disabled={!online}
            title={!online ? "Mikrofon butuh internet" : undefined}
          >
            <Icon name={step === "listening" ? "close" : "mic"} size={36} />
          </button>
          <span className="mic-hint">
            {!online
              ? "Offline — ketik manual di bawah"
              : step === "listening"
                ? "Tekan untuk berhenti"
                : "Tekan mikrofon lalu bicara"}
          </span>

          {(transcript || interim) && (
            <div className="live-transcript">
              {transcript} <span>{interim}</span>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="manual-entry">
            <label htmlFor="manual-voice">Tidak bisa pakai mikrofon? Ketik manual</label>
            <div>
              <input
                id="manual-voice"
                placeholder={
                  isCatalog
                    ? "Contoh: beras 14 ribu, gula 17 ribu"
                    : "Contoh: terjual 2 kg gula dan 5 bungkus mi"
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void processTranscript(event.currentTarget.value)
                  }
                }}
              />
              <button
                onClick={(event) => {
                  const input = event.currentTarget.previousElementSibling as HTMLInputElement
                  void processTranscript(input.value)
                }}
              >
                Proses
              </button>
            </div>
            {!supported && (
              <small>
                Browser ini tidak mendukung Web Speech API. Gunakan kolom manual di atas.
              </small>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}


