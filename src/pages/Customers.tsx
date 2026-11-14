import { useEffect, useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { CustomerNameField } from "../components/CustomerNameField"
import { useWarung } from "../lib/store"
import { buildCustomerProfiles, buildTagihText, type CustomerProfile } from "../lib/customers"
import { deadlineLabel, numberID, productLabel, rupiah, shortDate } from "../lib/format"
import type { ConfirmItem, Debt, Product } from "../lib/types"

const FILTERS = ["Semua", "Ada utang", "Lunas"] as const

/**
 * Buku Piutang.
 *
 * Kasir mencatat transaksi; buku Piutang mengingat **orangnya**: siapa yang
 * punya utang, sudah berapa lama, barang favoritnya, dan kapan terakhir
 * datang. Dari sini juga bisa/tagih dalam satu ketukan.
 */
export function Customers() {
  const { customers, debts, products, addCustomer, updateCustomer, saveDebt, settleDebt } =
    useWarung()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Semua")
  const [limit, setLimit] = useState(40)
  const [active, setActive] = useState<CustomerProfile | null>(null)
  const [tagih, setTagih] = useState("")
  const [copied, setCopied] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [debtOpen, setDebtOpen] = useState(false)
  const [form, setForm] = useState({ name: "", phone: "", note: "" })
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    note: "",
    maxDebt: "",
    debtDeadline: "",
  })
  const [debtForm, setDebtForm] = useState({ debtor: "", productId: "", qty: 1, price: 0 })
  const [pendingOpenName, setPendingOpenName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const debtProduct: Product | null = useMemo(
    () => products.find((product) => product.id === debtForm.productId) ?? null,
    [products, debtForm.productId],
  )
  const debtTotal = debtProduct ? debtForm.qty * debtForm.price : 0

  const openDebtAdd = () => {
    setDebtForm({ debtor: "", productId: products[0]?.id ?? "", qty: 1, price: 0 })
    setDebtOpen(true)
    setError("")
  }

  const pickDebtProduct = (product: Product) => {
    setDebtForm((current) => ({
      ...current,
      productId: product.id,
      price: current.price === 0 ? product.sell_price : current.price,
    }))
  }

  const handleAddDebt = async () => {
    const debtor = debtForm.debtor.trim()
    if (!debtor) {
      setError("Nama yang menyimpan wajib diisi.")
      return
    }
    if (!debtProduct) {
      setError("Pilih barang yang diutang dulu.")
      return
    }
    if (debtForm.qty < 1) {
      setError("Jumlah minimal 1.")
      return
    }
    const item: ConfirmItem = {
      key: "manual-debt",
      productId: debtProduct.id,
      name: debtProduct.name,
      qty: debtForm.qty,
      unit: debtProduct.unit,
      unitPrice: debtForm.price,
    }
    setBusy(true)
    setError("")
    try {
      await saveDebt([item], debtor)
      setDebtOpen(false)
    } catch (addDebtError) {
      setError(addDebtError instanceof Error ? addDebtError.message : "Gagal mencatat utang.")
    } finally {
      setBusy(false)
    }
  }

  const profiles = useMemo(() => buildCustomerProfiles(customers, debts), [customers, debts])

  const debtorProfile = useMemo(() => {
    const name = debtForm.debtor.trim().toLowerCase()
    if (!name) return null
    return profiles.find((profile) => profile.name.trim().toLowerCase() === name) ?? null
  }, [profiles, debtForm.debtor])

  const projectedDebt = (debtorProfile?.openDebt ?? 0) + debtTotal
  // Lewat batas maksimal: input ditolak sejak form — tidak masuk ke simpan.
  const overLimit =
    debtorProfile?.maxDebt != null &&
    debtorProfile.maxDebt > 0 &&
    projectedDebt > debtorProfile.maxDebt

  // Setelah menambah Piutang, langsung buka kartunya supaya nomornya
  // bisa diisi tanpa harus mencari lagi.
  useEffect(() => {
    if (!pendingOpenName) return
    const found = profiles.find(
      (profile) => profile.name.toLowerCase() === pendingOpenName.toLowerCase(),
    )
    if (!found) return
    setPendingOpenName(null)
    openCustomer(found)
  }, [pendingOpenName, profiles])

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return profiles
      .filter((profile) => {
        const matchesSearch =
          !search ||
          profile.name.toLowerCase().includes(search) ||
          (profile.phone ?? "").toLowerCase().includes(search)
        const matchesFilter =
          filter === "Semua" ||
          (filter === "Ada utang" ? profile.openDebt > 0 : profile.openDebt === 0)
        return matchesSearch && matchesFilter
      })
      .slice(0, limit)
  }, [filter, limit, profiles, query])

  const totalOpen = profiles.reduce((sum, profile) => sum + profile.openDebt, 0)
  const menunggak = profiles.filter((profile) => profile.status === "menunggak").length

  const openDebtsOf = (name: string): Debt[] =>
    debts.filter(
      (debt) => !debt.settled_at && debt.debtor.trim().toLowerCase() === name.trim().toLowerCase(),
    )

  const startTagih = (profile: CustomerProfile) => {
    setTagih(buildTagihText(profile, debts))
    setCopied(false)
  }

  const openCustomer = (profile: CustomerProfile) => {
    setActive(profile)
    setEditForm({
      name: profile.name,
      phone: profile.phone ?? "",
      note: profile.note ?? "",
      maxDebt: profile.maxDebt != null ? String(profile.maxDebt) : "",
      debtDeadline: profile.debtDeadline ?? "",
    })
    setError("")
  }

  /** Ubah isian input batas utang jadi nilai yang disimpan (null = tanpa batas). */
  const parseMaxDebt = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === "") return null
    const value = Math.round(Number(trimmed))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const handleSaveEdit = async (id: string) => {
    const name = editForm.name.trim()
    if (!name) {
      setError("Nama Piutang tidak boleh kosong.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await updateCustomer(id, {
        name,
        phone: editForm.phone.trim() || null,
        note: editForm.note.trim() || null,
        maxDebt: parseMaxDebt(editForm.maxDebt),
        debtDeadline: editForm.debtDeadline.trim() || null,
      })
      setActive(null)
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Gagal menyimpan Piutang.")
    } finally {
      setBusy(false)
    }
  }

  /** Piutang yang hanya dikenal dari catatan utang: simpan jadi record. */
  const handleSaveNew = async (name: string) => {
    setBusy(true)
    setError("")
    try {
      await addCustomer({
        name,
        phone: editForm.phone.trim() || null,
        note: editForm.note.trim() || null,
        maxDebt: parseMaxDebt(editForm.maxDebt),
        debtDeadline: editForm.debtDeadline.trim() || null,
      })
      setActive(null)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Gagal menyimpan Piutang.")
    } finally {
      setBusy(false)
    }
  }

  const copyTagih = async () => {
    try {
      await navigator.clipboard.writeText(tagih)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setError("Nama Piutang wajib diisi.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await addCustomer({
        name: form.name,
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
        maxDebt: null,
        debtDeadline: null,
      })
      setForm({ name: "", phone: "", note: "" })
      setNewOpen(false)
      setPendingOpenName(form.name.trim())
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Gagal menambah Piutang.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="customers-page">
      <section className="page-title">
        <div>
          <span className="date-label">BUKU Piutang</span>
          <h1>
            <span className="title-emoji" aria-hidden="true">
              👥
            </span>{" "}
            Piutang
          </h1>
          <p>Kasir mencatat barang; buku ini mengingat orangnya — utang, favorit, kapan datang.</p>
        </div>
        <div className="page-actions">
          <button className="primary-action" onClick={() => setNewOpen(true)}>
            <Icon name="plus" size={18} /> Tambah Piutang
          </button>
          <button className="secondary-action" onClick={openDebtAdd}>
            <Icon name="receipt" size={18} /> Tambah utang
          </button>
        </div>
      </section>

      <section className="inventory-summary">
        <article>
          <span className="summary-icon orange">
            <Icon name="user" />
          </span>
          <div>
            <small>Total Piutang</small>
            <strong>
              {profiles.length} <em>orang</em>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon green">
            <Icon name="receipt" />
          </span>
          <div>
            <small>Utang berjalan</small>
            <strong>{rupiah(totalOpen)}</strong>
          </div>
        </article>
        <article>
          <span className="summary-icon blue">
            <Icon name="warning" />
          </span>
          <div>
            <small>Menunggak lebih dari 7 hari</small>
            <strong>
              {menunggak} <em>orang</em>
            </strong>
          </div>
        </article>
      </section>

      <section className="customers-toolbar">
        <label>
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama atau nomor..."
            aria-label="Cari Piutang"
          />
        </label>
        <div className="filter-pills">
          {FILTERS.map((option) => (
            <button
              key={option}
              className={filter === option ? "active" : ""}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      {visible.length === 0 ? (
        <section className="empty-state">
          <Icon name="user" size={26} />
          <strong>Belum ada Piutang</strong>
          <span>
            Piutang otomatis muncul dari catatan utang. Tambah Piutang langganan tetap bila
            ingin mencatat telepon atau catatannya.
          </span>
        </section>
      ) : (
        <div className="customers-grid">
          {visible.map((profile) => (
            <button
              className="customer-card"
              key={profile.id ?? profile.name}
              onClick={() => openCustomer(profile)}
            >
              <div className="customer-head">
                <span className="customer-avatar">{profile.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.phone ?? "Tanpa nomor"}
                    {profile.lastBorrowAt ? ` · ${profile.daysSinceLastBorrow} hari lalu` : ""}
                  </small>
                </div>
              </div>
              <div className="customer-meta">
                {profile.openDebt > 0 ? (
                  <span className={`customer-status ${profile.status}`}>
                    {profile.status === "menunggak" ? "Menunggak" : "Ada utang"} ·{" "}
                    {rupiah(profile.openDebt)}
                  </span>
                ) : (
                  <span className="customer-status lunas">Lunas</span>
                )}
                {!profile.phone && <span className="customer-status belum">Lengkapi nomor</span>}
                {profile.favoriteItem && <small>favorit: {profile.favoriteItem}</small>}
              </div>
            </button>
          ))}
          {profiles.length > visible.length && (
            <button className="customer-more" onClick={() => setLimit((current) => current + 40)}>
              Tampilkan {Math.min(40, profiles.length - visible.length)} lagi
            </button>
          )}
        </div>
      )}

      {active && (
        <Modal label={`Piutang ${active.name}`} onClose={() => setActive(null)}>
          <span className="modal-kicker">KARTU Piutang</span>
          <h2>{active.name}</h2>
          <p>
            {active.phone ?? "Tanpa nomor"}
            {active.note ? ` · ${active.note}` : ""}
          </p>

          {active && (
            <div className="customer-edit">
              <strong>{active.id ? "Ubah data Piutang" : "Simpan data Piutang ini"}</strong>
              {!active.id && (
                <small className="customer-edit-hint">
                  Piutang ini baru dikenal dari catatan utang. Simpan nomornya supaya gampang
                  ditagih lain kali.
                </small>
              )}
              <label>
                Nama
                <input
                  value={editForm.name}
                  disabled={!active.id}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </label>
              <label>
                Nomor HP
                <input
                  inputMode="tel"
                  value={editForm.phone}
                  onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                  placeholder="Contoh: 0812 3456 7890"
                />
              </label>
              <label>
                Catatan
                <input
                  value={editForm.note}
                  onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                  placeholder="Contoh: tagih hari Jumat"
                />
              </label>
              <label>
                Batas maksimal utang (Rp)
                <input
                  type="number"
                  min={0}
                  value={editForm.maxDebt}
                  onChange={(event) => setEditForm({ ...editForm, maxDebt: event.target.value })}
                  placeholder="Kosong = tanpa batas"
                />
              </label>
              <label>
                Hari terakhir (tenggat)
                <input
                  type="date"
                  value={editForm.debtDeadline}
                  onChange={(event) =>
                    setEditForm({ ...editForm, debtDeadline: event.target.value })
                  }
                />
              </label>
              <small className="customer-edit-hint">
                Kalau utangnya sudah mencapai batas maksimal, orang ini tidak bisa nambah utang lagi
                sampai dilunasi.
              </small>
              <button
                className="secondary-action"
                onClick={() => {
                  if (active.id) {
                    void handleSaveEdit(active.id)
                  } else {
                    void handleSaveNew(active.name)
                  }
                }}
                disabled={busy}
              >
                {busy ? "Menyimpan…" : active.id ? "Simpan perubahan" : "Simpan data"}
              </button>
            </div>
          )}

          <div className="customer-stats">
            <div>
              <small>Utang berjalan</small>
              <strong>{rupiah(active.openDebt)}</strong>
            </div>
            <div>
              <small>Total pernah diutang</small>
              <strong>{rupiah(active.totalBorrowed)}</strong>
            </div>
            <div>
              <small>Terakhir datang</small>
              <strong>
                {active.daysSinceLastBorrow !== null ? `${active.daysSinceLastBorrow} hari` : "-"}
              </strong>
            </div>
          </div>

          {active.items.length > 0 && (
            <ul className="customer-items">
              {active.items.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{numberID(item.count)} kali</span>
                </li>
              ))}
            </ul>
          )}

          {openDebtsOf(active.name).length > 0 && (
            <>
              <h3 className="customer-subhead">Utang berjalan</h3>
              <ul className="customer-debts">
                {openDebtsOf(active.name).map((debt) => (
                  <li key={debt.id}>
                    <div>
                      <strong>
                        {debt.qty} {debt.unit} {debt.product_name}
                      </strong>
                      <small>{shortDate(debt.created_at)}</small>
                    </div>
                    <span>{rupiah(debt.amount)}</span>
                    <button
                      className="row-action"
                      onClick={() => {
                        setSettlingId(debt.id)
                        void settleDebt(debt.id).finally(() => setSettlingId(null))
                      }}
                      disabled={settlingId === debt.id}
                    >
                      <Icon name="check" size={14} /> Lunas
                    </button>
                  </li>
                ))}
              </ul>
              <button className="primary-action full" onClick={() => startTagih(active)}>
                <Icon name="receipt" size={16} /> Siapkan pesan tagihan
              </button>
            </>
          )}

          {tagih && (
            <div className="tagih-box">
              <strong>Pesan siap kirim</strong>
              <p>{tagih}</p>
              <button className="secondary-action" onClick={() => void copyTagih()}>
                <Icon name={copied ? "check" : "receipt"} size={15} />
                {copied ? "Tersalin" : "Salin pesan"}
              </button>
            </div>
          )}

          <div className="modal-actions">
            <button className="primary-action full" onClick={() => setActive(null)}>
              Tutup
            </button>
          </div>
        </Modal>
      )}

      {newOpen && (
        <Modal label="Tambah Piutang" onClose={() => setNewOpen(false)}>
          <span className="modal-kicker">Piutang BARU</span>
          <h2>Langganan tetap</h2>
          <p>Catat nama, nomor, dan catatan. Utangnya tetap tercatat lewat “Simpen dulu”.</p>
          <div className="customer-form">
            <label>
              Nama
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Contoh: Pak Yono"
              />
            </label>
            <label>
              Nomor HP
              <input
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="0812 3456 7890"
              />
            </label>
            <label>
              Catatan
              <input
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Tagih hari Jumat"
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-action" onClick={() => setNewOpen(false)}>
              Batal
            </button>
            <button className="primary-action" onClick={() => void handleAdd()} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan Piutang"}
            </button>
          </div>
        </Modal>
      )}

      {debtOpen && (
        <Modal label="Tambah utang" onClose={() => setDebtOpen(false)}>
          <span className="modal-kicker">BILANG UTANG</span>
          <h2>Tambah utang</h2>
          <p>
            Catat siapa yang menyimpan dulu dan barang apa yang diutang. Stoknya tetap keluar dari
            rak, dan utangnya masuk ke buku Piutang.
          </p>
          <div className="customer-form">
            <CustomerNameField
              id="debt-debtor"
              label="Yang menyimpan"
              value={debtForm.debtor}
              onChange={(value) => setDebtForm((current) => ({ ...current, debtor: value }))}
            />
            {debtorProfile && (
              <div className="debt-limit-card">
                <div className="debt-limit-row">
                  <span>Utang berjalan</span>
                  <strong>{rupiah(debtorProfile.openDebt)}</strong>
                </div>
                <div className="debt-limit-row">
                  <span>Batas maksimal</span>
                  <strong>
                    {debtorProfile.maxDebt != null ? rupiah(debtorProfile.maxDebt) : "Tanpa batas"}
                  </strong>
                </div>
                <div className="debt-limit-row">
                  <span>Hari terakhir (tenggat)</span>
                  <strong>
                    {debtorProfile.debtDeadline
                      ? deadlineLabel(debtorProfile.debtDeadline)
                      : "Tanpa batas"}
                  </strong>
                </div>
                {debtorProfile.atDebtLimit && (
                  <small className="debt-limit-warn">
                    Sudah di batas maksimal — lunasi dulu sebelum nambah.
                  </small>
                )}
                {debtorProfile.overdue && !debtorProfile.atDebtLimit && (
                  <small className="debt-limit-warn">Lewat tenggat, sebaiknya ditagih.</small>
                )}
              </div>
            )}
            <label>
              Barang
              <select
                value={debtForm.productId}
                onChange={(event) => {
                  const product = products.find((item) => item.id === event.target.value)
                  if (product) pickDebtProduct(product)
                }}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {productLabel(product)} ({product.unit})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jumlah
              <input
                type="number"
                min={1}
                value={debtForm.qty}
                onChange={(event) =>
                  setDebtForm((current) => ({
                    ...current,
                    qty: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
              />
            </label>
            <label>
              Harga satuan
              <input
                type="number"
                min={0}
                value={debtForm.price}
                onChange={(event) =>
                  setDebtForm((current) => ({
                    ...current,
                    price: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
            <div className="debt-total-line">
              <span>Total utang ini</span>
              <strong>{rupiah(debtTotal)}</strong>
            </div>
            <div className="debt-meta-line">
              <span>Dicatat hari</span>
              <strong>{shortDate(new Date().toISOString())}</strong>
            </div>
            {debtorProfile && (
              <div
                className={`debt-meta-line ${projectedDebt > (debtorProfile.maxDebt ?? Infinity) ? "debt-meta-over" : ""}`}
              >
                <span>Utang setelah ini</span>
                <strong>{rupiah(projectedDebt)}</strong>
              </div>
            )}
          </div>
          {debtorProfile &&
            debtorProfile.maxDebt != null &&
            projectedDebt > debtorProfile.maxDebt && (
              <div className="form-error">
                <Icon name="warning" size={15} />
                <span>
                  {debtorProfile.name} sudah mencapai batas limit maksimal utang (
                  {rupiah(debtorProfile.maxDebt)}): belum lunas {rupiah(debtorProfile.openDebt)} +
                  utang baru {rupiah(debtTotal)}. Mohon lunasi utangnya dahulu, catatan ini tidak
                  disimpan.
                </span>
              </div>
            )}
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-action" onClick={() => setDebtOpen(false)}>
              Batal
            </button>
            <button
              className="primary-action"
              onClick={() => void handleAddDebt()}
              disabled={busy || overLimit}
            >
              {busy ? "Menyimpan…" : "Simpan utang"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
