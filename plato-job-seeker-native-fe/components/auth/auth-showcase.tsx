"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { BellRing, Check, FileText, Pause, Play, Search, Send, Sparkles } from "lucide-react"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"
import { MatchRing, MonoTile } from "@/components/plato-ui"
import { SourceTile } from "@/components/source-tile"
import { spring } from "@/lib/motion-system"

// The product side of login and signup: one example run on a glass card, replayed as a loop, with
// three cards springing in around it (the Confirmo auth pattern, in Plato's story: your CV, the
// search, the best match, sent, an interview). Decorative: aria-hidden, one sentence for screen
// readers. Reduced motion, or Pause, holds the finished picture.

// When each beat appears (ms from the start of the loop); the loop restarts after HOLD.
const AT = { read: 500, skills: 1800, search: 2900, found: 4300, match: 5200, sent: 6900, interview: 8100 } as const
const HOLD = 11500
type Beat = keyof typeof AT
const LAST = Object.keys(AT).length

function useBeat(paused: boolean) {
  const reduced = !!useReducedMotion()
  const [t, setT] = useState(0) // how many beats are shown
  // The server can't know about reduced motion: render the first frame until mounted, so hydration matches.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- flips once after hydration
  useEffect(() => setMounted(true), [])
  const still = mounted && (reduced || paused)
  // One timeout per beat: wait until the next beat's time, show it; after the last, hold, then start over.
  useEffect(() => {
    if (still) return
    const at = Object.values(AT)
    const wait = t < LAST ? at[t] - (t ? at[t - 1] : 0) : HOLD - at[LAST - 1]
    const id = setTimeout(() => setT(t < LAST ? t + 1 : 0), wait)
    return () => clearTimeout(id)
  }, [t, still])
  const shown = still ? LAST : t
  return (b: Beat) => shown > Object.keys(AT).indexOf(b)
}

const SOURCES = ["LINKEDIN", "INDEED", "GOOGLE_JOBS", "WORKABLE", "LEVER", "GREENHOUSE"] as const
const SKILLS = ["SAP S/4HANA", "Presales", "Solution design", "SQL"]
const pop = { initial: { opacity: 0, y: 10, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, transition: { duration: 0.25 } }, transition: spring.enter }

// Placeholder lines: what a step looks like before its turn, so the card is never empty.
function Pending({ lines = 2 }: { lines?: number }) {
  return (
    <span className="flex flex-col gap-2 pt-1.5">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cn("h-2.5 animate-pulse rounded-full bg-muted", i ? "w-2/5" : "w-4/5")} />
      ))}
    </span>
  )
}

