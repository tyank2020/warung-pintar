import { useMemo } from "react"
import { useWarung } from "../lib/store"
import { buildCustomerProfiles } from "../lib/customers"
import { numberID, rupiah } from "../lib/format"

/**
 * Kolom nama yang mengenali Piutang dari buku Piutang.
 *
 * Kalau yang diketik cocok dengan Piutang yang sudah dikenal, sistem
 * langsung memberi tahu: punya utang berapa, terakhir datang kapan, dan
 * barang favoritnya. Jadi pemilik tidak perlu mengingat semua — cukup ketik
 * sebagian nama.
 */
export function CustomerNameField({
  id,
  label,
  value,
  onChange,
  placeholder = "Contoh: Pak Yono",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { customers, debts } = useWarung()

  const profiles = useMemo(
    () => buildCustomerProfiles(customers, debts),
    [customers, debts],
  )

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (query.length < 1) return []
    return profiles
      .filter((profile) => profile.name.toLowerCase().includes(query))
      .slice(0, 4)
  }, [profiles, value])

  const exact = profiles.find(
    (profile) => profile.name.trim().toLowerCase() === value.trim().toLowerCase(),
  )

  return (
    <div className="debtor-field customer-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {suggestions.length > 0 && (
        <div className="customer-suggest">
          {suggestions.map((profile) => (
            <button key={profile.id ?? profile.name} onClick={() => onChange(profile.name)}>
              <strong>{profile.name}</strong>
              <span>
                {profile.openDebt > 0
                  ? `utang ${rupiah(profile.openDebt)}`
                  : "tidak ada utang"}
                {profile.favoriteItem ? ` · favorit ${profile.favoriteItem}` : ""}
                {profile.phone ? ` · ${profile.phone}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {exact && (
        <small className="customer-recognized">
          <strong>{exact.name}</strong> dikenal:{" "}
          {exact.openDebt > 0
            ? `utang ${rupiah(exact.openDebt)} belum lunas`
            : "tidak ada utang"}
          {exact.daysSinceLastBorrow !== null
            ? ` · ${numberID(exact.daysSinceLastBorrow)} hari lalu datang`
            : ""}
          {exact.totalBorrowed > 0
            ? ` · total pernah diutang ${rupiah(exact.totalBorrowed)}`
            : ""}
        </small>
      )}
    </div>
  )
}
