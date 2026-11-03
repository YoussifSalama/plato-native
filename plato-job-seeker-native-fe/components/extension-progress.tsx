"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Activity, X } from "lucide-react"
import { cn } from "cn"
import { getExtensionProgress, type ExtensionProgress } from "@/lib/extension/api"
import { timeAgo } from "@/lib/jobs/links"

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
  const state = !data ? null : !data.linked ? { text: "Not linked", dot: "bg-lavender" } : data.online ? { text: active ? `${active} applying` : "Online", dot: "bg-success" } : { text: "Offline", dot: "bg-lavender" }

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

      {mounted &&
        createPortal(
      <aside aria-hidden={!open} className={cn("theme-app fixed inset-y-0 right-0 z-40 flex w-[min(380px,100vw)] flex-col border-l bg-card shadow-xl transition-transform duration-300", open ? "translate-x-0" : "pointer-events-none translate-x-full")}>
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Extension progress</h2>
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className={cn("size-2 rounded-full", data?.online ? "bg-success" : "bg-text-tertiary")} />
              {!data ? "Loading…" : !data.linked ? "No browser linked yet" : data.online ? "Extension is online" : "Extension is not running right now"}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-text-secondary hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        {data && (
          <div className="grid grid-cols-3 gap-2 border-b p-4 text-center">
            {([["working", "Working"], ["waiting", "Waiting"], ["needsYou", "Needs you"], ["submitted", "Applied"], ["failed", "Failed"], ["skipped", "Skipped"]] as const).map(([k, label]) => (
              <div key={k} className="rounded-lg bg-muted px-2 py-2">
                <div className={cn("text-lg font-bold tabular-nums", k === "needsYou" && data.counts[k] > 0 && "text-warning")}>{data.counts[k]}</div>
                <div className="text-[11px] text-text-secondary">{label}</div>
              </div>
            ))}
          </div>
        )}

        <ul className="flex-1 divide-y overflow-y-auto">
          {data && data.recent.length === 0 && <li className="p-5 text-sm text-text-secondary">Nothing yet. Add jobs with “Apply with Plato”, then start applying in the extension.</li>}
          {data?.recent.map((r) => {
            const l = LABEL[r.state] ?? { text: r.state, tone: "bg-muted text-text-secondary" }
            return (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-medium">
                    <span className="block truncate">{r.title}</span>
                    <span className="block truncate text-xs font-normal text-text-secondary">{r.company}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", l.tone)}>{l.text}</span>
                </div>
                {r.note && <p className="text-xs text-text-secondary">{r.note}</p>}
                <span className="text-[11px] text-text-tertiary">{timeAgo(r.updated_at)}</span>
              </li>
            )
          })}
        </ul>
        <p className="border-t p-4 text-xs text-text-tertiary">Updates every few seconds. To change anything, open the Plato extension.</p>
      </aside>,
          document.body,
        )}
    </>
  )
}
