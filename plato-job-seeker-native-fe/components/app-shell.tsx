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
import { NotificationsProvider, useNotifications } from "@/components/notifications-provider"
import { TokensChip } from "@/components/plato-tokens"
import { VerifyEmailBanner } from "@/components/verify-email-banner"
import { PlatoMark } from "@/components/plato-orb"
import { SpatialBackdrop } from "@/components/spatial-backdrop"
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
function useSetup() {
  const [s, setS] = useState<{ done: number; total: number; next: { label: string; href: string } | null } | null>(null)
  useEffect(() => {
    Promise.allSettled([getApplyReadiness(), getExtensionProgress(), getInsights()]).then(([r, e, i]) => {
      const steps = [
        { ok: r.status === "fulfilled" && r.value.ready, label: r.status === "fulfilled" && r.value.missing[0] ? `Add ${r.value.missing[0].label.toLowerCase()}` : "Finish your details", href: "/profile" },
        { ok: e.status === "fulfilled" && e.value.linked, label: "Link the browser extension", href: "/extension" },
        { ok: i.status === "fulfilled" && i.value.alerts.length > 0, label: "Follow a company or role", href: "/following" },
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
          active ? "border-white/90 bg-white font-semibold text-primary shadow-[0_1px_2px_rgb(0_58_110/0.06),0_8px_22px_-10px_rgb(0_58_110/0.3)]" : "border-transparent font-medium text-foreground/85 hover:bg-white/55 hover:text-foreground",
        )}
      >
        <it.icon className="size-[18px] shrink-0" />
        <span className="flex-1 truncate">{it.label}</span>
        {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>}
      </Link>
    )
  }

  return (
    <div className="theme-app glass-scope grid min-h-dvh grid-cols-1 text-foreground lg:grid-cols-[264px_1fr]">
      <SpatialBackdrop />
      {/* Floating glass sidebar: brand, the job hunt, the account, setup progress. */}
      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:py-4 lg:pl-4">
        <aside data-tour="sidebar" className="glass-panel flex h-full flex-col gap-6 rounded-[28px] px-3.5 py-5">
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
              <Link href={setup.next?.href ?? "/profile"} data-tour="status-card" className="flex flex-col gap-2 rounded-2xl border border-white/80 bg-white/70 p-3.5 shadow-[0_8px_24px_-16px_rgb(0_58_110/0.35)] transition-colors hover:bg-white/90">
                <span className="flex items-center justify-between text-sm">
                  <b>Ready to apply</b>
                  <b className="text-primary tabular-nums">
                    {setup.done} of {setup.total}
                  </b>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(setup.done / setup.total) * 100}%` }} />
                </span>
                <span className="text-xs text-text-secondary">{setup.next ? `Next: ${setup.next.label}` : "Plato has everything it needs to apply for you."}</span>
              </Link>
            )}
          </div>
        </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        {/* Top bar: tell Plato what to do, see what it is doing, tokens, notifications, you. */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2.5 px-3 pt-3 pb-2 sm:px-6 lg:px-8 lg:pt-4">
          <Link href="/" className="lg:hidden" aria-label="Plato home">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
          </Link>
          <button type="button" data-ai="nav.command-bar" onClick={() => openPlato()} className="glass-panel flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-sm text-text-secondary transition-colors hover:border-primary-line lg:max-w-[640px]">
            <Sparkles className="size-[18px] shrink-0 text-primary" />
            <span className="truncate">
              Tell Plato what to do: <span className="text-text-tertiary">“{promptFor(pathname)}”</span>
            </span>
            <kbd className="ml-auto hidden rounded-md border border-foreground/10 bg-white/60 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <PlatoStatusPill />
            <span className="hidden md:block">
              <TokensChip />
            </span>
            <NotificationBell />
            {user && (
              <Link href="/profile" title={titleCase(user.full_name)} aria-label="Your profile" className="flex size-11 items-center justify-center rounded-full bg-foreground text-sm font-bold text-white shadow-[0_6px_14px_-6px_rgb(14_27_44/0.6)]">
                {initials(user.full_name)}
              </Link>
            )}
          </div>
          {/* Compact nav for < lg, where the sidebar is hidden. */}
          <nav aria-label="Main" className="scroll-thin glass-panel flex w-full gap-1 overflow-x-auto rounded-2xl p-1 lg:hidden">
            {[...NAV, ...ACCOUNT].map(({ href, label, icon: Icon }) => {
              const active = isActive(href, pathname)
              return (
                <Link key={href} href={href} data-ai={`nav.${label.toLowerCase()}`} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium", active ? "bg-white font-semibold text-primary shadow-sm" : "text-text-secondary")}>
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
