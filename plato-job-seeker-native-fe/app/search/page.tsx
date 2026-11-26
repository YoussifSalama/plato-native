"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { BarChart3, BellRing, Briefcase, Building2, Check, CircleAlert, Clock, FileText, Loader2, Lock, MapPin, Plus, RefreshCw, Search, SearchX, Send, ShieldCheck, Upload, WifiOff, X, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PlatoMark } from "@/components/plato-orb"
import { CompanyAvatar } from "@/components/company-avatar"
import { SourceTile } from "@/components/source-tile"
import { OptionCombobox } from "@/app/onboarding/components/option-combobox"
import { timeAgo } from "@/lib/jobs/links"
import { useLeaveGuard } from "@/lib/use-leave-guard"
import { getGuest, getGuestSearch, OFFLINE, retryable, pickGuestJobs, startGuestSearch, uploadGuestCv, type GuestJob, type GuestPreviewJob, type GuestSearch, type GuestSearchInput, type GuestView } from "@/lib/jobs/guest"

// The public first search (owner request 2026-11-26): CV first, then one "is this right?" screen, then the search
// (about a minute, server-side), then the two best jobs open and a free-signup gate for the rest. The visitor is
// known by a device cookie, so a refresh or a return resumes where they were, and signup moves everything over.
// Screens follow the research spec (reports/Guest CV search first run UX.md): honest counts, locked tiles drawn
// from nothing (the server sends only their number), no gate when there is nothing to lock.

const REGION = new Intl.DisplayNames(["en"], { type: "region" })
const countryName = (c: string) => (c === "AE" ? "UAE" : (REGION.of(c) ?? c))
// Ordered for who uses Plato: the Gulf and Egypt first, then the UK, US, Canada and Germany, then A-Z.
const FIRST = ["SA", "AE", "EG", "QA", "KW", "GB", "US", "CA", "DE"]
// Every real country (the API takes any ISO code): AA..ZZ the browser can name, minus user-assigned/grouping codes.
const NAMED = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" })
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
// Not countries: groupings, uninhabited territories, and old or duplicate codes (BU, TP, SU, YU...).
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "AC", "CP", "DG", "EA", "IC", "TA", "CQ", "AQ", "BV", "HM", "UM", "BU", "TP", "AN", "CS", "DD", "FX", "NT", "SU", "YD", "YU", "ZR"])
const REST = [...LETTERS]
  .flatMap((a) => [...LETTERS].map((b) => a + b))
  .filter((c) => !c.startsWith("X") && !c.startsWith("Q") && c !== "ZZ" && c !== "AA" && !NOT_COUNTRIES.has(c) && !FIRST.includes(c) && NAMED.of(c))
  .sort((a, b) => countryName(a).localeCompare(countryName(b)))
const COUNTRY_OPTIONS = [...FIRST, ...REST].map((c) => ({ value: c, label: countryName(c) }))
const WORK = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const
const LEVELS = [
  { value: null, label: "Any" },
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
] as const
const ALL_WORK = WORK.map((w) => w.value)
const MAX_MB = 10
const ACCEPT = ".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const ACCOUNT_NEEDED = /create a free account/i
const jobsWord = (n: number) => `${n.toLocaleString("en-US")} job${n === 1 ? "" : "s"}`
const INDETERMINATE = "h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,var(--primary),var(--azure))] motion-reduce:w-full motion-reduce:animate-none"

// ---------- Shell ----------

type Step = 0 | 1 | 2
const STEPS = ["Upload", "Check", "Jobs"]

function Shell({ step, children, overHero }: { step: Step | null; children: ReactNode; overHero?: boolean }) {
  return (
    <div className="theme-app relative flex min-h-dvh flex-col bg-background text-foreground">
      <style>{"@keyframes indeterminate { from { transform: translateX(-100%) } to { transform: translateX(300%) } } @keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }"}</style>
      {/* On the upload screen the header sits on the night-blue hero (as on the landing); elsewhere it is light. */}
      <header className={cn(overHero ? "absolute inset-x-0 top-0 z-20 text-white" : "border-b border-border/70 bg-background/85 backdrop-blur")}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg">
            <PlatoMark size={30} />
            <span className="text-[15px] font-semibold whitespace-nowrap sm:text-base">Plato Job Seeker</span>
          </Link>
          {step !== null && (
            <ol aria-label="Progress" className="hidden items-center gap-2 text-xs font-medium md:flex">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-1.5", overHero ? (i === step ? "text-white" : "text-white/55") : i === step ? "text-primary" : i < step ? "text-foreground" : "text-text-tertiary")}>
                  <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", overHero ? (i === step ? "bg-white text-[#05203d]" : "bg-white/12 ring-1 ring-white/20") : i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary-soft text-primary ring-1 ring-primary" : "bg-muted")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
                  {s}
                  {i < STEPS.length - 1 && <span aria-hidden className={cn("mx-1 h-px w-6", overHero ? "bg-white/20" : "bg-border")} />}
                </li>
              ))}
            </ol>
          )}
          <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), overHero && "text-white/80 hover:bg-white/10 hover:text-white")}>
              Log in
            </Link>
            <Link href="/signup" className={overHero ? "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#0b1a2e] transition-transform hover:-translate-y-px" : buttonVariants({ variant: "outline", size: "sm", className: "rounded-full" })}>
              Sign up<span className="hidden sm:inline"> free</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-xs text-text-tertiary sm:px-6">
        <span>Plato Job Seeker searches, ranks and applies to jobs for you.</span>
        <span className="flex gap-4">
          <a href="https://platohiring.com/privacy/" className="hover:text-foreground">
            Privacy
          </a>
          <a href="https://platohiring.com/terms/" className="hover:text-foreground">
            Terms
          </a>
        </span>
      </footer>
    </div>
  )
}

// Each screen's title takes focus when the screen changes (not on first load), so keyboard and screen-reader users
// land on the new step.
function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 data-step-title tabIndex={-1} className={cn("outline-none", className)}>
      {children}
    </h1>
  )
}

// A message with what to do next; the "create a free account" limits get the button for it.
// The first sentence is the title (what happened), the rest the detail (what to do); the retry sits inside the banner.
function Problem({ message, className, onRetry }: { message: string; className?: string; onRetry?: () => void }) {
  if (ACCOUNT_NEEDED.test(message)) return <LimitNotice message={message} className={className} />
  const cut = message.search(/[.!?](\s|$)/)
  const title = cut > 0 ? message.slice(0, cut + 1) : message
  const detail = cut > 0 ? message.slice(cut + 1).trim() : ""
  const Icon = message === OFFLINE ? WifiOff : CircleAlert
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-2xl border border-destructive/20 bg-danger-soft/70 p-4 text-left", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-destructive shadow-card">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail && <p className="mt-0.5 text-sm text-text-secondary">{detail}</p>}
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 gap-1.5 rounded-full bg-card">
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

