"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { cn } from "cn"
import type { DiscoveryRun } from "@/lib/jobs/api"
import { timeAgo } from "@/lib/jobs/links"
import { NotificationIcon, useNotifications } from "@/components/notifications-provider"

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
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative flex size-10 items-center justify-center rounded-md border bg-card text-text-secondary hover:bg-muted">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-30 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-lg border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <button type="button" disabled={!unread} onClick={markAllRead} className="text-xs font-medium text-primary hover:underline disabled:text-text-tertiary disabled:no-underline">
                Mark all read
              </button>
            </div>
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet. Searches and applications will show up here.</p>}
            <ul className="scroll-thin flex max-h-96 flex-col overflow-y-auto p-1.5">
              {items.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      markRead([n.id])
                      setOpen(false)
                    }}
                    className={cn("flex items-start gap-3 rounded-md px-2.5 py-2.5 hover:bg-muted", isUnread(n.id) && "bg-primary-tint")}
                  >
                    <NotificationIcon n={n} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{n.title}</span>
                        {isUnread(n.id) && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                      </span>
                      <span className="line-clamp-2 block text-[13px] text-text-secondary">{n.body}</span>
                      <span className="block text-xs text-text-tertiary">{timeAgo(n.at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export { NotificationBell, RunStatusIcon }
