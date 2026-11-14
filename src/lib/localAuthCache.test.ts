/**
 * Tes cache sesi offline. Lingkungan test di proyek ini adalah Node tanpa
 * DOM/localStorage, jadi localStorage dipalsukan secara manual di memori.
 */
import { describe, expect, it, beforeEach, vi } from "vitest"
import {
  isNetworkOffline,
  readOfflineAuth,
  writeOfflineAuth,
  clearOfflineAuth,
} from "./localAuthCache"
import type { AuthUser } from "./authSession"

const KEY = "warung-pintar-offline-auth"

function installFakeStorage() {
  const map = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
  vi.stubGlobal("window", { localStorage })
  return map
}

const sampleUser: AuthUser = {
  id: "abc-123",
  name: "Pak Andi",
  email: "pakandi@example.com",
  avatarUrl: null,
  provider: "supabase",
  warungName: "Warung Sumber",
}

describe("localAuthCache", () => {
  beforeEach(() => {
    installFakeStorage()
  })

  it("round-trip: tulis lalu baca dengan identitas yang sama", () => {
    writeOfflineAuth(sampleUser)
    expect(readOfflineAuth()).toEqual(sampleUser)
  })

  it("mengembalikan null saat belum pernah login", () => {
    expect(readOfflineAuth()).toBeNull()
  })

  it("menolak data yang rusak", () => {
    window.localStorage.setItem(KEY, "{not-json")
    expect(readOfflineAuth()).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ v: 99, user: sampleUser }))
    expect(readOfflineAuth()).toBeNull()

    window.localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, user: { id: "", name: "" } }),
    )
    expect(readOfflineAuth()).toBeNull()
  })

  it("clearOfflineAuth menghapus penanda", () => {
    writeOfflineAuth(sampleUser)
    clearOfflineAuth()
    expect(readOfflineAuth()).toBeNull()
  })

  it("isNetworkOffline mengembalikan boolean tanpa melempar", () => {
    expect(typeof isNetworkOffline()).toBe("boolean")
  })
})