// A guest limit (CV uploads, searches) is not an error: it is where the free account starts. Calm, in brand.
function LimitNotice({ message, className }: { message: string; className?: string }) {
  const title = /cv/i.test(message) ? "You've used your free CV upload" : "You've used your free searches"
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 rounded-2xl border border-primary-line bg-primary-tint/60 px-5 py-7 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-card text-primary shadow-card">
        <Lock className="size-5" />
      </span>
      <b className="text-[17px] tracking-tight text-foreground">{title}</b>
      <p className="max-w-sm text-sm text-text-secondary">
        {message} Free. No card. Your CV and search come with you.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Link href="/signup" className={buttonVariants({ className: "h-11 rounded-xl px-6" })}>
          Create free account
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "ghost", className: "h-11" })}>
          Log in
        </Link>
      </div>
    </div>
  )
}

// ---------- The hero: the landing's night blue, on every step (the identity) ----------

const BEAM = "pointer-events-none absolute rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(169,220,247,.45)_35%,rgba(0,161,226,.3)_70%,transparent)]"
const GLASS = "flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 py-2 pr-3.5 pl-2 text-left text-xs font-semibold text-white shadow-[0_12px_30px_-12px_rgba(0,0,0,.5)] backdrop-blur-md"

// What Plato does, floating on the hero's sides (wide screens only; still with reduced motion).
function HeroFloats() {
  const items: { at: string; delay: string; icon: ReactNode; text: string }[] = [
    {
      at: "left-[6%] top-[34%]",
      delay: "0s",
      icon: (
        <span className="rounded-lg bg-white p-1">
          <SourceTile source="LINKEDIN" size={20} />
        </span>
      ),
      text: "LinkedIn · last 30 days",
    },
    { at: "left-[11%] top-[64%]", delay: "1.2s", icon: <span className="grid size-7 place-items-center rounded-lg bg-sky-400/25 text-sky-200"><Check className="size-3.5" /></span>, text: "Ranked against your CV" },
    { at: "right-[7%] top-[30%]", delay: "0.6s", icon: <span className="grid size-7 place-items-center rounded-lg bg-emerald-400/25 text-emerald-200"><Send className="size-3.5" /></span>, text: "Applied in your browser" },
    { at: "right-[10%] top-[60%]", delay: "1.8s", icon: <span className="grid size-7 place-items-center rounded-lg bg-amber-400/25 text-amber-200"><BellRing className="size-3.5" /></span>, text: "Interview invite" },
  ]
  return (
    <span aria-hidden className="hidden xl:block">
      {items.map((it) => (
        <span key={it.text} className={cn("absolute", it.at)}>
          <span className={cn(GLASS, "motion-safe:animate-[float_6s_ease-in-out_infinite]")} style={{ animationDelay: it.delay }}>
            {it.icon}
            {it.text}
          </span>
        </span>
      ))}
    </span>
  )
}

function Hero({ title, sub, children, tall }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; tall?: boolean }) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-b-[36px] bg-[radial-gradient(60%_70%_at_50%_38%,#0b4f96_0%,#08264c_50%,#050b16_100%)] px-4 text-center text-white", tall ? "pt-28 pb-48 sm:pt-32" : "pt-24 pb-32 sm:pt-28 sm:pb-36")}>
      <span aria-hidden className={cn(BEAM, "top-[-160px] left-[62%] h-[760px] w-9 rotate-[34deg] opacity-50 shadow-[0_0_60px_rgba(63,180,238,.5)]")} />
      <span aria-hidden className={cn(BEAM, "top-[220px] left-[8%] h-[560px] w-7 -rotate-[56deg] opacity-30")} />
      <HeroFloats />
      <Title className={cn("relative mx-auto max-w-3xl leading-[1.08] font-medium tracking-[-0.035em] text-balance", tall ? "text-[34px] sm:text-5xl" : "text-[28px] sm:text-[42px]")}>{title}</Title>
      {sub && <p className="relative mx-auto mt-3 max-w-xl text-[15px] text-white/75 sm:text-base">{sub}</p>}
      {children && <div className="relative">{children}</div>}
    </section>
  )
}

// ---------- 1. Upload ----------

// What is wrong with a file before it is sent, in the "The selected file must..." style.
function checkFile(f: File): string | null {
  const name = f.name.toLowerCase()
  if (name.endsWith(".doc")) return "The selected file must be a PDF or Word (.docx) file. If it's an older .doc, save it as .docx or PDF."
  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) return "The selected file must be a PDF or Word (.docx) file."
  if (f.size > MAX_MB * 1024 * 1024) return `The selected file must be smaller than ${MAX_MB} MB.`
  if (f.size === 0) return "We couldn't open this file. Try exporting it again as PDF."
  return null
}
const sizeLabel = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

