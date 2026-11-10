"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Bell, BellOff, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { cn } from "cn"
import type { DiscoveryRun } from "@/lib/jobs/api"
import { timeAgo } from "@/lib/jobs/links"
import { NotificationIcon, useNotifications } from "@/components/notifications-provider"
import { EmptyState } from "@/components/plato-ui"

function RunStatusIcon({ status }: { status: DiscoveryRun["status"] }) {
  if (status === "RUNNING") return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
  if (status === "DONE") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
  return <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
}

// Reads the app-wide notification stream: searches and applications, live.
function NotificationBell() {
  const { items, unread, isUnread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="surface-panel relative flex size-10 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 hover:border-primary-line hover:text-primary aria-expanded:border-primary-line aria-expanded:text-primary">
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-background">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-30 mt-2 w-[min(380px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border bg-card shadow-float animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="type-card-title flex items-center gap-2 text-foreground">
                Notifications
                {unread > 0 && <span className="rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary tabular-nums">{unread}</span>}
              </p>
              <button type="button" disabled={!unread} onClick={markAllRead} className="rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors duration-200 hover:bg-primary-soft disabled:bg-transparent disabled:text-text-tertiary">
                Mark all read
              </button>
            </div>
            {items.length === 0 && <EmptyState icon={BellOff} title="Nothing yet" hint="Searches and applications will show up here." className="m-3 border-0 py-5" />}
            <ul className="scroll-thin flex max-h-96 flex-col overflow-y-auto p-1.5">
              {items.slice(0, 10).map((n, i) => (
                <li key={n.id} className="animate-in fade-in-0 fill-mode-both duration-300" style={{ animationDelay: `${i * 30}ms` }}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      markRead([n.id])
                      setOpen(false)
                    }}
                    className={cn("group relative flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-200 hover:bg-muted/60", isUnread(n.id) && "bg-primary-tint/50 before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary")}
                  >
                    <NotificationIcon n={n} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">{n.title}</span>
                        {isUnread(n.id) && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                      </span>
                      <span className="line-clamp-2 block text-[13px] text-text-secondary">{n.body}</span>
                      <span className="type-meta block text-text-tertiary">{timeAgo(n.at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/notifications" onClick={() => setOpen(false)} className="group flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-semibold text-primary transition-colors duration-200 hover:bg-primary-tint">
              View all
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export { NotificationBell, RunStatusIcon }
