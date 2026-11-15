import { describe, expect, it } from "vitest"
import {
  detectDebtor,
  findDuplicateProduct,
  findProduct,
  normalizeUnit,
  parseCatalogText,
  parseVoiceText,
  toConfirmItems,
  isPurchaseIntent,
} from "./parser"
import type { Product } from "./types"

const products: Product[] = [
  {
    id: "p-beras",
    name: "Beras Ramos",
    unit: "kg",
    stock: 70,
    min_stock: 15,
    buy_price: 12000,
    sell_price: 14500,
    aliases: ["beras", "br"],
  },
  {
    id: "p-telur",
    name: "Telur Ayam",
    unit: "papan",
    stock: 24,
    min_stock: 6,
    buy_price: 25000,
    sell_price: 30000,
    aliases: ["telur", "telor"],
  },
  {
    id: "p-gula",
    name: "Gula Pasir",
    unit: "kg",
    stock: 12,
    min_stock: 8,
    buy_price: 14000,
    sell_price: 17000,
    aliases: ["gula", "gulpas"],
  },
  {
    id: "p-air",
    name: "Air Mineral",
    unit: "botol",
    stock: 25,
    min_stock: 12,
    buy_price: 2500,
    sell_price: 4000,
    aliases: ["air", "aqua"],
  },
]

describe("parseVoiceText dengan barang yang sudah ada", () => {
  it("'saya membeli 10 air mineral' membaca Air Mineral, bukan barang baru", () => {
    const result = parseVoiceText("saya membeli 10 air mineral", products)
    expect(result.items).toEqual([
      {
        name: "Air Mineral",
        qty: 10,
        unit: "botol",
        confidence: expect.any(Number),
        size: null,
        priceTotal: null,
        unitPrice: null,
      },
    ])
  })

  it("toConfirmItems sale memakai barang yang sudah ada", () => {
    const result = parseVoiceText("saya membeli 10 air mineral", products)
    const confirmed = toConfirmItems(result.items, products, "purchase")
    expect(confirmed[0]).toMatchObject({
      productId: "p-air",
      name: "Air Mineral",
      isNew: false,
      unitPrice: 2500,
    })
  })
})