function UploadScreen({ onUploaded, onBack, announce }: { onUploaded: (g: GuestView) => void; onBack?: () => void; announce: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sent, setSent] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  // Refresh, close or a link while the file is on its way: ask first (the upload would stop).
  useLeaveGuard(busy, "Your CV is still uploading. If you leave now, the upload stops. Leave anyway?")

  async function send(f: File | undefined) {
    if (!f || busy) return
    const bad = checkFile(f)
    setFile(f)
    setError(bad)
    if (bad) return
    setBusy(true)
    setSent(0)
    announce("File accepted. Uploading your CV.")
    try {
      const g = await uploadGuestCv(f, (p) => {
        setSent(p)
        if (p >= 1) announce("Reading your CV.")
      })
      announce("Your CV is read. Check what Plato found.")
      onUploaded(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : OFFLINE)
      setBusy(false)
    }
  }

  return (
    <div>
      {/* The landing's night-blue hero, continued: the visitor arrives from its main button. */}
      <Hero tall title="See jobs that fit your CV, before you sign up" sub="Upload your CV. Plato reads it, searches LinkedIn jobs from the last 30 days and shows you the best matches in about a minute.">
        <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
          <Check className="size-3.5 text-sky-300" />
          Free · No account needed for your first search
        </p>
      </Hero>

      <div className="relative z-10 mx-auto -mt-36 max-w-2xl px-4 pb-10">
        <div
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), void send(e.dataTransfer.files?.[0]))}
          className={cn("rounded-3xl border bg-card p-5 shadow-[0_30px_70px_-30px_rgb(14_27_44/0.35)] transition-[border-color,box-shadow] sm:p-7", over && "border-primary shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_15%,transparent)]")}
        >
          {error && ACCOUNT_NEEDED.test(error) ? (
            <LimitNotice message={error} />
          ) : file && busy ? (
            <div className="flex items-center gap-3 rounded-2xl border bg-primary-tint/50 p-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-card">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{file.name}</b>
                <span className="block text-xs text-text-secondary">
                  {sizeLabel(file.size)} · {sent < 1 ? `Uploading… ${Math.round(sent * 100)}%` : "Reading your CV…"}
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">{sent < 1 ? <span className="block h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(4, sent * 100)}%` }} /> : <span className={cn("block", INDETERMINATE)} />}</span>
              </span>
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            </div>
          ) : (
            // The whole area opens the picker on click (the button stays the keyboard way in).
            <div onClick={(e) => e.target === e.currentTarget && input.current?.click()} className={cn("group/drop flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-[background-color,border-color] duration-200", over ? "border-primary bg-primary-tint" : "border-border hover:border-primary-line hover:bg-primary-tint/40")}>
              <span className="pointer-events-none relative grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary transition-transform duration-300 group-hover/drop:-translate-y-0.5">
                <span aria-hidden className="absolute inset-0 rounded-2xl ring-4 ring-primary/10 motion-safe:animate-ping [animation-duration:2.4s]" />
                <FileText className="size-6" />
              </span>
              <span className="pointer-events-none">
                <b className="block text-[16px] text-foreground">{over ? "Drop it to upload" : "Add your CV to start"}</b>
                <span className="mt-1 hidden text-sm text-text-tertiary [@media(hover:hover)]:block">Drag it here, or choose the file</span>
              </span>
              <Button onClick={() => input.current?.click()} className="h-12 w-full gap-2 rounded-xl text-[15px] sm:w-auto sm:px-8">
                <Upload className="size-4" />
                Upload your CV
              </Button>
              <span className="pointer-events-none flex items-center gap-1.5 text-[11px] font-semibold text-text-tertiary">
                <span className="rounded-md bg-muted px-1.5 py-0.5">PDF</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5">DOCX</span>
                <span>up to {MAX_MB} MB</span>
              </span>
            </div>
          )}
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (void send(e.target.files?.[0]), (e.target.value = ""))} />

          {error && !ACCOUNT_NEEDED.test(error) && (
            <Problem message={error} className="mt-4" onRetry={file && !busy && retryable(error) ? () => void send(file) : undefined} />
          )}

          <p className="mt-4 text-center text-xs text-text-tertiary">Scanned images can&apos;t be read: use the Word file or a PDF exported from it.</p>
          <ul className="mt-5 grid grid-cols-1 gap-2.5 border-t border-divider pt-5 sm:grid-cols-3">
            {(
              [
                [ShieldCheck, "Only used to find your jobs"],
                [Lock, "Never sent to employers"],
                [Clock, "Results in about a minute"],
              ] as const
            ).map(([Icon, t]) => (
              <li key={t} className="flex items-center gap-2 text-xs font-medium text-text-secondary sm:flex-col sm:text-center">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Icon className="size-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <ol aria-label="How it works" className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              [Upload, "Upload your CV", "PDF or Word. Plato reads your roles, skills and experience."],
              [Check, "Check what Plato read", "Your roles, where and level, filled in for you."],
              [Briefcase, "See your best matches", "Two are free. Sign up free to see every job and apply."],
            ] as const
          ).map(([Icon, t, d], i) => (
            <li key={t} className="rounded-2xl border bg-card p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card">
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <Icon className="size-4 text-primary" />
              </span>
              <b className="mt-3 block text-sm">{t}</b>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{d}</span>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-center text-sm text-text-secondary">
          {onBack ? (
            <button type="button" onClick={onBack} className="font-semibold text-primary hover:underline">
              Back to your search
            </button>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Log in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

// ---------- 2. Check what Plato read ----------

// Unsaved edits on the Check step, per tab (sessionStorage): survive a refresh, never outlive the tab.
type Edits = { cv: string; roles: string[]; countries: string[]; work: string[]; level: GuestSearchInput["level"] }
const EDITS_KEY = "plato:guest-search-edits"
function readEdits(cv: string | undefined): Omit<Edits, "cv"> | null {
  try {
    const e = JSON.parse(sessionStorage.getItem(EDITS_KEY) ?? "null") as Edits | null
    return e && e.cv === cv ? e : null
  } catch {
    return null
  }
}
function writeEdits(cv: string | undefined, e: Omit<Edits, "cv"> | null) {
  try {
    if (!e || !cv) sessionStorage.removeItem(EDITS_KEY)
    else sessionStorage.setItem(EDITS_KEY, JSON.stringify({ cv, ...e }))
  } catch {}
}

function Chip({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label?: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-1 rounded-full border border-primary-line bg-primary-tint pr-1 pl-3.5 text-sm font-medium text-foreground">
      {children}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={label} className="grid size-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-card hover:text-foreground">
          <X className="size-3.5" />
        </button>
      ) : (
        <span className="w-2.5" />
      )}
    </span>
  )
}

function Field({ title, hint, icon: Icon, children }: { title: string; hint?: ReactNode; icon: LucideIcon; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-divider pt-6 first:border-t-0 first:pt-0">
      <legend className="float-left flex w-full items-center gap-2.5 text-[15px] font-semibold">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-4" />
        </span>
        {title}
      </legend>
      <div className="clear-both pt-3">
        {hint && <p className="mb-2.5 text-xs text-text-tertiary">{hint}</p>}
        {children}
      </div>
    </fieldset>
  )
}

function ConfirmScreen({ guest, onStarted, onNewCv, announce }: { guest: GuestView; onStarted: (s: GuestSearch, input: GuestSearchInput) => void; onNewCv: () => void; announce: (m: string) => void }) {
  const draft = guest.draft
  const fromCv = new Set(draft?.roles ?? [])
  // Edits not searched yet survive a refresh in this tab (for this CV only).
  const [saved] = useState(() => readEdits(guest.cv?.name))
  const [roles, setRoles] = useState<string[]>(saved?.roles ?? draft?.roles ?? [])
  const [countries, setCountries] = useState<string[]>(saved?.countries ?? draft?.countries ?? [])
  const [work, setWork] = useState<string[]>(saved?.work ?? (draft?.remoteTypes.length ? draft.remoteTypes : [...ALL_WORK]))
  const [level, setLevel] = useState<GuestSearchInput["level"]>(saved ? saved.level : (draft?.level ?? null))
  useEffect(() => writeEdits(guest.cv?.name, { roles, countries, work, level }), [guest.cv?.name, roles, countries, work, level])
  const [text, setText] = useState("")
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = text.trim()
  const allRoles = typed.length >= 2 && !roles.includes(typed) && roles.length < 2 ? [...roles, typed] : roles
  const p = guest.profile
  const latest = p?.title ? [p.title, p.company].filter(Boolean).join(" at ") : null
  useLeaveGuard(busy, "Your search is starting. Leave anyway?")

  function addRole() {
    if (typed.length < 2 || roles.length >= 2 || roles.includes(typed)) return
    setRoles([...roles, typed])
    setText("")
  }
  async function submit() {
    if (!allRoles.length) return
    const input: GuestSearchInput = { roles: allRoles, countries, remoteTypes: work.length === ALL_WORK.length ? [] : (work as GuestSearchInput["remoteTypes"]), level }
    setBusy(true)
    setError(null)
    try {
      const s = await startGuestSearch(input)
      writeEdits(guest.cv?.name, null)
      announce("Searching LinkedIn for your jobs.")
      onStarted(s, input)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The search could not start. Try again.")
      setBusy(false)
    }
  }

  const levelLabel = LEVELS.find((l) => l.value === level)?.label
  const summary = [allRoles.join(" + ") || null, countries.length ? countries.map(countryName).join(", ") : "Anywhere", work.length === ALL_WORK.length ? "Any work setup" : WORK.filter((w) => work.includes(w.value)).map((w) => w.label).join(", "), level ? `${levelLabel} level` : "Any level"].filter(Boolean)

  return (
    <div className="pb-40 lg:pb-14">
      <Hero title="Here's what Plato read. Is this right?" sub="Plato filled this in from your CV. Change anything that's off, then search." />
      <div className="relative z-10 mx-auto -mt-20 grid max-w-5xl grid-cols-1 items-start gap-5 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* The search: four short questions, each already answered. */}
        <section aria-label="Your search" className="flex flex-col gap-6 rounded-3xl border bg-card p-5 shadow-card sm:p-7">
          <Field title="The job you want" hint="Up to 2 roles per search." icon={Briefcase}>
            <div className="flex flex-wrap items-center gap-2">
              {roles.map((r) => (
                <Chip key={r} onRemove={() => setRoles(roles.filter((x) => x !== r))} label={`Remove role ${r}`}>
                  {r}
                  {fromCv.has(r) && <span className="ml-1.5 text-[11px] font-normal text-text-tertiary">From your CV</span>}
                </Chip>
              ))}
              {roles.length < 2 && (
                <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full border bg-card px-3.5 transition-colors focus-within:border-primary hover:border-primary-line">
                  <Plus className="size-4 text-text-tertiary" />
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => (setTyping(false), addRole())}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRole())}
                    maxLength={80}
                    placeholder={roles.length ? "Add another role" : "e.g. Accountant"}
                    aria-label="Add a role"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary"
                  />
                </label>
              )}
            </div>
            {!roles.length && !typed && <p className="mt-2 text-xs text-text-secondary">We couldn&apos;t spot a job title in your CV. Add the role you want.</p>}
          </Field>

          <Field title="Where" hint="Up to 2 countries. Leave it empty to search anywhere." icon={MapPin}>
            {/* The same searchable picker as onboarding: type to filter, popular countries first, Enter to add. */}
            <OptionCombobox id="countries" options={COUNTRY_OPTIONS} value={countries} onChange={setCountries} max={2} placeholder={countries.length ? "Add another country" : "Anywhere · type a country"} />
          </Field>

          <Field title="Work setup" hint="Pick all you'd take." icon={Building2}>
            <div className="grid grid-cols-3 gap-2">
              {WORK.map((w) => {
                const on = work.includes(w.value)
                return (
                  <button
                    key={w.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWork(on ? work.filter((x) => x !== w.value) : [...work, w.value])}
                    disabled={on && work.length === 1}
                    className={cn("inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors disabled:cursor-not-allowed", on ? "border-primary bg-primary-tint text-primary" : "bg-card text-text-secondary hover:border-primary-line hover:text-foreground")}
                  >
                    {on && <Check className="size-3.5" />}
                    {w.label}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field title="Level" icon={BarChart3}>
            <div role="radiogroup" aria-label="Level" className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
              {LEVELS.map((l) => (
                <button key={l.label} type="button" role="radio" aria-checked={level === l.value} onClick={() => setLevel(l.value)} className={cn("h-9 rounded-lg text-sm font-medium transition-colors", level === l.value ? "bg-card text-primary shadow-sm ring-1 ring-border" : "text-text-secondary hover:text-foreground")}>
                  {l.label}
                </button>
              ))}
            </div>
          </Field>
        </section>

        {/* What Plato read, the search in one line, and the one action. Sticky beside the form on desktop. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section aria-label="Your CV" className="rounded-3xl border bg-card p-5 shadow-card">
            <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">From your CV</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{guest.cv?.name ?? "Your CV"}</b>
                {latest && <span className="block truncate text-xs text-text-secondary">{latest}</span>}
                {p?.location && <span className="block truncate text-xs text-text-tertiary">{p.location}</span>}
              </span>
            </div>
            {p && p.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.skills.map((sk) => (
                  <span key={sk} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                    {sk}
                  </span>
                ))}
              </div>
            )}
            <button type="button" onClick={onNewCv} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <RefreshCw className="size-3.5" />
              Use a different CV
            </button>
          </section>

          <section aria-label="Search summary" className="rounded-3xl border border-primary-line bg-card p-5 shadow-card">
            <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">Plato will search</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {summary.map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">{x}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-text-tertiary">LinkedIn jobs posted in the last 30 days, ranked against your CV.</p>
            {error && <Problem message={error} className="mt-4" />}
            {/* The one action: here on desktop, a sticky bar on phones (hidden while typing). */}
            <div className={cn("fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none", typing && "max-lg:hidden")}>
              <Button onClick={() => void submit()} disabled={busy || !allRoles.length} className="h-12 w-full gap-2 rounded-xl text-[15px]">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Find my jobs
              </Button>
              {!allRoles.length && <p className="mt-1.5 text-center text-xs text-text-secondary">Add the role you want to search.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

// ---------- 3. Searching ----------

type StepState = "done" | "active" | "pending"

function StepRow({ state, children, detail }: { state: StepState; children: ReactNode; detail?: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-3 text-sm transition-colors duration-500", state === "pending" ? "text-text-tertiary" : "text-foreground")}>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-500", state === "done" ? "bg-primary text-primary-foreground" : state === "active" ? "bg-primary-soft text-primary" : "bg-muted")}>
        {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {detail && <span className="shrink-0 text-xs font-medium text-text-secondary tabular-nums">{detail}</span>}
    </li>
  )
}

// Every row is a real server event (GuestSearch.progress): the plan, each LinkedIn run as it finishes with its
// count, the filter (kept of found), the ranking. Nothing ticks on a timer.
function SearchingScreen({ search }: { search: GuestSearch }) {
  const [secs, setSecs] = useState(0)
  // The search runs on the server, so leaving loses nothing, but ask first: most people want to see the result.
  useLeaveGuard(true, "Your search is still running. It keeps going if you leave, and you can come back to it on this device. Leave anyway?")
  useEffect(() => {
    const t = setInterval(() => setSecs((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const pg = search.progress
  const runs = pg?.runs ?? []
  const planned = runs.length > 0
  const doneRuns = runs.filter((r) => r.count !== null).length
  const found = runs.reduce((n, r) => n + (r.count ?? 0), 0)
  const phase = !planned ? "planning" : (pg?.phase ?? "searching")
  const pct = phase === "planning" ? 6 : phase === "searching" ? 10 + (60 * doneRuns) / runs.length : phase === "filtering" ? 78 : 90
  const after = (p: string): StepState => (["filtering", "ranking"].indexOf(phase) > ["filtering", "ranking"].indexOf(p) ? "done" : phase === p ? "active" : "pending")

  return (
    <div className="pb-12">
      <Hero title="Finding jobs that fit your CV" sub={secs < 90 ? "Usually about a minute. Keep this page open to see your jobs the moment they're ready." : "Taking a bit longer than usual. Still searching."}>
        <Radar />
      </Hero>
      <div className="relative z-10 mx-auto -mt-20 max-w-2xl px-4">
      <section className="rounded-3xl border bg-card p-5 shadow-card sm:p-7">
        <div className="flex items-end justify-between gap-3">
          <p aria-live="polite" className="text-sm text-text-secondary">
            {found > 0 ? (
              <>
                <b className="text-2xl font-semibold text-foreground tabular-nums">{found.toLocaleString("en-US")}</b> jobs found so far
              </>
            ) : (
              "Starting the search…"
            )}
          </p>
          <span className="text-xs text-text-tertiary tabular-nums" aria-hidden>
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Search progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--azure))] transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>

        <ul className="mt-6 flex flex-col gap-3.5">
          <StepRow state={planned ? "done" : "active"}>Planning the job titles your CV fits</StepRow>
          {runs.map((r, i) => (
            <StepRow key={i} state={r.count !== null ? "done" : "active"} detail={r.count !== null ? jobsWord(r.count) : undefined}>
              Searching LinkedIn: <b className="font-medium">{r.title}</b> {r.place ? `in ${r.place}` : "anywhere"}
            </StepRow>
          ))}
          <StepRow state={after("filtering")} detail={pg?.kept !== undefined && pg.found !== undefined ? `kept ${pg.kept} of ${pg.found}` : undefined}>
            Leaving out old and off-target jobs
          </StepRow>
          <StepRow state={after("ranking")}>Ranking the best fits for your CV</StepRow>
        </ul>
      </section>

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Create your free account while you wait.
        </Link>{" "}
        Your results will be there.
      </p>
      </div>
    </div>
  )
}

// Plato in the middle, rings going out, LinkedIn circling: the search is alive.
function Radar() {
  return (
    <div aria-hidden className="relative mx-auto mt-8 grid size-36 place-items-center">
      {[0, 1, 2].map((r) => (
        <span key={r} className="absolute inset-0 rounded-full border border-sky-300/40 motion-safe:animate-[ping_3s_ease-out_infinite]" style={{ animationDelay: `${r}s` }} />
      ))}
      <span className="absolute inset-0 motion-safe:animate-[spin_8s_linear_infinite]">
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-xl bg-white p-1.5 shadow-[0_0_30px_rgba(63,180,238,.6)]">
          <SourceTile source="LINKEDIN" size={22} />
        </span>
      </span>
      <span className="grid size-16 place-items-center rounded-2xl bg-white/10 shadow-[0_0_50px_rgba(63,180,238,.5)] backdrop-blur">
        <PlatoMark size={40} />
      </span>
    </div>
  )
}

// ---------- 4. Results ----------

const WORK_LABEL: Record<GuestJob["remote_type"], string | null> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: null }
// "Cairo, Cairo, Egypt" -> "Cairo, Egypt"
const place = (loc: string | null) => (loc ? [...new Set(loc.split(",").map((x) => x.trim()).filter(Boolean))].join(", ") : null)

function salary(j: GuestJob) {
  if (!j.salary_min && !j.salary_max) return null
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
  const range = j.salary_min && j.salary_max ? `${f(j.salary_min)}–${f(j.salary_max)}` : f((j.salary_min ?? j.salary_max)!)
  return `${j.salary_currency ?? ""} ${range}`.trim()
}

function Facts({ job }: { job: Pick<GuestJob, "location" | "remote_type" | "posted_at"> & Partial<Pick<GuestJob, "job_type">> }) {
  return (
    <span className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-secondary">
      {place(job.location) && (
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" />
          {place(job.location)}
        </span>
      )}
      {WORK_LABEL[job.remote_type] && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{WORK_LABEL[job.remote_type]}</span>}
      {job.job_type && (
        <span className="flex items-center gap-1">
          <Briefcase className="size-3.5" />
          {job.job_type}
        </span>
      )}
      {job.posted_at && <span>Posted {timeAgo(job.posted_at)}</span>}
    </span>
  )
}

// An open job: the whole card picks it (a real checkbox underneath, for keyboards and screen readers).
function JobCard({ job, picked, onPick, best }: { job: GuestJob; picked: boolean; onPick: () => void; best: boolean }) {
  const pay = salary(job)
  return (
    <label className={cn("group relative flex cursor-pointer gap-4 rounded-3xl border bg-card p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20", picked ? "border-primary shadow-[0_18px_40px_-22px_rgb(0_91_167/0.45)]" : "hover:-translate-y-0.5 hover:border-primary-line hover:shadow-[0_18px_40px_-26px_rgb(14_27_44/0.35)]")}>
      <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Pick ${job.title} at ${job.company}`} className="sr-only" />
      <CompanyAvatar name={job.company} logo={job.company_logo} domain={job.company_domain} size={48} className="rounded-xl" />
      <span className="min-w-0 flex-1">
        {best && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
            <Check className="size-3" />
            Best match for your CV
          </span>
        )}
        <span className="block text-[16px] leading-snug font-semibold text-foreground">{job.title}</span>
        <span className="mt-0.5 block text-sm text-text-secondary">{job.company}</span>
        <Facts job={job} />
        {pay && <span className="mt-2 inline-block rounded-lg bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary">{pay}</span>}
      </span>
      <span className={cn("flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-xs font-semibold transition-colors", picked ? "border-primary bg-primary text-primary-foreground" : "text-text-secondary group-hover:border-primary-line group-hover:text-primary")}>
        <span className={cn("grid size-4 place-items-center rounded-full border", picked ? "border-white bg-white text-primary" : "border-current")}>{picked && <Check className="size-3" strokeWidth={3} />}</span>
        {picked ? "Picked" : "Pick"}
      </span>
    </label>
  )
}

