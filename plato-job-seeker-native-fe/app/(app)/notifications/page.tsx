"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { useState } from "react"
import Link from "next/link"
import { ArrowRight, BellOff } from "lucide-react"
import { cn } from "cn"
import { timeAgo } from "@/lib/jobs/links"
import { NotificationIcon, useNotifications } from "@/components/notifications-provider"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState } from "@/components/plato-ui"
import type { SeekerNotification } from "@/lib/notifications/api"

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "unread", label: "Unread", test: null },
  { key: "application", label: "Applications", test: (n: SeekerNotification) => n.kind === "application" || n.kind === "queue" },
  { key: "run", label: "Searches", test: (n: SeekerNotification) => n.kind === "run" },
  { key: "alert", label: "Job alerts", test: (n: SeekerNotification) => n.kind === "alert" },
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
    <div data-tour-state={loading ? undefined : items.length ? "notifications.list" : "notifications.empty"} className={PAGE}>
      <PageHeader
        section="Account"
        title="Notifications"
        description="Searches that finished, applications that moved and new jobs from your alerts. Updates arrive live."
        bell={false}
        actions={
          <button type="button" data-ai="notifications.mark-all-read" disabled={!unread} onClick={markAllRead} className="h-9 rounded-full border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint disabled:opacity-50">
            Mark all read
          </button>
        }
      />

      <PillTabs id="notifications-filter" tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, count: count(f.key) }))} value={filter} onChange={setFilter} label="Filter notifications" dataAi="notifications.filter" />

      <div data-tour="notifications-list" className={cn(CARD, "overflow-hidden px-5 py-1")}>
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
          <EmptyState
            icon={BellOff}
            className="my-4 border-0 py-10"
            title={filter === "unread" ? "You're all caught up" : "Nothing here yet"}
            hint={filter === "alert" ? "Follow a company and new jobs from it show up here." : filter === "unread" ? "New updates appear here as they arrive." : "Start a search or apply to a few jobs. Plato will tell you here when something needs you."}
            action={
              filter === "alert" ? (
                <Link href="/following" className="group inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                  Follow a company
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ) : undefined
            }
          />
        )}
        <ul>
          {shown.map((n, i) => (
            <li key={n.id} className="-mx-5 border-b border-divider animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 last:border-b-0" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              {/* Unread: a thin cobalt bar on the left and a faint tint, not a filled block. */}
              <Link href={n.href} data-ai={`notifications.item:${n.id}`} onClick={() => markRead([n.id])} className={cn("group relative flex items-center gap-3.5 px-5 py-4 transition-colors duration-200 hover:bg-primary-tint", isUnread(n.id) && "bg-primary-tint/40 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary")}>
                <NotificationIcon n={n} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="type-card-title truncate text-foreground">{n.title}</span>
                    {isUnread(n.id) && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                  </span>
                  <span className="line-clamp-2 block text-sm text-text-secondary">{n.body}</span>
                  <span className="type-meta mt-0.5 block text-text-tertiary">
                    {n.kind === "run" ? "Search" : n.kind === "queue" ? "Apply queue" : n.kind === "alert" ? "Job alerts" : "Application"} · {timeAgo(n.at)}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-lavender transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
