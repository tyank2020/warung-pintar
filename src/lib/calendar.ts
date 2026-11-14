/**
 * Kalender bisnis Warung Pintar.
 *
 * Aplikasi selalu menghitung hari dalam zona waktu warung (`Asia/Jakarta`),
 * bukan zona waktu perangkat. Alasannya tiga angka harus selalu sama:
 * grafik penjualan, label "hari ini", dan jam WIB yang ditampilkan. View SQL
 * juga memakai `at time zone 'Asia/Jakarta'`, jadi frontend dan database
 * menghitung hari yang sama.
 */

export const BUSINESS_TIME_ZONE = "Asia/Jakarta"

export const DAY_MS = 86_400_000

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  timeZoneName: "longOffset",
})

/** Selisih zona waktu warung terhadap UTC, dalam milidetik. */
function zoneOffsetMs(time: number): number {
  const parts = offsetFormatter.formatToParts(new Date(time))
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
  if (!match) return 0
  const sign = match[1] === "-" ? -1 : 1
  const hours = Number(match[2])
  const minutes = match[3] ? Number(match[3]) : 0
  return sign * (hours * 60 + minutes) * 60_000
}

let cachedOffsetMs = 0
let cachedOffsetFor = Number.NaN

/**
 * Offset zona waktu warung. Dihitung ulang sesekali supaya tetap benar
 * kalau zona waktu bisnis diubah atau aturan waktu berubah.
 */
function businessOffsetMs(time: number): number {
  // Wholesale cukup untuk zona tanpa DST. Zona dengan DST dihitung ulang
  // per hari sehingga batas hari tetap presisi.
  if (!Number.isFinite(cachedOffsetFor) || Math.abs(time - cachedOffsetFor) > 30 * DAY_MS) {
    cachedOffsetMs = zoneOffsetMs(time)
    cachedOffsetFor = time
  }
  return cachedOffsetMs
}

/** Ubah timestamp menjadi `YYYY-MM-DD` menurut zona waktu warung. */
export function businessDayKey(time: number): string {
  const shifted = new Date(time + businessOffsetMs(time))
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Awal hari bisnis (00:00 waktu warung) sebagai timestamp UTC.
 * Semua pengelompokan hari memakai fungsi ini.
 */
export function businessDayStart(time: number): number {
  const offset = businessOffsetMs(time)
  return Math.floor((time + offset) / DAY_MS) * DAY_MS - offset
}

/** Tanggal dalam bentuk `Date` untuk dipakai `Intl.DateTimeFormat`. */
export function businessDate(time: number): Date {
  const offset = businessOffsetMs(time)
  return new Date(time + offset)
}

/** Geser hari bisnis sejumlah hari. */
export function addBusinessDays(dayStart: number, days: number): number {
  return dayStart + days * DAY_MS
}

/** Jumlah hari bisnis antara dua hari (b − a). */
export function businessDaysBetween(from: number, to: number): number {
  return Math.round((businessDayStart(to) - businessDayStart(from)) / DAY_MS)
}

/**
 * Deret hari bisnis mundur, dari yang paling lama ke yang paling baru.
 * Contoh: `businessDayRange(now, 7)` mengembalikan 7 hari terakhir.
 */
export function businessDayRange(now: number, days: number): number[] {
  const today = businessDayStart(now)
  return Array.from({ length: days }, (_, index) => addBusinessDays(today, index - days + 1))
}

/** Label hari singkat ("Sen", "Sel") dalam bahasa Indonesia. */
export function businessDayLabel(dayStart: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(businessDate(dayStart))
}

/** Label tanggal pendek ("9 Nov") dalam bahasa Indonesia. */
export function businessShortDate(dayStart: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(businessDate(dayStart))
}

/**
 * Ubah kunci hari `YYYY-MM-DD` kembali menjadi timestamp awal hari.
 * Kebalikan dari `businessDayKey`.
 *
 * Hasilnya di-cache karena kunci hari yang sama dipakai berulang kali saat
 * menghitung agregasi per hari.
 */
const dayStartCache = new Map<string, number>()

export function businessDayStartFromKey(dayKey: string): number {
  const cached = dayStartCache.get(dayKey)
  if (cached !== undefined) return cached

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) return Number.NaN
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Sekitar tengah hari UTC supaya offset zona waktu tidak meleset di batas hari.
  const reference = Date.UTC(year, month - 1, day, 12)
  const offset = businessOffsetMs(reference)
  const start = Math.floor((reference + offset) / DAY_MS) * DAY_MS - offset

  if (dayStartCache.size > 4000) dayStartCache.clear()
  dayStartCache.set(dayKey, start)
  return start
}

/**
 * Kunci hari untuk tanggal yang sama satu tahun sebelumnya.
 * 29 Februari digeser ke 28 Februari pada tahun non-leap.
 */
export function sameDayPreviousYear(dayKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) return dayKey
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const isLeap = (value: number) => (value % 4 === 0 && value % 100 !== 0) || value % 400 === 0
  const maxDay = month === 2 && !isLeap(year - 1) ? 28 : day
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(maxDay).padStart(2, "0")}`
}