// A locked job: real title and company to read, nothing to pick or open. Each one further down is more blurred.
function PreviewCard({ job, index }: { job: GuestPreviewJob; index: number }) {
  return (
    <div className="flex gap-4 rounded-3xl border bg-card/80 p-5 select-none" style={{ filter: index ? `blur(${Math.min(index * 0.9, 6)}px)` : undefined, opacity: Math.max(1 - index * 0.08, 0.35) }}>
      <CompanyAvatar name={job.company} logo={job.company_logo} domain={job.company_domain} size={44} className="rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">{job.title}</span>
        <span className="mt-0.5 block text-sm text-text-secondary">{job.company}</span>
        <Facts job={job} />
      </span>
      <Lock className="size-4 shrink-0 text-text-tertiary" />
    </div>
  )
}

function ResultsScreen({ search, picked: initial, onEdit, onNewCv }: { search: GuestSearch; picked: string[]; onEdit: () => void; onNewCv: () => void }) {
  const router = useRouter()
  const gate = useRef<HTMLElement>(null)
  const [picked, setPicked] = useState(initial)
  const [going, setGoing] = useState(false)
  const [gateSeen, setGateSeen] = useState(false)
  const locked = search.locked
  const preview = (search.preview ?? []).slice(0, 8)
  const where = search.countries.length ? `in ${search.countries.map(countryName).join(" and ")}` : "anywhere"

  // The sticky "See all" bar hides while the gate is on screen.
  useEffect(() => {
    if (!gate.current) return
    const io = new IntersectionObserver(([e]) => setGateSeen(e.isIntersecting), { threshold: 0.2 })
    io.observe(gate.current)
    return () => io.disconnect()
  }, [locked])

  // Picks are kept on this device's guest, so signup or login carries them over.
  async function go(to: "/signup" | "/login") {
    setGoing(true)
    await pickGuestJobs(picked).catch(() => undefined)
    router.push(to)
  }
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  // Each pick is kept on this device's guest right away, so a refresh (or coming back) shows it picked.
  const firstPicks = useRef(true)
  useEffect(() => {
    if (firstPicks.current) return void (firstPicks.current = false)
    void pickGuestJobs(picked).catch(() => undefined)
  }, [picked])

  return (
    <div className="pb-32 sm:pb-12">
      <Hero
        title={
          <>
            We found <span className="bg-[linear-gradient(90deg,#7cc8ff,#3fb4ee_45%,#9fe1ff)] bg-clip-text text-transparent tabular-nums">{jobsWord(search.total)}</span> for {search.roles.join(" and ")} {where}
          </>
        }
        sub="LinkedIn · posted in the last 30 days · best matches first"
      >
        <Companies search={search} />
      </Hero>
      <div className="relative z-10 mx-auto -mt-20 max-w-3xl px-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-2.5 shadow-card">
        <h2 className="text-sm font-semibold">Your best matches</h2>
        <span className="text-xs text-text-tertiary">{picked.length ? `${picked.length} picked · saved to your account` : "Pick the ones you like"}</span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {search.open.map((j, i) => (
          <JobCard key={j.id} job={j} best={i === 0} picked={picked.includes(j.id)} onPick={() => toggle(j.id)} />
        ))}
      </div>

      {locked > 0 ? (
        <>
          <div className="mt-8 flex items-center gap-1.5 px-1 text-sm font-semibold">
            <Lock className="size-3.5 text-text-tertiary" />
            {jobsWord(locked)} more, ranked for you
          </div>
          {/* Read-only and fading: real jobs to see, not to pick. Screen readers get the count above instead. */}
          <div aria-hidden className="relative mt-3">
            <div className="flex flex-col gap-3 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
              {preview.length ? preview.map((j, i) => <PreviewCard key={i} job={j} index={i} />) : Array.from({ length: Math.min(locked, 3) }, (_, i) => <PreviewCard key={i} index={i + 2} job={{ title: "Job title", company: "Company", location: null, remote_type: "UNKNOWN", posted_at: null }} />)}
            </div>
          </div>

          {/* The gate rises over the end of the fade: inline, never a modal; the open jobs stay usable either way. */}
          <section ref={gate} aria-labelledby="gate-title" tabIndex={-1} className="relative z-10 -mt-40 overflow-hidden rounded-3xl border border-primary-line bg-card p-5 pt-6 shadow-[0_24px_60px_-30px_rgb(0_91_167/0.45)] outline-none focus-visible:ring-4 focus-visible:ring-primary/20 sm:p-7 sm:pt-8">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--primary),var(--azure))]" />
            <h2 id="gate-title" className="text-xl font-semibold tracking-tight">
              See all {jobsWord(search.total)} and apply
            </h2>
            <p className="mt-1.5 text-sm text-text-secondary">
              Create your free account to open the other {locked.toLocaleString("en-US")}. Your CV, search and {picked.length ? `${picked.length} picked job${picked.length === 1 ? "" : "s"}` : "picked jobs"} move to your account, so there&apos;s nothing to upload again.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
              <Check className="size-3.5 text-success" />
              Free. No card. Apply with the Plato Chrome extension from your own browser.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={() => void go("/signup")} disabled={going} className="h-12 gap-2 rounded-xl px-6 text-[15px]">
                {going && <Loader2 className="size-4 animate-spin" />}
                Create free account
              </Button>
              <Button variant="ghost" onClick={() => void go("/login")} disabled={going}>
                Already have an account? Log in
              </Button>
            </div>
          </section>
        </>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
          <p className="text-sm text-text-secondary">Create a free account to save {search.total === 1 ? "it" : "these"} and apply.</p>
          <Button onClick={() => void go("/signup")} disabled={going} className="rounded-full">
            Create free account
          </Button>
        </div>
      )}

      <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <button type="button" onClick={onEdit} className="font-semibold text-primary hover:underline">
          Search again with different settings
        </button>
        <button type="button" onClick={onNewCv} className="font-semibold text-primary hover:underline">
          Use a different CV
        </button>
      </p>

      {locked > 0 && !gateSeen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
          <Button onClick={() => (gate.current?.scrollIntoView({ behavior: "smooth", block: "center" }), gate.current?.focus({ preventScroll: true }))} className="h-12 w-full rounded-xl text-[15px]">
            See all {jobsWord(search.total)}
          </Button>
        </div>
      )}
      </div>
    </div>
  )
}

