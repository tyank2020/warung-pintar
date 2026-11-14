import { useEffect, useRef, type ReactNode } from "react"
import { Icon } from "./Icon"

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Shared modal shell: Escape/backdrop dismissal, scroll lock, initial focus,
 * focus trap, and focus restoration.
 */
export function Modal({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const node = dialogRef.current
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== "Tab" || !node) return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current()
      }}
    >
      <div className="modal modal-wide" ref={dialogRef} tabIndex={-1}>
        <button className="modal-close" onClick={onClose} aria-label="Tutup">
          <Icon name="close" />
        </button>
        {children}
      </div>
    </div>
  )
}
