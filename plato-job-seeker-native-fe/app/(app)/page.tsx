"use client"

import { NextSteps } from "@/components/next-steps"
import { InfoTip } from "@/components/info-tip"
import { PAGE } from "@/components/page-header"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { BellRing, Bookmark, Building2, CircleCheck, CircleX, Clock, Hand, MessagesSquare, Plus, Search, Send, Sparkles, Target } from "lucide-react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { CARD, EmptyState, Kpi, MatchPill, MatchRing, MetaChip, MonoTile, PlatoNote, SectionHeader } from "@/components/plato-ui"
import { getMe } from "@/lib/auth/api"
import { getProfile } from "@/lib/documents/api"
import { getDigests, getInsights, type Digest } from "@/lib/insights/api"
import { createThread, getDiscoveryStats, getMatches, listApplications, setSaved, type DiscoveryStats, type JobApplication, type JobMatch } from "@/lib/jobs/api"
import { statusView } from "@/lib/jobs/application-status"
import { threadHref, timeAgo } from "@/lib/jobs/links"
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
      return a.outcome === "INTERVIEW" ? <>{c} invited you to interview</> : a.outcome === "OFFER" ? <>{c} made you an offer</> : a.outcome === "VIEWED" ? <>{c} viewed your application</> : <>Applied to {c}</>
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
      const t = await createThread()
      router.push(threadHref(t.id))
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
  // The one line under the greeting: what changed and what Plato is doing.
  // The owner's line once there is something to show; a first step before that.
  const summary = !stats || stats.shortlisted || sent ? "While you were away, Plato kept your job hunt moving. Here’s where things stand." : "Start a search and Plato will rank every posting against your profile."

  return (
    // A brand-new account (no matches, nothing sent) gets the getting-started tour.
    <div className={PAGE} data-tour-state={top?.length === 0 && apps?.length === 0 ? "home.new" : "home.active"}>
      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">{error}</p>}

      {/* Greeting and the numbers that matter this week: one card, one stat strip inside it. */}
      <section data-tour="page-header" className={cn(CARD, "relative isolate flex flex-col gap-5 overflow-hidden p-5 sm:p-6 xl:flex-row xl:items-center xl:gap-8")}>
        {/* Brand light: a soft cobalt-to-azure glow behind the greeting. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
        <div className="min-w-0 xl:flex-1">
          <p className="eyebrow">
            {new Date().toLocaleDateString("en-GB", { weekday: "long" })}, {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </p>
          <h1 className="type-page-title mt-2 text-foreground">
            {greeting()}
            {name && (
              <>
                , <span className="text-brand-gradient">{name}</span>
              </>
            )}
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-text-secondary">{summary}</p>
        </div>
        {stats ? (
          <div data-tour="home-kpis" className="grid grid-cols-2 gap-1 sm:grid-cols-[1fr_1fr_1fr_1.3fr] xl:w-[820px] xl:shrink-0">
            <Link href="/jobs" data-ai="home.matches" className="rounded-xl transition-colors duration-200 hover:bg-muted/70">
              <Kpi value={stats.newThisWeek ?? stats.shortlisted} label={stats.newThisWeek === undefined ? "Jobs for you" : "New matches"} icon={Sparkles} accent="cobalt" index={0} />
            </Link>
            <Link href="/applications" data-ai="home.applied" className="rounded-xl transition-colors duration-200 hover:bg-muted/70">
              <Kpi value={sent} label="Applications sent" icon={Send} accent="azure" index={1} />
            </Link>
            {/* Interviews the seeker marked on their applications ("Did you hear back?"). */}
            <Link href="/applications?tab=applied" data-ai="home.interviews" title="Mark it on an application when an employer gets back to you" className="rounded-xl transition-[filter] hover:brightness-[0.98]">
              <Kpi value={interviews} label={interviews === 1 ? "Interview" : "Interviews"} tone="hi" icon={MessagesSquare} accent="green" index={2} />
            </Link>
            <Kpi
              value={
                <>
                  {sentWeek}
                  <span className="text-text-tertiary"> / {WEEK_GOAL}</span>
                </>
              }
              label={
                <span className="flex items-center gap-1.5">
                  This week’s goal
                  <InfoTip text={`Applications sent in the last 7 days, against a target of ${WEEK_GOAL} a week. Only applications that actually went through count.`} label="What this week's goal counts" />
                </span>
              }
              index={3}
              aside={
                // The ring needs the room of a 4-up strip; on phones the "0 / 10" says it alone.
                <span className="hidden sm:block">
                  <MatchRing value={(Math.min(sentWeek, WEEK_GOAL) / WEEK_GOAL) * 100} size={40} stroke={4} label={<Target className="size-4" strokeWidth={2} />} />
                </span>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-[1fr_1fr_1fr_1.3fr] xl:w-[820px] xl:shrink-0">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
        )}
      </section>

      <NextSteps stats={stats} onNewSearch={newSearch} />

      {/* Top matches. */}
      <section data-tour="home-top-matches" className="flex flex-col gap-3">
        <SectionHeader
          title={
            <span className="flex items-center gap-1.5">
              Top matches for you
              <InfoTip text="The % is how well a job's title and description match your roles, skills and experience, scaled to your own results: your strongest matches read close to 100%." label="What match % means" />
            </span>
          }
          icon={Sparkles} accent="cobalt" href="/jobs" dataAi="home.all-jobs" action={topTotal ? `See all ${topTotal}` : null} />
        {top === null && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[248px] rounded-2xl" />
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
              <motion.article key={m.id} variants={fadeUpItem} className={cn(CARD, "card-lift flex flex-col gap-4 p-5", i === 2 && "md:max-xl:hidden")}>
                <div className="flex items-start justify-between gap-3">
                  <MonoTile name={m.job.company} />
                  <MatchRing value={m.match_percent} />
                </div>
                <div className="min-w-0">
                  <h3 className="type-card-title line-clamp-2 text-foreground">
                    <a href={m.job.url} target="_blank" rel="noreferrer" data-ai={`home.job:${m.job.id}`} className="transition-colors hover:text-primary">
                      {m.job.title}
                    </a>
                  </h3>
                  <p className="mt-0.5 truncate text-[13px] text-text-secondary">{m.job.company}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[[m.job.location, REMOTE[m.job.remote_type]].filter(Boolean).join(" · "), m.job.posted_at && timeAgo(m.job.posted_at)].filter(Boolean).map((t) => (
                    <MetaChip key={t as string}>{t}</MetaChip>
                  ))}
                </div>
                <PlatoNote variant="inline">{reason(m)}</PlatoNote>
                <div className="mt-auto flex gap-2">
                  <Button data-ai={`home.apply:${m.job.id}`} size="sm" className="flex-1 bg-primary-soft text-primary shadow-none hover:bg-primary hover:text-primary-foreground" onClick={() => setApply(m.job.id)}>
                    Apply
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label={m.saved ? "Remove from saved" : "Save"} aria-pressed={m.saved} onClick={() => toggleSave(m)} className={cn(m.saved && "border-primary-line bg-primary-tint text-primary")}>
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
          <SectionHeader title="Your applications" icon={Send} accent="azure" href="/applications" action="Open" />
          {apps && apps.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex h-1.5 gap-1" aria-hidden>
                <span className="rounded-full bg-linear-to-r from-primary to-azure" style={{ flex: Math.max(1, sent) }} />
                <span className="rounded-full bg-teal" style={{ flex: Math.max(0.4, viewed) }} />
                <span className="rounded-full bg-success" style={{ flex: Math.max(0.2, interviews) }} />
              </div>
              <p className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-secondary tabular-nums">
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-primary" />
                  <b className="font-semibold text-foreground">{sent}</b> sent
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-teal" />
                  <b className="font-semibold text-foreground">{viewed}</b> viewed
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-success" />
                  <b className="font-semibold text-foreground">{interviews}</b> interview{interviews === 1 ? "" : "s"}
                  <InfoTip text="Viewed and interviews come from what you mark on a sent application (Did you hear back?). Plato can't read employer replies, so they only move when you update them." label="Where viewed and interviews come from" />
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
            <ul className="-mx-2 flex flex-col">
              {recent.map((a) => {
                const v = statusView(a)
                return (
                  <li key={a.id}>
                    <Link href={`/applications/${a.id}`} title={v.label} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70">
                      <MonoTile name={a.job.company} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary [&_b]:font-semibold [&_b]:text-foreground">{event(a)}</span>
                      <RowStatus status={a.status} />
                      <span className="type-meta shrink-0 text-text-tertiary tabular-nums">{timeAgo(a.submitted_at ?? a.updated_at)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Companies you follow: the latest alert digest. */}
        <div data-tour="home-following" className={cn(CARD, "flex flex-col gap-4 p-5")}>
          <SectionHeader
            title={
              <span className="flex items-center gap-1.5">
                Companies you follow are hiring
                <InfoTip text="Open roles from your latest alert digest at the companies you follow." label="Where these roles come from" />
              </span>
            }
            icon={Building2} accent="teal" href="/following" action="All" />
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
            <ul className="-mx-2 flex flex-col">
              {hiring.slice(0, 3).map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <MonoTile name={j.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">{j.title}</b>
                    <span className="type-meta block truncate text-text-secondary">{[j.company, j.location, j.posted_at && timeAgo(j.posted_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.match_percent ? (
                    <MatchPill value={j.match_percent} />
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

// Small coloured status mark on each activity row: sent, needs you, didn't go through, in progress.
function RowStatus({ status }: { status: string }) {
  const [Icon, cls, label] =
    status === "SUBMITTED"
      ? [CircleCheck, "text-success", "Sent"]
      : status === "NEEDS_INPUT" || status === "NEEDS_USER_VERIFICATION"
        ? [Hand, "text-warning", "Needs you"]
        : status === "FAILED" || status === "SKIPPED" || status === "EXPIRED"
          ? [CircleX, "text-rose", "Didn't go through"]
          : [Clock, "text-info", "In progress"]
  return <Icon aria-label={label} className={cn("size-4 shrink-0", cls)} strokeWidth={2} />
}
