import { handler as advisorHandler } from "../_shared/handlers/advisor.ts"
import { handler as parseVoiceHandler } from "../_shared/handlers/parse-voice.ts"
import { handler as scanReceiptHandler } from "../_shared/handlers/scan-receipt.ts"
import { handler as seasonalAdvisorHandler } from "../_shared/handlers/seasonal-advisor.ts"

// Small local assertions keep the tests free of npm type dependencies, so
// `deno test` works in CI without installing node_modules.
function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function deepStrictEqual(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) {
    throw new Error(`Expected ${right}, got ${left}`)
  }
}

const originalFetch = globalThis.fetch

function stubFetch(handler: (url?: string) => Response | Promise<Response>) {
  ;(globalThis as { fetch: typeof fetch }).fetch =
    (async (input: RequestInfo | URL) =>
      await handler(typeof input === "string" ? input : input.toString())) as typeof fetch
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

function aiResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

// scan-receipt memakai VLM native (Gemini generateContent), bukan shim chat-completions.
function vlmResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function withAiKey<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("AI_API_KEY", "test-key")
  return fn().finally(() => Deno.env.delete("AI_API_KEY"))
}

Deno.test("parse-voice returns normalized items", async () => {
  stubFetch(() =>
    aiResponse({
      items: [
        { name: "Beras Ramos", qty: "10", unit: "kilo", confidence: "0.95" },
        { name: "Telur Ayam", qty: 2, unit: "papan", confidence: 1.4 },
      ],
    })
  )

  try {
    const response = await withAiKey(() =>
      parseVoiceHandler(
        jsonRequest("parse-voice", {
          transcript: "terjual beras 10 kilo dan telur 2 papan",
          products: [{ name: "Beras Ramos", unit: "kg", aliases: ["beras"] }],
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), {
      items: [
        { name: "Beras Ramos", qty: 10, unit: "kg", confidence: 0.95 },
        { name: "Telur Ayam", qty: 2, unit: "papan", confidence: 0.99 },
      ],
      debtor: null,
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("parse-voice passes a normalized debtor for utang intent", async () => {
  stubFetch(() =>
    aiResponse({
      items: [{ name: "Rokok", qty: 2, unit: "bungkus", confidence: 0.9 }],
      debtor: "  Pak   Yono  ",
    })
  )

  try {
    const response = await withAiKey(() =>
      parseVoiceHandler(
        jsonRequest("parse-voice", {
          transcript: "simpen dulu buat Pak Yono dua rokok",
          products: [],
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), {
      items: [{ name: "Rokok", qty: 2, unit: "bungkus", confidence: 0.9 }],
      debtor: "Pak Yono",
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("parse-voice rejects empty transcript", async () => {
  const response = await parseVoiceHandler(jsonRequest("parse-voice", { transcript: "  " }))
  equal(response.status, 400)
  deepStrictEqual(await response.json(), { error: "Field transcript wajib diisi." })
})

Deno.test("parse-voice handles CORS preflight and wrong method", async () => {
  const options = await parseVoiceHandler(
    new Request("http://localhost/parse-voice", { method: "OPTIONS" }),
  )
  equal(options.status, 200)
  equal(options.headers.get("Access-Control-Allow-Origin"), "*")

  const get = await parseVoiceHandler(new Request("http://localhost/parse-voice"))
  equal(get.status, 405)
})

Deno.test("scan-receipt normalizes prices and data URLs", async () => {
  let requestedUrl = ""
  stubFetch((url) => {
    requestedUrl = url ?? ""
    return vlmResponse({
      items: [
        { name: "Minyak Goreng", qty: "5", unit: "liter", unit_price: "15.000" },
        { name: "Gula Pasir", qty: 10, unit: "kg", unit_price: "14.000" },
      ],
      total: "515.000",
    })
  })

  try {
    const imageBase64 = `data:image/jpeg;base64,${"a".repeat(200)}`
    const response = await withAiKey(() =>
      scanReceiptHandler(
        jsonRequest("scan-receipt", { imageBase64, mimeType: "image/jpeg" }),
      )
    )

    equal(response.status, 200)
    if (!requestedUrl.includes(":generateContent")) {
      throw new Error(`scan-receipt harus memanggil VLM native, bukan ${requestedUrl}`)
    }
    deepStrictEqual(await response.json(), {
      items: [
        { name: "Minyak Goreng", qty: 5, unit: "liter", unit_price: 15000 },
        { name: "Gula Pasir", qty: 10, unit: "kg", unit_price: 14000 },
      ],
      total: 515000,
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("scan-receipt rejects unsupported image types", async () => {
  const response = await scanReceiptHandler(
    jsonRequest("scan-receipt", {
      imageBase64: "a".repeat(200),
      mimeType: "image/gif",
    }),
  )
  equal(response.status, 400)
  deepStrictEqual(await response.json(), {
    error: "Format gambar harus JPEG, PNG, atau WebP.",
  })
})

Deno.test("scan-receipt defaults an empty mime type to JPEG", async () => {
  stubFetch(() =>
    vlmResponse({
      items: [{ name: "Beras Ramos", qty: 1, unit: "kg", unit_price: 12000 }],
      total: 12000,
    })
  )

  try {
    const response = await withAiKey(() =>
      scanReceiptHandler(
        jsonRequest("scan-receipt", { imageBase64: "a".repeat(200), mimeType: "" }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), {
      items: [{ name: "Beras Ramos", qty: 1, unit: "kg", unit_price: 12000 }],
      total: 12000,
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("advisor returns AI tips", async () => {
  stubFetch(() =>
    aiResponse({
      tips: [
        { text: "Siapkan stok telur.", reason: "Rata-rata terjual 2 papan/hari; stok 2 papan." },
      ],
    })
  )

  try {
    const response = await withAiKey(() =>
      advisorHandler(
        jsonRequest("advisor", {
          weekSales: 500000,
          weekCogs: 350000,
          lowStock: [{ name: "Telur Ayam", stock: 2, unit: "papan", min_stock: 6 }],
          tips: [{ text: "Saran lokal", reason: "Alasan lokal" }],
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), {
      tips: [
        { text: "Siapkan stok telur.", reason: "Rata-rata terjual 2 papan/hari; stok 2 papan." },
      ],
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("advisor falls back to local tips when AI fails", async () => {
  stubFetch(() => Promise.resolve(new Response("provider down", { status: 503 })))

  try {
    const fallback = [{ text: "Saran lokal", reason: "Alasan dari database" }]
    const response = await withAiKey(() =>
      advisorHandler(
        jsonRequest("advisor", {
          weekSales: 500000,
          weekCogs: 350000,
          lowStock: [],
          tips: fallback,
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), { tips: fallback })
  } finally {
    restoreFetch()
  }
})

Deno.test("seasonal-advisor returns AI tips from computed plan", async () => {
  stubFetch(() =>
    aiResponse({
      tips: [
        {
          text: "Dekatkan kopi ke kasir.",
          reason: "Permintaan musim ini naik 46%; stok 36 sachet.",
        },
      ],
    })
  )

  try {
    const response = await withAiKey(() =>
      seasonalAdvisorHandler(
        jsonRequest("seasonal-advisor", {
          context: {
            asOf: "2026-11-09",
            season: "Musim hujan",
            headline: "Musim hujan + akhir tahun",
            events: [{ label: "Akhir tahun", daysUntil: 41 }],
            dataDays: 365,
          },
          recommendations: [
            {
              kind: "display",
              action: "Dekatkan Kopi Kapal Api ke kasir",
              reason: "Permintaan musim ini naik 46%; stok 36 sachet.",
            },
          ],
          signals: [
            {
              name: "Kopi Kapal Api",
              stock: 36,
              unit: "sachet",
              seasonalIndex: 1.46,
              upliftPct: 46,
              suggestedQty: 0,
            },
          ],
          tips: [{ text: "Saran lokal", reason: "Alasan dari database" }],
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), {
      tips: [
        {
          text: "Dekatkan kopi ke kasir.",
          reason: "Permintaan musim ini naik 46%; stok 36 sachet.",
        },
      ],
    })
  } finally {
    restoreFetch()
  }
})

Deno.test("seasonal-advisor falls back to local plan when AI fails", async () => {
  stubFetch(() => Promise.resolve(new Response("provider down", { status: 503 })))

  try {
    const fallback = [{ text: "Pajang kopi", reason: "Permintaan naik 46%; stok 36 sachet." }]
    const response = await withAiKey(() =>
      seasonalAdvisorHandler(
        jsonRequest("seasonal-advisor", {
          context: { season: "Musim hujan", dataDays: 365 },
          recommendations: [],
          signals: [],
          tips: fallback,
        }),
      )
    )

    equal(response.status, 200)
    deepStrictEqual(await response.json(), { tips: fallback })
  } finally {
    restoreFetch()
  }
})

Deno.test("seasonal-advisor rejects wrong method", async () => {
  const response = await seasonalAdvisorHandler(
    new Request("http://localhost/seasonal-advisor", { method: "GET" }),
  )
  equal(response.status, 405)
})