describe("parseVoiceText", () => {
  it("mengabaikan kata kerja/pengantar yang diucapkan sebelum nama barang", () => {
    expect(parseVoiceText("aku mau beli beras 5 kilo", products).items[0]).toMatchObject({
      name: "Beras Ramos",
      qty: 5,
      unit: "kg",
    })
    expect(parseVoiceText("tolong catat 3 papan telur", products).items[0]).toMatchObject({
      name: "Telur Ayam",
      qty: 3,
      unit: "papan",
    })
    expect(parseVoiceText("dibeli gula pasir 2 kg", products).items[0]).toMatchObject({
      name: "Gula Pasir",
      qty: 2,
      unit: "kg",
    })
    expect(parseVoiceText("besok aku akan beli telur 1 papan", products).items[0]).toMatchObject({
      name: "Telur Ayam",
      qty: 1,
      unit: "papan",
    })
    expect(parseVoiceText("mohon sekali catat 2 papan telur ayam", products).items[0]).toMatchObject({
      name: "Telur Ayam",
      qty: 2,
      unit: "papan",
    })
    expect(parseVoiceText("terjual beras Ramos 10 kilo", products).items[0]).toMatchObject({
      name: "Beras Ramos",
      qty: 10,
      unit: "kg",
    })
  })

  it("toConfirmItems memberi nama barang bersih walau baris dari AI mengandung kata kerja", () => {
    // AI yang "bandel" mengembalikan nama dengan kata pengantar — harus
    // dibungkus dengan pembersih sebelum dibandingkan ke katalog.
    const dirty = [
      { name: "Terjual Beras Ramos", qty: 5, unit: "kg", confidence: 0.95 },
      { name: "Aku catat Teh Botol", qty: 3, unit: "botol", confidence: 0.95 },
      { name: "Membeli Gula Pasir", qty: 2, unit: "kg", confidence: 0.95 },
    ]
    for (const item of dirty) {
      const confirmed = toConfirmItems([item], products, "sale")
      expect(confirmed[0]?.name ?? "").not.toMatch(/terjual|aku catat|membeli/i)
    }
  })

  it("kasus nyata: 'iyan membeli 10 botol air mineral ukuran 1 liter harga Rp100.000' — harga terisi dari ucapan", () => {
    const result = parseVoiceText(
      "iyan membeli 10 botol air mineral ukuran 1 liter harga Rp100.000",
      [],
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      qty: 10,
      unit: "botol",
      size: "1 liter",
      priceTotal: 100000,
    })
    // Nama tidak boleh mengandung kata pengantar dan simbol harga.
    expect(result.items[0].name ?? "").not.toMatch(/ukuran|harga|rp100/i)
    const confirmed = toConfirmItems(result.items, [], "purchase")
    expect(confirmed[0]).toMatchObject({
      isNew: true,
      unitPrice: 10000,
      size: "1 liter",
    })
  })

  it("'saya membeli 10 botol air mineral 1 liter seharga 250 ribu' berperilaku sama pada ekstraksi besar", () => {
    const airmineralProducts: Product[] = [
      {
        id: "p-air1l",
        name: "Air Mineral",
        unit: "botol",
        stock: 0,
        min_stock: 0,
        buy_price: 2500,
        sell_price: 4000,
        aliases: ["air"],
        size: "1 Liter",
      },
    ]
    const result = parseVoiceText(
      "saya membeli 10 botol air mineral 1 liter seharga 250 ribu",
      airmineralProducts,
    )
    expect(result.items[0]).toMatchObject({
      qty: 10,
      unit: "botol",
      size: "1 liter",
      priceTotal: 250000,
    })
    const confirmed = toConfirmItems(result.items, airmineralProducts, "purchase")
    expect(confirmed[0]).toMatchObject({
      productId: "p-air1l",
      unitPrice: 25000,
      size: "1 liter",
    })
  })

  it("parses two items with their units", () => {
    const result = parseVoiceText("terjual beras 10 kilo dan telur 2 papan", products)

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ name: "Beras Ramos", qty: 10, unit: "kg" })
    expect(result.items[1]).toMatchObject({ name: "Telur Ayam", qty: 2, unit: "papan" })
  })

  it("matches product aliases", () => {
    const result = parseVoiceText("jual gulpas 3 kg", products)

    expect(result.items[0]).toMatchObject({ name: "Gula Pasir", qty: 3, unit: "kg" })
  })

  it("merges the same product and unit", () => {
    const result = parseVoiceText("terjual beras 2 kg dan beras 3 kg", products)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].qty).toBe(5)
  })

  it("parses two items separated by a comma", () => {
    const result = parseVoiceText("terjual beras 10 kilo, telur 2 papan", products)

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ name: "Beras Ramos", qty: 10, unit: "kg" })
    expect(result.items[1]).toMatchObject({ name: "Telur Ayam", qty: 2, unit: "papan" })
  })

  it("keeps decimal quantities with a comma or a dot", () => {
    const comma = parseVoiceText("terjual gula 1,5 kg", products)
    const dot = parseVoiceText("terjual gula 1.5 kg", products)

    expect(comma.items[0]).toMatchObject({ name: "Gula Pasir", qty: 1.5, unit: "kg" })
    expect(dot.items[0]).toMatchObject({ name: "Gula Pasir", qty: 1.5, unit: "kg" })
  })

  it("parses a decimal quantity before the product name", () => {
    const result = parseVoiceText("terjual 1,5 kg gula", products)

    expect(result.items[0]).toMatchObject({ name: "Gula Pasir", qty: 1.5, unit: "kg" })
  })

  it("does not create a row when only a number is mentioned", () => {
    expect(parseVoiceText("terjual 2", products).items).toHaveLength(0)
  })

  it("falls back to qty 1 when the number is missing", () => {
    const result = parseVoiceText("terjual telur", products)

    expect(result.items[0]).toMatchObject({ name: "Telur Ayam", qty: 1, unit: "papan" })
  })
})

