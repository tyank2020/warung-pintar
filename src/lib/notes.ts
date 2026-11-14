import type { PurchaseNote, PurchaseNoteItem } from "./types"

/**
 * Helper riwayat nota belanja — murni (tanpa React) supaya bisa diuji.
 *
 * Tujuannya satu: pemilik warung bisa melihat "stok ini masuk dari nota
 * mana, dan siapa yang menambahkannya" tanpa harus menebak.
 */

export function noteTotal(items: PurchaseNoteItem[]): number {
  return items.reduce((total, item) => total + item.qty * item.unitPrice, 0)
}

/**
 * Kunci bulan dari tanggal lokal (bukan UTC): transaksi jam 1 pagi WIB masih
 * tanggal lokal yang sama, jangan sampai masuk ke bulan sebelumnya.
 */
export function monthKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 7)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-")
  const names = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ]
  const index = Number(month) - 1
  const name = names[index] ?? key
  return `${name} ${year}`
}

export interface NotesSummary {
  count: number;
  total: number;
  monthCount: number;
  monthTotal: number;
  itemCount: number;
}

/** Ringkasan belanja: semua nota, dan khusus bulan berjalan. */
export function summarizeNotes(notes: PurchaseNote[], now = new Date()): NotesSummary {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthNotes = notes.filter((note) => monthKey(note.createdAt) === currentMonth);
  return {
    count: notes.length,
    total: notes.reduce((sum, note) => sum + note.total, 0),
    monthCount: monthNotes.length,
    monthTotal: monthNotes.reduce((sum, note) => sum + note.total, 0),
    itemCount: notes.reduce((sum, note) => sum + note.items.length, 0),
  };
}

export interface NoteMonthGroup {
  key: string;
  label: string;
  notes: PurchaseNote[];
  total: number;
}

/** Kelompokkan nota per bulan, terbaru di atas. */
export function groupNotesByMonth(notes: PurchaseNote[]): NoteMonthGroup[] {
  const groups = new Map<string, PurchaseNote[]>();
  for (const note of notes) {
    const key = monthKey(note.createdAt);
    const current = groups.get(key) ?? [];
    current.push(note);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: monthLabel(key),
      notes: [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
      total: items.reduce((sum, note) => sum + note.total, 0),
    }));
}

/** "3 barang · Rp 150.000" — ringkas untuk daftar. */
export function noteSummaryLine(note: PurchaseNote): string {
  const count = note.items.length;
  return `${count} barang · Rp ${Math.round(note.total).toLocaleString("id-ID")}`;
}

/** Berapa nota yang ditambahkan oleh selain pemilik. */
export function countByOthers(notes: PurchaseNote[], ownerName: string): number {
  const owner = ownerName.trim().toLowerCase();
  return notes.filter((note) => note.addedBy.trim().toLowerCase() !== owner).length;
}
