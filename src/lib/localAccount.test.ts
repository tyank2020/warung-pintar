import { describe, expect, it } from "vitest"
import { createPasswordRecord, hashPassword, verifyPassword } from "./localAccount"

describe("local password record", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const record = await createPasswordRecord("rahasia123")

    expect(record.salt).not.toBe("")
    expect(record.hash).not.toBe("")
    expect(await verifyPassword("rahasia123", record)).toBe(true)
    expect(await verifyPassword("salah", record)).toBe(false)
  })

  it("hashes the same password differently with a different salt", async () => {
    const first = await createPasswordRecord("rahasia123")
    const second = await createPasswordRecord("rahasia123")

    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it("keeps the hash stable for the same salt and password", async () => {
    const salt = new Uint8Array(16).fill(7)
    const first = await hashPassword("rahasia123", salt, 1000)
    const second = await hashPassword("rahasia123", salt, 1000)

    expect(first).toBe(second)
  })
})
