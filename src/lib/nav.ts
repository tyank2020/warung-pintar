import type { IconName } from "../components/Icon"

export type NavLabel =
  | "Kasir"
  | "Beranda"
  | "Stok Barang"
  | "Piutang"
  | "Titip Jual"
  | "Nota Belanja"
  | "Cek Stok"
  | "Harga Pasar"
  | "Tutup Buku"
  | "Laporan"
  | "Riwayat"
  | "Pengaturan"

export interface NavItem {
  label: NavLabel
  icon: IconName
}

/** Satu grup di sidebar/menu berjenjang. */
export interface NavGroup {
  /** Judul grup (tampil huruf besar). */
  title: string
  items: NavItem[]
}

/** Menu sidebar berjenjang sesuai struktur produk. */
export const navGroups: NavGroup[] = [
  {
    title: "BERANDA",
    items: [{ label: "Beranda", icon: "home" }],
  },
  {
    title: "MENU UTAMA",
    items: [
      { label: "Kasir", icon: "receipt" },
      { label: "Stok Barang", icon: "box" },
    ],
  },
  {
    title: "PENJUALAN & TRANSAKSI",
    items: [
      { label: "Piutang", icon: "user" },
      { label: "Titip Jual", icon: "spark" },
      { label: "Riwayat", icon: "clock" },
    ],
  },
  {
    title: "PERSEDIAAN BARANG",
    items: [
      { label: "Nota Belanja", icon: "scan" },
      { label: "Cek Stok", icon: "warning" },
      { label: "Harga Pasar", icon: "tag" },
    ],
  },
  {
    title: "KEUANGAN & LAPORAN",
    items: [
      { label: "Tutup Buku", icon: "clock" },
      { label: "Laporan", icon: "chart" },
    ],
  },
]

/** Daftar datar (dipakai tampilan datar seperti menu mobile bawah). */
export const nav: NavItem[] = navGroups.flatMap((group) => group.items)

/** Menu bawah (mobile) — dibatasi 4 + Akun supaya tidak berdesakan. */
export const mobileNav: Array<{ label: NavLabel; icon: IconName }> = [
  { label: "Kasir", icon: "receipt" },
  { label: "Beranda", icon: "home" },
  { label: "Stok Barang", icon: "box" },
  { label: "Laporan", icon: "chart" },
]