describe("findProduct", () => {
  it("does not match archived products", () => {
    const archived = products.map((product) =>
      product.id === "p-beras" ? { ...product, archived: true } : product,
    )
    expect(findProduct(archived, "beras")).toBeNull()
    expect(findProduct(archived, "Beras Ramos")).toBeNull()
    // Barang lain yang tidak diarsipkan tetap ketemu.
    expect(findProduct(archived, "gula")?.name).toBe("Gula Pasir")
  })

  it("finds a product by alias", () => {
    expect(findProduct(products, "gulpas")?.name).toBe("Gula Pasir")
  })

  it("returns null for an unknown product", () => {
    expect(findProduct(products, "sabun")).toBeNull()
  })
})

describe("findDuplicateProduct", () => {
  it("detects an existing name or alias", () => {
    expect(findDuplicateProduct(products, "Gula Pasir")?.name).toBe("Gula Pasir")
    expect(findDuplicateProduct(products, "gulpas")?.name).toBe("Gula Pasir")
    expect(findDuplicateProduct(products, "Gula Merah")).toBeNull()
  })

  it("detects a new alias that already belongs to another product", () => {
    expect(findDuplicateProduct(products, "Gula Merah", ["gulpas"])?.name).toBe("Gula Pasir")
  })
})

describe("normalizeUnit", () => {
  it("maps common Indonesian unit words", () => {
    expect(normalizeUnit("kilo")).toBe("kg")
    expect(normalizeUnit("liter")).toBe("liter")
    expect(normalizeUnit("papan")).toBe("papan")
  })
})

describe("isPurchaseIntent", () => {
  it("mengenali ucapan membeli", () => {
    expect(isPurchaseIntent("saya membeli 10 air mineral")).toBe(true)
    expect(isPurchaseIntent("beli 2 beras")).toBe(true)
    expect(isPurchaseIntent("restock mi instan 5")).toBe(true)
    expect(isPurchaseIntent("kulakan beras 20 kilo")).toBe(true)
  })

  it("penjualan tidak dikira membeli", () => {
    expect(isPurchaseIntent("terjual beras 10 kilo")).toBe(false)
    expect(isPurchaseIntent("jual gula 2 kg")).toBe(false)
    expect(isPurchaseIntent("air mineral 3 botol")).toBe(false)
  })
})

describe("toConfirmItems", () => {
  it("uses the selling price for a sale", () => {
    const items = toConfirmItems(
      [{ name: "Beras Ramos", qty: 2, unit: "kg", confidence: 0.9 }],
      products,
      "sale",
    )

    expect(items[0]).toMatchObject({
      productId: "p-beras",
      unitPrice: 14500,
      isNew: false,
    })
  })

  it("marks unknown products as new", () => {
    const items = toConfirmItems(
      [{ name: "Sabun Mandi", qty: 1, unit: "pcs", confidence: 0.5 }],
      products,
      "purchase",
    )

    expect(items[0]).toMatchObject({ productId: "", isNew: true, unitPrice: 0 })
  })
})

describe("detectDebtor", () => {
  it("detects a debtor after the debt keyword", () => {
    const result = detectDebtor("simpen dulu buat Pak Yono dua rokok")
    expect(result.debtor).toBe("Pak Yono")
    expect(result.cleanedTranscript).not.toContain("Pak Yono")
  })

  it("detects a debtor directly after utang", () => {
    const result = detectDebtor("utang Bu Tuti beras 3 kilo")
    expect(result.debtor).toBe("Bu Tuti")
  })

  it("returns null for a plain sale", () => {
    const result = detectDebtor("terjual beras 10 kilo dan telur 2 papan")
    expect(result.debtor).toBeNull()
    expect(result.cleanedTranscript).toBe("terjual beras 10 kilo dan telur 2 papan")
  })

  it("returns null when the keyword exists but no person is named", () => {
    const result = detectDebtor("simpen dulu barang di rak")
    expect(result.debtor).toBeNull()
  })
})

