"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, BellOff } from "lucide-react"
import { cn } from "cn"
import { timeAgo } from "@/lib/jobs/links"
import { NotificationIcon, useNotifications } from "@/components/notifications-provider"
import { Skeleton } from "@/components/ui/skeleton"
import type { SeekerNotification } from "@/lib/notifications/api"

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "unread", label: "Unread", test: null },
  { key: "application", label: "Applications", test: (n: SeekerNotification) => n.kind !== "run" },
  { key: "run", label: "Searches", test: (n: SeekerNotification) => n.kind === "run" },
] as const
type FilterKey = (typeof FILTERS)[number]["key"]

// Same live feed as the bell, with room to filter. New items appear on
// their own; there is nothing to refresh.
export default function NotificationsPage() {
  const { items, loading, unread, isUnread, markRead, markAllRead } = useNotifications()
  const [filter, setFilter] = useState<FilterKey>("all")

  const matches = (n: SeekerNotification) => (filter === "unread" ? isUnread(n.id) : (FILTERS.find((f) => f.key === filter)?.test?.(n) ?? true))
  const shown = items.filter(matches)
  const count = (key: FilterKey) => (key === "unread" ? unread : items.filter((n) => FILTERS.find((f) => f.key === key)?.test?.(n) ?? true).length)

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-text-secondary">Searches that finished and applications that moved. Updates arrive live.</p>
        </div>
        <button type="button" data-ai="notifications.mark-all-read" disabled={!unread} onClick={markAllRead} className="h-9 rounded-md border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
          Mark all read
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-ai={`notifications.filter.${f.key}`}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn("flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", filter === f.key ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-text-secondary hover:bg-muted")}
          >
            {f.label}
            <span className="text-xs tabular-nums opacity-70">{count(f.key)}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-card px-5 py-1">
        {loading && (
          <ul aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-divider py-4 last:border-b-0">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!loading && shown.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <BellOff className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">{filter === "unread" ? "You're all caught up" : "Nothing here yet"}</p>
            <p className="max-w-sm text-sm text-text-secondary">Start a search or apply to a few jobs. Plato will tell you here when something needs you.</p>
          </div>
        )}
        <ul>
          {shown.map((n) => (
            <li key={n.id} className="-mx-5 border-b border-divider last:border-b-0">
              <Link href={n.href} data-ai={`notifications.item:${n.id}`} onClick={() => markRead([n.id])} className={cn("flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-primary-tint", isUnread(n.id) && "bg-primary-tint/70")}>
                <NotificationIcon n={n} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-foreground">{n.title}</span>
                    {isUnread(n.id) && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                  </span>
                  <span className="line-clamp-2 block text-sm text-text-secondary">{n.body}</span>
                  <span className="mt-0.5 block text-xs text-text-tertiary">
                    {n.kind === "run" ? "Search" : n.kind === "queue" ? "Apply queue" : "Application"} · {timeAgo(n.at)}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-lavender" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
