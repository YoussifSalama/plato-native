"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Briefcase, Building2, Coins, GraduationCap, Home, LogOut, PanelLeftClose, PanelLeftOpen, Puzzle, Search, Send, Settings, Sparkles, User, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { AxiosError } from "axios"
import { toLogin } from "@/lib/api-client"
import { getMe, logout, type AuthUser } from "@/lib/auth/api"
import { getApplyReadiness, getDiscoveryStats } from "@/lib/jobs/api"
import { getExtensionProgress } from "@/lib/extension/api"
import { getInsights } from "@/lib/insights/api"
import { getPreferences } from "@/lib/preferences/api"
import { listDocuments } from "@/lib/documents/api"
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip, useTokens } from "@/components/plato-tokens"
import { formatTokens } from "@/lib/credits/api"
import { BRAND_PANEL } from "@/lib/brand"
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
  { href: "/settings", label: "Settings", icon: Settings },
]

// The phone bar: four tabs around the raised New search; Following and the account pages are in the avatar menu.
const TABS: NavItem[] = [NAV[0]!, NAV[1]!, { ...NAV[2]!, label: "Applied" }, NAV[4]!]

// What the command bar suggests on each page, so the seeker sees Plato can act right here.
const PROMPTS: [string, string][] = [
  ["/jobs", "Tailor my resume for my best match"],
  ["/applications", "Follow up on applications older than 2 weeks"],
  ["/following", "Follow companies hiring in my field"],
  ["/career", "Practice an interview for my next application"],
  ["/profile", "Make my resume bullets stronger"],
  ["/tokens", "How many tokens does applying use?"],
  ["/extension", "Is my browser connected?"],
  ["/settings", "How do I download my data?"],
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
  const [s, setS] = useState<{ done: number; total: number; linked: boolean; next: { label: string; short: string; href: string } | null } | null>(null)
  useEffect(() => {
    Promise.allSettled([getApplyReadiness(), getExtensionProgress(), getInsights(), getPreferences(), listDocuments()]).then(([r, e, i, p, d]) => {
      const steps = [
        { ok: r.status === "fulfilled" && r.value.ready, short: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()}` : "Finish your details", label: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()} so Plato never stops to ask.` : "Finish your details.", href: "/profile?tab=answers" },
        { ok: p.status === "fulfilled" && !!p.value.portfolio_url, short: "Add a portfolio link", label: "Add a portfolio link so Plato can paste it into forms.", href: "/profile?tab=experience&edit=links" },
        { ok: d.status === "fulfilled" && d.value.length > 1, short: "Add a second document", label: "Add a second document, like a certificate.", href: "/profile?tab=documents" },
        { ok: e.status === "fulfilled" && e.value.linked, short: "Link the extension", label: "Link the browser extension.", href: "/extension" },
        { ok: i.status === "fulfilled" && i.value.alerts.length > 0, short: "Follow a company", label: "Follow a company you'd like to work for.", href: "/following" },
      ]
      const open = steps.find((x) => !x.ok)
      setS({ done: steps.filter((x) => x.ok).length, total: steps.length, linked: e.status === "fulfilled" && e.value.linked, next: open ? { label: open.label, short: open.short, href: open.href } : null })
    })
  }, [])
  return s
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { needsYou } = useNotifications()
  const [user, setUser] = useState<AuthUser | null>(null)
  const setup = useProfileStrength()
  const tokens = useTokens()
  // "18 new" beside Jobs, as in the owner's sidebar: matches found this week.
  const [fresh, setFresh] = useState(0)
  useEffect(() => {
    getDiscoveryStats()
      .then((st) => setFresh(st.newThisWeek ?? 0))
      .catch(() => setFresh(0))
  }, [])

  useEffect(() => {
    // Only a dead session goes to login; a network blip or a 500 leaves you on the page.
    getMe()
      .then(setUser)
      .catch((e) => e instanceof AxiosError && e.response?.status === 401 && toLogin())
  }, [])

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
          "group/nav group/tip relative flex items-center gap-3 rounded-xl px-3 transition-[background-color,color,box-shadow] duration-200",
          collapsed && "justify-center px-0",
          size === "main" ? "h-10 text-[14.5px]" : "h-9 text-[13.5px]",
          // The page you're on is a cobalt-tinted pill; the rest light up on hover.
          active ? "bg-primary-soft font-bold text-primary" : "font-medium text-text-secondary hover:bg-primary-tint hover:text-foreground",
        )}
      >
        <it.icon className={cn("shrink-0 transition-transform duration-200 group-hover/nav:scale-110", size === "main" ? "size-[18px]" : "size-4", active ? "text-primary" : "text-text-tertiary group-hover/nav:text-primary")} strokeWidth={active ? 2.2 : 1.8} />
        {collapsed && <RailTip label={count > 0 ? `${it.label} · ${count} need you` : it.label} />}
        {collapsed ? (
          (count > 0 || (it.href === "/jobs" && fresh > 0)) && <span className={cn("absolute top-1.5 right-2.5 size-2 rounded-full ring-2 ring-card", count > 0 ? "bg-amber-400" : "bg-primary")} />
        ) : (
          <span className="flex-1 truncate">{it.label}</span>
        )}
        {/* Colour only where it means something: amber = waiting on you. */}
        {!collapsed && count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-[#3a2400] tabular-nums">{count > 9 ? "9+" : count}</span>}
        {!collapsed && it.href === "/jobs" && fresh > 0 && <span className={cn("flex h-5 items-center rounded-full px-2 text-[11px] font-bold tabular-nums", active ? "bg-card text-primary" : "bg-primary-soft text-primary")}>{fresh} new</span>}
      </Link>
    )
  }

  const strength = setup ? Math.round((setup.done / setup.total) * 100) : null

  return (
    <div className={cn("theme-app grid min-h-dvh grid-cols-1 text-foreground lg:transition-[grid-template-columns] lg:duration-200", collapsed ? "lg:grid-cols-[92px_1fr]" : "lg:grid-cols-[264px_1fr]")}>
      {/* Sidebar: a floating panel on the brand glow (shared with Home's header and the phone bar). */}
      <aside data-tour="sidebar" className="hidden lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-dvh lg:p-3">
        <div className={cn(BRAND_PANEL, "relative flex w-full flex-col gap-4 rounded-[26px] px-3 py-4 text-foreground shadow-[0_20px_44px_-26px_rgb(14_27_44/0.28)]")}>
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[26px] opacity-[0.06] [background-image:radial-gradient(var(--primary)_1px,transparent_1px)] [background-size:18px_18px]" />
          <Link href="/" data-ai="nav.logo" className={cn("relative flex shrink-0 items-center gap-2.5 px-1.5", collapsed && "justify-center px-0")} title="Plato Job Seeker">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-card ring-1 ring-primary-line/70">
              <PlatoMark size={26} />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="text-[15px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
                <span className="mt-1 text-[9.5px] font-bold tracking-[0.3em] text-text-secondary">JOB SEEKER</span>
              </span>
            )}
          </Link>
          {/* The action used most, reachable from every page. */}
          <Link href="/jobs/new" data-ai="nav.new-search" aria-label={collapsed ? "New search" : undefined} className={cn("group/tip relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-[14.5px] font-bold text-primary-foreground shadow-brand transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-primary-hover", collapsed && "mx-auto w-11")}>
            <Search className="size-[18px]" strokeWidth={2.2} />
            {collapsed ? <RailTip label="New search" /> : "New search"}
          </Link>
          <nav data-tour="sidebar-nav" aria-label="Main" className="relative flex flex-col gap-1">
            {NAV.map((it) => link(it, "main"))}
          </nav>
          {!collapsed && <p className="relative -mb-2 px-3 text-[10px] font-bold tracking-[0.24em] text-text-tertiary">YOU</p>}
          <nav aria-label="Account" className={cn("relative flex flex-col gap-0.5", collapsed && "border-t border-divider pt-3")}>
            {ACCOUNT.map((it) => link(it, "sub"))}
          </nav>
          <div className="relative mt-auto flex flex-col gap-2">
            {setup && collapsed && (
              <Link href={setup.next?.href ?? "/profile"} aria-label={`Profile strength ${strength}%`} className="group/tip relative mx-auto flex size-11 items-center justify-center rounded-full text-[11px] font-bold text-primary tabular-nums" style={{ background: `conic-gradient(var(--primary) ${strength}%, var(--primary-soft) 0)` }}>
                <span className="flex size-9 items-center justify-center rounded-full bg-card">{strength}</span>
                <RailTip label={`Profile strength ${strength}%`} />
              </Link>
            )}
            {setup && !collapsed && (
              // Plato's state in one card: the browser link, tokens, and the next thing to add (the whole card opens it).
              <div data-tour="status-card" className="group/ps relative flex flex-col gap-2 rounded-2xl border border-primary-line/70 bg-primary-tint/70 p-3 backdrop-blur-sm transition-colors hover:bg-primary-soft/70">
                <span className="flex items-center gap-2 text-[12.5px] font-semibold">
                  <span className={cn("size-2 rounded-full", setup.linked ? "bg-success" : "bg-text-tertiary/50")} />
                  {setup.linked ? "Extension linked" : "Extension not linked"}
                </span>
                {tokens && (
                  <>
                    <span className="flex items-center justify-between text-xs text-text-secondary">
                      Tokens <b className="text-foreground tabular-nums">{formatTokens(tokens.balance)}{tokens.monthly ? ` / ${formatTokens(tokens.monthly)}` : ""}</b>
                    </span>
                    <Meter pct={tokens.monthly ? Math.min(100, (tokens.balance / tokens.monthly) * 100) : 100} />
                  </>
                )}
                <span className="flex items-center justify-between text-xs text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <Link href={setup.next?.href ?? "/profile"} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary/40">
                      Profile strength
                    </Link>
                    <InfoTip text="How many of five checks are done so Plato can apply without stopping to ask: your application details, a portfolio link, a second document, a linked browser and a followed company." label="What profile strength means" side="right" className="relative z-10 text-text-tertiary" />
                  </span>
                  <b className="text-foreground tabular-nums">{strength}%</b>
                </span>
                <Meter pct={strength ?? 0} />
                <span className="line-clamp-2 text-xs leading-snug font-semibold text-primary">{setup.next ? `${setup.next.short} →` : "Plato has everything it needs to apply for you."}</span>
              </div>
            )}
            <button type="button" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cn("group/tip relative flex h-9 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-muted hover:text-foreground", collapsed && "justify-center px-0")}>
              {collapsed ? <PanelLeftOpen className="size-4 shrink-0" strokeWidth={1.8} /> : <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.8} />}
              {collapsed ? <RailTip label="Expand sidebar" /> : "Collapse"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-24 lg:pb-0">
        {/* Top bar: tell Plato what to do, what it is doing, tokens (phones; the sidebar shows them on desktop), notifications, you. */}
        <header className="sticky top-0 z-30 flex items-center gap-2 bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:h-[76px] lg:px-8 lg:pt-4 lg:pb-2">
          <Link href="/" className="shrink-0 lg:hidden" aria-label="Plato home">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
          </Link>
          <button type="button" data-ai="nav.command-bar" onClick={() => openPlato()} className="surface-panel flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left text-sm text-text-secondary transition-colors hover:border-primary-line lg:max-w-[600px]">
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
            <span className="hidden md:block lg:hidden">
              <TokensChip />
            </span>
            <NotificationBell />
            <AccountMenu user={user} />
          </div>
        </header>
        {user && user.email_verified === false && <VerifyEmailBanner email={user.email} />}
        {children}
      </div>

      {/* Phones and tablets: a floating bar on the brand glow, with New search raised in the middle. */}
      <nav aria-label="Main" className={cn(BRAND_PANEL, "fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-[22px] px-1 shadow-[0_18px_40px_-18px_rgb(14_27_44/0.3)] lg:hidden")}>
        {TABS.map((it, i) => {
          const active = isActive(it.href, pathname)
          const tab = (
            <Link key={it.href} href={it.href} data-ai={`nav.${it.label.toLowerCase()}`} aria-current={active ? "page" : undefined} className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px] font-semibold", active ? "text-primary" : "text-text-tertiary")}>
              <it.icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
              <span className="truncate">{it.label}</span>
              {active && <span aria-hidden className="absolute -bottom-1 h-[3px] w-4 rounded-full bg-primary" />}
              {it.href === "/applications" && needsYou > 0 && <span className="absolute top-0 right-[calc(50%-18px)] grid size-4 place-items-center rounded-full bg-amber-400 text-[9px] font-extrabold text-[#3a2400]">{needsYou > 9 ? "9+" : needsYou}</span>}
            </Link>
          )
          return i === 2 ? (
            <span key="new" className="contents">
              <Link href="/jobs/new" aria-label="New search" className="-mt-7 grid size-14 shrink-0 place-items-center rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-brand">
                <Search className="size-5" strokeWidth={2.4} />
              </Link>
              {tab}
            </span>
          ) : (
            tab
          )
        })}
      </nav>
    </div>
  )
}