describe("parseVoiceText with debtor", () => {
  it("parses items from the cleaned utang transcript", () => {
    const result = parseVoiceText("simpen dulu buat Pak Yono dua telur", products)
    expect(result.debtor).toBe("Pak Yono")
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items[0]).toMatchObject({ name: "Telur Ayam", qty: 2 })
  })

  it("keeps normal sales debtor-free", () => {
    const result = parseVoiceText("terjual 3 telur", products)
    expect(result.debtor).toBeNull()
    expect(result.items[0]).toMatchObject({ qty: 3 })
  })
})

describe("parseCatalogText", () => {
  it("extracts name and price from 'ribu'", () => {
    expect(parseCatalogText("beras 14 ribu")).toEqual([
      {
        name: "Beras",
        qty: 0,
        unit: "pcs",
        sellPrice: 14000,
        confidence: expect.any(Number),
        matchId: null,
        size: null,
      },
    ])
  })

  it("extracts name, stock, and price together", () => {
    const items = parseCatalogText("beras 20 kilo 14 ribu dan telur 2 papan 30 ribu")
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ name: "Beras", qty: 20, unit: "kg", sellPrice: 14000 })
    expect(items[1]).toMatchObject({ name: "Telur", qty: 2, unit: "papan", sellPrice: 30000 })
  })

  it("understands thousand-dot prices and rb", () => {
    const items = parseCatalogText("gula pasir 17.000, mi instan 3rb")
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ name: "Gula Pasir", sellPrice: 17000 })
    expect(items[1]).toMatchObject({ name: "Mi Instan", sellPrice: 3000 })
  })

  it("membaca 'rp 14' sebagai 14 rupiah, bukan 14.000", () => {
    const items = parseCatalogText("gula pasir rp 14")
    expect(items[0]).toMatchObject({ name: "Gula Pasir", sellPrice: 14 })
  })

  it("membaca 'rp 14 ribu' sebagai 14.000", () => {
    const items = parseCatalogText("gula pasir rp 14 ribu")
    expect(items[0]).toMatchObject({ name: "Gula Pasir", sellPrice: 14000 })
  })

  it("keeps items without price or qty as editable rows", () => {
    const items = parseCatalogText("beras, gula pasir dan sabun")
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ name: "Beras", qty: 0, sellPrice: 0 })
    expect(items.every((item) => item.name.length > 0)).toBe(true)
  })

  it("merges repeated names and keeps the last price", () => {
    const items = parseCatalogText("beras 14 ribu lalu beras 15 ribu")
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: "Beras", sellPrice: 15000 })
  })

  it("handles juta and decimals", () => {
    const items = parseCatalogText("beras 1,5 juta")
    expect(items[0]).toMatchObject({ name: "Beras", sellPrice: 1500000 })
  })

  it("mengarah ke barang yang sudah ada, bukan membuat barang baru", () => {
    const items = parseCatalogText("saya membeli 10 air mineral", products)
    expect(items).toEqual([
      {
        name: "Air Mineral",
        qty: 10,
        unit: "botol",
        sellPrice: 0,
        confidence: expect.any(Number),
        matchId: "p-air",
        size: null,
      },
    ])
  })

  it("barang yang tidak cocok tetap jadi barang baru", () => {
    const items = parseCatalogText("sabun batangan 5 pcs", products)
    expect(items[0]).toMatchObject({ name: "Sabun Batangan", matchId: null })
  })
})

