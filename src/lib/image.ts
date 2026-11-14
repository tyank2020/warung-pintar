export interface PreparedImage {
  dataUrl: string
  base64: string
  mimeType: string
}

/**
 * Perkecil foto nota sebelum disimpan ke riwayat, supaya database tidak
 * membengkak. Kalau canvas tidak tersedia, gambar asli dipakai apa adanya.
 */
export async function shrinkDataUrl(
  dataUrl: string,
  maxSize = 640,
  quality = 0.62,
): Promise<string> {
  if (!dataUrl || typeof document === "undefined") return dataUrl
  if (typeof Image === "undefined") return dataUrl

  return new Promise<string>((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        if (!context) {
          resolve(dataUrl)
          return
        }
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL("image/jpeg", quality))
      } catch {
        resolve(dataUrl)
      }
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export async function prepareImage(
  file: File,
  maxSize = 1280,
  quality = 0.82,
): Promise<PreparedImage> {
  const fallback = () =>
    new Promise<PreparedImage>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "")
        resolve({
          dataUrl,
          base64: dataUrl.split(",")[1] ?? "",
          mimeType: file.type || "image/jpeg",
        })
      }
      reader.onerror = () => reject(new Error("Gagal membaca foto."))
      reader.readAsDataURL(file)
    })

  if (typeof createImageBitmap !== "function") return fallback()

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return fallback()
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const dataUrl = canvas.toDataURL("image/jpeg", quality)
    return {
      dataUrl,
      base64: dataUrl.split(",")[1] ?? "",
      mimeType: "image/jpeg",
    }
  } catch {
    return fallback()
  }
}
