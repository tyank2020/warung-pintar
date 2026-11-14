export class AiError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = "AiError"
    this.status = status
  }
}

export type ChatContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >

export interface ChatMessage {
  role: "system" | "user"
  content: ChatContent
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_MODEL = "gpt-4o-mini"
const TIMEOUT_MS = 45_000

/**
 * Call an OpenAI-compatible chat completion endpoint and return parsed JSON.
 * The API key is read from Supabase Secrets, never from the frontend.
 */
export async function askJson(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<unknown> {
  const apiKey = Deno.env.get("AI_API_KEY")?.trim()
  if (!apiKey) {
    throw new AiError("AI_API_KEY belum diatur di Supabase Secrets.", 500)
  }

  const baseUrl = (Deno.env.get("AI_BASE_URL")?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "")
  const model = Deno.env.get("AI_MODEL")?.trim() || DEFAULT_MODEL
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 1200,
      }),
      signal: controller.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new AiError("AI tidak menjawab dalam batas waktu.", 504)
    }
    throw new AiError("Gagal menghubungi penyedia AI.", 502)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    const suffix = detail ? ` ${detail.slice(0, 300)}` : ""
    throw new AiError(`Penyedia AI menolak permintaan (${response.status}).${suffix}`, 502)
  }

  let payload: ChatCompletionResponse
  try {
    payload = (await response.json()) as ChatCompletionResponse
  } catch {
    throw new AiError("Jawaban penyedia AI bukan JSON.", 502)
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) {
    throw new AiError("AI tidak mengembalikan isi jawaban.", 502)
  }

  return parseJsonContent(content)
}

/** Accept plain JSON, fenced JSON, or JSON wrapped in extra prose. */
export function parseJsonContent(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // Try the outermost object below.
  }

  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      // Fall through to the error below.
    }
  }

  throw new AiError("AI tidak mengembalikan JSON yang valid.", 502)
}
