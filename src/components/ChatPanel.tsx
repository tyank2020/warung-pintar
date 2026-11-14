import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "./Icon"
import { useWarung } from "../lib/store"
import { callAskWarung } from "../lib/api"
import {
  addMessage,
  createSession,
  deleteSession,
  readSessions,
  recentTurns,
  renameSession,
  upsertSession,
  writeSessions,
  type ChatSession,
} from "../lib/chat"
import { fallbackAnswer, type ChatFacts } from "../lib/chatAnswers"

const QUICK_QUESTIONS = [
  "Bagaimana penjualan minggu ini?",
  "Barang apa yang perlu dibeli ulang?",
  "Siapa yang paling banyak utang?",
  "Kapan sebaiknya kulakan?",
  "Barang apa yang paling laku?",
]

/**
 * Asisten warung dengan sesi.
 *
 * Semua angka dikirim dari database (dihitung di aplikasi), AI hanya menyusun
 * kalimatnya. Kalau AI tidak tersedia, jawaban tetap dihitung sendiri dari
 * data yang sama — jadi obrolan tidak pernah kosong.
 */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { stats, debts } = useWarung()
  const [sessions, setSessions] = useState<ChatSession[]>(() => readSessions())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sessions.length > 0) return
    const session = createSession()
    setSessions([session])
    setActiveId(session.id)
  }, [sessions.length])

  const active = sessions.find((session) => session.id === activeId) ?? sessions[0] ?? null

  const persist = (session: ChatSession) => {
    setSessions((current) => {
      const next = upsertSession(current, session)
      writeSessions(next)
      return next
    })
  }

  const facts = useMemo<ChatFacts>(() => {
    const open = debts.filter((debt) => !debt.settled_at)
    const byDebtor = new Map<string, number>()
    for (const debt of open) {
      byDebtor.set(debt.debtor, (byDebtor.get(debt.debtor) ?? 0) + debt.amount)
    }
    const top = [...byDebtor.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      todaySales: stats.todaySales,
      todayTransactions: stats.todayTransactions,
      todayProfit: stats.todayGrossProfit,
      weekSales: stats.weekSales,
      weekProfit: stats.weekGrossProfit,
      weekTransactions: stats.weekTransactions,
      openDebts: open.length,
      debtAmount: open.reduce((total, debt) => total + debt.amount, 0),
      topDebtor: top ? { name: top[0], amount: top[1] } : null,
      lowStock: stats.lowStock.slice(0, 6).map((product) => ({
        name: product.name,
        stock: product.stock,
        unit: product.unit,
        minStock: product.min_stock,
      })),
      suggestions: stats.suggestions.map((suggestion) => ({
        name: suggestion.name,
        qty: suggestion.suggestedQty,
        unit: suggestion.unit,
        cost: suggestion.estimatedCost,
      })),
      topProduct: stats.topProducts[0]
        ? {
            name: stats.topProducts[0].name,
            qty: stats.topProducts[0].qty,
            revenue: stats.topProducts[0].revenue,
          }
        : null,
    }
  }, [stats, debts])

  const context = useMemo(
    () => ({
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
      lowStock: facts.lowStock,
      suggestions: stats.suggestions.map((suggestion) => ({
        name: suggestion.name,
        suggestedQty: suggestion.suggestedQty,
        unit: suggestion.unit,
      })),
      topProducts: stats.topProducts.map((product) => ({
        name: product.name,
        qty: product.qty,
        revenue: product.revenue,
      })),
      debts: {
        open: facts.openDebts,
        totalAmount: facts.debtAmount,
        topDebtor: facts.topDebtor,
      },
      // Riwayat percakapan ikut dikirim supaya jawaban bisa menyambung
      // pertanyaan sebelumnya. Angkanya tetap dari data di atas.
      history: active ? recentTurns(active, 4) : [],
    }),
    [active, facts, stats],
  )

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [active?.messages.length, busy])

  const send = async (raw: string) => {
    const question = raw.trim()
    if (!question || busy || !active) return
    setInput("")
    let session = addMessage(active, "user", question)
    persist(session)
    setBusy(true)

    try {
      const result = await callAskWarung(question, context)
      const answer = result?.answer?.trim()
      session = addMessage(
        session,
        "assistant",
        answer ||
          fallbackAnswer(question, facts) ||
          "AI belum menjawab. Coba pertanyaan lain — atau lihat angka langsung di Beranda dan Laporan.",
      )
    } catch {
      session = addMessage(
        session,
        "assistant",
        fallbackAnswer(question, facts) ||
          "AI belum aktif sekarang. Angka warung tetap lengkap di Beranda, Stok Barang, dan Laporan.",
      )
    } finally {
      setBusy(false)
      persist(session)
    }
  }

  const startNewSession = () => {
    const session = createSession()
    setSessions((current) => {
      const next = upsertSession(current, session)
      writeSessions(next)
      return next
    })
    setActiveId(session.id)
    setHistoryOpen(false)
    setInput("")
  }

  const handleDelete = (id: string) => {
    setSessions((current) => {
      const next = deleteSession(current, id)
      writeSessions(next)
      return next
    })
    if (activeId === id) {
      const fallback = sessions.find((session) => session.id !== id)
      setActiveId(fallback?.id ?? null)
    }
  }

  const handleRename = (id: string) => {
    if (!renameValue.trim()) return
    setSessions((current) => {
      const next = renameSession(current, id, renameValue)
      writeSessions(next)
      return next
    })
    setRenamingId(null)
    setRenameValue("")
  }

  const panelRef = useRef<HTMLDivElement>(null)

  // Escape menutup panel, dan fokus masuk ke dalam (bukan terjebak di luar).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    const previous = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>("button")
    first?.focus()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="chat-drawer" role="dialog" aria-modal="true" aria-label="Asisten warung" ref={panelRef}>
      <div className="chat-head">
        <div>
          <span className="modal-kicker">ASISTEN WARUNG</span>
          <strong>Tanya apa saja soal warung ini</strong>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Tutup">
          <Icon name="close" />
        </button>
      </div>

      <div className="chat-toolbar">
        <button className="secondary-action" onClick={startNewSession}>
          <Icon name="plus" size={15} /> Sesi baru
        </button>
        <button
          className={historyOpen ? "secondary-action active" : "secondary-action"}
          onClick={() => setHistoryOpen((current) => !current)}
        >
          <Icon name="clock" size={15} /> Riwayat
        </button>
      </div>

      {historyOpen && (
        <div className="chat-history">
          {sessions.length === 0 && <p className="cashier-empty">Belum ada sesi.</p>}
          {sessions.map((session) => (
            <div key={session.id} className={session.id === active?.id ? "chat-session active" : "chat-session"}>
              {renamingId === session.id ? (
                <>
                  <input
                    value={renameValue}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleRename(session.id)
                    }}
                    aria-label="Nama sesi"
                  />
                  <button onClick={() => handleRename(session.id)} aria-label="Simpan nama">
                    <Icon name="check" size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="chat-session-title"
                    onClick={() => {
                      setActiveId(session.id)
                      setHistoryOpen(false)
                    }}
                  >
                    <span>{session.title}</span>
                    <small>{session.messages.length} pesan</small>
                  </button>
                  <button
                    className="chat-session-action"
                    onClick={() => {
                      setRenamingId(session.id)
                      setRenameValue(session.title)
                    }}
                    aria-label={`Ganti nama sesi ${session.title}`}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    className="chat-session-action"
                    onClick={() => handleDelete(session.id)}
                    aria-label={`Hapus sesi ${session.title}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="chat-messages" ref={scrollRef}>
        {!active || active.messages.length === 0 ? (
          <div className="chat-empty">
            <span className="success-orb">
              <Icon name="spark" size={24} />
            </span>
            <p>
              Tanya apa saja: penjualan, stok, utang, atau kapan sebaiknya kulakan. Semua angka
              diambil dari catatan warung Anda sendiri.
            </p>
            <div className="ask-chips">
              {QUICK_QUESTIONS.map((question) => (
                <button key={question} onClick={() => void send(question)}>
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          active.messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.role}`}>
              <span>{message.text}</span>
            </div>
          ))
        )}
        {busy && (
          <div className="chat-bubble assistant typing">
            <span>Menghitung dari data warung…</span>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault()
          void send(input)
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Contoh: laba bulan ini berapa?"
          aria-label="Pertanyaan untuk asisten"
          maxLength={300}
        />
        <button type="submit" disabled={busy || input.trim().length === 0}>
          {busy ? "Menjawab…" : "Tanya"}
        </button>
      </form>
      <small className="chat-note">
        Sesi tersimpan di perangkat ini. AI hanya menjelaskan angka dari catatanmu.
      </small>
    </div>
  )
}
