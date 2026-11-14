import { describe, expect, it } from "vitest"
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import { AuthProvider } from "../lib/auth"
import { WarungProvider } from "../lib/store"
import { Cashier } from "../pages/Cashier"
import { Closing } from "../pages/Closing"
import { Consignments } from "../pages/Consignments"
import { Customers } from "../pages/Customers"
import { Dashboard } from "../pages/Dashboard"
import { History } from "../pages/History"
import { Inventory } from "../pages/Inventory"
import { MarketPrices } from "../pages/MarketPrices"
import { Notes } from "../pages/Notes"
import { Reconcile } from "../pages/Reconcile"
import { Reports } from "../pages/Reports"
import { Settings } from "../pages/Settings"
import { ProductSheet } from "../components/ProductSheet"
import { StockCountSheet } from "../components/StockCountSheet"
import { AuthScreen } from "../components/AuthScreen"

const noop = () => {}

const SAMPLE_PRODUCT = {
  id: "p-beras",
  name: "Beras Ramos",
  unit: "kg",
  stock: 10,
  min_stock: 5,
  buy_price: 10000,
  sell_price: 15000,
  aliases: [],
}

describe("render halaman", () => {
  it("menampilkan login dalam halaman awal bersama identitas warung", () => {
    const html = renderToString(createElement(AuthProvider, null, createElement(AuthScreen)))

    expect(html).toContain("Warung Anda,")
    expect(html).toContain("ASISTEN CERDAS UNTUK WARUNG")
    expect(html).toContain("Masuk ke warung")
    expect(html).toContain("Buat akun")
  })

  it("merender semua halaman tanpa error", () => {
    const pages = [
      createElement(Cashier, { onVoice: noop }),
      createElement(Dashboard, { onVoice: noop, onReceipt: noop, onNavigate: noop }),
      createElement(Inventory, {
        onReceipt: noop,
        onProduct: noop,
        onVoice: noop,
        onNavigate: noop,
        initialSearch: "",
      }),
      createElement(Customers),
      createElement(Consignments),
      createElement(Notes),
      createElement(Reconcile),
      createElement(MarketPrices),
      createElement(Closing),
      createElement(Reports, { onNavigate: noop }),
      createElement(History),
      createElement(Settings),
      createElement(ProductSheet, { product: SAMPLE_PRODUCT, onClose: noop }),
      createElement(StockCountSheet, { onClose: noop }),
    ]

    for (const page of pages) {
      const html = renderToString(
        createElement(AuthProvider, null, createElement(WarungProvider, null, page)),
      )
      expect(html.length).toBeGreaterThan(0)
    }
  })
})