// The employers behind the results: real logos, then how many more.
function Companies({ search }: { search: GuestSearch }) {
  const seen = new Set<string>()
  const firms = [...search.open, ...(search.preview ?? [])].filter((j) => !seen.has(j.company) && !!seen.add(j.company))
  const shown = firms.slice(0, 6)
  if (!shown.length) return null
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <span className="flex -space-x-2.5">
        {shown.map((j) => (
          <span key={j.company} title={j.company} className="rounded-xl ring-2 ring-[#08264c]">
            <CompanyAvatar name={j.company} logo={j.company_logo} domain={j.company_domain} size={36} className="rounded-xl" />
          </span>
        ))}
      </span>
      <span className="text-sm text-white/75">
        {shown
          .slice(0, 2)
          .map((j) => j.company)
          .join(", ")}
        {firms.length > 2 ? ` and ${firms.length - 2} more companies` : ""}
      </span>
    </div>
  )
}

// ---------- States ----------

function StateCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="pb-16">
      <Hero title={title}>
        <span className="mx-auto mt-6 grid size-12 place-items-center rounded-2xl bg-white/10 text-sky-200 backdrop-blur">
          <Icon className="size-6" />
        </span>
      </Hero>
      <div className="relative z-10 mx-auto -mt-16 max-w-xl px-4">
        <div className="rounded-3xl border bg-card p-6 text-center shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  )
}

