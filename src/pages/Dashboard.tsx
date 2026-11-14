import { useEffect, useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { StockInModal } from "../components/StockInModal"
import { useAuth } from "../lib/auth"
import { useWarung } from "../lib/store"
import { callAskWarung, callAdvisor, callSeasonalAdvisor } from "../lib/api"
import { buildLedgerDigest, ledgerContext, ledgerInsights } from "../lib/ledger"
import {
  buildCapitalReport,
  readCapitalInput,
  writeCapitalInput,
  type CapitalInput,
} from "../lib/capital"
import {
  deadlineLabel,
  longDate,
  numberID,
  productInitials,
  productLabel,
  rupiah,
  shortDate,
  timeWIB,
} from "../lib/format"
import {
  greetingForHour,
  statusColor,
  statusFor,
  transactionAmount,
  transactionIcon,
  transactionTitle,
  transactionTone,
} from "../lib/display"
import { computeMonthRhythm } from "../lib/monthRhythm"
import { computeCostWatch, suggestSellPrice, type CostMove } from "../lib/costWatch"
import { buildCustomerProfiles } from "../lib/customers"
import type { NavLabel } from "../lib/nav"
import type { AdvisorTip } from "../lib/types"

const PRICE_HINT_KEY = "warung-pintar-price-hints-v1"

function readHandledHints(): string[] {
  try {
    const raw = window.localStorage.getItem(PRICE_HINT_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

function priceHintToken(move: CostMove): string {
  return `${move.productId}:${move.lastCost}`
}

export function Dashboard({
  onVoice,
  onReceipt,
  onNavigate,
}: {
  onVoice: () => void
  onReceipt: () => void
  onNavigate: (nav: NavLabel) => void
}) {
  const {
    stats,
    products,
    transactions,
    debts,
    customers,
    settleDebt,
    setSellPrice,
    source,
    seasonal: seasonalPlan,
    expenses,
  } = useWarung()
  const { user } = useAuth()
  const [aiTips, setAiTips] = useState<AdvisorTip[] | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState("")
  const [askQuestion, setAskQuestion] = useState("")
  const [askAnswer, setAskAnswer] = useState("")
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState("")
  const [showSeasonalSignals, setShowSeasonalSignals] = useState(false)
  const [seasonalAiTips, setSeasonalAiTips] = useState<AdvisorTip[] | null>(null)
  const [seasonalAiLoading, setSeasonalAiLoading] = useState(false)
  const [seasonalAiNote, setSeasonalAiNote] = useState("")
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [draftPrice, setDraftPrice] = useState("")
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceError, setPriceError] = useState("")
  const [savedPriceId, setSavedPriceId] = useState("")
  const [handledHints, setHandledHints] = useState<string[]>(readHandledHints)
  const [ledgerAnswer, setLedgerAnswer] = useState("")
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState("")
  const [stockInOpen, setStockInOpen] = useState(false)
  const [stockInProductId, setStockInProductId] = useState<string | undefined>(undefined)
  const openStockIn = (productId?: string) => {
    setStockInProductId(productId)
    setStockInOpen(true)
  }
  const closeStockIn = () => {
    setStockInOpen(false)
    setStockInProductId(undefined)
  }
  // Modal awal: satu angka dari pemilik warung, disimpan di perangkatnya.
  const [capitalInput, setCapitalInput] = useState<CapitalInput | null>(() => readCapitalInput())
  const [capitalDraft, setCapitalDraft] = useState(() => ({
    amount: capitalInput ? String(capitalInput.amount) : "",
    since: capitalInput?.since ?? new Date().toISOString().slice(0, 10),
  }))
  const [capitalEditing, setCapitalEditing] = useState(false)
  const [capitalError, setCapitalError] = useState("")
  const seasonal = seasonalPlan
  const rhythm = useMemo(() => computeMonthRhythm(products, transactions), [products, transactions])
  const costWatch = useMemo(
    () => computeCostWatch(products, transactions),
    [products, transactions],
  )
  const openDebts = useMemo(() => debts.filter((debt) => !debt.settled_at), [debts])

  // Orang yang masih punya utang: nama, total utang, dan tenggat (deadline).
  const debtorProfiles = useMemo(() => {
    const profiles = buildCustomerProfiles(customers, debts).filter(
      (profile) => profile.openDebt > 0,
    )
    return profiles.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      const aDeadline = a.debtDeadline ?? "9999-12-31"
      const bDeadline = b.debtDeadline ?? "9999-12-31"
      if (aDeadline !== bDeadline) return aDeadline < bDeadline ? -1 : 1
      return b.openDebt - a.openDebt
    })
  }, [customers, debts])

  // Buku dagang: angka dari transaksi, AI cuma menyusun kalimat.
  const ledger = useMemo(
    () => buildLedgerDigest(products, transactions, debts),
    [debts, products, transactions],
  )
  const ledgerFacts = useMemo(() => ledgerInsights(ledger), [ledger])

  const capitalReport = useMemo(
    () => (capitalInput ? buildCapitalReport(capitalInput, products, transactions, debts) : null),
    [capitalInput, debts, products, transactions],
  )

  const askLedger = async () => {
    setLedgerLoading(true)
    setLedgerError("")
    setLedgerAnswer("")
    try {
      const result = await callAskWarung(
        "Dari buku dagang 30 hari terakhir, apa yang berubah dan apa yang perlu dicek di warung ini?",
        ledgerContext(ledger),
      )
      setLedgerAnswer(result?.answer ?? "")
      if (!result?.answer) {
        setLedgerError("AI belum menjawab. Temuan di atas tetap bisa dipakai.")
      }
    } catch {
      setLedgerError("AI belum aktif sekarang. Temuan di atas tetap bisa dipakai.")
    } finally {
      setLedgerLoading(false)
    }
  }
  const costMoves = useMemo(
    () =>
      costWatch.moves.map((move) => {
        const product = products.find((item) => item.id === move.productId)
        const suggestion = product ? suggestSellPrice(product.sell_price, move) : null
        const handled = handledHints.includes(priceHintToken(move))
        return {
          move,
          suggestion: suggestion && !suggestion.ok && !handled ? suggestion : null,
        }
      }),
    [costWatch.moves, handledHints, products],
  )
  const openDebtTotal = useMemo(
    () => openDebts.reduce((total, debt) => total + debt.amount, 0),
    [openDebts],
  )
  const today = stats.salesByDay[stats.salesByDay.length - 1]?.sales ?? 0
  const yesterday = stats.salesByDay[stats.salesByDay.length - 2]?.sales ?? 0
  const trend = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0
  const margin = today > 0 ? (stats.todayGrossProfit / today) * 100 : 0

  // Pengeluaran belanja stok hari ini: penjualan hari itu dikurangi biaya
  // pembelian stok, dapat penghasilan bersih dan marjin barunya.
  const expenseTotal = expenses.total
  const netIncome = stats.todaySales - expenseTotal - stats.todayConsignmentPayable
  const netMargin = stats.todaySales > 0 ? (netIncome / stats.todaySales) * 100 : 0

  const settleAllForPerson = (profile: { name: string }) => {
    const target = profile.name.trim().toLowerCase()
    const ids = openDebts
      .filter((debt) => debt.debtor.trim().toLowerCase() === target)
      .map((debt) => debt.id)
    if (ids.length === 0) return
    void Promise.all(ids.map((id) => settleDebt(id))).catch(() => {
      // Kesalahan sinkron individual tidak mematikan panel; utang tetap
      // bisa dilunasi satu-satu lewat tombolnya.
    })
  }

  const applySellPrice = async (move: CostMove, price: number) => {
    setPriceBusy(true)
    setPriceError("")
    try {
      await setSellPrice(move.productId, price)
      setSavedPriceId(move.productId)
      setEditingPriceId(null)
      setHandledHints((current) => {
        const next = [...current, priceHintToken(move)]
        try {
          window.localStorage.setItem(PRICE_HINT_KEY, JSON.stringify(next))
        } catch {
          // Penyimpanan lokal penuh/blokir: saran boleh muncul lagi, tidak fatal.
        }
        return next
      })
    } catch (error) {
      setPriceError(error instanceof Error ? error.message : "Gagal menyimpan harga jual.")
    } finally {
      setPriceBusy(false)
    }
  }

  const submitSellPrice = (move: CostMove) => {
    // Buang separator ribuan gaya Indonesia ("17.000") — kalau tidak, Number()
    // membacanya sebagai 17 dan harga jual jadi hancur.
    const price = Number(draftPrice.replace(/[^\d]/g, ""))
    if (!Number.isFinite(price) || price <= 0) {
      setPriceError("Harga jual harus lebih dari nol.")
      return
    }
    void applySellPrice(move, price)
  }
  const tips = aiTips ?? stats.tips
  const topTip = tips[0]

  useEffect(() => {
    setAiTips(null)
    setAiError("")
  }, [stats.lowStockCount, stats.weekSales, stats.weekTransactions])

  const requestAiTips = async () => {
    setAiLoading(true)
    setAiError("")
    try {
      const result = await callAdvisor({
        tips: stats.tips,
        weekSales: stats.weekSales,
        weekCogs: stats.weekSales - stats.weekGrossProfit,
        lowStock: stats.lowStock.map((product) => ({
          name: product.name,
          stock: product.stock,
          unit: product.unit,
          min_stock: product.min_stock,
        })),
      })
      if (result?.tips?.length) {
        setAiTips(result.tips)
      } else {
        setAiError("AI belum memberi saran. Saran lokal tetap dipakai.")
      }
    } catch {
      setAiError("Saran AI belum tersedia. Saran lokal tetap dipakai.")
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    setSeasonalAiTips(null)
    setSeasonalAiNote("")
  }, [seasonal.generatedAt])

  const requestSeasonalAi = async () => {
    setSeasonalAiLoading(true)
    setSeasonalAiNote("")
    try {
      const result = await callSeasonalAdvisor(seasonal, {
        weekSales: stats.weekSales,
        weekCogs: stats.weekSales - stats.weekGrossProfit,
      })
      if (result?.tips?.length) {
        setSeasonalAiTips(result.tips)
      } else {
        setSeasonalAiNote("AI belum memberi saran. Rencana lokal tetap dipakai.")
      }
    } catch {
      setSeasonalAiNote("AI belum aktif. Rencana lokal tetap dipakai.")
    } finally {
      setSeasonalAiLoading(false)
    }
  }

  const askContext = useMemo(
    () => ({
      totalProducts: stats.totalProducts,
      today: {
        sales: stats.todaySales,
        grossProfit: stats.todayGrossProfit,
        transactions: stats.todayTransactions,
      },
      week: {
        sales: stats.weekSales,
        grossProfit: stats.weekGrossProfit,
        transactions: stats.weekTransactions,
      },
      salesByDay: stats.salesByDay.slice(-14),
      lowStock: stats.lowStock.slice(0, 10).map((product) => ({
        name: product.name,
        stock: product.stock,
        unit: product.unit,
        minStock: product.min_stock,
      })),
      suggestions: stats.suggestions.map((suggestion) => ({
        name: suggestion.name,
        suggestedQty: suggestion.suggestedQty,
        unit: suggestion.unit,
      })),
    }),
    [stats],
  )

  const requestAsk = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || askLoading) return
    setAskLoading(true)
    setAskError("")
    setAskAnswer("")
    try {
      const result = await callAskWarung(trimmed, askContext)
      if (result?.answer) {
        setAskAnswer(result.answer)
      } else {
        setAskError("AI belum menjawab. Coba lagi atau lihat angka langsung di Laporan.")
      }
    } catch {
      setAskError("AI belum aktif sekarang. Angka tetap tersedia di Laporan.")
    } finally {
      setAskLoading(false)
    }
  }

  return (
    <>
      <section className="greeting">
        <div>
          <span className="date-label">RINGKASAN USAHA · {longDate()}</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🌤️
            </span>{" "}
            {greetingForHour(new Date().getHours())}, {user?.name ?? "Pemilik Warung"}
          </h1>
          <p>Berikut kondisi warung Anda untuk hari ini.</p>
        </div>
        <button className="period-button" onClick={() => onNavigate("Laporan")}>
          Hari ini <Icon name="down" size={16} />
        </button>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon revenue">Rp</span>
            {yesterday > 0 && (
              <span className={`trend ${trend >= 0 ? "positive" : "warning"}`}>
                <Icon name={trend >= 0 ? "up" : "down"} size={13} /> {numberID(Math.abs(trend), 1)}%
                vs kemarin
              </span>
            )}
          </div>
          <span className="stat-label">Penjualan hari ini</span>
          <strong>{rupiah(stats.todaySales)}</strong>
          <small>
            {stats.todayConsignmentSales > 0
              ? `Termasuk omzet titipan ${rupiah(stats.todayConsignmentSales)} · ${stats.todayTransactions} transaksi`
              : `${stats.todayTransactions} transaksi tercatat hari ini`}
          </small>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon profit">
              <Icon name="chart" size={20} />
            </span>
            <span className="trend">Margin {numberID(margin, 1)}%</span>
          </div>
          <span className="stat-label">Laba kotor hari ini</span>
          <strong>{rupiah(stats.todayGrossProfit)}</strong>
          <small>
            {stats.todayConsignmentCommission > 0
              ? `Termasuk komisi titipan ${rupiah(stats.todayConsignmentCommission)}`
              : "Penjualan dikurangi modal barang terjual"}
          </small>
        </article>
        <article className="stat-card stock-summary">
          <div className="stat-top">
            <span className="stat-icon inventory">
              <Icon name="box" size={20} />
            </span>
            <span className={`trend ${stats.lowStockCount > 0 ? "warning" : "positive"}`}>
              <Icon name={stats.lowStockCount > 0 ? "warning" : "check"} size={13} />{" "}
              {stats.lowStockCount > 0 ? "Perlu dicek" : "Aman"}
            </span>
          </div>
          <span className="stat-label">Total jenis barang</span>
          <strong>
            {stats.totalProducts} <em>barang</em>
          </strong>
          <small>
            <b>{stats.lowStockCount} barang</b> di bawah stok minimum
          </small>
        </article>
      </section>

      <section className="panel capital-panel" id="modal-awal">
        <div className="panel-heading">
          <div>
            <h2>Modal awal & untung/rugi</h2>
            <p>
              Masukkan modal yang Anda pakai mulai berjualan, lalu bandingkan dengan uang Anda
              sekarang.
            </p>
          </div>
          {capitalInput && (
            <button onClick={() => setCapitalEditing((current) => !current)}>
              {capitalEditing ? "Sembunyikan" : "Ubah"} <Icon name="arrow" size={16} />
            </button>
          )}
        </div>

        {(!capitalInput || capitalEditing) && (
          <div className="capital-form">
            <label>
              Modal awal (stok + kas)
              <input
                inputMode="numeric"
                value={capitalDraft.amount}
                onChange={(event) =>
                  setCapitalDraft({ ...capitalDraft, amount: event.target.value })
                }
                placeholder="Contoh: 5000000"
              />
            </label>
            <label>
              Mulai sejak
              <input
                type="date"
                value={capitalDraft.since}
                onChange={(event) =>
                  setCapitalDraft({ ...capitalDraft, since: event.target.value })
                }
              />
            </label>
            <button
              className="primary-action"
              onClick={() => {
                const amount = Number(capitalDraft.amount.replace(/[^\d]/g, "")) || 0
                if (amount <= 0) {
                  setCapitalError("Isi modal awalnya lebih dari nol.")
                  return
                }
                const input = { amount, since: capitalDraft.since }
                writeCapitalInput(input)
                setCapitalInput(input)
                setCapitalEditing(false)
                setCapitalError("")
              }}
            >
              <Icon name="check" size={16} /> Simpan modal awal
            </button>
            {capitalError && <div className="form-error">{capitalError}</div>}
          </div>
        )}

        {capitalInput && capitalReport && (
          <>
            <div className={`capital-verdict ${capitalReport.verdict}`}>
              <strong>{capitalReport.message}</strong>
              <small>
                Modal awal {rupiah(capitalReport.initial)} · posisi modal sekarang{" "}
                {rupiah(capitalReport.estimatedNow)}
              </small>
            </div>
            <div className="capital-metrics">
              <div>
                <small>Di rak (stok)</small>
                <strong>{rupiah(capitalReport.stockValue)}</strong>
              </div>
              <div>
                <small>Laba kotor</small>
                <strong>{rupiah(capitalReport.grossProfit)}</strong>
              </div>
              <div>
                <small>Piutang (utang)</small>
                <strong>{rupiah(capitalReport.openDebt)}</strong>
              </div>
              <div>
                <small>Modal awal</small>
                <strong>{rupiah(capitalReport.initial)}</strong>
              </div>
            </div>
            <small className="ask-note">
              Perhitungan dari catatan: nilai stok memakai harga modal, laba kotor dari penjualan
              setelah tanggal modal awal ditambah komisi barang titipan, Piutang dari utang yang
              belum lunas. Uang tunai di laci belum ikut dihitung.
            </small>
          </>
        )}
      </section>

      <section className="quick-section">
        <div className="section-heading">
          <div>
            <h2>Mau catat apa sekarang?</h2>
            <p>Pilih cara paling mudah untuk mencatat aktivitas warung.</p>
          </div>
        </div>
        <div className="quick-grid">
          <button className="quick-card voice" onClick={onVoice}>
            <span className="quick-icon">
              <Icon name="mic" size={30} />
            </span>
            <span>
              <strong>Catat dengan suara</strong>
              <small>Cukup sebutkan barang yang terjual</small>
            </span>
            <Icon name="arrow" className="quick-arrow" />
          </button>
          <button className="quick-card receipt" onClick={onReceipt}>
            <span className="quick-icon">
              <Icon name="camera" size={30} />
            </span>
            <span>
              <strong>Foto nota kulakan</strong>
              <small>Restock barang baru atau lama; stok diperbarui setelah Anda mengonfirmasi</small>
            </span>
            <Icon name="arrow" className="quick-arrow" />
          </button>
          <button className="quick-card stockin" onClick={() => openStockIn()}>
            <span className="quick-icon">
              <Icon name="box" size={30} />
            </span>
            <span>
              <strong>Tambah stok manual</strong>
              <small>Pilih barang dari stok, isi jumlah masuk dan biaya belanjanya</small>
            </span>
            <Icon name="arrow" className="quick-arrow" />
          </button>
        </div>
      </section>

      <section className="panel closing-panel" id="tutup-buku">
        <div className="panel-heading">
          <div>
            <h2>Tutup buku hari ini</h2>
            <p>Ringkasan singkat sebelum tutup warung: uang, utang, dan yang harus dibeli besok.</p>
          </div>
          <button onClick={() => onNavigate("Tutup Buku")}>
            Buka <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="closing-inline">
          <div>
            <small>Penjualan hari ini</small>
            <strong>{rupiah(stats.todaySales)}</strong>
          </div>
          <div>
            <small>Laba kotor</small>
            <strong>{rupiah(stats.todayGrossProfit)}</strong>
          </div>
          <div>
            <small>Belanja stok</small>
            <strong>{rupiah(expenseTotal)}</strong>
          </div>
          <div>
            <small>Bersih hari ini</small>
            <strong>{rupiah(netIncome)}</strong>
          </div>
          <div>
            <small>Utang berjalan</small>
            <strong>{rupiah(openDebtTotal)}</strong>
          </div>
          <div>
            <small>Perlu restok</small>
            <strong>{stats.lowStockCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel pengeluaran-panel" id="pengeluaran">
        <div className="panel-heading">
          <div>
            <h2>Pengeluaran belanja hari ini</h2>
            <p>Biaya stok yang masuk hari ini, dipotong dari penjualan untuk penghasilan bersih.</p>
          </div>
          <button onClick={() => openStockIn()}>
            <Icon name="plus" size={16} /> Catat belanja
          </button>
        </div>
        <div className="closing-inline">
          <div>
            <small>Pengeluaran belanja</small>
            <strong>{rupiah(expenseTotal)}</strong>
          </div>
          <div>
            <small>Penjualan hari ini</small>
            <strong>{rupiah(stats.todaySales)}</strong>
          </div>
          <div>
            <small>Penghasilan bersih</small>
            <strong>{rupiah(netIncome)}</strong>
          </div>
          <div>
            <small>Marjin bersih</small>
            <strong>{numberID(netMargin, 1)}%</strong>
          </div>
        </div>
        {expenses.recent.length > 0 ? (
          <div className="transaction-list">
            {expenses.recent.map((entry) => (
              <div className="transaction-item" key={entry.id}>
                <span className="transaction-icon orange">
                  <Icon name="down" size={19} />
                </span>
                <div>
                  <strong>{entry.name} · stok masuk</strong>
                  <small>
                    {numberID(entry.qty)} {entry.unit} ·{" "}
                    {timeWIB(new Date(entry.time).toISOString())} WIB
                  </small>
                </div>
                <b className="orange">−{rupiah(entry.total)}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <Icon name="receipt" size={22} />
            <strong>Belum ada pengeluaran belanja hari ini</strong>
            <span>Setelah menambah stok, biaya belanjanya muncul di sini.</span>
          </div>
        )}
        <small className="ask-note">
          Penghasilan bersih = penjualan hari ini {rupiah(stats.todaySales)} − belanja stok{" "}
          {rupiah(expenseTotal)} − bagian pemilik titipan {rupiah(stats.todayConsignmentPayable)}.
          Marjin bersih = penghasilan bersih ÷ penjualan.
        </small>
      </section>

      <section className="panel utang-panel" id="simpen-dulu">
        <div className="panel-heading">
          <div>
            <h2>Simpen dulu</h2>
            <p>
              Buku utang per orang: catatannya, total, tenggat, dan batas maksimal. Bilang saja:
              “simpen dulu buat Pak Yono dua rokok”.
            </p>
          </div>
          <span className={`utang-badge ${debtorProfiles.length > 0 ? "warning" : ""}`}>
            {debtorProfiles.length > 0 ? `${debtorProfiles.length} orang` : "Lunas semua"}
          </span>
        </div>
        {openDebts.length === 0 ? (
          <div className="inline-empty">
            <Icon name="check" size={22} />
            <strong>Buku utang bersih</strong>
            <span>Semua utang sudah lunas. Catat utang baru lewat suara.</span>
          </div>
        ) : (
          <>
            <div className="utang-total">
              <span>Total belum lunas</span>
              <strong>{rupiah(openDebtTotal)}</strong>
            </div>
            <div className="debtors-list">
              {debtorProfiles.map((profile) => {
                const personDebts = openDebts.filter(
                  (debt) => debt.debtor.trim().toLowerCase() === profile.name.trim().toLowerCase(),
                )
                return (
                  <div className="debtor-group" key={profile.id ?? profile.name}>
                    <div className="debtor-row">
                      <div className="product-code">{productInitials(profile.name)}</div>
                      <div className="debtor-main">
                        <strong>{profile.name}</strong>
                        <small>
                          {personDebts.length} catatan · Tenggat{" "}
                          {profile.debtDeadline
                            ? deadlineLabel(profile.debtDeadline)
                            : "tanpa batas"}
                          {profile.overdue ? " · lewat tenggat" : ""}
                        </small>
                      </div>
                      {profile.atDebtLimit && <span className="debt-badge">Maks</span>}
                      <b>{rupiah(profile.openDebt)}</b>
                      <button
                        className="row-action"
                        onClick={() => settleAllForPerson(profile)}
                        aria-label={`Lunasi semua utang ${profile.name}`}
                      >
                        Lunasin
                      </button>
                      <button
                        className="row-action"
                        onClick={() => onNavigate("Piutang")}
                        aria-label={`Kelola utang ${profile.name}`}
                      >
                        Urus
                      </button>
                    </div>
                    <div className="person-debts">
                      {personDebts.map((debt) => (
                        <div className="utang-item" key={debt.id}>
                          <div className="product-code">{productInitials(debt.product_name)}</div>
                          <div>
                            <strong>{debt.product_name}</strong>
                            <small>
                              {numberID(debt.qty)} {debt.unit} · {shortDate(debt.created_at)}
                            </small>
                          </div>
                          <b>{rupiah(debt.amount)}</b>
                          <button
                            className="row-action"
                            onClick={() => void settleDebt(debt.id)}
                            aria-label={`Tandai lunas utang ${debt.debtor}`}
                          >
                            Lunas
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section className="seasonal" aria-labelledby="seasonal-title">
        <div className="seasonal-head">
          <div className="seasonal-copy">
            <span className="seasonal-kicker">Saran musim ini</span>
            <h2 id="seasonal-title">{seasonal.context.headline}</h2>
            <p>{seasonal.context.summary}</p>
          </div>
          <div className="seasonal-events">
            {seasonal.context.events.slice(0, 3).map((event) => (
              <span className={`season-event ${event.tone}`} key={event.id}>
                <b>{event.label}</b>
                <small>{event.daysUntil > 0 ? `${event.daysUntil} hari lagi` : "sekarang"}</small>
              </span>
            ))}
          </div>
        </div>

        <div className="seasonal-recs">
          {seasonal.recommendations.map((recommendation) => (
            <article className={`seasonal-rec ${recommendation.kind}`} key={recommendation.id}>
              <div className="seasonal-rec-top">
                <span>{recommendation.title}</span>
                <small>{recommendation.confidence}</small>
              </div>
              <strong>{recommendation.action}</strong>
              <p>{recommendation.reason}</p>
              {recommendation.estimatedCost ? (
                <small className="seasonal-cost">
                  Perkiraan modal {rupiah(recommendation.estimatedCost)}
                </small>
              ) : null}
            </article>
          ))}
        </div>

        {seasonalAiTips && (
          <div className="seasonal-ai">
            <span className="ai-label">Rapian AI</span>
            {seasonalAiTips.map((tip, index) => (
              <p key={`${tip.text}-${index}`}>
                <strong>{tip.text}</strong> {tip.reason}
              </p>
            ))}
          </div>
        )}

        <div className="seasonal-foot">
          <span>
            <Icon name="chart" size={14} /> {seasonal.dataDays} hari data ·{" "}
            {seasonal.context.season} · keyakinan {seasonal.context.confidence}
          </span>
          <div>
            <button onClick={() => setShowSeasonalSignals((value) => !value)}>
              {showSeasonalSignals ? "Tutup sinyal" : "Lihat sinyal"}
            </button>
            {source === "supabase" && (
              <button onClick={requestSeasonalAi} disabled={seasonalAiLoading}>
                {seasonalAiLoading ? "Menyusun…" : "Minta AI rapikan"}
              </button>
            )}
          </div>
        </div>

        {showSeasonalSignals && (
          <div className="seasonal-signals">
            <div className="seasonal-signal seasonal-signal-head">
              <span>Barang</span>
              <span>Rata-rata</span>
              <span>Musim</span>
              <span>Stok</span>
            </div>
            {seasonal.signals.slice(0, 6).map((signal) => (
              <div className="seasonal-signal" key={signal.productId}>
                <strong>{signal.name}</strong>
                <span>
                  {numberID(signal.avgDaily30, 1)} {signal.unit}/hari
                </span>
                <span className={signal.upliftPct >= 0 ? "up" : "down"}>
                  {signal.upliftPct >= 0 ? "+" : ""}
                  {numberID(signal.upliftPct)}%
                </span>
                <span>{numberID(signal.daysOfCover, 1)} hari</span>
              </div>
            ))}
          </div>
        )}

        {seasonalAiNote && <small className="seasonal-note">{seasonalAiNote}</small>}
        <small className="seasonal-note">
          Angka dihitung dari {seasonal.dataDays} hari transaksi. Saran musiman adalah estimasi,
          bukan janji.
        </small>
      </section>

      <div className="dashboard-grid">
        <section className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>Stok hampir habis</h2>
              <p>Segera beli lagi.</p>
            </div>
            <button onClick={() => onNavigate("Stok Barang")}>
              Lihat semua <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="stock-list">
            {stats.lowStock.slice(0, 3).map((product) => {
              const status = statusFor(product)
              return (
                <div className="stock-item" key={product.id}>
                  <div className="product-code">{productInitials(product.name)}</div>
                  <div className="stock-info">
                    <div>
                      <strong>{productLabel(product)}</strong>
                      <span style={{ color: statusColor[status.label] }}>{status.label}</span>
                    </div>
                    <small>
                      Tersisa {numberID(product.stock)} {product.unit} · minimum{" "}
                      {numberID(product.min_stock)} {product.unit}
                    </small>
                    <div className="progress">
                      <i
                        style={{
                          width: `${Math.max(4, status.percent)}%`,
                          background: statusColor[status.label],
                        }}
                      />
                    </div>
                  </div>
                  <button
                    aria-label={`Tambah stok ${productLabel(product)}`}
                    onClick={() => openStockIn(product.id)}
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              )
            })}
            {stats.lowStock.length === 0 && (
              <div className="inline-empty">
                <Icon name="check" size={22} />
                <strong>Semua stok aman</strong>
                <span>Belum ada barang yang melewati batas minimum.</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel transaction-panel">
          <div className="panel-heading">
            <div>
              <h2>Transaksi terbaru</h2>
              <p>Aktivitas warung hari ini.</p>
            </div>
            <button onClick={() => onNavigate("Riwayat")}>
              Lihat semua <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="transaction-list">
            {stats.recentTransactions.slice(0, 4).map((row) => (
              <div className="transaction-item" key={row.id}>
                <span className={`transaction-icon ${transactionTone(row)}`}>
                  <Icon name={transactionIcon(row)} size={19} />
                </span>
                <div>
                  <strong>{transactionTitle(row)}</strong>
                  <small>
                    {numberID(row.qty)} {row.product.unit} · {timeWIB(row.created_at)} WIB
                  </small>
                </div>
                <b className={transactionTone(row)}>{transactionAmount(row)}</b>
              </div>
            ))}
            {stats.recentTransactions.length === 0 && (
              <div className="inline-empty">
                <Icon name="receipt" size={22} />
                <strong>Belum ada transaksi</strong>
                <span>Catat penjualan pertama lewat suara atau foto nota.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {rhythm.hasData && (
        <section className="panel sinyal-panel" id="sinyal-warung">
          <div className="panel-heading">
            <div>
              <h2>Sinyal warung</h2>
              <p>
                Pola penjualan per fase tanggal dalam bulan, plus harga modal. Semuanya dihitung
                dari catatan Anda sendiri.
              </p>
            </div>
          </div>
          <div className="sinyal-grid">
            <article className="sinyal-card">
              <h3>Pola per fase tanggal</h3>
              <div className="rhythm-row">
                {rhythm.windows.map((window) => (
                  <div key={window.key}>
                    <small>{window.label}</small>
                    <strong>{rupiah(window.avgDailySales)}</strong>
                    <span>{numberID(window.days)} hari data</span>
                  </div>
                ))}
              </div>
              {rhythm.tuaVsAwalPct !== null && (
                <p>
                  Rata-rata harian tanggal tua {rhythm.tuaVsAwalPct >= 0 ? "naik" : "turun"}{" "}
                  {numberID(Math.abs(rhythm.tuaVsAwalPct))}% dibanding awal bulan.
                </p>
              )}
              {rhythm.shifts[0] && (
                <p>
                  Paling terasa: <b>{rhythm.shifts[0].name}</b>{" "}
                  {rhythm.shifts[0].changePct >= 0 ? "naik" : "turun"}{" "}
                  {numberID(Math.abs(rhythm.shifts[0].changePct))}% di tanggal tua (
                  {numberID(rhythm.shifts[0].tuaDailyQty, 1)} {rhythm.shifts[0].unit}/hari, dari{" "}
                  {numberID(rhythm.shifts[0].baseDailyQty, 1)} di fase awal dan tengah).
                </p>
              )}
            </article>
            <article className="sinyal-card">
              <h3>Modal bergerak</h3>
              {costWatch.moves.length === 0 && (
                <p>
                  Harga modal stabil — tidak ada pergeseran harga di atas 5% dari{" "}
                  {numberID(costWatch.checkedCount)} produk yang diperiksa.
                </p>
              )}
              {costMoves.map(({ move, suggestion }) => (
                <div className="cost-move" key={move.productId}>
                  <b>{move.name}</b>
                  <span>
                    Kulakan terakhir {rupiah(move.lastCost)}/{move.unit}, sebelumnya{" "}
                    {rupiah(move.prevCost)}
                  </span>
                  <b className={move.changePct >= 0 ? "up" : "down"}>
                    {move.changePct >= 0 ? "+" : "−"}
                    {numberID(Math.abs(move.changePct), 1)}% modal
                  </b>
                  {suggestion && editingPriceId !== move.productId && (
                    <div className="price-hint">
                      <span>
                        Margin {numberID(suggestion.baselineMarginPct, 1)}% →{" "}
                        {numberID(suggestion.currentMarginPct, 1)}% kalau harga jual diam.
                      </span>
                      <span>
                        Saran jual <b>{rupiah(suggestion.suggestedPrice)}</b>/{move.unit} biar
                        margin kembali seperti sebelumnya.
                      </span>
                      <button
                        className="row-action"
                        onClick={() => {
                          setEditingPriceId(move.productId)
                          setDraftPrice(String(suggestion.suggestedPrice))
                          setPriceError("")
                          setSavedPriceId("")
                        }}
                      >
                        <Icon name="plus" size={14} /> Atur harga jual
                      </button>
                    </div>
                  )}
                  {editingPriceId === move.productId && (
                    <form
                      className="price-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        submitSellPrice(move)
                      }}
                    >
                      <label>
                        Harga jual baru (sekarang {rupiah(suggestion?.currentPrice ?? 0)})
                        <input
                          value={draftPrice}
                          onChange={(event) => setDraftPrice(event.target.value)}
                          inputMode="numeric"
                          autoFocus
                        />
                      </label>
                      <div className="price-form-actions">
                        <button type="submit" disabled={priceBusy}>
                          {priceBusy ? "Menyimpan…" : "Simpan harga"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPriceId(null)}
                          disabled={priceBusy}
                        >
                          Batal
                        </button>
                      </div>
                      {priceError && <small className="price-error">{priceError}</small>}
                    </form>
                  )}
                  {savedPriceId === move.productId && (
                    <small className="price-saved">Harga jual diperbarui.</small>
                  )}
                </div>
              ))}
              <small className="sinyal-note">
                Dari transaksi kulakan nyata. Kalau modal naik, cek harga jual sebelum margin
                menyusut.
              </small>
            </article>
          </div>
        </section>
      )}

      {source === "supabase" && (
        <section className="panel ledger-panel" id="baca-dagang">
          <div className="panel-heading">
            <div>
              <h2>AI baca buku dagang</h2>
              <p>
                Bukan chat: AI membaca 30 hari catatanmu, lalu bilang apa yang berubah dan apa yang
                perlu dicek.
              </p>
            </div>
            <button onClick={() => void askLedger()} disabled={ledgerLoading}>
              {ledgerLoading ? "Membaca…" : "Minta AI membaca"}
            </button>
          </div>

          {ledgerFacts.length > 0 ? (
            <ul className="ledger-facts">
              {ledgerFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : (
            <div className="inline-empty">
              <Icon name="check" size={22} />
              <strong>Belum ada yang janggal</strong>
              <span>
                30 hari terakhir terlihat normal: tidak ada transaksi kecil, harga di bawah modal,
                atau jam ganjil.
              </span>
            </div>
          )}

          {ledgerAnswer && (
            <div className="ledger-answer">
              <span className="modal-kicker">BACAAN AI</span>
              <p>{ledgerAnswer}</p>
            </div>
          )}
          {ledgerError && <div className="form-error">{ledgerError}</div>}
        </section>
      )}

      {source === "supabase" && (
        <section className="panel ask-panel" id="tanya-warung">
          <div className="panel-heading">
            <div>
              <h2>Tanya warung Anda</h2>
              <p>AI menjawab dari angka catatan Anda sendiri — bukan karangan.</p>
            </div>
          </div>
          <form
            className="ask-form"
            onSubmit={(event) => {
              event.preventDefault()
              void requestAsk(askQuestion)
            }}
          >
            <input
              value={askQuestion}
              onChange={(event) => setAskQuestion(event.target.value)}
              placeholder="Contoh: kenapa penjualan kemarin turun?"
              aria-label="Pertanyaan untuk asisten"
              maxLength={300}
            />
            <button type="submit" disabled={askLoading || askQuestion.trim().length === 0}>
              {askLoading ? "Menjawab…" : "Tanya"}
            </button>
          </form>
          <div className="ask-chips">
            {[
              "Bagaimana penjualan minggu ini?",
              "Barang apa yang perlu dibeli ulang?",
              "Kapan sebaiknya kulakan?",
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setAskQuestion(sample)
                  void requestAsk(sample)
                }}
              >
                {sample}
              </button>
            ))}
          </div>
          {askAnswer && <p className="ask-answer">{askAnswer}</p>}
          {askError && <small className="ask-note">{askError}</small>}
          <small className="ask-note">
            AI hanya menjelaskan angka dari catatan Anda; tidak menghitung angka baru.
          </small>
        </section>
      )}

      <section className="advisor" id="advisor">
        <div className="advisor-copy">
          <span className="ai-label">Saran stok harian</span>
          <h2>Siapkan stok untuk 3 hari ke depan</h2>
          <p>
            {topTip ? (
              <>
                {topTip.text} <strong>{topTip.reason}</strong>
              </>
            ) : (
              <>
                Belum ada cukup data penjualan untuk membuat saran. Catat beberapa transaksi
                terlebih dahulu.
              </>
            )}
          </p>
          <button onClick={() => onNavigate("Laporan")}>
            Lihat analisis lengkap <Icon name="arrow" size={17} />
          </button>
          {source === "supabase" && (
            <button onClick={requestAiTips} disabled={aiLoading}>
              {aiLoading ? "Menyusun saran…" : "Minta saran AI"}
            </button>
          )}
          {aiError && <small className="advisor-note">{aiError}</small>}
          <small className="advisor-note">
            Angka dihitung dari transaksi. Saran adalah perkiraan, bukan janji.
          </small>
        </div>
        <div className="recommendation">
          {stats.suggestions.map((suggestion, index) => (
            <div key={suggestion.productId}>
              <span className={`rec-icon ${["rice", "egg", "oil"][index] ?? "rice"}`}>
                {productInitials(suggestion.name)}
              </span>
              <span>
                <small>Tambah stok</small>
                <strong>
                  {suggestion.name} +{numberID(suggestion.suggestedQty)} {suggestion.unit}
                </strong>
              </span>
            </div>
          ))}
          {stats.suggestions.length === 0 && (
            <div className="recommendation-empty">
              <Icon name="check" size={20} />
              <span>
                <strong>Stok aman</strong>
                <small>Belum ada barang yang perlu dibeli untuk 3 hari ke depan.</small>
              </span>
            </div>
          )}
        </div>
      </section>

      <p className="dashboard-footnote">
        {products.filter((product) => product.archived !== true).length} jenis barang dipantau · {stats.weekTransactions} transaksi dalam 7 hari
        terakhir.
      </p>

      {stockInOpen && <StockInModal defaultProductId={stockInProductId} onClose={closeStockIn} />}
    </>
  )
}
