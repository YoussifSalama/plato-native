"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

// Native <dialog>: the browser gives focus trap, Esc and the backdrop.
// `remember` adds a "don't ask again" box; its value is passed to onConfirm.
function ConfirmDialog({ open, title, children, confirmLabel, remember, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; remember?: string; onConfirm: (remember: boolean) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), onCancel())} onClick={(e) => e.target === ref.current && onCancel()} className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40">
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
          {remember && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4 accent-primary" />
              {remember}
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(checked)} autoFocus>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}

export { ConfirmDialog }