// A thin white meter on the brand panel.
function Meter({ pct }: { pct: number }) {
  return (
    <span className="h-1.5 overflow-hidden rounded-full bg-primary-soft">
      <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </span>
  )
}

// The avatar opens a small menu: Profile, Settings, Log out. A menu, not a bare log-out icon
// beside it, so a tap on a phone can't sign you out by mistake.
function AccountMenu({ user }: { user: AuthUser | null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])
  // A full page load after logout, so nothing of this account stays in memory. If the server
  // didn't clear the session, say so and stay: navigating away would look signed out when it isn't.
  const signOut = () => {
    setBusy(true)
    setError(null)
    logout()
      .then(() => window.location.assign("/login"))
      .catch(() => {
        setError("Couldn't log out. Check your connection and try again.")
        setBusy(false)
      })
  }
  const item = "flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Your account" title={user ? user.full_name : "Your account"} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white ring-2 ring-background transition-shadow hover:ring-primary-line">
        {user ? initials(user.full_name) : <User className="size-4" />}
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 flex w-60 flex-col gap-0.5 rounded-xl border bg-card p-1.5 shadow-float animate-in fade-in-0 zoom-in-95 duration-150">
          {user && (
            <div className="border-b border-divider px-3 pt-1.5 pb-2.5">
              <p className="truncate text-sm font-semibold text-foreground">{user.full_name}</p>
              <p className="truncate text-xs text-text-secondary">{user.email}</p>
            </div>
          )}
          {[{ ...NAV[3]!, phone: true }, ...ACCOUNT].map((it) => (
            <Link key={it.href} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={cn(item, "phone" in it && "lg:hidden")}>
              <it.icon className="size-4 text-text-tertiary" />
              {it.label}
            </Link>
          ))}
          <button role="menuitem" type="button" onClick={signOut} disabled={busy} className={cn(item, "disabled:opacity-60")}>
            <LogOut className="size-4 text-text-tertiary" />
            {busy ? "Logging out…" : "Log out"}
          </button>
          {error && (
            <p role="alert" className="px-3 pt-1 pb-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export { AppShell }
