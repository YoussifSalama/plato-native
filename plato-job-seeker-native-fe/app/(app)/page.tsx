"use client"

import { NextSteps } from "@/components/next-steps"
import { PAGE } from "@/components/page-header"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowRight, Bookmark, Plus } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { MatchRing, MonoTile, PlatoNote, StatTile, StatusPill } from "@/components/plato-ui"
import { getMe } from "@/lib/auth/api"
import { getDigests, type Digest } from "@/lib/insights/api"
import { createThread, getDiscoveryStats, getMatches, listApplications, setSaved, type DiscoveryStats, type JobApplication, type JobMatch } from "@/lib/jobs/api"
import { needsAttention, statusView } from "@/lib/jobs/application-status"
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
const toneOf = (cls: string) => (cls.includes("warning") ? "warning" : cls.includes("success") ? "success" : cls.includes("info") ? "info" : cls.includes("destructive") ? "danger" : "neutral")
const within = (iso: string | null, days: number) => !!iso && Date.now() - new Date(iso).getTime() < days * 864e5
// Why Plato picked this job, in one line.
const reason = (m: JobMatch) => (m.job.eligibility && m.job.eligibility.status !== "open" && m.job.eligibility.note ? m.job.eligibility.note : `${m.match_label} for your profile${m.job.posted_at && within(m.job.posted_at, 2) ? ", posted in the last 2 days" : ""}`)