// One step of the run. Always in place (the card keeps its finished size); its content arrives on its beat.
function Row({ on, icon: Icon, children }: { on: boolean; icon: typeof Search; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-500", on ? "bg-primary-soft text-primary" : "bg-muted text-text-tertiary")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {on ? (
            <motion.div key="on" {...pop} className="pt-1 text-[13.5px] text-text-secondary">
              {children}
            </motion.div>
          ) : (
            <motion.div key="off" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
              <Pending />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// A card floating beside the main one: springs in on its beat, then drifts slowly.
function Float({ on, className, icon: Icon, tone = "primary", children }: { on: boolean; className: string; icon: typeof Search; tone?: "primary" | "success" | "warning"; children: ReactNode }) {
  const tint = { primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning" }[tone]
  return (
    <div className={cn("absolute z-20 will-change-transform", className)} style={depth(-22)}>
      <AnimatePresence>
        {on && (
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: [0, -5, 0], scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25 } }} transition={{ ...spring.enter, y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 } }} className="flex items-center gap-2.5 rounded-2xl border border-white/70 bg-card/90 py-2.5 pr-4 pl-2.5 shadow-[0_12px_32px_-12px_rgb(14_27_44/0.25)] backdrop-blur-md transition-shadow duration-300 hover:shadow-[0_18px_40px_-12px_rgb(14_27_44/0.35)]">
            <span className={cn("grid size-8 place-items-center rounded-xl", tint)}>
              <Icon className="size-4" />
            </span>
            <span className="text-[13px] leading-tight font-semibold whitespace-nowrap text-foreground">{children}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Demo({ paused }: { paused: boolean }) {
  const on = useBeat(paused)
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden>
      <div className="relative will-change-transform" style={TILT}>
        {/* A second sheet of glass behind the card: the stack reads as depth when it tilts. */}
        <span aria-hidden className="absolute inset-x-8 -top-4 -z-10 h-full scale-[0.97] rounded-[26px] border border-white/60 bg-card/50 opacity-80 shadow-[0_10px_30px_rgb(14_27_44/0.08)] backdrop-blur-md" />
        <div className="group/card relative flex flex-col gap-4 overflow-hidden rounded-[26px] border border-white/70 bg-card/75 p-5 shadow-[0_30px_70px_-30px_rgb(14_27_44/0.35)] backdrop-blur-xl">
          <span className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--azure)_18%,transparent),transparent)]" />
          {/* The specular light: shows while the pointer is over the side, follows it across the glass. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-500 [[data-hot]_&]:opacity-100">
            <i className="absolute top-[calc(50%-200px)] left-[calc(50%-200px)] size-[400px] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.55),transparent)] will-change-transform" style={depth(170)} />
          </span>
          <header className="flex items-center gap-2.5 border-b border-divider pb-3">
            <PlatoMark size={30} />
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] text-foreground">Plato</b>
              <span className="block text-xs text-text-tertiary">Working on your job hunt</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Live
            </span>
          </header>

          <Row on={on("read")} icon={FileText}>
            Read <b className="text-foreground">Sara_Hassan_CV.pdf</b>: 6 years in presales
            <AnimatePresence>
              {on("skills") && (
                <motion.span initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="mt-2 flex flex-wrap gap-1.5">
                  {SKILLS.map((s) => (
                    <motion.span key={s} variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {s}
                    </motion.span>
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </Row>

          <Row on={on("search")} icon={Search}>
            Searching LinkedIn, Bayt, Wuzzuf and more for <b className="text-foreground">Presales Consultant</b> in Riyadh
            <span className="mt-2 flex items-center gap-1.5">
              {SOURCES.map((s, i) => (
                <motion.span key={s} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.micro, delay: 0.15 + i * 0.12 }}>
                  <SourceTile source={s} size={22} />
                </motion.span>
              ))}
            </span>
          </Row>

          <AnimatePresence mode="wait" initial={false}>
            {!on("match") ? (
              <motion.div key="wait" exit={{ opacity: 0, transition: { duration: 0.15 } }} className="mt-auto flex items-center gap-3 rounded-2xl border border-dashed bg-card/60 p-3">
                <span className="size-9 shrink-0 animate-pulse rounded-xl bg-muted" />
                <span className="min-w-0 flex-1">
                  <Pending />
                </span>
                <span className="text-xs font-medium text-text-tertiary">Your best match</span>
              </motion.div>
            ) : (
              <motion.div key="match" {...pop} className="mt-auto flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
                <MonoTile name="Mozn" size="sm" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] text-foreground">Presales Consultant, Applied AI</b>
                  <span className="block text-xs text-text-secondary">Mozn · Riyadh · Hybrid</span>
                </span>
                <MatchRing value={91} size={40} stroke={4} />
                <motion.span layout transition={spring.micro} className={cn("flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold", on("sent") ? "bg-success-soft text-success" : "bg-primary text-primary-foreground")}>
                  {on("sent") ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
                  {on("sent") ? "Sent" : "Apply"}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Float on={on("found")} className="-top-5 -right-6 xl:-right-12" icon={Sparkles}>
        458 jobs found, 214 fit you
      </Float>
      <Float on={on("sent")} className="top-[62%] -left-8 xl:-left-14" icon={Send} tone="success">
        Applied in your browser
      </Float>
      <Float on={on("interview")} className="-right-4 -bottom-6 xl:-right-10" icon={BellRing} tone="warning">
        Interview invite · Thu 19 Nov
      </Float>
    </div>
  )
}

// Depth (the Confirmo auth pattern): ONE pointer value, eased each frame into --px/--py (-1..1) on the side;
// each layer moves by its own amount (dots 4px, glow 9px, card 8px + 4deg tilt, floats 22px, light 170px).
// Mouse only; still with reduced motion or while paused. Transform only, so it never reflows.
const depth = (px: number): CSSProperties => ({ transform: `translate3d(calc(var(--px, 0) * ${px}px), calc(var(--py, 0) * ${px}px), 0)` })
const TILT: CSSProperties = { transform: "perspective(1400px) translate3d(calc(var(--px, 0) * -8px), calc(var(--py, 0) * -8px), 0) rotateX(calc(3deg + var(--py, 0) * -4deg)) rotateY(calc(-5deg + var(--px, 0) * 4deg))" }

function useDepth(still: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0
    const frame = () => {
      cx += (tx - cx) * 0.09
      cy += (ty - cy) * 0.09
      const done = Math.abs(tx - cx) < 0.002 && Math.abs(ty - cy) < 0.002
      if (done) {
        cx = tx
        cy = ty
      }
      el.style.setProperty("--px", cx.toFixed(4))
      el.style.setProperty("--py", cy.toFixed(4))
      raf = done ? 0 : requestAnimationFrame(frame)
    }
    const kick = () => void (raf ||= requestAnimationFrame(frame))
    const clamp = (v: number) => Math.max(-1, Math.min(1, v * 1.5))
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || still) return
      const r = el.getBoundingClientRect()
      tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1)
      ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1)
      el.dataset.hot = ""
      kick()
    }
    const onLeave = () => {
      tx = ty = 0
      delete el.dataset.hot
      kick()
    }
    if (still) onLeave()
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    return () => {
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", onLeave)
      cancelAnimationFrame(raf)
    }
  }, [still])
  return ref
}

function AuthShowcase() {
  const [paused, setPaused] = useState(false)
  const reduced = !!useReducedMotion()
  const ref = useDepth(paused || reduced)
  return (
    <div ref={ref} className="relative flex min-h-0 flex-1 flex-col">
      {/* Back layers: a dot grid and the brand glow, moving least. */}
      <span aria-hidden className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(255,255,255,.14)_1.2px,transparent_1.6px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_62%_at_50%_55%,#000_15%,transparent_78%)]" style={depth(-4)} />
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-1/3 -z-10 h-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(63,180,238,.28),transparent)] blur-2xl" style={depth(-9)} />

      <Link href="/" className="flex w-fit items-center gap-2.5 rounded-lg transition-opacity duration-200 hover:opacity-80">
        <PlatoMark size={34} />
        <span className="text-lg font-semibold text-white">Plato Job Seeker</span>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 py-6">
        <div className="flex flex-col items-center gap-4 text-center" style={depth(-3)}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <Check className="size-3.5 text-sky-300" />
            Free · No card · Applying costs nothing
          </span>
          <h1 className="max-w-lg text-[30px] leading-[1.08] font-medium tracking-[-0.035em] text-balance text-white xl:text-[38px]">
            Upload your CV. <span className="bg-[linear-gradient(90deg,#7cc8ff,#3fb4ee_45%,#9fe1ff)] bg-clip-text text-transparent">See the jobs that fit you.</span>
          </h1>
          <p className="sr-only">An example: Plato reads a CV, searches the job boards, finds a 91% match, applies, and the seeker gets an interview invite.</p>
          <span className="flex items-center gap-2" aria-hidden>
            {SOURCES.slice(0, 5).map((s) => (
              <span key={s} className="rounded-xl border bg-card p-1.5 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
                <SourceTile source={s} size={24} />
              </span>
            ))}
            <span className="rounded-xl border border-white/15 bg-white/10 px-2.5 py-2 text-xs font-semibold text-white/85 backdrop-blur">and more</span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-10">
          <Demo paused={paused} />
          {/* WCAG 2.2.2: the loop and the depth both stop here. */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play the example" : "Pause the example"} className="grid size-8 place-items-center rounded-full border border-white/15 bg-white/10 text-white/80 backdrop-blur transition-[color,transform] duration-200 hover:scale-105 hover:text-white">
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/65 backdrop-blur">An example run. Names and numbers are illustrative.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export { AuthShowcase }