/** Varian ukuran: nama sama, ukuran berbeda, stok terpisah. */
const sizeProducts: Product[] = [
  {
    id: "p-minyak-1l",
    name: "Minyak Goreng",
    unit: "botol",
    stock: 35,
    min_stock: 5,
    buy_price: 15000,
    sell_price: 18000,
    aliases: ["minyak"],
    size: "1 Liter",
  },
  {
    id: "p-minyak-2l",
    name: "Minyak Goreng",
    unit: "botol",
    stock: 20,
    min_stock: 5,
    buy_price: 29000,
    sell_price: 32000,
    aliases: ["minyak"],
    size: "2 Liter",
  },
]

describe("varian ukuran (size)", () => {
  it("contoh produk: dua varian Air Mineral, satu kalimat dengan harga seharga", () => {
    const airMineralProducts: Product[] = [
      {
        id: "p-air-1l",
        name: "Air Mineral",
        unit: "botol",
        stock: 50,
        min_stock: 10,
        buy_price: 25000,
        sell_price: 30000,
        aliases: ["aqua"],
        size: "1 Liter",
      },
      {
        id: "p-air-500ml",
        name: "Air Mineral",
        unit: "botol",
        stock: 50,
        min_stock: 10,
        buy_price: 20000,
        sell_price: 25000,
        aliases: ["aqua"],
        size: "500 ml",
      },
    ]

    const result = parseVoiceText(
      "saya membeli 10 botol air mineral 1 liter seharga 250 ribu dan 5 botol air mineral 500 ml seharga 100 ribu",
      airMineralProducts,
    )

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      name: "Air Mineral",
      qty: 10,
      unit: "botol",
      size: "1 liter",
      priceTotal: 250000,
    })
    expect(result.items[1]).toMatchObject({
      name: "Air Mineral",
      qty: 5,
      unit: "botol",
      size: "500 ml",
      priceTotal: 100000,
    })

    // Varian dipilih berdasarkan ukuran, dan harga yang diucapkan menang
    // atas katalog.
    const confirmed = toConfirmItems(result.items, airMineralProducts, "purchase")
    expect(confirmed[0]).toMatchObject({ productId: "p-air-1l", unitPrice: 25000 })
    expect(confirmed[1]).toMatchObject({ productId: "p-air-500ml", unitPrice: 20000 })
  })

  it("mendukung harga per satuan ('per 25 ribu')", () => {
    const items = parseVoiceText("terjual beras 2 kg per 15 ribu", products)
    expect(items.items[0]).toMatchObject({ name: "Beras Ramos", qty: 2, unit: "kg" })
    const confirmed = toConfirmItems(items.items, products, "sale")
    expect(confirmed[0]?.unitPrice).toBe(15000)
  })

  it("menangani urutan 'jumlah dulu baru ukuran' dan sebaliknya", () => {
    const airProds: Product[] = [
      {
        id: "p-a1",
        name: "Air Mineral",
        unit: "botol",
        stock: 10,
        min_stock: 2,
        buy_price: 1000,
        sell_price: 2000,
        aliases: ["air"],
        size: "1 Liter",
      },
    ]
    const qtyFirst = parseVoiceText("terjual 10 botol air mineral 1 liter", airProds)
    const sizeFirst = parseVoiceText("terjual air mineral 1 liter 10 botol", airProds)
    expect(qtyFirst.items[0]).toMatchObject({ qty: 10, unit: "botol", size: "1 liter" })
    expect(sizeFirst.items[0]).toMatchObject({ qty: 10, unit: "botol", size: "1 liter" })
  })

  it("'minyak 2 liter 20 botol' membaca ukuran sebagai size, bukan jumlah", () => {
    const result = parseVoiceText("terjual minyak 2 liter 20 botol", sizeProducts)
    expect(result.items[0]).toMatchObject({
      name: "Minyak Goreng",
      qty: 20,
      unit: "botol",
      size: "2 liter",
    })
  })

  it("varian ikut dipilih saat nama sama: 2 Liter dan 1 Liter beda barang", () => {
    const one = toConfirmItems(
      parseVoiceText("terjual minyak 1 liter 15 botol", sizeProducts).items,
      sizeProducts,
      "sale",
    )
    const two = toConfirmItems(
      parseVoiceText("terjual minyak 2 liter 20 botol", sizeProducts).items,
      sizeProducts,
      "sale",
    )
    expect(one[0]?.productId).toBe("p-minyak-1l")
    expect(two[0]?.productId).toBe("p-minyak-2l")
  })

  it("satu pasangan angka+satuan diperlakukan seperti biasa (tanpa size)", () => {
    const result = parseVoiceText("terjual minyak 2 liter", sizeProducts)
    expect(result.items[0]).toMatchObject({ qty: 2, unit: "liter", size: null })
  })

  it("nama sama tapi ukuran berbeda BUKAN duplikat", () => {
    expect(findDuplicateProduct(sizeProducts, "Minyak Goreng", [], "2 Liter")?.id).toBe(
      "p-minyak-2l",
    )
    expect(findDuplicateProduct(sizeProducts, "Minyak Goreng", [], "1 liter")?.id).toBe(
      "p-minyak-1l",
    )
    expect(findDuplicateProduct(sizeProducts, "Minyak Goreng", [], "3 Liter")).toBeNull()
  })

  it("tanpa ukuran, nama yang sama tetap dianggap duplikat (perilaku lama)", () => {
    expect(findDuplicateProduct(sizeProducts, "Minyak Goreng", [])).not.toBeNull()
  })

  it("baris dengan ukuran yang tidak ada variannya jadi produk baru, bukan cocok ke produk lepas", () => {
    // Katalog hanya punya Minyak Goreng 1L & 2L (keduanya sized). Ukuran 3L
    // tidak ada → null. Begitu juga tanpa ukuran cocok, item tidak boleh
    // jatuh ke barang lepas bernama sama.
    expect(findProduct(sizeProducts, "Minyak Goreng", "3 Liter")).toBeNull()

    const items = toConfirmItems(
      [{ name: "Minyak Goreng", qty: 10, unit: "botol", confidence: 0.5, size: "3 Liter" }],
      sizeProducts,
      "purchase",
    )
    expect(items[0]).toMatchObject({ productId: "", isNew: true, size: "3 Liter", unit: "botol" })
  })

  it("nama+ukuran sama tapi merek berbeda = produk berbeda (harga beda)", () => {
    const branded: Product[] = [
      { ...sizeProducts[1]!, id: "p-minyak-2l-generic", brand: null },
      { ...sizeProducts[1]!, id: "p-minyak-2l-bimoli", brand: "Bimoli" },
    ]
    expect(findProduct(branded, "minyak goreng", "2 Liter", "Bimoli")?.id).toBe(
      "p-minyak-2l-bimoli",
    )
    expect(findProduct(branded, "minyak goreng", "2 Liter", "Filma")).toBeNull()
    expect(findDuplicateProduct(branded, "Minyak Goreng", [], "2 Liter", "Bimoli")?.id).toBe(
      "p-minyak-2l-bimoli",
    )
    expect(findDuplicateProduct(branded, "Minyak Goreng", [], "2 Liter", "Filma")).toBeNull()
  })

  it("parseCatalogText 'minyak 2 liter 29 ribu 20 botol' memisahkan size, harga, dan qty", () => {
    const matched = parseCatalogText("minyak 2 liter 29 ribu 20 botol", sizeProducts)
    expect(matched[0]).toMatchObject({
      name: "Minyak Goreng",
      qty: 20,
      unit: "botol",
      size: "2 liter",
      matchId: "p-minyak-2l",
      // Produk yang sudah ada tidak menimpa harga yang tersimpan.
      sellPrice: 0,
    })
    const fresh = parseCatalogText("minyak 2 liter 29 ribu 20 botol")
    expect(fresh[0]).toMatchObject({
      name: "Minyak",
      qty: 20,
      unit: "botol",
      size: "2 liter",
      sellPrice: 29000,
      matchId: null,
    })
  })
})
