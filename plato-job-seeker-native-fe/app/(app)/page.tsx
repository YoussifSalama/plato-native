"use client"

import { NextSteps, type NextAction } from "@/components/next-steps"
import { InfoTip } from "@/components/info-tip"
import { PAGE } from "@/components/page-header"
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowRight, BellRing, Bookmark, Building2, Hand, Mic, Plus, Search, Send, Sparkles, TrendingUp, Wallet, Zap } from "lucide-react"
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
import { BRAND_GLASS, BRAND_PANEL } from "@/lib/brand"
import { openPlato } from "@/components/app-shell"
import { getResumeScore, type ResumeScore } from "@/lib/career/api"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
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
  const [apply, setApply] = useState<string[] | null>(null)
  const [cv, setCv] = useState<ResumeScore | null>(null)
  const [practice, setPractice] = useState<InterviewSummary[]>([])

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
    getResumeScore()
      .then(setCv)
      .catch(() => setCv(null))
    listInterviews()
      .then(setPractice)
      .catch(() => setPractice([]))
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
  const needing = apps?.filter(needsAttention) ?? []
  const viewedOnly = apps?.filter((a) => a.outcome === "VIEWED").length ?? 0
  // The last practice for the interview on the calendar (same company), to show how ready they are.
  const lastPractice = interview ? practice.find((p) => p.score !== null && p.company?.toLowerCase() === interview.job.company.toLowerCase()) : undefined
  const tone: "need" | "interview" | "plain" = needs ? "need" : interview ? "interview" : "plain"
  // The one line under the greeting: what changed and what Plato is doing.
  // The owner's line once there is something to show; a first step before that.
  const summary =
    !stats || stats.shortlisted || sent ? "While you were away, Plato kept your job hunt moving. Here’s where things stand." : "Start a search and Plato will rank every posting against your profile."

  return (
    // A brand-new account (no matches, nothing sent) gets the getting-started tour.
    <div className={PAGE} data-tour-state={top?.length === 0 && apps?.length === 0 ? "home.new" : "home.active"}>
      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}

      {/* The brand header: greeting, what Plato is doing, the week in four numbers (the identity of the sidebar and /search). */}
      <section data-tour="page-header" className={cn(BRAND_PANEL, "fx-depth relative isolate overflow-hidden rounded-[28px] px-5 py-6 text-white shadow-[0_24px_48px_-26px_rgb(0_60_120/0.6)] sm:px-8 sm:py-8")}>
        <span aria-hidden className="depth-2 pointer-events-none absolute -top-24 -right-24 -z-10 size-[420px] rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.22),transparent_65%)]" />
        <span aria-hidden className="depth-1 pointer-events-none absolute -inset-6 -z-10 opacity-[0.08] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="grid gap-7 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
          <div className="min-w-0">
            <p className="text-[12px] font-bold tracking-[0.22em] text-white/75 uppercase">
              {new Date().toLocaleDateString("en-GB", { weekday: "long" })}, {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-2 text-[30px] leading-tight font-extrabold tracking-tight sm:text-[38px]">
              {greeting()}
              {name && `, ${name}`}
            </h1>
            <p className={cn(BRAND_GLASS, "mt-3 inline-flex max-w-full items-center gap-2.5 rounded-full py-1.5 pr-4 pl-2.5 text-sm")}>
              <span className="relative flex size-2.5 shrink-0">
                {stats?.runs.running ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-70" /> : null}
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-300" />
              </span>
              <span className="truncate">{stats?.runs.running ? "Plato is searching for you right now" : stats && (stats.newThisWeek || stats.shortlisted) ? <>Plato found <b>{stats.newThisWeek ?? stats.shortlisted} new jobs</b> this week · {stats.shortlisted} ranked for you</> : summary}</span>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" data-ai="home.new-search" onClick={newSearch} disabled={creating} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 font-bold text-primary shadow-[0_10px_24px_-12px_rgb(0_30_70/0.7)] transition-transform hover:-translate-y-px">
                <Search className="size-[18px]" strokeWidth={2.3} />
                New search
              </button>
              <button type="button" data-ai="home.ask-plato" onClick={() => openPlato()} className={cn(BRAND_GLASS, "inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold transition-colors hover:bg-white/20")}>
                <Sparkles className="size-[18px]" />
                Ask Plato
              </button>
            </div>
          </div>
          {stats ? (
            <div data-tour="home-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:w-[660px]">
              <Kpi href="/jobs" dataAi="home.matches" value={stats.newThisWeek ?? stats.shortlisted} label={stats.newThisWeek === undefined ? "Jobs for you" : "New matches"} sub={<><TrendingUp className="size-3.5" />{stats.shortlisted} ranked</>} />
              <Kpi href="/applications" dataAi="home.applied" value={sent} label="Applications sent" sub={`${sentWeek} this week`} />
              {/* Interviews the seeker marked on their applications ("Did you hear back?"). */}
              <Kpi href="/applications?tab=applied" dataAi="home.interviews" value={interviews} label={interviews === 1 ? "Interview" : "Interviews"} sub={interview ? interview.job.company : "Mark replies"} title="Mark it on an application when an employer gets back to you" lit={!!interview} />
              {/* Same shape as the other tiles (number, label, one line), the ring in the corner. */}
              <div className={cn(BRAND_GLASS, "fx fx-dark card-lift relative flex min-w-0 flex-col rounded-2xl p-4 hover:!border-white/30")}>
                <svg viewBox="0 0 36 36" className="absolute top-3 right-3 size-8 -rotate-90" aria-hidden>
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="4" />
                  {sentWeek > 0 && <circle cx="18" cy="18" r="15" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(Math.min(sentWeek, WEEK_GOAL) / WEEK_GOAL) * 94.2} 94.2`} />}
                </svg>
                <b className="text-[28px] leading-none font-extrabold tabular-nums">
                  {sentWeek}/{WEEK_GOAL}
                </b>
                <span className="mt-1.5 flex min-w-0 items-center gap-1 text-[13px] text-white/85">
                  <span className="truncate">Week&apos;s goal</span>
                  <InfoTip text={`Applications sent in the last 7 days, against a target of ${WEEK_GOAL} a week. Only applications that actually went through count.`} label="What this week's goal counts" className="shrink-0 text-white/80" />
                </span>
                <span className="mt-1.5 truncate text-xs font-bold">{sentWeek >= WEEK_GOAL ? "Goal met" : `${WEEK_GOAL - sentWeek} to go`}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:w-[660px]">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[92px] rounded-2xl bg-white/15" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* The one thing to do now (amber only when it waits on you), and setup in one small card while it isn't done. */}
      <section className="flex flex-col gap-4 lg:flex-row">
        {then ? (
          <motion.div
            data-tour="next-action"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(CARD, "flex min-w-0 flex-1 flex-wrap items-center gap-4 p-5", tone === "need" ? "border-l-[4px] border-l-warning" : tone === "interview" ? "border-l-[4px] border-l-success" : "border-l-[4px] border-l-primary")}
          >
            <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tone === "need" ? "bg-warning-soft text-warning-ink" : tone === "interview" ? "bg-success-soft text-success-ink" : "bg-primary-soft text-primary")}>
              {tone === "need" ? <Hand className="size-5" /> : tone === "interview" ? <Mic className="size-5" /> : <Zap className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 basis-[240px]">
              <p className="text-[17px] font-bold text-foreground">{then.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{then.body}</p>
              {tone === "need" && needing.length > 0 && (
                <div className="mt-2.5 flex gap-2">
                  {needing.slice(0, 4).map((a) => (
                    <Mark key={a.id} name={a.job.company} domain={a.job.company_domain} logo={a.job.company_logo} size="sm" />
                  ))}
                </div>
              )}
            </div>
            <Link href={then.href} data-ai="home.next-action" className={cn(buttonVariants(), "group/cta h-11 w-full rounded-xl px-5 font-bold sm:w-auto")}>
              {then.cta}
              <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" />
            </Link>
          </motion.div>
        ) : (
          <Skeleton className="h-[104px] flex-1 rounded-2xl" />
        )}
        <NextSteps compact stats={stats} onNewSearch={newSearch} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Top matches: logo, why it fits, pay, and the best three in one go. */}
          <section data-tour="home-top-matches" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="type-section-title text-foreground">Top matches for you</h2>
                {!!topTotal && <p className="text-sm text-text-secondary">Best of {topTotal} jobs ranked against your CV</p>}
              </div>
              {!!top?.length && (
                <div className="flex gap-2">
                  <Link href="/jobs" data-ai="home.all-jobs" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl")}>
                    See all
                  </Link>
                  {top.length > 1 && (
                    <Button data-ai="home.apply-top" onClick={() => setApply(top.slice(0, 3).map((m) => m.job.id))} className="h-10 gap-1.5 rounded-xl font-bold">
                      <Zap className="size-4" />
                      Apply to top {Math.min(3, top.length)}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {top === null && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[300px] rounded-2xl" />
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
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className={cn("grid grid-cols-1 gap-4", top.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2")}>
                {top.slice(0, 3).map((m, i) => (
                  // Two columns between md and xl: the third card would sit alone on its own row.
                  <motion.article key={m.id} variants={fadeUpItem} className={cn(CARD, "card-lift relative flex flex-col gap-3 p-5", i === 2 && "md:max-xl:hidden")}>
                    {m.job.posted_at && within(m.job.posted_at, 2) && <span className="absolute -top-px right-5 rounded-b-lg bg-primary px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary-foreground">NEW</span>}
                    <div className="flex items-start justify-between gap-3">
                      <Mark name={m.job.company} domain={m.job.company_domain} logo={m.job.company_logo} />
                      <MatchRing value={m.match_percent} size={48} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-[16.5px] leading-snug font-bold text-foreground">
                        <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`home.job:${m.job.id}`} className="transition-colors hover:text-primary">
                          {m.job.title}
                        </a>
                      </h3>
                      <p className="mt-0.5 truncate text-sm text-text-secondary">{[m.job.company, m.job.location, m.job.posted_at && timeAgo(m.job.posted_at)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {REMOTE[m.job.remote_type] && <MetaChip className="rounded-lg px-2.5 py-1 text-[12.5px]">{REMOTE[m.job.remote_type]}</MetaChip>}
                      <MetaChip className="gap-1 rounded-lg px-2.5 py-1 text-[12.5px]">
                        <Wallet className="size-3.5" />
                        {pay(m) ?? "Pay not shown"}
                      </MetaChip>
                    </div>
                    {m.job.eligibility && m.job.eligibility.status !== "open" && m.job.eligibility.note ? (
                      <PlatoNote variant="inline">{m.job.eligibility.note}</PlatoNote>
                    ) : m.reasons?.length ? (
                      <div className="flex flex-wrap gap-1.5" aria-label="Why it fits you">
                        {m.reasons.slice(0, 3).map((r) => (
                          <span key={r} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <PlatoNote variant="inline">{reason(m)}</PlatoNote>
                    )}
                    <div className="mt-auto flex gap-2 pt-1">
                      <Button data-ai={`home.apply:${m.job.id}`} className="h-10 flex-1 rounded-xl text-[15px] font-bold" onClick={() => setApply([m.job.id])}>
                        Apply
                      </Button>
                      <Button variant="outline" aria-label={m.saved ? "Remove from saved" : "Save"} aria-pressed={m.saved} onClick={() => toggleSave(m)} className={cn("size-10 shrink-0 rounded-xl p-0", m.saved && "border-primary-line bg-primary-tint text-primary")}>
                        <Bookmark className={cn("size-4", m.saved && "fill-current")} />
                      </Button>
                    </div>
                  </motion.article>
                ))}
              </motion.div>
            )}
          </section>

          {/* Applications: every stage named and counted, then the latest moves. */}
          <section data-tour="home-recent" className={cn(CARD, "flex flex-col gap-4 p-5 sm:p-6")}>
            <PlainHeader title="Your applications" href="/applications" action="Open all" />
            {apps === null ? (
              <Skeleton className="h-[84px] rounded-2xl" />
            ) : apps.length === 0 ? (
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
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Stage href="/applications?tab=active" n={(stats?.applications.queued ?? 0) + (stats?.applications.inProgress ?? 0)} label="In line" />
                  <Stage href="/applications?tab=needs" n={needs} label="Need you" tone={needs ? "need" : undefined} />
                  <Stage href="/applications?tab=applied" n={sent} label="Sent" bar="bg-primary" />
                  <Stage href="/applications?tab=applied" n={viewedOnly} label="Viewed" bar="bg-primary/60" />
                  <Stage href="/applications?tab=applied" n={interviews} label={interviews === 1 ? "Interview" : "Interviews"} tone={interviews ? "good" : undefined} />
                </div>
                <ul className="flex flex-col divide-y divide-divider border-t border-divider">
                  {recent.map((a) => {
                    const st = statusView(a)
                    return (
                      <li key={a.id}>
                        <Link href={`/applications/${a.id}`} title={st.label} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/70">
                          <Mark name={a.job.company} domain={a.job.company_domain} logo={a.job.company_logo} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-[15px] text-text-secondary [&_b]:font-semibold [&_b]:text-foreground">
                            {event(a)} <span className="hidden text-text-tertiary sm:inline">· {a.job.title}</span>
                          </span>
                          <span className={cn("hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold sm:inline", needsAttention(a) ? "bg-warning-soft text-warning-ink" : a.outcome === "INTERVIEW" || a.outcome === "OFFER" ? "bg-success-soft text-success-ink" : "bg-primary-soft text-primary")}>{a.outcome === "INTERVIEW" ? "Interview" : a.outcome === "OFFER" ? "Offer" : st.label}</span>
                          <span className="w-8 shrink-0 text-right text-sm text-text-secondary tabular-nums">{shortAge(a.submitted_at ?? a.updated_at)}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* The rail: the interview coming up, the CV's score, companies you follow that are hiring. */}
        <aside className="flex flex-col gap-6">
          {interview && (
            <section className={cn(CARD, "overflow-hidden")}>
              <div className="bg-linear-to-br from-success-soft to-card p-5">
                <div className="flex items-center gap-3">
                  <Mark name={interview.job.company} domain={interview.job.company_domain} logo={interview.job.company_logo} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.14em] text-success-ink uppercase">Interview</p>
                    <p className="truncate font-bold text-foreground">
                      {interview.job.company} · {interview.job.title}
                    </p>
                  </div>
                </div>
                {lastPractice?.score != null && (
                  <>
                    <p className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Last practice</span>
                      <b className="tabular-nums">{lastPractice.score} / 100</b>
                    </p>
                    <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-success/15">
                      <span className="block h-full rounded-full bg-success" style={{ width: `${lastPractice.score}%` }} />
                    </span>
                  </>
                )}
                <Link
                  href={`/career/interviews/new?${new URLSearchParams({ target: "job", job: interview.job.id, jt: interview.job.title, jc: interview.job.company })}`}
                  data-ai="home.interview-prep"
                  className={cn(buttonVariants(), "mt-4 h-10 w-full gap-2 rounded-xl font-bold")}
                >
                  <Mic className="size-4" />
                  Practise with questions from the post
                </Link>
              </div>
            </section>
          )}
          {cv && (
            <section className={cn(CARD, "flex items-center gap-4 p-5")}>
              <MatchRing value={cv.score} size={64} stroke={5} label={<span className="text-base font-extrabold text-primary tabular-nums">{cv.score}</span>} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground">Your CV scores {cv.score}</p>
                {cv.topFixes[0] && <p className="line-clamp-2 text-sm text-text-secondary">{cv.topFixes[0]}</p>}
                <Link href="/career" data-ai="home.cv-score" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover">
                  Improve it with Plato
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </section>
          )}
          <section data-tour="home-following" className={cn(CARD, "flex flex-col gap-3 p-5")}>
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
                      <span className="block truncate text-xs text-text-secondary">{[j.company, j.location, j.posted_at && timeAgo(j.posted_at)].filter(Boolean).join(" · ")}</span>
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
          </section>
        </aside>
      </div>

      <ExtensionApplyModal open={!!apply} count={apply?.length ?? 0} req={{ jobIds: apply ?? [] }} onClose={() => setApply(null)} />
    </div>
  )
}

// One number on the brand header: glass tile, big number, label, and what it means this week.
function Kpi({ href, value, label, sub, title, lit, dataAi }: { href: string; value: ReactNode; label: string; sub: ReactNode; title?: string; lit?: boolean; dataAi?: string }) {
  return (
    <Link href={href} data-ai={dataAi} title={title} className={cn(BRAND_GLASS, "fx fx-dark card-lift flex min-w-0 flex-col rounded-2xl p-4 hover:!border-white/30", lit && "ring-1 ring-white/50")}>
      <b className="text-[28px] leading-none font-extrabold tabular-nums">{value}</b>
      <span className="mt-1.5 text-[13px] whitespace-nowrap text-white/85">{label}</span>
      <span className="mt-1.5 flex items-center gap-1 truncate text-xs font-bold text-white">{sub}</span>
    </Link>
  )
}

// One stage of the application pipeline: its count, its name, a bar in its meaning's colour.
function Stage({ href, n, label, tone, bar = "bg-primary-line" }: { href: string; n: number; label: string; tone?: "need" | "good"; bar?: string }) {
  return (
    <Link href={href} className={cn("card-lift flex flex-col rounded-2xl p-3", tone === "need" ? "bg-warning-soft ring-1 ring-warning-line" : tone === "good" ? "bg-success-soft ring-1 ring-success/30" : "bg-primary-tint hover:bg-primary-soft")}>
      <b className={cn("text-[22px] leading-none font-extrabold tabular-nums", tone === "need" ? "text-warning-ink" : tone === "good" ? "text-success-ink" : "text-foreground")}>{n}</b>
      <span className={cn("mt-1 text-xs font-semibold", tone === "need" ? "text-warning-ink" : tone === "good" ? "text-success-ink" : "text-text-secondary")}>{label}</span>
      <span className={cn("mt-2 h-1.5 rounded-full", tone === "need" ? "bg-warning" : tone === "good" ? "bg-success" : bar)} />
    </Link>
  )
}

// The job's stated pay, short ("$4–5k / mo"); null when the posting doesn't say.
function pay(m: JobMatch) {
  const { salary_min: lo, salary_max: hi, salary_currency: cur } = m.job
  if (!lo && !hi) return null
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${n}`)
  const sym = !cur || cur === "USD" ? "$" : `${cur} `
  return `${sym}${lo && hi && lo !== hi ? `${k(lo)}–${k(hi)}` : k((lo ?? hi)!)}`
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
