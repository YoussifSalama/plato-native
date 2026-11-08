"use client"

import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Briefcase, Building2, Coins, GraduationCap, Home, Puzzle, Send, Sparkles, User, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getApplyReadiness } from "@/lib/jobs/api"
import { getExtensionProgress } from "@/lib/extension/api"
import { getInsights } from "@/lib/insights/api"
import { getPreferences } from "@/lib/preferences/api"
import { listDocuments } from "@/lib/documents/api"
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip } from "@/components/plato-tokens"
import { VerifyEmailBanner } from "@/components/verify-email-banner"
import { PlatoMark } from "@/components/plato-orb"
import { PlatoStatusPill } from "@/components/extension-progress"
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

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/following" && path.startsWith("/insights")))

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

// The command bar opens the native Plato chat on this page. Pages with their own
// assistant (a search thread) do not take "plato:ask", so the palette opens instead.
export function openPlato(text = "") {
  const taken = !window.dispatchEvent(new CustomEvent("plato:ask", { cancelable: true, detail: { text } }))
  if (!taken) window.dispatchEvent(new CustomEvent("plato:palette", { detail: { text } }))
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <NotificationsProvider>
      <Frame>{children}</Frame>
    </NotificationsProvider>
  )
}

// How far the seeker is from Plato applying on its own: profile details, a linked
// browser, job alerts. Read from the same checks as the next-steps guide.
// "Profile strength" in the owner's screens: the share of five checks that let Plato apply
// without stopping (the server's readiness check, a portfolio link, a second document,
// a linked browser, something followed). The next missing one is the hint.
function useSetup() {
  const [s, setS] = useState<{ done: number; total: number; next: { label: string; href: string } | null } | null>(null)
  useEffect(() => {
    Promise.allSettled([getApplyReadiness(), getExtensionProgress(), getInsights(), getPreferences(), listDocuments()]).then(([r, e, i, p, d]) => {
      const steps = [
        { ok: r.status === "fulfilled" && r.value.ready, label: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()} so Plato never stops to ask.` : "Finish your details.", href: "/profile?tab=answers" },
        { ok: p.status === "fulfilled" && !!p.value.portfolio_url, label: "Add a portfolio link so Plato can paste it into forms.", href: "/onboarding?step=2" },
        { ok: d.status === "fulfilled" && d.value.length > 1, label: "Add a second document, like a certificate.", href: "/onboarding?step=1" },
        { ok: e.status === "fulfilled" && e.value.linked, label: "Link the browser extension.", href: "/extension" },
        { ok: i.status === "fulfilled" && i.value.alerts.length > 0, label: "Follow a company you'd like to work for.", href: "/following" },
      ]
      const open = steps.find((x) => !x.ok)
      setS({ done: steps.filter((x) => x.ok).length, total: steps.length, next: open ? { label: open.label, href: open.href } : null })
    })
  }, [])
  return s
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { needsYou } = useNotifications()
  const [user, setUser] = useState<AuthUser | null>(null)
  const setup = useSetup()

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => router.replace("/login"))
  }, [router])

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
        className={cn(
          "flex items-center gap-3 rounded-2xl border transition-all duration-200",
          size === "main" ? "px-3.5 py-2.5 text-[15px]" : "px-3.5 py-2 text-sm",
          active ? "border-border bg-card font-semibold text-primary shadow-[0_1px_2px_rgb(14_27_44/0.05)]" : "border-transparent font-medium text-foreground hover:bg-card",
        )}
      >
        <it.icon className="size-[18px] shrink-0" />
        <span className="flex-1 truncate">{it.label}</span>
        {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>}
      </Link>
    )
  }

  const strength = setup ? Math.round((setup.done / setup.total) * 100) : null

  return (
    <div className="theme-app grid min-h-dvh grid-cols-1 text-foreground lg:grid-cols-[248px_1fr]">
      {/* Sidebar (owner screens 05-12): the job hunt, the account, profile strength. */}
      <aside data-tour="sidebar" className="hidden border-r bg-[#f9fbfd] px-3.5 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-7">
        <Link href="/" data-ai="nav.logo" className="flex items-center gap-3 px-2" title="Plato">
          <PlatoMark size={36} />
          <span className="text-[17px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
        </Link>
        <nav data-tour="sidebar-nav" aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((it) => link(it, "main"))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <nav aria-label="Account" className="flex flex-col gap-0.5">
            {ACCOUNT.map((it) => link(it, "sub"))}
          </nav>
          {setup && (
            <Link href={setup.next?.href ?? "/profile"} data-tour="status-card" className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5 transition-colors hover:border-primary-line">
              <span className="flex items-center justify-between text-sm">
                <b>Profile strength</b>
                <b className="text-primary tabular-nums">{strength}%</b>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-divider">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${strength}%` }} />
              </span>
              <span className="text-xs text-text-secondary">{setup.next ? setup.next.label : "Plato has everything it needs to apply for you."}</span>
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar: tell Plato what to do, what it is doing, tokens, notifications, you. */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2.5 border-b bg-background px-3 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="lg:hidden" aria-label="Plato home">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
          </Link>
          <button type="button" data-ai="nav.command-bar" onClick={() => openPlato()} className="surface-panel flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-sm text-text-secondary transition-colors hover:border-primary-line lg:max-w-[640px]">
            <Sparkles className="size-[18px] shrink-0 text-primary" />
            <span className="truncate">
              Tell Plato what to do: <span className="text-text-tertiary">“{promptFor(pathname)}”</span>
            </span>
            <kbd className="ml-auto hidden rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-text-secondary sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <PlatoStatusPill />
            <span className="hidden md:block">
              <TokensChip />
            </span>
            <NotificationBell />
            {user && (
              <Link href="/profile" title={titleCase(user.full_name)} aria-label="Your profile" className="flex size-11 items-center justify-center rounded-full bg-foreground text-sm font-bold text-white">
                {initials(user.full_name)}
              </Link>
            )}
          </div>
          {/* Compact nav for < lg, where the sidebar is hidden. */}
          <nav aria-label="Main" className="scroll-thin surface-panel flex w-full gap-1 overflow-x-auto rounded-2xl p-1 lg:hidden">
            {[...NAV, ...ACCOUNT].map(({ href, label, icon: Icon }) => {
              const active = isActive(href, pathname)
              return (
                <Link key={href} href={href} data-ai={`nav.${label.toLowerCase()}`} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium", active ? "bg-primary-soft font-semibold text-primary" : "text-text-secondary")}>
                  <Icon className="size-3.5" />
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
