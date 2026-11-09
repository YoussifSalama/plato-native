"use client"

import { useState } from "react"
import { cn } from "cn"
import { setApplicationOutcome, type ApplicationOutcome } from "@/lib/jobs/api"

// Plato can't read employer replies, so the seeker says what happened, if they want to.
// It feeds "Interview" on Home and the applications funnel.
export const OUTCOME_LABEL: Record<ApplicationOutcome, string> = { VIEWED: "Viewed", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Not selected" }
export const OUTCOME_TONE: Record<ApplicationOutcome, string> = {
  VIEWED: "bg-muted text-text-secondary",
  INTERVIEW: "bg-primary-soft text-primary",
  OFFER: "bg-success-soft text-success-ink",
  REJECTED: "bg-muted text-text-tertiary",
}
const ORDER: (ApplicationOutcome | null)[] = [null, "VIEWED", "INTERVIEW", "OFFER", "REJECTED"]

export function OutcomePicker({ id, value, onChange }: { id: string; value: ApplicationOutcome | null; onChange?: (v: ApplicationOutcome | null) => void }) {
  const [current, setCurrent] = useState(value)
  const [error, setError] = useState(false)
  async function pick(v: ApplicationOutcome | null) {
    const before = current
    setCurrent(v)
    setError(false)
    try {
      await setApplicationOutcome(id, v)
      onChange?.(v)
    } catch {
      setCurrent(before)
      setError(true)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        Did you hear back? <span className="font-normal text-text-tertiary">Optional. Only you see this.</span>
      </p>
      <div role="radiogroup" aria-label="What you heard back" className="flex flex-wrap gap-1.5">
        {ORDER.map((o) => (
          <button key={o ?? "none"} type="button" role="radio" aria-checked={current === o} data-ai={`application.outcome.${(o ?? "none").toLowerCase()}`} onClick={() => void pick(o)} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", current === o ? "border-primary bg-primary text-white" : "bg-card text-foreground hover:border-primary-line")}>
            {o ? OUTCOME_LABEL[o] : "Not yet"}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">Couldn&apos;t save that. Try again.</p>}
    </div>
  )
}
