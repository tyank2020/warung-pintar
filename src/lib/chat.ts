/**
 * Sesi chat asisten warung.
 *
 * Sesi disimpan di perangkat (localStorage) supaya pemilik warung bisa
 * melanjutkan obrolan yang sama besok tanpa setup apa pun. Lapisannya
 * sengaja terpisah dari komponen: kalau nanti mau pindah ke Supabase,
 * hanya fungsi baca/tulis di file ini yang berubah.
 */

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  at: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

const CHAT_KEY = "warung-pintar-chat-v1"

export const chatStorageKey = CHAT_KEY

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

export function readSessions(): ChatSession[] {
  const storage = safeStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(CHAT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatSession[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((session) => session && typeof session.id === "string")
      .map((session) => ({
        id: session.id,
        title: session.title || "Percakapan",
        createdAt: session.createdAt || new Date().toISOString(),
        updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
        messages: Array.isArray(session.messages) ? session.messages : [],
      }))
  } catch {
    return []
  }
}

export function writeSessions(sessions: ChatSession[]): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(CHAT_KEY, JSON.stringify(sessions.slice(0, 30)))
  } catch {
    // Penyimpanan penuh atau diblokir: percakapan tetap jalan di memori.
  }
}

export function createSession(): ChatSession {
  const now = new Date().toISOString()
  return {
    id: `sesi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "Percakapan baru",
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

/** Judul sesi diambil dari pertanyaan pertama, dipotong biar ringkas. */
export function sessionTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return "Percakapan baru"
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean
}

export function addMessage(
  session: ChatSession,
  role: ChatMessage["role"],
  text: string,
): ChatSession {
  const now = new Date().toISOString()
  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text: text.trim(),
    at: now,
  }
  const messages = [...session.messages, message]
  return {
    ...session,
    messages,
    title: session.messages.length === 0 && role === "user" ? sessionTitleFrom(text) : session.title,
    updatedAt: now,
  }
}

/** Simpan sesi di daftar, paling baru di atas. */
export function upsertSession(sessions: ChatSession[], session: ChatSession): ChatSession[] {
  const rest = sessions.filter((item) => item.id !== session.id)
  return [session, ...rest]
}

export function deleteSession(sessions: ChatSession[], id: string): ChatSession[] {
  return sessions.filter((session) => session.id !== id)
}

export function renameSession(
  sessions: ChatSession[],
  id: string,
  title: string,
): ChatSession[] {
  const clean = title.replace(/\s+/g, " ").trim()
  if (!clean) return sessions
  return sessions.map((session) =>
    session.id === id ? { ...session, title: clean.slice(0, 60), updatedAt: new Date().toISOString() } : session,
  )
}

/** Riwayat singkat untuk dikirim ke AI sebagai konteks percakapan. */
export function recentTurns(session: ChatSession, limit = 4) {
  return session.messages.slice(-limit).map((message) => ({
    role: message.role,
    text: message.text,
  }))
}
