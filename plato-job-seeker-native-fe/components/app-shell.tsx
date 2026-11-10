"use client"

import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Briefcase, Building2, Coins, GraduationCap, Home, PanelLeftClose, PanelLeftOpen, Puzzle, Send, Sparkles, User, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getApplyReadiness, getDiscoveryStats } from "@/lib/jobs/api"
import { getExtensionProgress } from "@/lib/extension/api"
import { getInsights } from "@/lib/insights/api"
import { getPreferences } from "@/lib/preferences/api"
import { listDocuments } from "@/lib/documents/api"
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip } from "@/components/plato-tokens"
import { VerifyEmailBanner } from "@/components/verify-email-banner"
import { PlatoMark } from "@/components/plato-orb"
import { PlatoStatusPill } from "@/components/extension-progress"
import { ExtensionAutoLink } from "@/components/extension-auto-link"
import { InfoTip } from "@/components/info-tip"
import { NotificationBell } from "@/app/(app)/jobs/components/notification-bell"

type NavItem = { href: string; label: string; icon: LucideIcon }
// The job hunt, in order (SPEC §5). The account pages sit at the bottom.
const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Send },
  { href: "/following", label: "Following", icon: Building2 },
  { href: "/career", label: "Career", icon: GraduationCap },
]
const ACCOUNT: NavItem[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/tokens", label: "Plan & credits", icon: Coins },
  { href: "/extension", label: "Extension", icon: Puzzle },
]

// What the command bar suggests on each page, so the seeker sees Plato can act right here.
const PROMPTS: [string, string][] = [
  ["/jobs", "Tailor my resume for my best match"],
  ["/applications", "Follow up on applications older than 2 weeks"],
  ["/following", "Follow companies hiring in my field"],
  ["/career", "Practice an interview for my next application"],
  ["/profile", "Make my resume bullets stronger"],
  ["/tokens", "How many tokens does applying use?"],
  ["/extension", "Is my browser connected?"],
]
const promptFor = (path: string) => PROMPTS.find(([p]) => path.startsWith(p))?.[1] ?? "Find remote jobs that fit my CV"

// Tooltip for the collapsed rail: sits to the right of the icon, shows on hover or keyboard focus.
function RailTip({ label }: { label: string }) {
  return (
    <span role="tooltip" className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-x-1 -translate-y-1/2 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-float transition-[opacity,translate] duration-150 group-hover/tip:translate-x-0 group-hover/tip:opacity-100 group-focus-visible/tip:translate-x-0 group-focus-visible/tip:opacity-100">
      {label}
    </span>
  )
}

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/following" && path.startsWith("/insights")))

function initials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 1) // one letter, as in the owner's top bar
    .map((p) => p[0]?.toUpperCase())
    .join("")
}
function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

// The command bar opens the native Plato chat on this page. Pages with their own
// assistant (a search thread) do not take "plato:ask", so the palette opens instead.
export function openPlato(text = "") {
  const taken = !window.dispatchEvent(new CustomEvent("plato:ask", { cancelable: true, detail: { text } }))
  if (!taken) window.dispatchEvent(new CustomEvent("plato:palette", { detail: { text } }))
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <NotificationsProvider>
      <ExtensionAutoLink />
      <Frame>{children}</Frame>
    </NotificationsProvider>
  )
}

