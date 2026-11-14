import { describe, expect, it } from "vitest"
import {
  authHashError,
  initials,
  isEmail,
  isSignupConfirmationUrl,
  localUser,
  mapSupabaseUser,
  normalizeEmail,
  normalizeName,
  parseLocalSession,
} from "./authSession"

describe("email helpers", () => {
  it("normalizes email case and spaces", () => {
    expect(normalizeEmail("  Pemilik@Gmail.COM ")).toBe("pemilik@gmail.com")
  })

  it("accepts common email addresses and rejects incomplete ones", () => {
    expect(isEmail("nama@gmail.com")).toBe(true)
    expect(isEmail("nama@warung.id")).toBe(true)
    expect(isEmail("nama")).toBe(false)
    expect(isEmail("nama@")).toBe(false)
    expect(isEmail("nama@gmail")).toBe(false)
  })
})

describe("isSignupConfirmationUrl", () => {
  it("detects a signup confirmation hash", () => {
    expect(isSignupConfirmationUrl("https://app.id/#access_token=abc&type=signup")).toBe(true)
    expect(isSignupConfirmationUrl("https://app.id/?konfirmasi=1")).toBe(true)
  })

  it("ignores recovery, normal, and broken URLs", () => {
    expect(isSignupConfirmationUrl("https://app.id/#access_token=abc&type=recovery")).toBe(false)
    expect(isSignupConfirmationUrl("https://app.id/")).toBe(false)
    expect(isSignupConfirmationUrl("bukan-url")).toBe(false)
  })
})

describe("authHashError", () => {
  it("ignores a valid recovery hash", () => {
    expect(authHashError("#access_token=abc&type=recovery")).toBeNull()
  })

  it("explains expired and invalid links", () => {
    expect(
      authHashError("#error=access_denied&error_description=Email+link+is+invalid+or+has+expired"),
    ).toContain("kedaluwarsa")
    expect(authHashError("#error=access_denied&error_description=Invalid+link")).toContain(
      "tidak valid",
    )
  })
})

describe("mapSupabaseUser", () => {
  it("maps the seller, warung, and real email", () => {
    const user = mapSupabaseUser({
      id: "user-1",
      email: "pemilik@gmail.com",
      user_metadata: {
        warung_name: "Warung Sumber Rejeki",
        seller_name: "Pak Andi",
      },
      app_metadata: { provider: "email" },
    })

    expect(user).toEqual({
      id: "user-1",
      name: "Pak Andi",
      email: "pemilik@gmail.com",
      avatarUrl: null,
      provider: "supabase",
      warungName: "Warung Sumber Rejeki",
    })
  })

  it("falls back to full_name and a generic warung name", () => {
    const user = mapSupabaseUser({
      id: "user-2",
      email: "pemilik@warung.id",
      user_metadata: { full_name: "Bu Sari" },
      app_metadata: { provider: "email" },
    })

    expect(user.name).toBe("Bu Sari")
    expect(user.warungName).toBe("Warung Saya")
  })
})

describe("parseLocalSession", () => {
  const account = JSON.stringify({
    email: "pemilik@gmail.com",
    warungName: "Warung Bu Sari",
    sellerName: "Bu Sari",
  })

  it("accepts a session whose email matches the local account", () => {
    const user = parseLocalSession(
      JSON.stringify({ email: "PEMILIK@gmail.com" }),
      account,
    )

    expect(user).toMatchObject({
      name: "Bu Sari",
      email: "pemilik@gmail.com",
      warungName: "Warung Bu Sari",
      provider: "local",
    })
  })

  it("rejects missing, corrupt, or mismatched sessions", () => {
    expect(parseLocalSession(null, account)).toBeNull()
    expect(parseLocalSession("{", account)).toBeNull()
    expect(parseLocalSession(JSON.stringify({ email: "lain@gmail.com" }), account)).toBeNull()
  })
})

describe("localUser", () => {
  it("creates a local profile with the real email", () => {
    expect(localUser("Pemilik@gmail.com", "Warung Bu Sari", "Bu Sari")).toMatchObject({
      id: "local:pemilik@gmail.com",
      name: "Bu Sari",
      email: "Pemilik@gmail.com",
      warungName: "Warung Bu Sari",
      provider: "local",
      avatarUrl: null,
    })
  })
})

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Warung   Bu Sari ")).toBe("warung bu sari")
  })
})

describe("initials", () => {
  it("uses at most two words", () => {
    expect(initials("Warung Sumber Rejeki")).toBe("WS")
    expect(initials("  andi  ")).toBe("A")
    expect(initials("")).toBe("WP")
  })
})