// Home: where the job hunt stands, what needs you, and the best next jobs (SPEC §5, screen 05).
export default function Home() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [apps, setApps] = useState<JobApplication[] | null>(null)
  const [top, setTop] = useState<JobMatch[] | null>(null)
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
    getMatches({ tab: "discover", sort: "best", take: 3 })
      .then((r) => setTop(r.items))
      .catch(() => setTop([]))
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

  const needs = apps?.filter(needsAttention) ?? []
  const working = apps?.find((a) => a.status === "IN_PROGRESS" || a.status === "EXTENSION_ACTIVE")
  const sentWeek = apps?.filter((a) => a.status === "SUBMITTED" && within(a.submitted_at ?? a.updated_at, 7)).length ?? 0
  const sent = apps?.filter((a) => a.status === "SUBMITTED").length ?? 0
  const recent = [...(apps ?? [])].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 3)
  // The one line under the greeting: what changed and what Plato is doing.
  const summary = !stats
    ? "Here is where your job hunt stands."
    : [
        sentWeek ? `Plato sent ${sentWeek} application${sentWeek === 1 ? "" : "s"} this week.` : null,
        working ? `It's applying to ${working.job.company} right now.` : stats.runs.running ? "It's searching for jobs right now." : null,
        !sentWeek && !working ? (stats.shortlisted ? `${stats.shortlisted} jobs are ready for you, ${stats.quality.excellent} of them excellent matches.` : "Start a search and Plato will rank every posting against your profile.") : null,
      ]
        .filter(Boolean)
        .join(" ")

  return (
    <div className={PAGE}>
      {error && <p className="rounded-xl border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{error}</p>}

      {/* Greeting and the numbers that matter this week. */}
      <section data-tour="page-header" className="flex flex-wrap items-center gap-6 rounded-[22px] border bg-card p-6 shadow-card">
        <div className="min-w-[260px] flex-1">
          <p className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1.5 text-[30px] leading-tight font-extrabold tracking-tight">
            {greeting()}
            {name && <span className="text-brand-gradient">, {name}</span>}
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[15px] text-text-secondary">{summary}</p>
        </div>
        {stats ? (
          <div data-tour="home-kpis" className="flex flex-wrap gap-2.5">
            <Link href="/jobs" data-ai="home.matches">
              <StatTile value={stats.shortlisted} label="Jobs for you" className="card-lift" />
            </Link>
            <Link href="/applications" data-ai="home.applied">
              <StatTile value={sent} label="Applied" className="card-lift" />
            </Link>
            {needs.length > 0 && (
              <Link href="/applications" data-ai="home.needs-you">
                <StatTile value={needs.length} label="Need you" tone="need" className="card-lift" />
              </Link>
            )}
            <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
              <MatchRing value={(Math.min(sentWeek, WEEK_GOAL) / WEEK_GOAL) * 100} size={46} label="" />
              <span>
                <b className="block text-lg leading-tight font-extrabold tabular-nums">
                  {sentWeek} / {WEEK_GOAL}
                </b>
                <span className="text-[12.5px] text-text-secondary">This week’s goal</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex gap-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[74px] w-[118px] rounded-2xl" />
            ))}
          </div>
        )}
      </section>

      {/* Waiting for you: the first application Plato paused on. */}
      {needs[0] && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning-line bg-warning-soft/70 px-4 py-3">
          <MonoTile name={needs[0].job.company} size="sm" />
          <div className="min-w-[200px] flex-1">
            <p className="eyebrow text-warning-ink">Waiting for you · {needs.length}</p>
            <p className="mt-0.5 text-sm">
              <b>{needs[0].job.company}</b> · {needs[0].needs_input?.message ?? statusView(needs[0]).hint}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl bg-card" onClick={() => router.push(`/applications/${needs[0].id}`)}>
            Answer
          </Button>
          <Link href="/applications" className="text-sm font-semibold text-primary hover:underline">
            See all {needs.length}
          </Link>
        </section>
      )}

      <NextSteps stats={stats} onNewSearch={newSearch} />

      {/* Top matches. */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Top matches for you</h2>
          {stats && stats.shortlisted > 0 && (
            <Link href="/jobs" data-ai="home.all-jobs" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              See all {stats.shortlisted}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        {top === null && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-60 rounded-[22px]" />
            ))}
          </div>
        )}
        {top?.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-[22px] border bg-card p-6 shadow-card sm:flex-row sm:items-center">
            <PlatoNote variant="headline" className="flex-1">
              No matches yet. Tell Plato what you are after and it searches every board for you.
            </PlatoNote>
            <Button data-ai="home.first-search" onClick={newSearch} disabled={creating} className="gap-2 rounded-xl">
              <Plus className="size-4" />
              Start a search
            </Button>
          </div>
        )}
        {!!top?.length && (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {top.map((m) => (
              <motion.article key={m.id} variants={fadeUpItem} className="card-lift flex flex-col gap-3 rounded-[22px] border bg-card p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <MonoTile name={m.job.company} />
                  <MatchRing value={m.match_percent} />
                </div>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-[16.5px] font-bold tracking-tight">{m.job.title}</h3>
                  <p className="truncate text-sm text-text-secondary">{m.job.company}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[[m.job.location, REMOTE[m.job.remote_type]].filter(Boolean).join(" · "), m.job.posted_at && timeAgo(m.job.posted_at)].filter(Boolean).map((t) => (
                    <span key={t as string} className="rounded-md bg-muted px-2 py-0.5 text-[12.5px] font-medium text-text-secondary">
                      {t}
                    </span>
                  ))}
                </div>
                <PlatoNote variant="inline">{reason(m)}</PlatoNote>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button data-ai={`home.apply:${m.job.id}`} className="flex-1 rounded-xl" onClick={() => setApply(m.job.id)}>
                    Apply
                  </Button>
                  <Button variant="outline" size="icon" aria-label={m.saved ? "Remove from saved" : "Save"} aria-pressed={m.saved} onClick={() => toggleSave(m)} className={cn("rounded-xl", m.saved && "border-primary-line text-primary")}>
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
        <div data-tour="home-recent" className="flex flex-col gap-3 rounded-[22px] border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Your applications</h2>
            <Link href="/applications" className="text-sm font-semibold text-primary hover:underline">
              Open
            </Link>
          </div>
          {apps && (
            <>
              <div className="flex h-1.5 gap-1.5" aria-hidden>
                <span className="rounded-full bg-primary-line" style={{ flex: Math.max(1, apps.length) }} />
                <span className="rounded-full bg-primary/50" style={{ flex: Math.max(0.3, sent) }} />
                <span className="rounded-full bg-warning" style={{ flex: Math.max(needs.length ? 0.3 : 0, needs.length) }} />
              </div>
              <p className="flex flex-wrap gap-x-5 text-sm">
                <span>
                  <b>{apps.length}</b> total
                </span>
                <span>
                  <b>{sent}</b> applied
                </span>
                <span>
                  <b>{needs.length}</b> need you
                </span>
              </p>
            </>
          )}
          <ul className="flex flex-col divide-y divide-divider">
            {apps === null && <Skeleton className="h-28 rounded-xl" />}
            {apps?.length === 0 && <li className="py-3 text-sm text-text-secondary">Nothing sent yet. Pick jobs and Plato applies for you.</li>}
            {recent.map((a) => {
              const v = statusView(a)
              return (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <MonoTile name={a.job.company} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b>{a.job.company}</b> · {a.job.title}
                    </span>
                    <StatusPill tone={toneOf(v.tone)}>{v.label}</StatusPill>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Companies you follow: the latest alert digest. */}
        <div className="flex flex-col gap-3 rounded-[22px] border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Companies you follow are hiring</h2>
            <Link href="/following" className="text-sm font-semibold text-primary hover:underline">
              All
            </Link>
          </div>
          {digest === null ? (
            <PlatoNote variant="inline" className="py-2">
              Follow companies and roles, and Plato tells you when they post a job that fits. <Link href="/following" className="font-semibold text-primary hover:underline">Follow one</Link>
            </PlatoNote>
          ) : (
            <ul className="flex flex-col divide-y divide-divider">
              {digest.jobs.slice(0, 3).map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-2.5">
                  <MonoTile name={j.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{j.title}</b>
                    <span className="block truncate text-xs text-text-secondary">{[j.company, j.location, j.posted_at && timeAgo(j.posted_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.closed ? <StatusPill tone="neutral">Closed</StatusPill> : <a href={j.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">View</a>}
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
