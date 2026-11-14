import { describe, expect, it } from "vitest"
import {
  addMessage,
  createSession,
  deleteSession,
  recentTurns,
  renameSession,
  sessionTitleFrom,
  upsertSession,
} from "./chat"

describe("sesi chat", () => {
  it("membuat sesi baru dengan judul default", () => {
    const session = createSession()
    expect(session.messages).toHaveLength(0)
    expect(session.title).toBe("Percakapan baru")
  })

  it("mengambil judul dari pertanyaan pertama", () => {
    expect(sessionTitleFrom("  Bagaimana   penjualan minggu ini? ")).toBe(
      "Bagaimana penjualan minggu ini?",
    )
    expect(sessionTitleFrom("x".repeat(60)).length).toBeLessThanOrEqual(43)
  })

  it("menambahkan pesan dan mengganti judul sesi", () => {
    let session = createSession()
    session = addMessage(session, "user", "Kenapa laba turun?")
    expect(session.title).toBe("Kenapa laba turun?")
    session = addMessage(session, "assistant", "Karena penjualan hari ini turun.")
    expect(session.messages).toHaveLength(2)
    expect(session.title).toBe("Kenapa laba turun?")
  })

  it("menyimpan sesi terbaru di atas daftar", () => {
    const first = addMessage(createSession(), "user", "Satu")
    const second = addMessage(createSession(), "user", "Dua")
    const sessions = upsertSession(upsertSession([], first), second)
    expect(sessions[0].id).toBe(second.id)
    expect(sessions).toHaveLength(2)
  })

  it("mengganti sesi lama tidak menggandakan", () => {
    const session = addMessage(createSession(), "user", "Satu")
    const sessions = upsertSession(upsertSession([], session), session)
    expect(sessions).toHaveLength(1)
  })

  it("menghapus dan mengganti nama sesi", () => {
    const session = addMessage(createSession(), "user", "Satu")
    const sessions = upsertSession([], session)
    expect(deleteSession(sessions, session.id)).toHaveLength(0)
    const renamed = renameSession(sessions, session.id, "Utang Pak Yono")
    expect(renamed[0].title).toBe("Utang Pak Yono")
  })

  it("mengambil beberapa putaran terakhir sebagai konteks", () => {
    let session = createSession()
    session = addMessage(session, "user", "Satu")
    session = addMessage(session, "assistant", "Dua")
    session = addMessage(session, "user", "Tiga")
    expect(recentTurns(session, 2)).toEqual([
      { role: "assistant", text: "Dua" },
      { role: "user", text: "Tiga" },
    ])
  })
})
