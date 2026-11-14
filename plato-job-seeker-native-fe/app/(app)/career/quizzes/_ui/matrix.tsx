"use client"

import { Eraser } from "lucide-react"
import { cn } from "cn"

// Figural matrices from the Open Matrices Item Bank (GPLv3): every cell is a 20-character mask of construction
// elements drawn in a 100×100 box — 4 corners, 4 lines, 4 bars, 4 centre shapes, 4 arrows. Geometry follows the
// bank's own drawing.js, so a cell here is the cell the item was calibrated with.

const POLY: Record<number, string> = {
  0: "0,0 25,0 0,25",
  1: "25,100 0,100 0,75",
  2: "100,75 100,100 75,100",
  3: "75,0 100,0 100,25",
  4: "12.5,50 50,12.5",
  5: "12.5,50 50,87.5",
  6: "50,87.5 87.5,50",
  7: "50,12.5 87.5,50",
  8: "37.5,0 62.5,0 62.5,12.5 37.5,12.5",
  9: "0,37.5 0,62.5 12.5,62.5 12.5,37.5",
  10: "37.5,87.5 62.5,87.5 62.5,100 37.5,100",
  11: "87.5,37.5 87.5,62.5 100,62.5 100,37.5",
  16: "50,12.5 37.5,25 62.5,25",
  17: "12.5,50 25,37.5 25,62.5",
  18: "50,87.5 37.5,75 62.5,75",
  19: "87.5,50 75,37.5 75,62.5",
}

function Element({ i }: { i: number }) {
  if (i === 12) return <rect x={40} y={40} width={20} height={20} fill="currentColor" />
  if (i === 13) return <rect x={40} y={40} width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} />
  if (i === 14) return <circle cx={50} cy={50} r={10} fill="currentColor" />
  if (i === 15) return <circle cx={50} cy={50} r={10} fill="none" stroke="currentColor" strokeWidth={1.5} />
  const line = i >= 4 && i <= 7
  return <polygon points={POLY[i]} fill={line ? "none" : "currentColor"} stroke="currentColor" strokeWidth={line ? 2 : 1} strokeLinejoin="round" />
}

/** One cell: the elements its mask switches on. */
export function Cell({ mask, className, label }: { mask: string; className?: string; label?: string }) {
  return (
    <svg viewBox="-2 -2 104 104" className={cn("block size-full", className)} role="img" aria-label={label}>
      {mask.split("").map((b, i) => (b === "1" ? <Element key={i} i={i} /> : null))}
    </svg>
  )
}

/**
 * The 3×3 grid. `cells` are the 8 given cells (or all 9 on a result); the 9th slot shows `answer` — the piece the
 * seeker is building — with a dashed frame, or a question mark while it is empty.
 */
export function MatrixGrid({
  cells,
  answer,
  answerTone,
  size = "md",
  className,
}: {
  cells: string[]
  answer?: string | null
  answerTone?: "neutral" | "right" | "wrong"
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const ninth = cells[8] ?? answer ?? null
  const empty = !ninth || !ninth.includes("1")
  return (
    <div
      className={cn(
        "grid aspect-square grid-cols-3 overflow-hidden rounded-xl border bg-card text-foreground",
        size === "sm" ? "w-24 gap-px bg-divider" : size === "lg" ? "w-full max-w-[400px] gap-px bg-divider" : "w-full max-w-[360px] gap-px bg-divider",
        className,
      )}
    >
      {cells.slice(0, 8).map((m, i) => (
        <div key={i} className={cn("bg-card", size === "sm" ? "p-1" : "p-2.5 sm:p-3.5")}>
          <Cell mask={m} label={`Cell ${i + 1}`} />
        </div>
      ))}
      <div className={cn("relative", size === "sm" ? "p-1" : "p-2.5 sm:p-3.5", answerTone === "right" ? "bg-success-soft" : answerTone === "wrong" ? "bg-danger-soft" : "bg-primary-tint")}>
        <div className={cn("size-full rounded-md", size !== "sm" && "outline-2 -outline-offset-2 outline-primary/40 outline-dashed", answerTone && "outline-none")}>
          {empty ? (
            <span className={cn("grid size-full place-items-center font-bold text-primary", size === "sm" ? "text-base" : "text-3xl")}>?</span>
          ) : (
            <Cell mask={ninth} label="Your answer" className={cn(answerTone === "right" && "text-success-ink", answerTone === "wrong" && "text-destructive")} />
          )}
        </div>
      </div>
    </div>
  )
}

const GROUPS = [
  { name: "Corners", ids: [0, 1, 2, 3] },
  { name: "Lines", ids: [4, 5, 6, 7] },
  { name: "Bars", ids: [8, 9, 10, 11] },
  { name: "Centre", ids: [12, 13, 14, 15] },
  { name: "Arrows", ids: [16, 17, 18, 19] },
]

/** The 20 construction elements as toggles: the seeker builds the missing cell from them. */
export function ElementPalette({ mask, onChange, disabled }: { mask: string; onChange: (mask: string) => void; disabled?: boolean }) {
  const toggle = (i: number) => onChange(mask.slice(0, i) + (mask[i] === "1" ? "0" : "1") + mask.slice(i + 1))
  const picked = mask.split("").filter((b) => b === "1").length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          Build the missing cell{" "}
          <span className="font-normal text-text-tertiary tabular-nums">
            · {picked} part{picked === 1 ? "" : "s"} picked
          </span>
        </p>
        <button
          type="button"
          onClick={() => onChange("0".repeat(20))}
          disabled={disabled || picked === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-text-secondary hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Eraser className="size-4" /> Clear
        </button>
      </div>
      <div className="grid gap-2.5">
        {GROUPS.map((g) => (
          <div key={g.name} className="grid grid-cols-[64px_1fr] items-center gap-3">
            <span className="text-xs font-medium tracking-wide text-text-tertiary uppercase">{g.name}</span>
            <div className="grid max-w-[288px] grid-cols-4 gap-2">
              {g.ids.map((i) => {
                const on = mask[i] === "1"
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${g.name} ${(i % 4) + 1}`}
                    disabled={disabled}
                    onClick={() => toggle(i)}
                    className={cn(
                      "aspect-square rounded-lg border bg-card p-1 text-foreground transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary-line hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      on && "border-primary bg-primary-soft text-primary ring-1 ring-primary",
                    )}
                  >
                    <Cell mask={"0".repeat(i) + "1" + "0".repeat(19 - i)} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
