import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { StockCountSheet } from "../components/StockCountSheet"
import { useWarung } from "../lib/store"
import {
  findNotesWithoutStock,
  findStockDiscrepancies,
  groupFindingsByMonth,
  summarizeFindings,
  type StockFinding,
} from "../lib/reconcile"
import { compactRupiah, rupiah, shortDate, timeWIB } from "../lib/format"
import type { PurchaseNote } from "../lib/types"

/**
 * Cek Stok — catatan versus kenyataan.
 *
 * Dua arah: selisih hasil hitung fisik, dan nota yang tercatat tapi barangnya
 * tidak pernah masuk. Semua temuan dikaitkan ke nota tertentu supaya pemilik
 * tahu harus memeriksa nota yang mana.
 */
export function Reconcile() {
  const { products, transactions, notes } = useWarung()
  const [countOpen, setCountOpen] = useState(false)
  const [openNote, setOpenNote] = useState<PurchaseNote | null>(null)

  const findings = useMemo<StockFinding[]>(
    () => [
      ...findStockDiscrepancies(products, transactions, notes),
      ...findNotesWithoutStock(products, transactions, notes),
    ],
    [notes, products, transactions],
  )

  const summary = useMemo(() => summarizeFindings(findings), [findings])
  const groups = useMemo(() => groupFindingsByMonth(findings), [findings])

  const noteById = (id: string | null) => notes.find((note) => note.id === id) ?? null

  return (
    <div className="reconcile-page">
      <section className="page-title">
        <div>
          <span className="date-label">CATATAN VS KENYATAAN</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              ✅
            </span>{" "}
            Cek stok
          </h1>
          <p>
            Hitung fisik di gudang, lalu bandingkan dengan catatan. Selisih yang mencurigakan
            otomatis ditautkan ke nota terkait.
          </p>
        </div>
        <div className="page-actions">
          <button className="primary-action" onClick={() => setCountOpen(true)}>
            <Icon name="edit" size={18} /> Hitung stok
          </button>
        </div>
      </section>

      <section className="inventory-summary">
        <article>
          <span className="summary-icon orange">
            <Icon name="warning" />
          </span>
          <div>
            <small>Temuan</small>
            <strong>
              {summary.count} <em>selisih</em>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon green">
            <Icon name="box" />
          </span>
          <div>
            <small>Nilai bermasalah</small>
            <strong>{compactRupiah(summary.totalValue)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon blue">
            <Icon name="receipt" />
          </span>
          <div>
            <small>Temuan terkait nota</small>
            <strong>
              {summary.linkedToNotes} <em>dari {summary.count}</em>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon purple">
            <Icon name="warning" />
          </span>
          <div>
            <small>Perlu ditindaklanjuti</small>
            <strong>
              {summary.heavyCount} <em>berat</em>
            </strong>
          </div>
        </article>
      </section>

      {findings.length === 0 ? (
        <section className="empty-state">
          <Icon name="check" size={26} />
          <strong>Belum ada selisih</strong>
          <span>
            Catatan dan gudang masih sinkron. Klik **Hitung stok** untuk menghitung fisik lalu
            membandingkannya dengan catatan.
          </span>
        </section>
      ) : (
        groups.map((group) => (
          <section className="findings-group" key={group.key}>
            <div className="notes-group-head">
              <h2>{group.label}</h2>
              <span>
                {group.findings.length} temuan · {rupiah(group.total)}
              </span>
            </div>
            <div className="findings-list">
              {group.findings.map((finding) => {
                const note = noteById(finding.noteId)
                return (
                  <article className={`finding-card ${finding.severity}`} key={finding.id}>
                    <div className="finding-head">
                      <span className={`finding-badge ${finding.severity}`}>
                        {finding.severity === "berat" ? "Perlu dicek" : "Selisih ringan"}
                      </span>
                      <span className="finding-kind">
                        {finding.kind === "selisih-stok"
                          ? "Selisih hitung fisik"
                          : "Nota tanpa stok masuk"}
                      </span>
                    </div>
                    <p>{finding.message}</p>
                    <div className="finding-foot">
                      <span>
                        {shortDate(finding.at)} {timeWIB(finding.at)}
                      </span>
                      <strong>{rupiah(finding.value)}</strong>
                      {note && (
                        <button className="row-action" onClick={() => setOpenNote(note)}>
                          <Icon name="receipt" size={14} /> Lihat nota
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))
      )}

      {countOpen && <StockCountSheet onClose={() => setCountOpen(false)} />}

      {openNote && (
        <Modal label={`Nota ${openNote.addedBy}`} onClose={() => setOpenNote(null)}>
          <span className="modal-kicker">NOTA BELANJA</span>
          <h2>{openNote.addedBy}</h2>
          <p>
            {shortDate(openNote.createdAt)} {timeWIB(openNote.createdAt)}
          </p>
          {openNote.image && (
            <div className="note-detail-image">
              <img src={openNote.image} alt={`Nota ${openNote.addedBy}`} />
              <span>Foto nota</span>
            </div>
          )}
          <ul className="note-detail-items">
            {openNote.items.map((item, index) => (
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
            <strong>{rupiah(openNote.total)}</strong>
          </div>
          <div className="modal-actions">
            <button className="primary-action full" onClick={() => setOpenNote(null)}>
              Tutup
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