// How far the seeker is from Plato applying on its own: profile details, a linked
// browser, job alerts. Read from the same checks as the next-steps guide.
// "Profile strength" in the owner's screens: the share of five checks that let Plato apply
// without stopping (the server's readiness check, a portfolio link, a second document,
// a linked browser, something followed). The next missing one is the hint.
export function useProfileStrength() {
  const [s, setS] = useState<{ done: number; total: number; next: { label: string; short: string; href: string } | null } | null>(null)
  useEffect(() => {
    Promise.allSettled([getApplyReadiness(), getExtensionProgress(), getInsights(), getPreferences(), listDocuments()]).then(([r, e, i, p, d]) => {
      const steps = [
        { ok: r.status === "fulfilled" && r.value.ready, short: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()}` : "Finish your details", label: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()} so Plato never stops to ask.` : "Finish your details.", href: "/profile?tab=answers" },
        { ok: p.status === "fulfilled" && !!p.value.portfolio_url, short: "Add a portfolio link", label: "Add a portfolio link so Plato can paste it into forms.", href: "/onboarding?step=2" },
        { ok: d.status === "fulfilled" && d.value.length > 1, short: "Add a second document", label: "Add a second document, like a certificate.", href: "/onboarding?step=1" },
        { ok: e.status === "fulfilled" && e.value.linked, short: "Link the extension", label: "Link the browser extension.", href: "/extension" },
        { ok: i.status === "fulfilled" && i.value.alerts.length > 0, short: "Follow a company", label: "Follow a company you'd like to work for.", href: "/following" },
      ]
      const open = steps.find((x) => !x.ok)
      setS({ done: steps.filter((x) => x.ok).length, total: steps.length, next: open ? { label: open.label, short: open.short, href: open.href } : null })
    })
  }, [])
  return s
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { needsYou } = useNotifications()
  const [user, setUser] = useState<AuthUser | null>(null)
  const setup = useProfileStrength()
  // "18 new" beside Jobs, as in the owner's sidebar: matches found this week.
  const [fresh, setFresh] = useState(0)
  useEffect(() => {
    getDiscoveryStats()
      .then((st) => setFresh(st.newThisWeek ?? 0))
      .catch(() => setFresh(0))
  }, [])

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => router.replace("/login"))
  }, [router])

  // Collapsed = icon rail. Remembered per browser (a personal layout choice, not account data).
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration; the server can't know it
      setSaved(localStorage.getItem("plato.sidebar") === "collapsed")
    } catch {}
  }, [])
  // Jobs has its own searches column, so the sidebar starts as a rail there. A toggle on that page
  // lasts until you leave it; elsewhere the toggle is remembered.
  const autoRail = pathname.startsWith("/jobs")
  const [pageToggle, setPageToggle] = useState<{ path: string; collapsed: boolean } | null>(null)
  const collapsed = pageToggle?.path === pathname ? pageToggle.collapsed : autoRail || saved
  const toggleSidebar = () => {
    const next = !collapsed
    setPageToggle({ path: pathname, collapsed: next })
    if (autoRail) return
    setSaved(next)
    try {
      localStorage.setItem("plato.sidebar", next ? "collapsed" : "open")
    } catch {}
  }

  const link = (it: NavItem, size: "main" | "sub") => {
    const active = isActive(it.href, pathname)
    const count = it.href === "/applications" ? needsYou : 0
    return (
      <Link
        key={it.href}
        href={it.href}
        data-ai={`nav.${it.label.toLowerCase()}`}
        data-tour={`nav-${it.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? it.label : undefined}
        className={cn(
          "group/nav group/tip relative flex items-center gap-3 rounded-xl px-3 transition-[background-color,color] duration-200",
          collapsed && "justify-center px-0",
          size === "main" ? "h-10 text-[14.5px]" : "h-9 text-[13.5px]",
          // Active: a soft brand-tinted pill, cobalt text and icon. One colour for every section.
          active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-text-secondary hover:bg-foreground/[0.05] hover:text-foreground",
        )}
      >
        <it.icon className={cn("shrink-0 transition-[color,transform] duration-200", size === "main" ? "size-[18px]" : "size-4", active ? "text-primary" : "text-text-tertiary group-hover/nav:text-primary")} strokeWidth={active ? 2.2 : 1.8} />
        {collapsed && <RailTip label={count > 0 ? `${it.label} · ${count} need you` : it.label} />}
        {collapsed ? (
          (count > 0 || (it.href === "/jobs" && fresh > 0)) && <span className={cn("absolute top-1.5 right-2 size-2 rounded-full ring-2 ring-background", count > 0 ? "bg-warning" : "bg-primary")} />
        ) : (
          <span className="flex-1 truncate">{it.label}</span>
        )}
        {!collapsed && count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-warning-line bg-warning-soft px-1 text-[11px] font-semibold text-warning-ink tabular-nums">{count > 9 ? "9+" : count}</span>}
        {!collapsed && it.href === "/jobs" && fresh > 0 && <span className="flex h-5 items-center rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary tabular-nums">{fresh} new</span>}
      </Link>
    )
  }

  const strength = setup ? Math.round((setup.done / setup.total) * 100) : null

  return (
    <div className={cn("theme-app grid min-h-dvh grid-cols-1 text-foreground lg:transition-[grid-template-columns] lg:duration-200", collapsed ? "lg:grid-cols-[68px_1fr]" : "lg:grid-cols-[232px_1fr]")}>
      {/* Sidebar (owner screens 05-12): the job hunt, the account, profile strength. */}
      <aside data-tour="sidebar" className="hidden border-r lg:z-40 bg-linear-to-b from-white to-[color-mix(in_oklch,var(--background),white_30%)] px-3 pb-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-5">
        {/* Same height as the top bar so the two borders line up. */}
        <Link href="/" data-ai="nav.logo" className={cn("flex h-16 shrink-0 items-center gap-2.5 px-2.5", collapsed && "justify-center px-0")} title="Plato">
          <PlatoMark size={30} />
          {!collapsed && <span className="text-[15px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>}
        </Link>
        <nav data-tour="sidebar-nav" aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((it) => link(it, "main"))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <nav aria-label="Account" className="flex flex-col gap-0.5 border-t border-divider pt-3">
            {ACCOUNT.map((it) => link(it, "sub"))}
            <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cn("group/tip relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-foreground/[0.04] hover:text-foreground", collapsed && "justify-center px-0")}>
              {collapsed ? <PanelLeftOpen className="size-4 shrink-0 text-text-tertiary" strokeWidth={1.8} /> : <PanelLeftClose className="size-4 shrink-0 text-text-tertiary" strokeWidth={1.8} />}
              {collapsed ? <RailTip label="Expand sidebar" /> : "Collapse"}
            </button>
          </nav>
          {setup && collapsed && (
            <Link href={setup.next?.href ?? "/profile"} aria-label={`Profile strength ${strength}%`} className="group/tip relative mx-auto flex size-10 items-center justify-center rounded-full text-[11px] font-bold text-primary tabular-nums" style={{ background: `conic-gradient(var(--primary) ${strength}%, var(--primary-soft) 0)` }}>
              <span className="flex size-8 items-center justify-center rounded-full bg-card">{strength}</span>
              <RailTip label={`Profile strength ${strength}%`} />
            </Link>
          )}
          {setup && !collapsed && (
            // The whole card opens the next step (a stretched link), with the (i) sitting above it.
            <div data-tour="status-card" className="group/ps relative flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-card transition-colors hover:border-primary-line">
              <span className="flex items-center justify-between text-[13px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <Link href={setup.next?.href ?? "/profile"} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring/30">
                    Profile strength
                  </Link>
                  <InfoTip text="How many of five checks are done so Plato can apply without stopping to ask: your application details, a portfolio link, a second document, a linked browser and a followed company." label="What profile strength means" side="right" className="relative z-10" />
                </span>
                <span className="text-primary tabular-nums">{strength}%</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-primary-soft">
                <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${strength}%` }} />
              </span>
              <span className="line-clamp-2 text-xs leading-snug text-text-secondary group-hover/ps:text-foreground">{setup.next ? setup.next.label : "Plato has everything it needs to apply for you."}</span>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar: tell Plato what to do, what it is doing, tokens, notifications, you. */}
        {/* Every control in the bar is 40px tall: command bar, status and token pills, bell, avatar. */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:px-8 lg:py-0">
          <Link href="/" className="shrink-0 lg:hidden" aria-label="Plato home">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
          </Link>
          <button type="button" data-ai="nav.command-bar" onClick={() => openPlato()} className="surface-panel flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-left text-sm text-text-secondary transition-colors hover:border-primary-line lg:max-w-[600px]">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="truncate">
              <span className="sm:hidden">Ask Plato…</span>
              <span className="hidden sm:inline">
                Tell Plato what to do: <span className="text-text-tertiary">“{promptFor(pathname)}”</span>
              </span>
            </span>
            <kbd className="ml-auto hidden h-5 shrink-0 items-center rounded border bg-muted/60 px-1.5 font-sans text-[11px] font-medium whitespace-nowrap text-text-tertiary md:flex">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PlatoStatusPill />
            <span className="hidden md:block">
              <TokensChip />
            </span>
            <NotificationBell />
            {user && (
              <Link href="/profile" title={titleCase(user.full_name)} aria-label="Your profile" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white ring-2 ring-background transition-shadow hover:ring-primary-line">
                {initials(user.full_name)}
              </Link>
            )}
          </div>
          {/* Compact nav for < lg, where the sidebar is hidden. */}
          <nav aria-label="Main" className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:hidden">
            {[...NAV, ...ACCOUNT].map(({ href, label, icon: Icon }) => {
              const active = isActive(href, pathname)
              return (
                <Link key={href} href={href} data-ai={`nav.${label.toLowerCase()}`} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", active ? "border-primary-line bg-primary-soft font-semibold text-primary" : "border-transparent text-text-secondary hover:bg-foreground/[0.04]")}>
                  <Icon className="size-3.5" strokeWidth={active ? 2.1 : 1.8} />
                  {label}
                  {href === "/applications" && needsYou > 0 && <span className="size-1.5 rounded-full bg-warning" />}
                </Link>
              )
            })}
          </nav>
        </header>
        {user && user.email_verified === false && <VerifyEmailBanner email={user.email} />}
        {children}
      </div>
    </div>
  )
}

export { AppShell }
