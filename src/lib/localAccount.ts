import { normalizeEmail } from "./authSession"

const ACCOUNT_KEY = "warung-pintar-local-account-v1"
const SESSION_KEY = "warung-pintar-local-session-v1"
const PASSWORD_ITERATIONS = 120_000

export interface PasswordRecord {
  salt: string
  hash: string
  iterations: number
}

export interface LocalAccount {
  email: string
  warungName: string
  sellerName: string
  password: PasswordRecord
  createdAt: string
}

export interface LocalSession {
  email: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export async function hashPassword(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PASSWORD_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

export async function createPasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return {
    salt: bytesToBase64(salt),
    hash: await hashPassword(password, salt),
    iterations: PASSWORD_ITERATIONS,
  }
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const hash = await hashPassword(password, base64ToBytes(record.salt), record.iterations)
  return sameText(hash, record.hash)
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Penyimpanan diblokir: akun tidak bertahan setelah halaman ditutup.
  }
}

function removeItem(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Tidak ada yang bisa dibersihkan kalau penyimpanan diblokir.
  }
}

function isPasswordRecord(value: unknown): value is PasswordRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<PasswordRecord>
  return (
    typeof record.salt === "string" &&
    typeof record.hash === "string" &&
    typeof record.iterations === "number"
  )
}

export function readLocalAccount(): LocalAccount | null {
  const account = readJson<Partial<LocalAccount>>(ACCOUNT_KEY)
  if (
    !account ||
    typeof account.email !== "string" ||
    typeof account.warungName !== "string" ||
    typeof account.sellerName !== "string" ||
    !isPasswordRecord(account.password)
  ) {
    return null
  }
  return {
    email: account.email,
    warungName: account.warungName,
    sellerName: account.sellerName,
    password: account.password,
    createdAt: typeof account.createdAt === "string" ? account.createdAt : "",
  }
}

export function hasLocalAccount(): boolean {
  return readLocalAccount() !== null
}

export function writeLocalAccount(account: LocalAccount) {
  writeJson(ACCOUNT_KEY, account)
}

export function readLocalSession(): LocalSession | null {
  const session = readJson<Partial<LocalSession>>(SESSION_KEY)
  if (!session || typeof session.email !== "string") return null
  return { email: session.email }
}

export function writeLocalSession(session: LocalSession) {
  writeJson(SESSION_KEY, session)
}

export function clearLocalSession() {
  removeItem(SESSION_KEY)
}

export function clearLocalAccount() {
  removeItem(ACCOUNT_KEY)
  removeItem(SESSION_KEY)
}

export function localAccountMatches(account: LocalAccount, email: string): boolean {
  return normalizeEmail(account.email) === normalizeEmail(email)
}
