"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react"
import { cn } from "cn"
import { listNotifications, notificationEventsUrl, type NotificationTone, type SeekerNotification } from "@/lib/notifications/api"
import { spring } from "@/lib/motion-system"

const SEEN_KEY = "plato.seenNotifications"
const TOAST_MS = 7000

// Read-state is a per-browser convenience; the feed itself is server truth.
function readSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return new Set()
  }
}
function writeSeen(ids: Set<string>) {
  try {
    // Ids for items that left the feed are dead weight; cap the list.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)))
  } catch {}
}

type Ctx = {
  items: SeekerNotification[]
  loading: boolean
  unread: number
  // Applications currently waiting on the seeker.
  needsYou: number
  isUnread: (id: string) => boolean
  markRead: (ids: string[]) => void
  markAllRead: () => void
}
const NotificationsContext = createContext<Ctx | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>")
  return ctx
}

const TONE: Record<NotificationTone, { icon: typeof Info; chip: string }> = {
  success: { icon: CheckCircle2, chip: "bg-success-soft text-success" },
  warning: { icon: AlertTriangle, chip: "bg-warning-soft text-warning" },
  error: { icon: XCircle, chip: "bg-destructive/10 text-destructive" },
  info: { icon: Info, chip: "bg-info-soft text-info" },
}

export function NotificationIcon({ n, className }: { n: Pick<SeekerNotification, "tone" | "status">; className?: string }) {
  const Icon = n.status === "RUNNING" ? Loader2 : TONE[n.tone].icon
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE[n.tone].chip, className)}>
      <Icon className={cn("size-4", n.status === "RUNNING" && "animate-spin")} />
    </span>
  )
}

// One stream for the whole signed-in app: feeds the bell, the sidebar
// badges, the notifications page and the toasts.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const reduced = !!useReducedMotion()
  const pathname = usePathname()
  const [items, setItems] = useState<SeekerNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<SeekerNotification[]>([])

  useEffect(() => {
    listNotifications()
      .then((feed) => {
        setItems(feed)
        // First visit on this browser: history is not news.
        const stored = readSeen()
        const initial = stored ?? new Set(feed.map((n) => n.id))
        if (!stored) writeSeen(initial)
        setSeen(initial)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))

    const source = new EventSource(notificationEventsUrl(), { withCredentials: true })
    source.onmessage = (msg) => {
      const n = JSON.parse(msg.data as string) as SeekerNotification
      // Same thing, new state: replace the older entry for that run/application.
      const subject = n.id.split(":").slice(0, 2).join(":")
      setItems((prev) => [n, ...prev.filter((p) => !p.id.startsWith(`${subject}:`))])
      setToasts((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 3))
      setTimeout(() => setToasts((prev) => prev.filter((p) => p.id !== n.id)), TOAST_MS)
    }
    return () => source.close()
  }, [])

  const markRead = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = new Set([...prev, ...ids])
      writeSeen(next)
      return next
    })
  }, [])

  const value = useMemo<Ctx>(() => {
    const countable = items.filter((n) => n.status !== "RUNNING")
    return {
      items,
      loading,
      unread: countable.filter((n) => !seen.has(n.id)).length,
      needsYou: items.filter((n) => n.kind === "application" && (n.status === "NEEDS_INPUT" || n.status === "VERIFY")).length,
      isUnread: (id) => !seen.has(id) && !id.endsWith(":RUNNING"),
      markRead,
      markAllRead: () => markRead(countable.map((n) => n.id)),
    }
  }, [items, loading, seen, markRead])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {/* Top-right: the Plato dock owns bottom-right. */}
      <div aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts
            // Don't announce what the seeker is already looking at.
            .filter((t) => !(t.kind === "application" && pathname.startsWith("/applications")))
            .map((t) => (
              <motion.div
                key={t.id}
                layout={!reduced}
                initial={{ opacity: 0, x: reduced ? 0 : 24, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: reduced ? 0 : 24, transition: { duration: 0.18 } }}
                transition={reduced ? { duration: 0.15 } : spring.enter}
                className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3.5 shadow-[0_18px_44px_-20px_rgba(79,63,247,0.4),0_2px_6px_-2px_rgba(30,29,43,0.08)]"
              >
                <NotificationIcon n={t} />
                <Link
                  href={t.href}
                  onClick={() => {
                    markRead([t.id])
                    setToasts((prev) => prev.filter((p) => p.id !== t.id))
                  }}
                  className="min-w-0 flex-1"
                >
                  <span className="block text-sm font-semibold text-foreground">{t.title}</span>
                  <span className="line-clamp-2 block text-[13px] text-text-secondary">{t.body}</span>
                </Link>
                <button type="button" aria-label="Dismiss" onClick={() => setToasts((prev) => prev.filter((p) => p.id !== t.id))} className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </NotificationsContext.Provider>
  )
}
