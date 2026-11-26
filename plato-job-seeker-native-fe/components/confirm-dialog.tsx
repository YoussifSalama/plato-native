"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

// Native <dialog>: the browser gives focus trap, Esc and the backdrop.
// `remember` adds a "don't ask again" box; its value is passed to onConfirm.
// `danger` paints the confirm button red (only for what can't be undone); `busy` holds it while the request runs.
function ConfirmDialog({ open, title, children, confirmLabel, remember, danger, busy, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; remember?: string; danger?: boolean; busy?: boolean; onConfirm: (remember: boolean) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), onCancel())} onClick={(e) => e.target === ref.current && onCancel()} className="m-auto w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-card p-0 text-foreground shadow-[0_28px_70px_-28px_rgba(11,63,122,0.45)] backdrop:bg-foreground/30 backdrop:backdrop-blur-sm">
      {open && (
        <div className="flex flex-col gap-4 p-6 animate-in fade-in-0 zoom-in-95 duration-200">
          <h2 className="type-section-title">{title}</h2>
          <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
          {remember && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <Checkbox checked={checked} onCheckedChange={(c) => setChecked(c)} />
              {remember}
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant={danger ? "destructive" : "default"} disabled={busy} onClick={() => onConfirm(checked)} autoFocus={!danger}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}

export { ConfirmDialog }
