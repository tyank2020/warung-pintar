import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { CartLine } from "../lib/checkout"
import type { Product } from "../lib/types"

const mocks = vi.hoisted(() => ({
  saveCheckout: vi.fn(async () => {}),
  addProduct: vi.fn(async () => ({})),
  setMinStock: vi.fn(async () => {}),
  adjustStock: vi.fn(async () => {}),
  savePurchase: vi.fn(async () => {}),
  savePurchaseWithNote: vi.fn(async () => {}),
  addCustomer: vi.fn(async () => ({})),
  updateCustomer: vi.fn(async () => {}),
  settleDebt: vi.fn(async () => {}),
  refreshCatalog: vi.fn(async () => {}),
  consignments: [
    {
      id: "c-1",
      depositor: "Bu Warsih",
      productName: "Keripik Tempe",
      unit: "bungkus",
      qty: 20,
      soldQty: 5,
      buyPrice: 5000,
      sellPrice: 7000,
      commissionPct: 10,
      status: "active" as const,
      note: null,
      createdAt: "2026-11-10T02:00:00.000Z",
      settledAt: null,
    },
  ],
  cartLines: [] as CartLine[],
  setCartLines: vi.fn(),
  products: [
    {
      id: "p-rokok",
      name: "Rokok Kretek",
      unit: "bungkus",
      stock: 10,
      min_stock: 3,
      buy_price: 18000,
      sell_price: 20000,
      aliases: [],
    },
    {
      id: "p-pisang",
      name: "Pisang",
      unit: "kg",
      stock: 5,
      min_stock: 2,
      buy_price: 14000,
      sell_price: 17000,
      aliases: [],
    },
  ] as Product[],
  stats: {
    todaySales: 150000,
    todayGrossProfit: 40000,
    todayTransactions: 8,
    weekSales: 1200000,
    weekGrossProfit: 320000,
    weekTransactions: 60,
    totalProducts: 2,
    lowStockCount: 1,
    lowStock: [
      {
        id: "p-pisang",
        name: "Pisang",
        unit: "kg",
        stock: 5,
        min_stock: 2,
        buy_price: 14000,
        sell_price: 17000,
        aliases: [],
      },
    ],
    recentTransactions: [],
    salesByDay: [],
    topProducts: [
      { productId: "p-rokok", name: "Rokok Kretek", unit: "bungkus", qty: 30, revenue: 600000 },
    ],
    suggestions: [
      {
        productId: "p-pisang",
        name: "Pisang",
        unit: "kg",
        stock: 5,
        avgPerDay: 1.4,
        suggestedQty: 2,
        estimatedCost: 28000,
        reason: "Rata-rata terjual 1,4 kg/hari.",
      },
    ],
    tips: [],
  },
  debts: [
    {
      id: "d-1",
      debtor: "Pak Yono",
      product_name: "Rokok Kretek",
      qty: 2,
      unit: "bungkus",
      amount: 40000,
      note: null,
      created_at: "2026-11-01T02:00:00.000Z",
      settled_at: null,
    },
  ],
  notes: [
    {
      id: "n-1",
      createdAt: "2026-11-05T02:00:00.000Z",
      addedBy: "Pegawai toko",
      total: 215000,
      items: [
        { name: "Minyak Goreng", qty: 5, unit: "liter", unitPrice: 15000 },
        { name: "Gula Pasir", qty: 10, unit: "kg", unitPrice: 14000 },
      ],
      image: "",
      source: "scan" as const,
    },
  ],
  customers: [
    {
      id: "c-1",
      name: "Pak Yono",
      phone: "0812 3456 7890",
      note: "Langganan tetap",
      createdAt: "2026-05-01T02:00:00.000Z",
    },
  ],
  transactions: [
    {
      id: "t-1",
      type: "sale" as const,
      product_id: "p-rokok",
      qty: 2,
      unit_price: 20000,
      created_at: "2026-11-02T02:00:00.000Z",
    },
    {
      id: "t-2",
      type: "purchase" as const,
      product_id: "p-rokok",
      qty: 10,
      unit_price: 18000,
      created_at: "2026-11-03T02:00:00.000Z",
    },
  ],
}))

vi.mock("../lib/store", () => ({
  useWarung: () => ({
    products: mocks.products,
    debts: mocks.debts,
    notes: mocks.notes,
    customers: mocks.customers,
    consignments: mocks.consignments,
    cartLines: mocks.cartLines,
    setCartLines: mocks.setCartLines,
    stats: mocks.stats,
    transactions: mocks.transactions,
    saveCheckout: mocks.saveCheckout,
    addProduct: mocks.addProduct,
    setMinStock: mocks.setMinStock,
    adjustStock: mocks.adjustStock,
    savePurchase: mocks.savePurchase,
    savePurchaseWithNote: mocks.savePurchaseWithNote,
    addCustomer: mocks.addCustomer,
    updateCustomer: mocks.updateCustomer,
    settleDebt: mocks.settleDebt,
    refreshCatalog: mocks.refreshCatalog,
  }),
}))

