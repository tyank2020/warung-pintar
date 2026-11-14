import { useEffect, useRef, useState } from "react"

/**
 * Angka yang bergerak halus dari nilai lama ke nilai baru (count-up).
 * Dipakai di kartu ringkasan supaya perubahan stok/transaksi terasa hidup.
 * Nilai awal animasi adalah 0 pada mount pertama — hitungan "menggulung" saat
 * kartu muncul, lalu mengikuti perubahan dengan easing ease-out-cubic.
 */
export function useAnimatedNumber(target: number, durationMs = 650): number {
  const [value, setValue] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) {
      setValue(target)
      return
    }
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (target - from) * eased
      fromRef.current = next
      setValue(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return value
}
