import { AiError, parseJsonContent } from "./ai.ts"

/**
 * Native VLM call (Gemini `generateContent`) untuk memahami gambar, dipakai oleh `scan-receipt`.
 *
 * Beda dengan `ai.ts` (chat-completions kompatibel OpenAI): gambar dikirim sebagai
 * `inlineData` di bagian content multimodal, kunci lewat header `x-goog-api-key`
 * (bukan di URL), dan respons diminta sebagai JSON (`responseMimeType: application/json`).
 * Kunci AI tetap hanya dibaca dari Supabase Secrets.
 */

const DEFAULT_VLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_VLM_MODEL = "gemini-3.5-flash-lite"
const TIMEOUT_MS = 60_000

export interface VisionRequest {
  /** Prompt sistem: aturan ekstraksi. */
  systemPrompt: string
  /** Instruksi singkat untuk user turn. */
  userText: string
  /** Base64 mentah (tanpa prefix data URL). */
  imageBase64: string
  /** image/jpeg | image/png | image/webp */
  mimeType: string
}

interface GeminiPart {
  text?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

export async function askVlmJson(
  vision: VisionRequest,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<unknown> {
  const apiKey = Deno.env.get("AI_API_KEY")?.trim()
  if (!apiKey) {
    throw new AiError("AI_API_KEY belum diatur di Supabase Secrets.", 500)
  }

  const baseUrl = (Deno.env.get("AI_VLM_BASE_URL")?.trim() || DEFAULT_VLM_BASE_URL).replace(
    /\/+$/,
    "",
  )
  const model = Deno.env.get("AI_MODEL")?.trim() || DEFAULT_VLM_MODEL
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: vision.systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: vision.userText },
              { inlineData: { mimeType: vision.mimeType, data: vision.imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          maxOutputTokens: options.maxTokens ?? 1600,
          responseMimeType: "application/json",
        },
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

  let payload: GeminiResponse
  try {
    payload = (await response.json()) as GeminiResponse
  } catch {
    throw new AiError("Jawaban penyedia AI bukan JSON.", 502)
  }

  const blockReason = payload.promptFeedback?.blockReason
  if (blockReason) {
    throw new AiError(`AI menolak memproses gambar (${blockReason}).`, 422)
  }

  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim()
  if (!text) {
    throw new AiError("AI tidak mengembalikan isi jawaban.", 502)
  }

  return parseJsonContent(text)
}
