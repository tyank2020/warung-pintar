import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { useWarung } from "../lib/store"
import { groupNotesByMonth, noteSummaryLine, summarizeNotes } from "../lib/notes"
import { findNotesWithoutStock, findStockDiscrepancies, findingsForNote } from "../lib/reconcile"
import { compactRupiah, rupiah, shortDate, timeWIB } from "../lib/format"
import type { PurchaseNote } from "../lib/types"

/**
 * Riwayat nota belanja.
 *
 * Tujuannya: pemilik warung bisa memeriksa sendiri barang yang masuk —
 * dari nota mana, berapa harganya, dan siapa yang menambahkannya.
 */
export function Notes() {
  const { notes, notesLocalOnly, products, transactions } = useWarung()
  const [active, setActive] = useState<PurchaseNote | null>(null)

  const summary = useMemo(() => summarizeNotes(notes), [notes])
  const groups = useMemo(() => groupNotesByMonth(notes), [notes])

  // Temuan rekonsiliasi yang menunjuk ke nota ini.
  const findings = useMemo(
    () => [
      ...findStockDiscrepancies(products, transactions, notes),
      ...findNotesWithoutStock(products, transactions, notes),
    ],
    [notes, products, transactions],
  )
  const activeFindings = active ? findingsForNote(findings, active.id) : []

  return (
    <div className="notes-page">
      <section className="page-title">
        <div>
          <span className="date-label">RIWAYAT NOTA</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              🧾
            </span>{" "}
            Nota belanja
          </h1>
          <p>Bukti barang masuk gudang: dari nota mana, siapa yang menambah, berapa harganya.</p>
        </div>
      </section>

      <section className="inventory-summary">
        <article>
          <span className="summary-icon orange">
            <Icon name="receipt" />
          </span>
          <div>
            <small>Belanja bulan ini</small>
            <strong>{compactRupiah(summary.monthTotal)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon green">
            <Icon name="box" />
          </span>
          <div>
            <small>Jumlah nota bulan ini</small>
            <strong>
              {summary.monthCount} <em>nota</em>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon blue">Rp</span>
          <div>
            <small>Total semua nota</small>
            <strong>{compactRupiah(summary.total)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon purple">
            <Icon name="user" />
          </span>
          <div>
            <small>Total barang tercatat</small>
            <strong>
              {summary.itemCount} <em>baris</em>
            </strong>
          </div>
        </article>
      </section>

      {notesLocalOnly && (
        <div className="data-banner warning">
          <div>
            <strong>Sebagian nota tersimpan di perangkat ini</strong>
            <span>
              Tabel riwayat nota di server belum siap, jadi nota terakhir disimpan di HP ini saja.
              Jalankan migrasi Supabase agar tersimpan bersama.
            </span>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <section className="empty-state">
          <Icon name="receipt" size={26} />
          <strong>Belum ada nota tersimpan</strong>
          <span>
            Pindai nota belanja atau tambah stok manual — buktinya akan muncul di sini supaya
            pemilik bisa memeriksa.
          </span>
        </section>
      ) : (
        groups.map((group) => (
          <section className="notes-group" key={group.key}>
            <div className="notes-group-head">
              <h2>{group.label}</h2>
              <span>
                {group.notes.length} nota · {rupiah(group.total)}
              </span>
            </div>
            <div className="notes-grid">
              {group.notes.map((note) => (
                <button className="note-card" key={note.id} onClick={() => setActive(note)}>
                  <span className="note-thumb">
                    {note.image ? (
                      <img src={note.image} alt={`Nota ${note.addedBy}`} />
                    ) : (
                      <Icon name="receipt" size={22} />
                    )}
                  </span>
                  <span className="note-meta">
                    <strong>{noteSummaryLine(note)}</strong>
                    <small>
                      {shortDate(note.createdAt)} {timeWIB(note.createdAt)} · {note.addedBy}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {active && (
        <Modal label={`Nota ${active.addedBy}`} onClose={() => setActive(null)}>
          <span className="modal-kicker">NOTA BELANJA</span>
          <h2>{active.addedBy}</h2>
          <p>
            {shortDate(active.createdAt)} {timeWIB(active.createdAt)}
          </p>

          {active.image && (
            <div className="note-detail-image">
              <img src={active.image} alt={`Nota ${active.addedBy}`} />
              <span>Foto nota</span>
            </div>
          )}

          <ul className="note-detail-items">
            {active.items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <strong>{item.name}</strong>
                <span>
                  {item.qty} {item.unit} × {rupiah(item.unitPrice)}
                </span>
                <span>{rupiah(item.qty * item.unitPrice)}</span>
              </li>
            ))}
          </ul>

          <div className="confirm-total">
            <span>Total belanja</span>
            <strong>{rupiah(active.total)}</strong>
          </div>

          {activeFindings.length > 0 && (
            <div className="count-findings">
              <strong>Temuan terkait nota ini</strong>
              {activeFindings.map((finding) => (
                <p key={finding.id}>{finding.message}</p>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button className="primary-action full" onClick={() => setActive(null)}>
              Tutup
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