import { Cashier } from "../pages/Cashier"
import { ChatPanel } from "../components/ChatPanel"
import { Closing } from "../pages/Closing"
import { Customers } from "../pages/Customers"
import { MobileMenu } from "./MobileMenu"
import { Notes } from "../pages/Notes"
import { Reconcile } from "../pages/Reconcile"
import { ProductSheet } from "../components/ProductSheet"
import { StockCountSheet } from "../components/StockCountSheet"

describe("halaman kasir", () => {
  it("menampilkan barang dan keranjang kosong", () => {
    const html = renderToStaticMarkup(<Cashier onVoice={() => {}} />)
    expect(html).toContain("Rokok Kretek")
    expect(html).toContain("Keranjang")
    expect(html).toContain("Belum ada barang")
    expect(html).toContain("Simpan")
  })

  it("menawarkan tab barang warung dan barang titipan", () => {
    const html = renderToStaticMarkup(<Cashier onVoice={() => {}} />)
    expect(html).toContain("Barang Warung")
    expect(html).toContain("Barang Titipan")
    expect(html).toContain("Keripik Tempe")
  })

  it("menawarkan jalan suara sebagai pintasan dan barang baru", () => {
    const html = renderToStaticMarkup(<Cashier onVoice={() => {}} />)
    expect(html).toContain("Catat lewat suara")
    expect(html).toContain("Barang belum ada di daftar")
    expect(html).toContain("20.000")
  })
})

describe("panel asisten", () => {
  it("menampilkan ajakan dan contoh pertanyaan", () => {
    const html = renderToStaticMarkup(<ChatPanel onClose={() => {}} />)
    expect(html).toContain("Asisten warung")
    expect(html).toContain("Bagaimana penjualan minggu ini?")
    expect(html).toContain("Siapa yang paling banyak utang?")
  })
})

describe("kartu stok", () => {
  it("menampilkan riwayat masuk dan keluar barang", () => {
    const html = renderToStaticMarkup(
      <ProductSheet product={mocks.products[0]} onClose={() => {}} />,
    )
    expect(html).toContain("Kartu stok")
    expect(html).toContain("Masuk")
    expect(html).toContain("Keluar")
    expect(html).toContain("Restok cepat")
  })
})

describe("stok opname", () => {
  it("menampilkan daftar barang untuk dihitung", () => {
    const html = renderToStaticMarkup(<StockCountSheet onClose={() => {}} />)
    expect(html).toContain("Hitung stok fisik")
    expect(html).toContain("Rokok Kretek")
    expect(html).toContain("Pisang")
  })
})

describe("riwayat nota", () => {
  it("menampilkan ringkasan belanja dan nota yang tersimpan", () => {
    const html = renderToStaticMarkup(<Notes />)
    expect(html).toContain("Nota belanja")
    expect(html).toContain("Belanja bulan ini")
    expect(html).toContain("Pegawai toko")
    expect(html).toContain("2 barang")
  })
})

describe("menu lengkap HP", () => {
  it("menampilkan semua halaman yang tidak ada di nav bawah", () => {
    const html = renderToStaticMarkup(
      <MobileMenu activeNav="Beranda" onNavigate={() => {}} onClose={() => {}} />,
    )
    expect(html).toContain("Piutang")
    expect(html).toContain("Titip Jual")
    expect(html).toContain("Nota Belanja")
    expect(html).toContain("Cek Stok")
    expect(html).toContain("Harga Pasar")
    expect(html).toContain("Tutup Buku")
    expect(html).toContain("Akun &amp; Pengaturan")
  })
})

describe("cek stok", () => {  it("menampilkan ringkasan temuan dan ajakan menghitung stok", () => {
    const html = renderToStaticMarkup(<Reconcile />)
    expect(html).toContain("Cek stok")
    expect(html).toContain("Temuan")
    expect(html).toContain("Hitung stok")
    expect(html).toContain("Belum ada selisih")
  })
})

describe("buku Piutang", () => {
  it("menampilkan Piutang, utang berjalan, dan ajakan menambah", () => {
    const html = renderToStaticMarkup(<Customers />)
    expect(html).toContain("BUKU Piutang")
    expect(html).toContain("Pak Yono")
    expect(html).toContain("Utang berjalan")
    expect(html).toContain("Tambah Piutang")
  })
})

describe("tutup buku", () => {  it("menampilkan ringkasan harian, utang, dan saran beli", () => {
    const html = renderToStaticMarkup(<Closing />)
    expect(html).toContain("Tutup buku")
    expect(html).toContain("Laba kotor")
    expect(html).toContain("Utang berjalan")
    expect(html).toContain("yang perlu dibeli")
    expect(html).toContain("Salin ringkasan")
  })
})
