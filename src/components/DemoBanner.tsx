import { Icon } from "./Icon"

export function DemoBanner({
  source,
  syncError,
  online,
  pending,
  onOpenSettings,
}: {
  source: "demo" | "supabase"
  syncError: string
  /** Status internet perangkat (ikuti langsung dari store). */
  online: boolean
  /** Jumlah perubahan yang belum terkirim ke server. */
  pending: number
  onOpenSettings: () => void
}) {
  if (source === "supabase" && !syncError && online) return null

  if (source === "supabase" && !syncError && !online) {
    return (
      <div className="data-banner">
        <Icon name="spark" size={17} />
        <span>
          <strong>Mode offline.</strong>{" "}
          {pending > 0
            ? `${pending} perubahan belum terkirim — `
            : "Semua perubahan tersimpan di perangkat ini — "}
          otomatis dikirim saat internet kembali.
        </span>
        <button onClick={onOpenSettings}>Atur</button>
      </div>
    )
  }

  return (
    <div className={`data-banner ${syncError ? "warning" : ""}`}>
      <Icon name={syncError ? "warning" : "spark"} size={17} />
      <span>
        <strong>{syncError ? "Koneksi Supabase bermasalah." : "Mode demo aktif."}</strong>{" "}
        {syncError ||
          "Data disimpan di browser. Hubungkan Supabase lewat file .env agar data tersimpan di cloud."}
      </span>
      <button onClick={onOpenSettings}>Atur</button>
    </div>
  )
}
