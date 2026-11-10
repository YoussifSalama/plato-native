"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Activity, ChevronRight, CircleCheck, CircleX, Clock, Hand, Loader, SkipForward, X } from "lucide-react"
import { cn } from "cn"
import { getExtensionProgress, type ExtensionProgress } from "@/lib/extension/api"
import { timeAgo } from "@/lib/jobs/links"
import { applicationHref, reasonText } from "@/lib/jobs/application-status"
import { EmptyState, StatIcon } from "@/components/plato-ui"
import { CountUp } from "@/components/count-up"
import { InfoTip } from "@/components/info-tip"

// A small sidebar, available on every page, showing what the browser extension is doing. It only READS
// the state the extension already records on the server; it never controls the extension.
const LABEL: Record<string, { text: string; tone: string }> = {
  PENDING: { text: "Waiting", tone: "bg-muted text-text-secondary" },
  CLAIMED: { text: "Starting", tone: "bg-info-soft text-info" },
  PREPARING: { text: "Starting", tone: "bg-info-soft text-info" },
  FILLING: { text: "Filling the form", tone: "bg-info-soft text-info" },
  REVIEW: { text: "Filling the form", tone: "bg-info-soft text-info" },
  AWAITING_SUBMIT: { text: "Submitting", tone: "bg-primary-soft text-primary" },
  NEEDS_USER: { text: "Needs you", tone: "bg-warning-soft text-warning" },
  VERIFY: { text: "Please check", tone: "bg-warning-soft text-warning" },
  SUBMITTED_CONFIRMED: { text: "Applied", tone: "bg-success-soft text-success" },
  SUBMITTED_ATTESTED: { text: "Applied", tone: "bg-success-soft text-success" },
  FAILED: { text: "Failed", tone: "bg-rose-soft text-rose" },
  SKIPPED: { text: "Skipped", tone: "bg-muted text-text-secondary" },
}

// The counters a person could misread; the rest say what they are.
const COUNTER_TIP: Partial<Record<string, [string, string]>> = {
  working: ["What working counts", "Jobs the extension has picked up and is opening, filling or submitting right now."],
  waiting: ["What waiting counts", "Jobs added with “Apply with Plato” that the extension hasn't started yet. They start when you start applying in the extension."],
  needsYou: ["What needs you counts", "The extension stopped on these until you act: it asked you for something, or couldn't tell whether the form was sent."],
}

function useProgress(open: boolean) {
  const [data, setData] = useState<ExtensionProgress | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      getExtensionProgress()
        .then((d) => alive && setData(d))
        .catch(() => undefined)
    load()
    const id = setInterval(load, open ? 4000 : 15000) // faster while it is on screen
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open])
  return data
}

// `row` is the sidebar status card's line: "Extension · ● Online · 2 applying".
// The drawer is portalled to <body>: the sidebar is a backdrop-filtered glass panel, which
// would otherwise become the containing block of this fixed drawer and trap it inside.
const noop = () => () => {}
const useMounted = () => useSyncExternalStore(noop, () => true, () => false)

export function ExtensionProgressNav({ collapsed, itemClass, variant = "item" }: { collapsed: boolean; itemClass: string; variant?: "item" | "row" }) {
  const [open, setOpen] = useState(false)
  const data = useProgress(open)
  // The Plato AI opens it ("show me the progress").
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener("plato:open-extension-progress", on)
    return () => window.removeEventListener("plato:open-extension-progress", on)
  }, [])
  const mounted = useMounted()
  const active = data?.active ?? 0
  const state = !data ? null : !data.linked ? { text: "Not linked", dot: "bg-lavender" } : data.online ? { text: data.counts.working ? `${data.counts.working} applying` : data.counts.needsYou ? `${data.counts.needsYou} need you` : "Online", dot: "bg-success" } : { text: "Offline", dot: "bg-lavender" }

  return (
    <>
      {variant === "row" && !collapsed ? (
        <button type="button" data-ai="nav.extension-progress" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(itemClass, "w-full")}>
          <Activity className="size-4 shrink-0 text-text-tertiary" />
          <span className="flex-1 truncate text-left text-text-secondary">Extension</span>
          {state && (
            <span className={cn("flex items-center gap-1.5 text-xs font-semibold", data?.online ? "text-success" : "text-text-tertiary")}>
              <span className={cn("size-1.5 rounded-full", state.dot, data?.online && "shadow-[0_0_0_3px_rgb(28_154_75/0.18)]")} />
              {state.text}
            </span>
          )}
        </button>
      ) : (
      <button type="button" data-ai="nav.extension-progress" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={collapsed ? "Extension progress" : undefined} className={cn(itemClass, "w-full", !collapsed && "pl-1.5")}>
        <span className="relative shrink-0">
          <Activity className="size-[17px]" />
          {data?.online && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-success" />}
        </span>
        {!collapsed && <span className="flex-1 truncate text-left">Extension progress</span>}
        {!collapsed && active > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{active}</span>}
      </button>
      )}

      {mounted && createPortal(<ProgressDrawer open={open} onClose={() => setOpen(false)} data={data} />, document.body)}
    </>
  )
}

