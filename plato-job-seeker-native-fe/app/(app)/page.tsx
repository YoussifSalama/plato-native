"use client"

import { NextSteps, type NextAction } from "@/components/next-steps"
import { InfoTip } from "@/components/info-tip"
import { PAGE } from "@/components/page-header"
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowRight, BellRing, Bookmark, Building2, Plus, Search, Send } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { CARD, EmptyState, MatchPill, MatchRing, MetaChip, PlatoNote } from "@/components/plato-ui"
import { CompanyAvatar } from "@/components/company-avatar"
import { getMe } from "@/lib/auth/api"
import { getProfile } from "@/lib/documents/api"
import { getDigests, getInsights, type Digest } from "@/lib/insights/api"
import { getDiscoveryStats, getMatches, listApplications, setSaved, type DiscoveryStats, type JobApplication, type JobMatch } from "@/lib/jobs/api"
import { needsAttention, statusView } from "@/lib/jobs/application-status"
import { timeAgo } from "@/lib/jobs/links"
import { staggerContainer, fadeUpItem } from "@/lib/motion-variants"

const WEEK_GOAL = 10
const REMOTE: Record<string, string> = { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site", UNKNOWN: "" }

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}
const firstName = (full?: string) => {
  const f = full?.trim().split(/\s+/)[0]
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""
}
const within = (iso: string | null, days: number) => !!iso && Date.now() - new Date(iso).getTime() < days * 864e5
// Why Plato picked this job, in one line.
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)
const reason = (m: JobMatch) =>
  m.job.eligibility && m.job.eligibility.status !== "open" && m.job.eligibility.note
    ? m.job.eligibility.note
    : m.reasons?.length
      ? `Matches your ${list(m.reasons)}.${m.job.posted_at && within(m.job.posted_at, 2) ? " Posted in the last 2 days." : ""}`
      : `${m.match_label} for your profile${m.job.posted_at && within(m.job.posted_at, 2) ? ", posted in the last 2 days" : ""}.`
// One line per application, the way the owner's Home reads ("Applied to EXCELerate").
const event = (a: JobApplication) => {
  const c = <b>{a.job.company}</b>
  switch (a.status) {
    case "SUBMITTED":
      // What the seeker marked they heard back, newest news first.
      return a.outcome === "INTERVIEW" ? (
        <>{c} invited you to interview</>
      ) : a.outcome === "OFFER" ? (
        <>{c} made you an offer</>
      ) : a.outcome === "VIEWED" ? (
        <>{c} viewed your application</>
      ) : (
        <>Applied to {c}</>
      )
    case "IN_PROGRESS":
    case "EXTENSION_ACTIVE":
      return <>Plato is applying to {c}</>
    case "QUEUED":
      return <>{c} is in line</>
    case "NEEDS_INPUT":
    case "NEEDS_USER_VERIFICATION":
      return <>{c} needs something from you</>
    default:
      return <>{c} didn&apos;t go through</>
  }
}

