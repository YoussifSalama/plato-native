"use client"

import { cn } from "cn"

// IPIP response scale: how accurately a statement describes you, 1-5.
export const LIKERT = ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"] as const

export function LikertQuestion({ text, value, onPick }: { text: string; value: number | null; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-text-tertiary">How accurately does this describe you?</p>
        <p className="mt-2 text-2xl leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-[28px]">I {text.charAt(0).toLowerCase() + text.slice(1)}</p>
      </div>
      <div role="radiogroup" aria-label="Your answer" className="grid gap-2 sm:grid-cols-5">
        {LIKERT.map((label, i) => {
          const v = i + 1
          const on = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(v)}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary-line hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-[104px] sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:px-2 sm:text-center",
                on && "border-primary bg-primary-soft ring-1 ring-primary",
              )}
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums", on ? "bg-primary text-primary-foreground" : "bg-muted text-text-secondary")}>
                {v}
              </span>
              <span className={cn("text-sm leading-tight font-medium", on ? "text-primary" : "text-foreground")}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
