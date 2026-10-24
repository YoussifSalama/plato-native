"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, ListTree } from "lucide-react"
import { cn } from "cn"
import { spring } from "@/lib/motion-system"
import { TypedText } from "./typed-text"
import type { Journey } from "./use-journey-log"

// Chronological log of what Plato has said; latest note is typed, older
// ones settle back. Shared by the canvas overlay and the side board.
function NotesList({ journey, className }: { journey: Journey; className?: string }) {
  const { notes, current, reduced } = journey
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" })
  }, [notes.length, reduced])

  return (
    <div ref={listRef} className={cn("flex flex-col gap-3 overflow-y-auto", className)}>
      {notes.map((n, i) => {
        const latest = i === notes.length - 1
        return (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: latest ? 1 : 0.75, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex gap-2.5"
          >
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", latest ? "bg-primary" : "bg-muted-foreground/40")} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{latest ? <TypedText key={n.id} text={n.voice} /> : n.voice}</p>
              <p className="text-xs text-muted-foreground">{n.detail}</p>
            </div>
          </motion.div>
        )
      })}
      {!current && <p className="text-sm text-muted-foreground">Warming up…</p>}
    </div>
  )
}

// Steps rendered inside the chat timeline, as Plato working out loud.
function StepsInline({ journey }: { journey: Journey }) {
  const { notes, totalSteps, finished, reduced } = journey
  if (!notes.length) return null
  return (
    <div className="mr-auto w-full max-w-[92%] rounded-lg rounded-tl-[4px] border border-primary/15 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <ListTree className="size-3.5 text-primary" />
        Search steps
        <span className="flex items-center gap-1 normal-case tracking-normal text-primary">
          <span className={cn("size-1.5 rounded-full bg-primary", !finished && "animate-pulse")} />
          {finished ? "Done" : "Live"}
        </span>
        <span className="ml-auto font-medium normal-case tracking-normal">
          {notes.length} / {totalSteps}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {notes.map((n, i) => {
          const latest = i === notes.length - 1
          return (
            <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: latest ? 1 : 0.8, y: 0 }} transition={{ duration: reduced ? 0 : 0.25 }} className="flex gap-2.5">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", latest ? "bg-primary" : "bg-muted-foreground/40")} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{latest ? <TypedText key={n.id} text={n.voice} /> : n.voice}</p>
                <p className="text-xs text-muted-foreground">{n.detail}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// Collapsible section for the side board (next to the chat).
function NotesBoard({ journey, defaultOpen = true }: { journey: Journey; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const { notes, totalSteps, finished, reduced } = journey
  return (
    <div className="border-b">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
      >
        <ListTree className="size-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Search steps</span>
        <span className="flex items-center gap-1 text-xs text-primary">
          <span className={cn("size-1.5 rounded-full bg-primary", !finished && "animate-pulse")} />
          {finished ? "Done" : "Live"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {notes.length} / {totalSteps}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduced ? { duration: 0 } : spring.micro}>
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <NotesList journey={journey} className="max-h-64 px-4 pb-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { NotesList, NotesBoard, StepsInline }