// Home: where the job hunt stands, what needs you, and the best next jobs (SPEC §5, screen 05).
export default function Home() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [apps, setApps] = useState<JobApplication[] | null>(null)
  const [top, setTop] = useState<JobMatch[] | null>(null)
  const [topTotal, setTopTotal] = useState<number | null>(null)
  const [followed, setFollowed] = useState<string[] | null>(null)
  const [digest, setDigest] = useState<Digest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [apply, setApply] = useState<string | null>(null)

  useEffect(() => {
    // Signed out goes to /login from the app shell; a new account finishes onboarding first.
    getMe()
      .then((me) => (me.onboarding_completed === false ? router.replace("/onboarding") : setName(firstName(me.full_name))))
      .catch(() => {})
    Promise.all([getDiscoveryStats(), listApplications()])
      .then(([s, a]) => {
        setStats(s)
        setApps(a)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your dashboard"))
    // Same list the Jobs page opens on: by default only jobs that take applicants from the seeker's country.
    getProfile()
      .then((p) => p.location?.country ?? undefined)
      .catch(() => undefined)
      .then((acceptsCountry) => getMatches({ tab: "discover", sort: "best", take: 3, ...(acceptsCountry && { acceptsCountry }) }))
      .then((r) => {
        setTop(r.items)
        setTopTotal(r.total)
      })
      .catch(() => setTop([]))
    getInsights()
      .then((i) => setFollowed(i.alerts.filter((a) => a.kind === "COMPANY" && a.company).map((a) => (a.company as string).toLowerCase())))
      .catch(() => setFollowed([]))
    getDigests(1)
      .then((d) => setDigest(d[0] ?? null))
      .catch(() => setDigest(null))
  }, [router])

  async function newSearch() {
    setCreating(true)
    try {
      router.push("/jobs/new") // New search is its own page; Start there creates the search
    } finally {
      setCreating(false)
    }
  }
  async function toggleSave(m: JobMatch) {
    setTop((cur) => cur?.map((x) => (x.id === m.id ? { ...x, saved: !x.saved } : x)) ?? cur)
    await setSaved(m.job.id, !m.saved).catch(() => setTop((cur) => cur?.map((x) => (x.id === m.id ? { ...x, saved: m.saved } : x)) ?? cur))
  }

  const sentWeek = apps?.filter((a) => a.status === "SUBMITTED" && within(a.submitted_at ?? a.updated_at, 7)).length ?? 0
  const sent = apps?.filter((a) => a.status === "SUBMITTED").length ?? 0
  // Marked by the seeker on a sent application (optional): Plato can't read replies.
  const viewed = apps?.filter((a) => a.outcome && a.outcome !== "REJECTED").length ?? 0
  const interviews = apps?.filter((a) => a.outcome === "INTERVIEW" || a.outcome === "OFFER").length ?? 0
  // As on Following: open roles in the latest digest at companies you follow.
  const hiring = digest?.jobs.filter((j) => !j.closed && followed?.includes(j.company.toLowerCase())) ?? []
  const recent = [...(apps ?? [])].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 3)
  // The one thing to do now, once setup is done: what needs the seeker, an interview to prepare for,
  // this week's goal, then interview practice.
  const needs = apps?.filter(needsAttention).length ?? 0
  const interview = apps?.find((a) => a.outcome === "INTERVIEW")
  const then: NextAction | null = !apps
    ? null
    : needs
      ? { title: `${needs} application${needs === 1 ? " needs" : "s need"} you`, body: "Plato can't finish them alone. Answer what's missing and they go out.", href: "/applications?tab=needs", cta: "Open" }
      : interview
        ? { title: `Prepare for your ${interview.job.company} interview`, body: "Practise with questions built from that job post.", href: `/career/interviews/new?${new URLSearchParams({ target: "job", job: interview.job.id, jt: interview.job.title, jc: interview.job.company })}`, cta: "Prep" }
        : sentWeek < WEEK_GOAL && (topTotal ?? 0) > 0
          ? { title: `Send ${WEEK_GOAL - sentWeek} more application${WEEK_GOAL - sentWeek === 1 ? "" : "s"} this week`, body: `${topTotal} matches are waiting. Pick the best and Plato applies.`, href: "/jobs", cta: "Pick jobs" }
          : { title: "Get ready for your interviews", body: "Practise for the jobs you applied to, and see how ready you are.", href: "/career", cta: "Practise" }
  // The one line under the greeting: what changed and what Plato is doing.
  // The owner's line once there is something to show; a first step before that.
  const summary =
    !stats || stats.shortlisted || sent ? "While you were away, Plato kept your job hunt moving. Here’s where things stand." : "Start a search and Plato will rank every posting against your profile."

  return (
    // A brand-new account (no matches, nothing sent) gets the getting-started tour.
    <div className={PAGE} data-tour-state={top?.length === 0 && apps?.length === 0 ? "home.new" : "home.active"}>
      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}

      {/* Greeting and the four numbers that matter this week (owner design, 2026-11-13). */}
      <section data-tour="page-header" className={cn(CARD, "flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-center xl:gap-8")}>
        <div className="min-w-0 xl:flex-1">
          <p className="font-mono text-[13px] tracking-[0.12em] text-text-secondary uppercase">
            {new Date().toLocaleDateString("en-GB", { weekday: "long" })}, {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </p>
          <h1 className="type-page-title mt-2 text-foreground">
            {greeting()}
            {name && `, ${name}`}
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-text-secondary">{summary}</p>
        </div>
        {stats ? (
          <div data-tour="home-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-[auto_auto_auto_auto] xl:shrink-0">
            <StatTile href="/jobs" dataAi="home.matches" value={stats.newThisWeek ?? stats.shortlisted} label={stats.newThisWeek === undefined ? "Jobs for you" : "New matches"} />
            <StatTile href="/applications" dataAi="home.applied" value={sent} label="Applications sent" />
            {/* Interviews the seeker marked on their applications ("Did you hear back?"). */}
            <StatTile
              href="/applications?tab=applied"
              dataAi="home.interviews"
              value={interviews}
              label={interviews === 1 ? "Interview" : "Interviews"}
              title="Mark it on an application when an employer gets back to you"
              tone="hi"
            />
            <div className="col-span-2 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:col-span-1">
              <MatchRing
                value={(Math.min(sentWeek, WEEK_GOAL) / WEEK_GOAL) * 100}
                size={44}
                stroke={4}
                label={<span className="sr-only">{Math.round((Math.min(sentWeek, WEEK_GOAL) / WEEK_GOAL) * 100)}%</span>}
              />
              <span className="min-w-0">
                <b className="block text-lg leading-tight font-bold text-foreground tabular-nums">
                  {sentWeek} / {WEEK_GOAL}
                </b>
                <span className="flex items-center gap-1 text-[13px] whitespace-nowrap text-text-secondary">
                  This week’s goal
                  <InfoTip
                    text={`Applications sent in the last 7 days, against a target of ${WEEK_GOAL} a week. Only applications that actually went through count.`}
                    label="What this week's goal counts"
                  />
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[640px] xl:shrink-0">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))}
          </div>
        )}
      </section>

      {/* Right under the greeting: setup steps while there are any, then the one thing to do now. */}
      <NextSteps stats={stats} onNewSearch={newSearch} then={then} />

      {/* Top matches. */}
      <section data-tour="home-top-matches" className="flex flex-col gap-3">
        <PlainHeader title="Top matches for you" href="/jobs" dataAi="home.all-jobs" action={topTotal ? `See all ${topTotal}` : null} />
        {top === null && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[268px] rounded-2xl" />
            ))}
          </div>
        )}
        {top?.length === 0 && (
          <div className={cn(CARD, "p-5")}>
            <EmptyState
              icon={Search}
              title="No matches yet"
              hint="Tell Plato what you are after and it searches every board for you."
              action={
                <Button data-ai="home.first-search" size="sm" onClick={newSearch} disabled={creating}>
                  <Plus />
                  Start a search
                </Button>
              }
              className="border-0 py-4"
            />
          </div>
        )}
        {!!top?.length && (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {top.slice(0, 3).map((m, i) => (
              // Two columns between md and xl: the third card would sit alone on its own row.
              <motion.article key={m.id} variants={fadeUpItem} className={cn(CARD, "card-lift flex flex-col gap-3.5 p-5", i === 2 && "md:max-xl:hidden")}>
                <div className="flex items-start justify-between gap-3">
                  <Mark name={m.job.company} domain={m.job.company_domain} logo={m.job.company_logo} />
                  <MatchRing value={m.match_percent} size={46} />
                </div>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-[17px] leading-snug font-bold text-foreground">
                    <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`home.job:${m.job.id}`} className="transition-colors hover:text-primary">
                      {m.job.title}
                    </a>
                  </h3>
                  <p className="mt-0.5 truncate text-sm text-text-secondary">{m.job.company}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[[m.job.location, REMOTE[m.job.remote_type]].filter(Boolean).join(" · "), m.job.posted_at && timeAgo(m.job.posted_at)].filter(Boolean).map((t) => (
                    <MetaChip key={t as string} className="rounded-lg px-2.5 py-1 text-[13px]">
                      {t}
                    </MetaChip>
                  ))}
                </div>
                <PlatoNote variant="inline">{reason(m)}</PlatoNote>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button data-ai={`home.apply:${m.job.id}`} className="h-11 flex-1 rounded-xl text-[15px] font-semibold" onClick={() => setApply(m.job.id)}>
                    Apply
                  </Button>
                  <Button
                    variant="outline"
                    aria-label={m.saved ? "Remove from saved" : "Save"}
                    aria-pressed={m.saved}
                    onClick={() => toggleSave(m)}
                    className={cn("size-11 shrink-0 rounded-xl p-0", m.saved && "border-primary-line bg-primary-tint text-primary")}
                  >
                    <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                  </Button>
                </div>
              </motion.article>
            ))}
          </motion.div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Applications: the funnel and the latest moves. */}
        <div data-tour="home-recent" className={cn(CARD, "flex flex-col gap-4 p-5")}>
          <PlainHeader title="Your applications" href="/applications" action="Open" />
          {apps && apps.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* sent -> viewed -> interview, light to dark */}
              <div className="flex h-2 gap-1" aria-hidden>
                <span className="rounded-full bg-primary-line" style={{ flex: Math.max(1, sent) }} />
                <span className="rounded-full bg-primary/60" style={{ flex: Math.max(0.4, viewed) }} />
                <span className="rounded-full bg-brand-deep" style={{ flex: Math.max(0.2, interviews) }} />
              </div>
              <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] text-text-secondary tabular-nums">
                <span>
                  <b className="font-bold text-foreground">{sent}</b> sent
                </span>
                <span>
                  <b className="font-bold text-foreground">{viewed}</b> viewed
                </span>
                <span className="flex items-center gap-1.5">
                  <span>
                    <b className="font-bold text-foreground">{interviews}</b> interview{interviews === 1 ? "" : "s"}
                  </span>
                  <InfoTip
                    text="Viewed and interviews come from what you mark on a sent application (Did you hear back?). Plato can't read employer replies, so they only move when you update them."
                    label="Where viewed and interviews come from"
                  />
                </span>
              </p>
            </div>
          )}
          {apps === null && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          )}
          {apps?.length === 0 && (
            <EmptyState
              icon={Send}
              title="Nothing sent yet"
              hint="Pick jobs and Plato applies for you."
              action={
                <Link href="/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Browse jobs
                </Link>
              }
              className="flex-1 justify-center"
            />
          )}
          {!!recent.length && (
            <ul className="flex flex-col divide-y divide-divider">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} title={statusView(a).label} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/70">
                    <Mark name={a.job.company} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-text-secondary [&_b]:font-semibold [&_b]:text-foreground">{event(a)}</span>
                    <span className="shrink-0 text-sm text-text-secondary tabular-nums">{shortAge(a.submitted_at ?? a.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Companies you follow: the latest alert digest. */}
        <div data-tour="home-following" className={cn(CARD, "flex flex-col gap-4 p-5")}>
          <PlainHeader title="Companies you follow are hiring" href="/following" action="All" />
          {followed === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : followed.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Follow companies and roles"
              hint="Plato tells you when they post a job that fits."
              action={
                <Link href="/following" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Follow one
                </Link>
              }
              className="flex-1 justify-center"
            />
          ) : hiring.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="No new roles yet"
              hint={`Plato checks the ${followed.length} compan${followed.length === 1 ? "y" : "ies"} you follow and tells you when one posts a job that fits.`}
              action={
                <Link href="/following" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Manage following
                </Link>
              }
              className="flex-1 justify-center"
            />
          ) : (
            <ul className="flex flex-col divide-y divide-divider">
              {hiring.slice(0, 3).map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2.5">
                  <Mark name={j.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-semibold">{j.title}</b>
                    <span className="block truncate text-sm text-text-secondary">{[j.company, j.location, j.posted_at && timeAgo(j.posted_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.match_percent ? (
                    <MatchPill value={j.match_percent} className="px-2.5 py-1 text-[13px]" />
                  ) : (
                    <a href={j.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-primary hover:text-primary-hover">
                      View
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>


      <ExtensionApplyModal open={!!apply} count={1} req={{ jobIds: apply ? [apply] : [] }} onClose={() => setApply(null)} />
    </div>
  )
}

// One number tile in the greeting card: a bordered box, a big number, a short label. "hi" = tinted (interviews).
function StatTile({ href, value, label, tone, title, dataAi }: { href: string; value: ReactNode; label: string; tone?: "hi"; title?: string; dataAi?: string }) {
  return (
    <Link
      href={href}
      data-ai={dataAi}
      title={title}
      className={cn(
        "flex min-w-[120px] flex-col justify-center rounded-xl border px-4 py-3 transition-colors",
        tone === "hi" ? "border-primary-line bg-primary-soft text-primary hover:bg-primary-soft/80" : "bg-card text-foreground hover:bg-muted/60",
      )}
    >
      <b className="text-[26px] leading-none font-bold tabular-nums">{value}</b>
      <span className={cn("mt-1.5 text-[13px] whitespace-nowrap", tone === "hi" ? "text-primary" : "text-text-secondary")}>{label}</span>
    </Link>
  )
}

// A section title with its one link, plain like the owner's Home ("See all 122 →").
function PlainHeader({ title, href, action, dataAi }: { title: string; href: string; action: ReactNode; dataAi?: string }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <h2 className="type-section-title text-foreground">{title}</h2>
      {action && (
        <Link href={href} data-ai={dataAi} className="group/see inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-primary transition-colors hover:text-primary-hover">
          {action}
          {action !== "Open" && action !== "All" && <ArrowRight className="size-4 transition-transform group-hover/see:translate-x-0.5" />}
        </Link>
      )}
    </div>
  )
}

// The employer's mark: its logo (source logo, else its website's icon) when known, else neutral initials in a white tile.
function Mark({ name, domain, logo, size = "md" }: { name: string; domain?: string | null; logo?: string | null; size?: "sm" | "md" }) {
  const px = size === "sm" ? 36 : 46
  if (logo || domain) return <CompanyAvatar name={name} domain={domain} logo={logo} size={px} className="rounded-lg" />
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-lg border bg-card font-semibold text-foreground/80", size === "sm" ? "size-9 text-xs" : "size-[46px] text-sm")}>
      {ini || "?"}
    </span>
  )
}

// "2h", "5h", "1d": the right-hand age on an activity row.
function shortAge(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
