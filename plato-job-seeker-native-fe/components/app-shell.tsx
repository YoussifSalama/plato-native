"use client"

import { ExtensionProgressNav } from "@/components/extension-progress"
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, BellRing, Briefcase, FileText, GraduationCap, HelpCircle, Home, MessageCircle, PanelLeftClose, PanelLeftOpen, Puzzle, User, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip, TokensNav } from "@/components/plato-tokens"
import { VerifyEmailBanner } from "@/components/verify-email-banner"
import { PlatoMark } from "@/components/plato-orb"
import { SpatialBackdrop } from "@/components/spatial-backdrop"

type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean }
// Grouped the way the job hunt goes: see where you stand, find and apply,
// grow, then the account. Page headers use the same section names.
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: "/", label: "Home", icon: Home }] },
  {
    label: "Find & apply",
    items: [
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/applications", label: "Applications", icon: FileText },
      { href: "/insights", label: "Job alerts", icon: BellRing },
    ],
  },
  { label: "Grow", items: [{ href: "/career", label: "Career", icon: GraduationCap }] },
  {
    label: "Account",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/extension", label: "Extension", icon: Puzzle },
      { href: "/profile", label: "Profile", icon: User },
      { href: "/messages", label: "Messages", icon: MessageCircle, soon: true },
    ],
  },
]
const NAV = NAV_GROUPS.flatMap((g) => g.items)

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

// Post-login frame: white sidebar, cobalt brand from the logo, soft-blue active state.
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
      "flex items-center gap-3 rounded-2xl text-sm transition-all duration-200",
      collapsed ? "size-11 justify-center" : "px-3.5 py-2.5",
      active
        ? "bg-white font-semibold text-primary shadow-[0_1px_2px_rgb(0_58_110/0.06),0_8px_22px_-10px_rgb(0_58_110/0.3)]"
        : "font-medium text-text-secondary hover:bg-white/55 hover:text-foreground",
    )

  return (
    <div className={cn("theme-app glass-scope grid min-h-dvh grid-cols-1 text-foreground transition-[grid-template-columns] duration-300", collapsed ? "lg:grid-cols-[104px_1fr]" : "lg:grid-cols-[284px_1fr]")}>
      <SpatialBackdrop />
      {/* Floating glass sidebar: brand, navigation, a status card, the account. */}
      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:py-4 lg:pl-4">
        <aside data-tour="sidebar" className={cn("glass-panel flex h-full flex-col justify-between rounded-[28px] py-5", collapsed ? "px-3" : "px-3.5")}>
          <div className="flex min-h-0 flex-col gap-6">
            <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between gap-2 pr-0.5 pl-1.5")}>
              <Link href="/" data-ai="nav.logo" className="flex min-w-0 items-center gap-3" title="Plato">
                <PlatoMark size={38} />
                {!collapsed && (
                  <span className="min-w-0">
                    <span className="block text-[17px] leading-tight font-extrabold tracking-tight text-foreground">Plato</span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">Your AI job hunter</span>
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                title={collapsed ? "Expand" : "Collapse"}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-white/70 hover:text-foreground"
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </div>

            <nav data-tour="sidebar-nav" className={cn("scroll-thin -mr-1 flex min-h-0 flex-col gap-4 overflow-y-auto pr-1", collapsed && "items-center")}>
              {NAV_GROUPS.map((g) => (
                <div key={g.label ?? "top"} className={cn("flex flex-col gap-1", collapsed && "items-center")}>
                  {g.label &&
                    (collapsed ? (
                      <span className="mx-auto mb-1 h-px w-6 bg-foreground/10" aria-hidden />
                    ) : (
                      <span className="px-3.5 pb-1 font-mono text-[10.5px] font-medium tracking-[0.08em] text-text-tertiary uppercase">{g.label}</span>
                    ))}
                  {g.items.map((it) => {
                    const { href, label, icon: Icon } = it
                    const soon = !!it.soon
                    const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
                    return (
                      <Link key={href} href={href} data-ai={`nav.${label.toLowerCase()}`} data-tour={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`} aria-current={active ? "page" : undefined} title={collapsed ? (soon ? `${label} (coming soon)` : label) : undefined} className={cn(item(active), soon && !active && "opacity-70")}>
                        <span className="relative shrink-0">
                          <Icon className="size-[18px]" />
                          {collapsed && badge[href] > 0 && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />}
                        </span>
                        {!collapsed && <span className="flex-1 truncate">{label}</span>}
                        {!collapsed && soon && <span className="rounded-full bg-foreground/6 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">Soon</span>}
                        {!collapsed && badge[href] > 0 && (
                          <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold", href === "/applications" ? "bg-warning-soft text-warning" : "bg-destructive text-white")}>{badge[href] > 9 ? "9+" : badge[href]}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>
          </div>

          <div className={cn("flex flex-col gap-3", collapsed && "items-center")}>
            {/* Status card: what is running for the seeker right now. */}
            {collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <ExtensionProgressNav collapsed itemClass={item(false)} />
                <TokensNav collapsed itemClass={item(pathname.startsWith("/tokens"))} />
              </div>
            ) : (
              <div data-tour="status-card" className="flex flex-col gap-0.5 rounded-2xl border border-white/80 bg-white/70 p-1.5 shadow-[0_8px_24px_-16px_rgb(0_58_110/0.35)]">
                <ExtensionProgressNav collapsed={false} variant="row" itemClass="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors hover:bg-primary-tint" />
                <TokensNav collapsed={false} variant="row" itemClass={cn("flex rounded-xl px-2.5 py-2 text-[13px] transition-colors hover:bg-primary-tint", pathname.startsWith("/tokens") && "bg-primary-tint")} />
              </div>
            )}
            {user && (
              <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "pl-1")}>
                <Link href="/profile" title={collapsed ? titleCase(user.full_name) : undefined} className={cn("group flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-1.5 transition-colors hover:bg-white/55", collapsed && "justify-center")}>
                  <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgb(0_91_167/0.6)]">{initials(user.full_name)}</span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{titleCase(user.full_name)}</span>
                      <span className="block truncate text-xs text-text-tertiary">Job seeker · View profile</span>
                    </span>
                  )}
                </Link>
                <a href="#" title="Help & Support" aria-label="Help & Support" className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-white/70 hover:text-foreground">
                  <HelpCircle className="size-[17px]" />
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        {/* Compact nav for < lg, where the sidebar is hidden. */}
        <div className="glass-panel sticky top-2 z-30 mx-2 mt-2 flex items-center gap-3 rounded-2xl px-3 py-2 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Plato" width={28} height={28} className="size-7" />
          </Link>
          <nav className="scroll-thin flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  data-ai={`nav.${label.toLowerCase()}`}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium", active ? "bg-white font-semibold text-primary shadow-sm" : "text-text-secondary")}
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
        {user && user.email_verified === false && <VerifyEmailBanner email={user.email} />}
        {children}
      </div>
    </div>
  )
}

export { AppShell }
