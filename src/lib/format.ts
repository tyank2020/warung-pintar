export const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)

export const numberID = (value: number, digits = 0) =>
  new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)

export const compactRupiah = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `Rp${numberID(value / 1_000_000, 1)} jt`
  if (Math.abs(value) >= 1_000) return `Rp${numberID(value / 1_000, 0)} rb`
  return rupiah(value)
}

export const longDate = (date = new Date()) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)

export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso))

/**
 * Hari + tanggal digabung untuk tenggat penagihan, mis. "Jum, 13 Nov".
 * Tanggal bisnis `yyyy-mm-dd` diformat di zona waktu warung.
 */
export const deadlineLabel = (isoDate: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${isoDate}T12:00:00Z`))

export const timeWIB = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(".", ":")

export const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(date)

export const isoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Inisial nama untuk avatar: "Pak Andi" -> "PA". */
export const initials = (name: string) => productInitials(name)

export const productInitials = (name: string) =>
  normalizeText(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

/**
 * Nama produk untuk ditampilkan: merek (bila ada) lalu nama, ditutup dengan
 * ukuran/varian bila ada — "Bimoli Minyak Goreng · 2 Liter" dan
 * "Minyak Goreng · 2 Liter" tidak tertukar.
 */
export const productLabel = (product: {
  name: string
  size?: string | null
  brand?: string | null
}) => {
  const brand = product.brand?.trim()
  const size = product.size?.trim()
  const base = brand ? `${brand} ${product.name}` : product.name
  return size ? `${base} · ${size}` : base
}