function ProgressDrawer({ open, onClose, data }: { open: boolean; onClose: () => void; data: ExtensionProgress | null }) {
  return (
      <aside aria-hidden={!open} className={cn("theme-app fixed inset-y-0 right-0 z-[55] flex w-[min(380px,100vw)] flex-col border-l bg-card shadow-xl transition-transform duration-300", open ? "translate-x-0" : "pointer-events-none translate-x-full")}>
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div className="flex items-start gap-3">
            <StatIcon icon={Activity} accent="cobalt" className="size-9 rounded-lg [&_svg]:size-4" />
            <div className="flex flex-col gap-1">
              <h2 className="type-section-title">Extension progress</h2>
              <p className="type-meta flex items-center gap-1.5 text-text-secondary">
                <span className={cn("size-2 rounded-full", data?.online ? "bg-success shadow-[0_0_0_3px_rgb(28_154_75/0.18)]" : "bg-text-tertiary")} />
                {!data ? "Loading…" : !data.linked ? "No browser linked yet" : data.online ? "Extension is online" : "Extension is not running right now"}
              </p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1.5 text-text-secondary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        {data && (
          <div className="grid grid-cols-3 gap-2 border-b p-4 text-center">
            {(
              [
                ["working", "Working", Loader, "cobalt"],
                ["waiting", "Waiting", Clock, "azure"],
                ["needsYou", "Needs you", Hand, "amber"],
                ["submitted", "Applied", CircleCheck, "green"],
                ["failed", "Failed", CircleX, "rose"],
                ["skipped", "Skipped", SkipForward, "teal"],
              ] as const
            ).map(([k, label, icon, accent], i) => {
              const tip = COUNTER_TIP[k]
              return (
              <div key={k} className="flex animate-in flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-2.5 shadow-card fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${i * 60}ms` }}>
                <StatIcon icon={icon} accent={accent} className="size-7 rounded-lg [&_svg]:size-3.5" />
                <div className={cn("text-lg leading-none font-bold tabular-nums", k === "needsYou" && data.counts[k] > 0 && "text-warning-ink")}>
                  <CountUp value={data.counts[k]} />
                </div>
                <div className="flex items-center gap-1 text-[11px] text-text-secondary">
                  {label}
                  {tip && <InfoTip side="bottom" className="size-3.5 [&_svg]:size-3" label={tip[0]} text={tip[1]} />}
                </div>
              </div>
              )
            })}
          </div>
        )}

        <ul className="scroll-thin flex-1 divide-y divide-divider overflow-y-auto">
          {data && data.recent.length === 0 && (
            <li className="p-4">
              <EmptyState icon={Activity} title="Nothing yet" hint="Add jobs with “Apply with Plato”, then start applying in the extension." />
            </li>
          )}
          {data?.recent.map((r, i) => {
            const l = LABEL[r.state] ?? { text: r.state, tone: "bg-muted text-text-secondary" }
            return (
              <li key={r.id} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                {/* Each card opens that application's own page (steps, resume, answers); items without one yet stay plain. */}
                {(() => {
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-sm font-medium">
                          <span className="block truncate transition-colors duration-200 group-hover:text-primary">{r.title}</span>
                          <span className="type-meta block truncate font-normal text-text-secondary">{r.company}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", l.tone)}>{l.text}</span>
                          {r.application_id && <ChevronRight className="size-4 text-text-tertiary transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />}
                        </span>
                      </div>
                      {r.note && <p className="text-xs text-text-secondary">{/\s/.test(r.note) ? r.note : reasonText(r.note)}</p>}
                      <span className="text-[11px] text-text-tertiary">{timeAgo(r.updated_at)}</span>
                    </>
                  )
                  return r.application_id ? (
                    <Link href={applicationHref(r.application_id)} onClick={onClose} className="group flex flex-col gap-1 px-5 py-3 transition-colors duration-200 outline-none hover:bg-primary-tint focus-visible:bg-primary-tint">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-1 px-5 py-3">{body}</div>
                  )
                })()}
              </li>
            )
          })}
        </ul>
        <p className="type-meta border-t p-4 text-text-tertiary">Updates every few seconds. To change anything, open the Plato extension.</p>
      </aside>
  )
}

// Top bar pill: "● Plato · applying 2" / "● Plato · ready". Opens the same drawer.
export function PlatoStatusPill() {
  const [open, setOpen] = useState(false)
  const data = useProgress(open)
  const mounted = useMounted()
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener("plato:open-extension-progress", on)
    return () => window.removeEventListener("plato:open-extension-progress", on)
  }, [])
  const active = data?.active ?? 0
  const needs = data?.counts.needsYou ?? 0
  // "applying" counts only the jobs being worked on; ones waiting on the person read as "need you".
  const working = data?.counts.working ?? 0
  const label = !data ? "Plato" : !data.linked ? "Plato · not linked" : working ? `Plato · applying ${working}` : needs ? `Plato · ${needs} need you` : data.online ? "Plato · ready" : "Plato · offline"
  const dot = !data || !data.linked || (!data.online && !active) ? "bg-lavender" : working ? "bg-azure animate-pulse" : needs ? "bg-warning" : "bg-success"
  return (
    <>
      <button type="button" data-ai="nav.extension-progress" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="What the Plato extension is doing: jobs it's applying to or waiting on you for. Click for details." className="surface-panel flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold text-foreground tabular-nums transition-colors hover:border-primary-line sm:px-3.5">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {mounted && createPortal(<ProgressDrawer open={open} onClose={() => setOpen(false)} data={data} />, document.body)}
    </>
  )
}