const LEVEL_NEXT: Record<string, GuestSearchInput["level"]> = { entry: "mid", mid: "senior", senior: "mid" }

function ZeroResults({ search, base, rerun, onEdit, error }: { search: GuestSearch; base: GuestSearchInput; rerun: (p: Partial<GuestSearchInput>) => void; onEdit: () => void; error: string | null }) {
  const where = search.countries.length ? `in ${search.countries.map(countryName).join(" and ")}` : "anywhere"
  const widen: { label: string; patch: Partial<GuestSearchInput> }[] = [
    ...(search.countries.length ? [{ label: "Search anywhere", patch: { countries: [] } }] : []),
    ...(base.remoteTypes.length ? [{ label: "Any work setup", patch: { remoteTypes: [] } }] : []),
    ...(base.level ? [{ label: `Try ${LEVEL_NEXT[base.level]} level`, patch: { level: LEVEL_NEXT[base.level] } }] : []),
  ]
  return (
    <StateCard icon={SearchX} title="No matching jobs yet">
      <p className="mt-2 text-sm text-text-secondary">
        No LinkedIn jobs from the last 30 days matched {search.roles.join(" or ")} {where}. Widen the search and try again:
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {widen.map((w) => (
          <Button key={w.label} variant="outline" onClick={() => rerun(w.patch)} className="rounded-full">
            {w.label}
          </Button>
        ))}
        <Button variant="outline" onClick={onEdit} className="gap-1.5 rounded-full">
          <Plus className="size-3.5" />
          Add another role
        </Button>
      </div>
      {error && <Problem message={error} className="mt-5" />}
    </StateCard>
  )
}

