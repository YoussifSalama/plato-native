"use client"

import { ExtensionProgressNav } from "@/components/extension-progress"
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, BellRing, Briefcase, ChevronRight, FileText, GraduationCap, HelpCircle, Home, MessageCircle, PanelLeftClose, PanelLeftOpen, Puzzle, User } from "lucide-react"
import { cn } from "cn"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip, TokensNav } from "@/components/plato-tokens"

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/insights", label: "Job alerts", icon: BellRing },
  { href: "/career", label: "Career", icon: GraduationCap },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/extension", label: "Extension", icon: Puzzle },
  { href: "/profile", label: "Profile", icon: User },
] as const

function initials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

const COLLAPSED_KEY = "plato.sidebarCollapsed"

// Collapsed state lives in localStorage; useSyncExternalStore keeps SSR
// (always expanded) and the client in agreement without a hydration mismatch.
const listeners = new Set<() => void>()
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1"
  } catch {
    return false
  }
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const writeCollapsed = (v: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0")
  } catch {}
  listeners.forEach((l) => l())
}

// Post-login frame: white sidebar, violet brand, lavender active state.
// Expanded shows icon + label; collapsed is an icon rail with tooltips.
function AppShell({ children }: { children: ReactNode }) {
  return (
    <NotificationsProvider>
      <Frame>{children}</Frame>
    </NotificationsProvider>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { unread, needsYou } = useNotifications()
  // Live counts on the nav: unread notifications, applications waiting on you.
  const badge: Record<string, number> = { "/notifications": unread, "/applications": needsYou }
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => router.replace("/login"))
  }, [router])

  const toggle = () => writeCollapsed(!collapsed)

  const item = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-sm text-sm font-medium transition-colors",
      collapsed ? "size-11 justify-center" : "px-3.5 py-2.5",
      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-text-secondary hover:bg-primary-tint hover:text-foreground",
    )

  return (
    <div className={cn("theme-app grid min-h-dvh grid-cols-1 bg-background text-foreground transition-[grid-template-columns] duration-300", collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[264px_1fr]")}>
      <aside className={cn("hidden flex-col justify-between border-r border-sidebar-border bg-sidebar py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh", collapsed ? "px-3" : "px-4")}>
        <div className="flex flex-col gap-7">
          <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between px-1.5")}>
            <Link href="/jobs" data-ai="nav.logo" className="flex items-center gap-2.5" title="Plato">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-sm bg-primary text-base font-bold text-primary-foreground">P</span>
              {!collapsed && <span className="text-xl font-bold text-foreground">Plato</span>}
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand" : "Collapse"}
              className="flex size-8 items-center justify-center rounded-sm border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>

          <nav className={cn("flex flex-col gap-1", collapsed && "items-center")}>
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <Link key={href} href={href} data-ai={`nav.${label.toLowerCase()}`} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={item(active)}>
                  <span className="relative shrink-0">
                    <Icon className="size-[18px]" />
                    {collapsed && badge[href] > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />}
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge[href] > 0 && (
                    <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold", href === "/applications" ? "bg-warning-soft text-warning" : "bg-destructive text-white")}>{badge[href] > 9 ? "9+" : badge[href]}</span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className={cn("flex flex-col gap-3.5", collapsed && "items-center")}>
          <ExtensionProgressNav collapsed={collapsed} itemClass={item(false)} />
          <TokensNav collapsed={collapsed} itemClass={item(pathname.startsWith("/tokens"))} />
          <a href="#" title={collapsed ? "Help & Support" : undefined} className={cn(item(false), !collapsed && "pl-1.5")}>
            <HelpCircle className="size-[17px] shrink-0" />
            {!collapsed && "Help & Support"}
          </a>
          {user && (
            <Link href="/profile" title={collapsed ? titleCase(user.full_name) : undefined} className={cn("flex items-center gap-2.5 border-t border-sidebar-border pt-4 pb-2", collapsed ? "w-full justify-center" : "px-1.5")}>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{initials(user.full_name)}</span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{titleCase(user.full_name)}</span>
                    <span className="block text-xs text-text-tertiary">View profile</span>
                  </span>
                  <ChevronRight className="size-3.5 text-lavender" />
                </>
              )}
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Compact nav for < lg, where the sidebar is hidden. */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-sm font-bold text-primary-foreground">P</span>
          </Link>
          <nav className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  data-ai={`nav.${label.toLowerCase()}`}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-text-secondary")}
                >
                  <Icon className="size-3.5" />
                  {label}
                  {badge[href] > 0 && <span className="size-1.5 rounded-full bg-destructive" />}
                </Link>
              )
            })}
          </nav>
          <TokensChip />
        </div>
        {children}
      </div>
    </div>
  )
}

export { AppShell }
