import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react"
import { Check, Loader2, X } from "lucide-react"
import type { Job } from "./types"
import { STEPS } from "./store"

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "warn" | "danger" | "soft"; size?: "sm" | "md" | "lg"; icon?: ReactNode; busy?: boolean }
export function Button({ variant = "secondary", size = "md", icon, busy, className, children, ...rest }: BtnProps) {
  const v = {
    primary: "bg-cobalt text-white hover:bg-cobalt-hover shadow-[0_8px_20px_-10px_rgb(0_91_167/0.8)]",
    secondary: "bg-white text-ink border border-line hover:border-brand-line hover:bg-tint",
    ghost: "text-ink-2 hover:bg-white/70 hover:text-ink",
    soft: "bg-soft text-cobalt hover:bg-brand-line/60",
    warn: "bg-warning text-white hover:brightness-95",
    danger: "bg-white text-danger border border-danger/25 hover:bg-danger-soft",
  }[variant]
  const s = { sm: "h-8 px-3 text-[12.5px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2" }[size]
  return (
    <button type="button" className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50", v, s, className)} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconBtn({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white hover:text-ink", className)} {...rest}>
      {children}
    </button>
  )
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="bg-brand flex shrink-0 items-center justify-center rounded-[30%] text-white shadow-[0_8px_18px_-8px_rgb(0_91_167/0.8)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" aria-hidden>
        <path d="M7 20V4h6.2a5 5 0 0 1 0 10H7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function CompanyTile({ job, size = 40 }: { job: Pick<Job, "company" | "tint">; size?: number }) {
  // Light brand colors get dark letters so the tile stays readable.
  const c = job.tint.replace("#", "")
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16)
  const light = (r * 299 + g * 587 + b * 114) / 1000 > 165
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl font-bold" style={{ width: size, height: size, background: job.tint, color: light ? "#0E1B2C" : "#fff", fontSize: size * 0.42 }} aria-hidden>
      {job.company[0]}
    </span>
  )
}

export function matchTone(m: number) {
  return m >= 90 ? { label: "Excellent", cls: "bg-success-soft text-success" } : m >= 80 ? { label: "Strong", cls: "bg-info-soft text-info" } : { label: "Fair", cls: "bg-paper text-ink-2" }
}
export function MatchPill({ m, big }: { m: number; big?: boolean }) {
  const t = matchTone(m)
  return <span className={cx("tabular inline-flex items-center rounded-full font-bold", t.cls, big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11.5px]")}>{m}%</span>
}

export function Chip({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "brand" | "good" | "warn" | "bad" | "violet"; className?: string }) {
  const t = { plain: "bg-paper text-ink-2", brand: "bg-soft text-cobalt", good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-danger", violet: "bg-violet-soft text-violet" }[tone]
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", t, className)}>{children}</span>
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-[20px] border border-line/70 bg-card shadow-card", className)} {...rest}>
      {children}
    </div>
  )
}

export function Steps({ step, compact, failedAt }: { step: number; compact?: boolean; failedAt?: number }) {
  return (
    <ol className={cx("flex items-center", compact ? "gap-1" : "gap-1.5")} aria-label={`Step ${Math.min(step + 1, 5)} of 5: ${STEPS[Math.min(step, 4)]}`}>
      {STEPS.map((label, i) => {
        const done = i < step
        const now = i === step && step < 5
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5" title={label}>
            <span className={cx("h-1.5 flex-1 rounded-full transition-colors duration-500", done ? "bg-cobalt" : now ? (failedAt === i ? "bg-warning" : "shimmer bg-soft") : "bg-divider")} />
          </li>
        )
      })}
    </ol>
  )
}

export function Modal({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", k)
    ref.current?.focus()
    return () => removeEventListener("keydown", k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cx("anim-pop shadow-pop flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-card outline-none sm:rounded-[24px]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-start gap-3 border-b border-divider px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
          </div>
          <IconBtn label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconBtn>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider bg-tint/60 px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={label} className="anim-slide shadow-pop flex h-full w-full max-w-[560px] flex-col bg-card" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {children}
      </aside>
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-cobalt" : "bg-mist/60")}>
      <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-white/70 p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" type="button" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cx("flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-all", size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]", value === o.value ? "bg-cobalt text-white shadow" : "text-ink-2 hover:text-ink")}>
          {o.label}
          {o.count !== undefined && <span className={cx("tabular rounded-full px-1.5 text-[10.5px]", value === o.value ? "bg-white/20" : "bg-paper")}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  )
}
export const inputCls = "h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-mist focus:border-cobalt/50 focus:ring-4 focus:ring-cobalt/10"

export function TagEditor({ values, onChange, placeholder, suggestions = [], id }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[]; id?: string }) {
  const add = (v: string) => {
    const t = v.trim()
    if (t && !values.includes(t)) onChange([...values, t])
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white px-2 py-1.5 focus-within:border-cobalt/50 focus-within:ring-4 focus-within:ring-cobalt/10">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-soft py-1 pr-1 pl-2.5 text-[12.5px] font-semibold text-cobalt">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="flex size-4 items-center justify-center rounded-full hover:bg-cobalt/10">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          placeholder={values.length ? "Add more" : placeholder}
          className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-mist"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add((e.target as HTMLInputElement).value)
              ;(e.target as HTMLInputElement).value = ""
            }
          }}
          onBlur={(e) => {
            add(e.target.value)
            e.target.value = ""
          }}
        />
      </div>
      {suggestions.filter((s) => !values.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-brand-line px-2.5 py-1 text-xs font-semibold text-blue hover:bg-tint">
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export function CheckRow({ state, children }: { state: "ok" | "warn" | "no"; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-snug">
      <span className={cx("mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold", state === "ok" ? "bg-success-soft text-success" : state === "warn" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>{state === "ok" ? <Check className="size-3" strokeWidth={3} /> : state === "warn" ? "!" : "×"}</span>
      <span className="text-ink-2">{children}</span>
    </li>
  )
}

export function money(n: number) {
  return `$${n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k" : n}`
}

// "Remote · Remote, worldwide" reads twice; say the place once.
export function placeOf(j: { setup: string; location: string }) {
  const city = j.location.split(",")[0]
  return /remote/i.test(j.location) ? j.location : j.setup === "On-site" ? city : `${j.setup} · ${city}`
}