// ---------- Loading ----------

// While the device's guest loads: the shape of the step in the address, not a spinner, so nothing jumps when it lands.
const HeroBar = ({ className }: { className: string }) => <span className={cn("mx-auto block animate-pulse rounded-full bg-white/12", className)} />
const CARD_SHADOW = "rounded-3xl border bg-card p-5 shadow-card sm:p-7"

function StepSkeleton({ slug }: { slug: Slug }) {
  const upload = slug === "upload"
  return (
    <div role="status" aria-label="Loading" className={upload ? "pb-10" : "pb-12"}>
      <span className="sr-only">Loading…</span>
      <section aria-hidden className={cn("relative isolate overflow-hidden rounded-b-[36px] bg-[radial-gradient(60%_70%_at_50%_38%,#0b4f96_0%,#08264c_50%,#050b16_100%)] px-4", upload ? "pt-28 pb-48 sm:pt-32" : "pt-24 pb-32 sm:pt-28 sm:pb-36")}>
        <HeroBar className={cn("w-[min(560px,85%)]", upload ? "h-10 sm:h-12" : "h-8 sm:h-10")} />
        <HeroBar className={cn("mt-3 w-[min(420px,70%)]", upload ? "h-10 sm:h-12" : "hidden")} />
        <HeroBar className="mt-5 h-4 w-[min(480px,80%)]" />
        {upload && <HeroBar className="mt-6 h-7 w-64" />}
        {slug === "searching" && <span className="mx-auto mt-8 block size-28 animate-pulse rounded-full bg-white/8 ring-1 ring-white/15" />}
        {slug === "jobs" && (
          <span className="mt-6 flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-9 animate-pulse rounded-xl bg-white/12" />
            ))}
          </span>
        )}
      </section>

      {upload && (
        <div aria-hidden className="relative z-10 mx-auto -mt-36 max-w-2xl px-4">
          <div className="rounded-3xl border bg-card p-5 shadow-[0_30px_70px_-30px_rgb(14_27_44/0.35)] sm:p-7">
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10">
              <Skeleton className="size-14 rounded-2xl" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-2 h-11 w-48 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t pt-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3 w-24 max-w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {slug === "check" && (
        <div aria-hidden className="relative z-10 mx-auto -mt-20 grid max-w-5xl grid-cols-1 items-start gap-5 px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={cn(CARD_SHADOW, "flex flex-col gap-7")}>
            {[3, 4, 3, 3].map((chips, i) => (
              <div key={i} className="flex flex-col gap-3">
                <span className="flex items-center gap-2.5">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                </span>
                <Skeleton className="h-3 w-56 max-w-full" />
                <span className="flex flex-wrap gap-2">
                  {Array.from({ length: chips }, (_, j) => (
                    <Skeleton key={j} className="h-9 w-24 rounded-full" />
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className={cn(CARD_SHADOW, "flex flex-col gap-3")}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="mt-3 h-11 w-full rounded-full" />
          </div>
        </div>
      )}

      {slug === "searching" && (
        <div aria-hidden className="relative z-10 mx-auto -mt-20 max-w-2xl px-4">
          <div className={CARD_SHADOW}>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
            <div className="mt-6 flex flex-col gap-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="flex items-center gap-3">
                  <Skeleton className="size-6 shrink-0 rounded-full" />
                  <Skeleton className={cn("h-4", ["w-56", "w-64", "w-48", "w-52"][i])} />
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {slug === "jobs" && (
        <div aria-hidden className="relative z-10 mx-auto -mt-20 max-w-3xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-card">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                  <span className="mt-1 flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </span>
                </span>
                <Skeleton className="size-5 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SLUGS: Slug[] = ["upload", "check", "searching", "jobs"]
const slugStep = (s: Slug): Step => (s === "upload" ? 0 : s === "check" ? 1 : 2)

// ---------- The page ----------

// The step is in the address (/search?step=upload|check|searching|jobs): shareable within the device, Back works
// between steps, and a refresh lands on it. What each step shows comes from the server (the device's guest), so a
// step that isn't possible yet (jobs before a search) is corrected to the one that is.
type Slug = "upload" | "check" | "searching" | "jobs"

function SearchPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const asked = params.get("step") as Slug | null
  const go = useCallback((to: Slug, how: "push" | "replace" = "push") => router[how](`/search?step=${to}`, { scroll: false }), [router])
  const [guest, setGuest] = useState<GuestView | null | undefined>(undefined) // undefined: still loading
  const [search, setSearch] = useState<GuestSearch | null>(null)
  const [base, setBase] = useState<GuestSearchInput | null>(null) // the settings of the latest search
  const newCv = asked === "upload" && !!guest?.cv
  const editing = asked === "check" && !!search
  const [fails, setFails] = useState(0)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  // This device's guest, if any: a refresh (or coming back later) lands where the visitor was.
  useEffect(() => {
    getGuest()
      .then((g) => {
        setGuest(g)
        setSearch(g?.search ?? null)
        if (g?.draft) setBase(g.draft)
      })
      .catch(() => setGuest(null))
  }, [])

  // A running search: poll until it is done, and say so when it is.
  const runningId = search?.status === "RUNNING" ? search.id : null
  useEffect(() => {
    if (!runningId) return
    const t = setInterval(() => {
      getGuestSearch(runningId)
        .then((s) => {
          if (s.status === "RUNNING") return
          setSearch(s)
          if (s.status === "FAILED") setFails((n) => n + 1)
          else {
            setMessage("Your jobs are ready.")
            if (document.hidden) document.title = "Your jobs are ready · Plato Job Seeker"
          }
        })
        .catch(() => undefined)
    }, 2500)
    return () => clearInterval(t)
  }, [runningId])
  useEffect(() => {
    const back = () => {
      if (!document.hidden && document.title.startsWith("Your jobs are ready")) document.title = "Plato Job Seeker"
    }
    document.addEventListener("visibilitychange", back)
    return () => document.removeEventListener("visibilitychange", back)
  }, [])

  const started = (s: GuestSearch, input: GuestSearchInput) => {
    setSearch(s)
    setBase(input)
    setRetryError(null)
    go("searching")
  }
  async function rerun(patch: Partial<GuestSearchInput> = {}) {
    if (!search) return
    const input = { roles: search.roles, countries: search.countries, remoteTypes: base?.remoteTypes ?? [], level: base?.level ?? null, ...patch }
    setRetryError(null)
    try {
      started(await startGuestSearch(input), input)
      setMessage("Searching LinkedIn for your jobs.")
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "The search could not start. Try again.")
    }
  }
  const onUploaded = (g: GuestView) => {
    setGuest(g)
    setSearch(null)
    if (g.draft) setBase(g.draft)
    go("check")
  }
  const resultsStep: Slug = search?.status === "RUNNING" ? "searching" : "jobs"

  let step: Step | null = null
  let body: ReactNode
  if (guest === undefined) {
    const loading: Slug = asked && SLUGS.includes(asked) ? asked : "upload"
    step = slugStep(loading)
    body = <StepSkeleton slug={loading} />
  } else if (!guest?.cv || newCv) {
    step = 0
    body = <UploadScreen onUploaded={onUploaded} onBack={guest?.cv ? () => go(search ? resultsStep : "check") : undefined} announce={setMessage} />
  } else if (!search || editing) {
    step = 1
    body = <ConfirmScreen key={guest.cv.name} guest={guest} onStarted={started} onNewCv={() => go("upload")} announce={setMessage} />
  } else if (search.status === "RUNNING") {
    step = 2
    body = <SearchingScreen search={search} />
  } else if (search.status === "FAILED") {
    step = 2
    body = (
      <StateCard icon={WifiOff} title="Something went wrong while searching">
        <p className="mt-2 text-sm text-text-secondary">Your CV and settings are saved.{fails > 1 ? " Come back later; we'll keep your search on this device." : ""}</p>
        <Button onClick={() => void rerun()} className="mt-6 gap-1.5 rounded-full">
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
        {retryError && <Problem message={retryError} className="mt-5" />}
      </StateCard>
    )
  } else if (!search.total) {
    step = 2
    body = <ZeroResults search={search} base={base ?? { roles: search.roles, countries: search.countries, remoteTypes: [], level: null }} rerun={(p) => void rerun(p)} onEdit={() => go("check")} error={retryError} />
  } else {
    step = 2
    body = <ResultsScreen search={search} picked={guest.picked ?? []} onEdit={() => go("check")} onNewCv={() => go("upload")} />
  }

  // Keep the address on the step actually shown (a step not possible yet is corrected, without a history entry).
  const shown: Slug | null = guest === undefined ? null : step === 0 ? "upload" : step === 1 ? "check" : resultsStep
  useEffect(() => {
    if (shown && asked !== shown) go(shown, "replace")
  }, [shown, asked, go])

  // Focus the new screen's title on every screen change after the first.
  const screen = `${step}-${search?.status ?? ""}-${editing}-${newCv}`
  const first = useRef(true)
  useEffect(() => {
    if (guest === undefined) return
    if (first.current) {
      first.current = false
      return
    }
    document.querySelector<HTMLElement>("[data-step-title]")?.focus()
  }, [screen, guest])

  return (
    <Shell step={step} overHero>
      {/* One polite live region for milestones (file accepted, CV read, searching, results ready). */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </p>
      {body}
    </Shell>
  )
}

export default function PublicSearchPage() {
  return (
    <Suspense
      fallback={
        <Shell step={0} overHero>
          <StepSkeleton slug="upload" />
        </Shell>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
