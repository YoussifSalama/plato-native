"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react"
import { cn } from "cn"
import { tourFor, type TourStep } from "@/lib/tours"

// "Tour this page": a round button just above the Plato AI dock. It walks the
// seeker through the page they are on, one highlighted element at a time.
// Anything can start it with window.dispatchEvent(new Event("plato:start-tour")).

const SEEN = "plato:tour-seen:"
const seen = (id: string) => {
  try {
    return localStorage.getItem(SEEN + id) === "1"
  } catch {
    return true
  }
}
const markSeen = (id: string) => {
  try {
    localStorage.setItem(SEEN + id, "1")
  } catch {}
}
const noop = () => () => {}
const useMounted = () => useSyncExternalStore(noop, () => true, () => false)

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
}
const find = (sel?: string) => (sel ? ([...document.querySelectorAll(sel)].find(visible) as HTMLElement | undefined) : undefined)

export function PageTour() {
  const pathname = usePathname()
  const mounted = useMounted()
  const tour = tourFor(pathname)
  // Both are keyed by the tour they belong to, so moving to another page simply ends them.
  const [run, setRun] = useState<{ id: string; steps: TourStep[] } | null>(null)
  const [i, setI] = useState(0)
  const [hintFor, setHintFor] = useState<string | null>(null)
  const steps = run?.id === tour.id ? run.steps : null
  const hint = hintFor === tour.id

  const start = useCallback(() => {
    // Only the steps whose element is on screen now (or that need none).
    const live = tour.steps.filter((s) => !s.target || find(s.target))
    if (!live.length) return
    setHintFor(null)
    setI(0)
    setRun({ id: tour.id, steps: live })
  }, [tour])
  const close = useCallback(() => {
    markSeen(tour.id)
    setRun(null)
  }, [tour.id])

  useEffect(() => {
    window.addEventListener("plato:start-tour", start)
    return () => window.removeEventListener("plato:start-tour", start)
  }, [start])
  // On a first visit to a page, offer its tour for a few seconds.
  useEffect(() => {
    if (seen(tour.id)) return
    const id = tour.id
    const show = setTimeout(() => setHintFor(id), 1500)
    const hide = setTimeout(() => setHintFor((h) => (h === id ? null : h)), 11000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [tour.id])

  return (
    <>
      <div data-ai-skip className="pointer-events-none fixed right-6 bottom-[92px] z-40 flex items-center gap-2">
        <AnimatePresence>
          {hint && !steps && (
            <motion.button
              type="button"
              onClick={start}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="glass-panel pointer-events-auto rounded-full px-3.5 py-2 text-xs font-semibold text-foreground"
            >
              New here? Take a quick tour of {tour.name}
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          data-tour="tour-button"
          data-ai="tour.start"
          onClick={() => (steps ? close() : start())}
          aria-label={`Tour this page: ${tour.name}`}
          title="Tour this page"
          className="glass-panel group pointer-events-auto relative flex size-11 items-center justify-center rounded-full text-primary transition-transform hover:scale-105"
        >
          <Compass className="size-5 transition-transform duration-500 group-hover:rotate-45" />
          {hint && !steps && <span className="absolute -top-0.5 -right-0.5 size-3 animate-pulse rounded-full border-2 border-white bg-azure" aria-hidden />}
        </button>
      </div>
      {mounted && steps && createPortal(<TourOverlay steps={steps} index={i} setIndex={setI} onClose={close} />, document.body)}
    </>
  )
}

type Box = { top: number; left: number; width: number; height: number }
const PAD = 8
const GAP = 14

function TourOverlay({ steps, index, setIndex, onClose }: { steps: TourStep[]; index: number; setIndex: (n: number) => void; onClose: () => void }) {
  const reduced = !!useReducedMotion()
  const step = steps[index]
  const last = index === steps.length - 1
  const [measured, setMeasured] = useState<{ index: number; box: Box } | null>(null)
  const box = step.target && measured?.index === index ? measured.box : null
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const card = useRef<HTMLDivElement>(null)

  // Bring the element into view, then follow it on scroll and resize.
  useEffect(() => {
    const el = find(step.target)
    if (!el) return
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        setMeasured({ index, box: { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } })
      })
    }
    measure()
    const settle = setTimeout(measure, 380)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [step, index, reduced])

  // Put the card below, above, or beside the element, whichever fits; centre it when there is none.
  useLayoutEffect(() => {
    const c = card.current
    if (!c) return
    const w = c.offsetWidth
    const h = c.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16)
    const clampY = (y: number) => Math.min(Math.max(16, y), vh - h - 16)
    if (!box) return setPos({ top: (vh - h) / 2, left: (vw - w) / 2 })
    const cx = box.left + box.width / 2 - w / 2
    if (box.top + box.height + GAP + h < vh - 16) return setPos({ top: box.top + box.height + GAP, left: clampX(cx) })
    if (box.top - GAP - h > 16) return setPos({ top: box.top - GAP - h, left: clampX(cx) })
    if (box.left + box.width + GAP + w < vw - 16) return setPos({ top: clampY(box.top), left: box.left + box.width + GAP })
    if (box.left - GAP - w > 16) return setPos({ top: clampY(box.top), left: box.left - GAP - w })
    setPos({ top: vh - h - 24, left: (vw - w) / 2 })
  }, [box, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (last) onClose()
        else setIndex(index + 1)
      }
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, last, onClose, setIndex])
  useEffect(() => card.current?.focus(), [index])

  const ease = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 }
  return (
    <div className="theme-app fixed inset-0 z-[60]" style={{ background: "transparent" }}>
      {/* Dim everything but the element: one box with a huge shadow. */}
      {box ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl ring-2 ring-white/80"
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={ease}
          style={{ boxShadow: "0 0 0 9999px rgb(5 11 22 / 0.52), 0 0 0 6px rgb(0 161 226 / 0.25), 0 0 40px 6px rgb(0 161 226 / 0.35)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgb(5_11_22/0.52)] backdrop-blur-[2px]" />
      )}
      {/* Clicks outside the card are swallowed so the page does not change under the tour. */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />
      <motion.div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        initial={false}
        animate={pos ? { top: pos.top, left: pos.left, opacity: 1 } : { opacity: 0 }}
        transition={ease}
        className="fixed w-[min(340px,calc(100vw-32px))] rounded-2xl border border-white/80 bg-white/90 p-5 text-foreground shadow-[0_30px_80px_-24px_rgb(0_30_70/0.55)] outline-none backdrop-blur-xl"
        style={{ top: 0, left: 0 }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow">
            Step {index + 1} of {steps.length}
          </span>
          <button type="button" onClick={onClose} aria-label="End the tour" className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={index} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <h2 id="tour-title" className="mt-2 text-[15px] font-bold">
              {step.title}
            </h2>
            <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              {step.body}
            </p>
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex flex-1 gap-1" aria-hidden>
            {steps.map((_, n) => (
              <span key={n} className={cn("h-1.5 rounded-full transition-all", n === index ? "w-5 bg-primary" : n < index ? "w-1.5 bg-primary/40" : "w-1.5 bg-foreground/12")} />
            ))}
          </span>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-text-secondary hover:bg-muted">
              <ArrowLeft className="size-4" />
              Back
            </button>
          )}
          <button type="button" onClick={() => (last ? onClose() : setIndex(index + 1))} className="flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary-hover">
            {last ? "Done" : "Next"}
            {!last && <ArrowRight className="size-4" />}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
