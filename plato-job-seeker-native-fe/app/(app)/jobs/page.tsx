"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import {
  Activity,
  ArrowRight,
  Award,
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  ChevronRight,
  ClipboardList,
  Filter,
  Globe2,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Target,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SourceTile } from "@/components/source-tile"
import { createThread, getDiscoveryStats, SOURCE_LABEL, type JobSourceName, listThreads, type DiscoveryStats, type ThreadSummary } from "@/lib/jobs/api"
import { runHref, runSummary, threadHref, timeAgo } from "@/lib/jobs/links"
import { staggerContainer } from "@/lib/motion-variants"
import { NotificationBell, RunStatusIcon } from "./components/notification-bell"
import { Bar, BreakdownRows, Card, KpiCard, Ring, Sparkbars, TONES, type Tone } from "./components/dashboard-widgets"

const REMOTE: Record<string, { label: string; tone: Tone }> = {
  REMOTE: { label: "Remote", tone: "green" },
  HYBRID: { label: "Hybrid", tone: "blue" },
  ONSITE: { label: "On-site", tone: "amber" },
  UNKNOWN: { label: "Not specified", tone: "slate" },
}
const LEVEL: Record<string, { label: string; tone: Tone }> = {
  junior: { label: "Junior / Entry", tone: "teal" },
  mid: { label: "Mid level", tone: "blue" },
  senior: { label: "Senior / Lead", tone: "violet" },
}

function entries<T extends string>(rec: Partial<Record<T, number>> | undefined) {
  return Object.entries(rec ?? {}).map(([k, v]) => [k as T, v as number] as const)
}

export default function JobsDashboard() {
  const router = useRouter()
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([listThreads(), getDiscoveryStats()])
      .then(([t, s]) => {
        setThreads(t)
        setStats(s)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your searches"))
  }, [])

  async function newSearch() {
    setCreating(true)
    try {
      const t = await createThread()
      router.push(threadHref(t.id))
    } finally {
      setCreating(false)
    }
  }

  const s = stats
  const running = s?.runs.running ?? 0
  const appsTotal = s ? Object.values(s.applications).reduce((n, c) => n + (c ?? 0), 0) : 0
  const funnel = s
    ? [
        { key: "found", label: "Jobs found", count: s.shortlisted, tone: "violet" as Tone },
        { key: "saved", label: "Saved", count: s.saved, tone: "teal" as Tone },
        { key: "queued", label: "Sent to Plato", count: appsTotal, tone: "amber" as Tone },
        { key: "applied", label: "Applied", count: s.applications.submitted, tone: "green" as Tone },
      ]
    : []

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
          <p className="text-sm text-text-secondary">Your search overview — what Plato found, where it came from, and what happens next.</p>
        </div>
        <div className="flex items-center gap-3.5">
          <Button data-ai="jobs.new-search" onClick={newSearch} disabled={creating} className="gap-2 rounded-full px-5">
            <Plus className="size-4" />
            New search
          </Button>
          <NotificationBell />
        </div>
      </header>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {!s && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {s && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Search} tone="violet" value={s.threads} label="Searches" hint={`${s.runs.done} finished · ${running} running · ${s.runs.failed} failed`} />
            <KpiCard icon={Briefcase} tone="green" value={s.shortlisted} label="Jobs ready for you" hint={`${s.quality.excellent} excellent · ${s.quality.strong} strong`} />
            <KpiCard icon={ClipboardList} tone="amber" value={appsTotal} label="Applications" hint={s.applications.needsInput ? `${s.applications.needsInput} need you · ${s.applications.submitted} applied` : `${s.applications.queued} queued · ${s.applications.submitted} applied`} />
            <KpiCard icon={Layers} tone="blue" value={s.analyzed.toLocaleString()} label="Postings analyzed" hint="LinkedIn · Indeed · Google Jobs · Glassdoor · ATS boards · Plato index" />
          </div>

          {/* Funnel · Quality · Activity */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Card title="Your pipeline" icon={Filter} tone="violet">
              <BreakdownRows rows={funnel} tone="violet" />
              <p className="text-xs text-text-tertiary">{s.hidden ? `${s.hidden} hidden as “not interested”.` : "Nothing hidden yet."}</p>
            </Card>
            <Card title="Match quality" icon={Target} tone="green">
              <Ring
                centerLabel="fit"
                centerValue={s.shortlisted ? `${Math.round(((s.quality.excellent + s.quality.strong) / s.shortlisted) * 100)}%` : "—"}
                slices={[
                  { label: "Excellent (≥90%)", value: s.quality.excellent, tone: "green", color: "var(--success)" },
                  { label: "Strong (75–89%)", value: s.quality.strong, tone: "blue", color: "var(--info)" },
                  { label: "Other", value: s.quality.other, tone: "slate", color: "var(--lavender)" },
                ]}
              />
            </Card>
            <Card title="Last 14 days" icon={Activity} tone="blue" className="xl:col-span-2" action={<span className="text-xs text-text-tertiary">bars = postings fetched · dots = searches</span>}>
              <Sparkbars points={s.activity} tone="blue" />
            </Card>
          </div>

          {/* Sources · Work setup · Seniority · Salary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Where jobs come from" icon={Globe2} tone="violet">
              <BreakdownRows
                tone="violet"
                rows={entries(s.bySource).map(([k, v]) => ({
                  key: k,
                  label: SOURCE_LABEL[k] ?? k,
                  count: v,
                  leading: <SourceTile source={k as JobSourceName} size={22} />,
                }))}
              />
            </Card>
            <Card title="Work setup" icon={MapPin} tone="green">
              <BreakdownRows tone="green" rows={entries(s.byRemoteType).map(([k, v]) => ({ key: k, label: REMOTE[k]?.label ?? k, count: v, tone: REMOTE[k]?.tone }))} />
            </Card>
            <Card title="Seniority mix" icon={Award} tone="teal">
              <BreakdownRows tone="teal" rows={entries(s.levels).map(([k, v]) => ({ key: k, label: LEVEL[k]?.label ?? k, count: v, tone: LEVEL[k]?.tone }))} />
            </Card>
            <Card title="Salary signal" icon={Banknote} tone="amber">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[26px] leading-none font-bold text-foreground">{s.salary.medianUsdMax ? `$${Math.round(s.salary.medianUsdMax / 1000)}K` : "—"}</p>
                  <p className="mt-1 text-sm text-text-secondary">Median top-of-range (USD postings)</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Postings with salary</span>
                  <span className="font-semibold text-foreground tabular-nums">{s.salary.withSalary}</span>
                </div>
                <Bar value={s.salary.withSalary} max={Math.max(1, s.shortlisted)} tone="amber" />
                <p className="text-xs text-text-tertiary">Most postings don’t publish pay; Plato reads it when they do.</p>
              </div>
            </Card>
          </div>

          {/* Locations · Companies · Roles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Top locations" icon={MapPin} tone="rose">
              <BreakdownRows tone="rose" rows={s.topLocations.map((l) => ({ key: l.label, label: l.label, count: l.count }))} />
            </Card>
            <Card title="Companies hiring most" icon={Building2} tone="blue">
              <BreakdownRows
                tone="blue"
                rows={s.topCompanies.map((c) => ({
                  key: c.company,
                  label: c.company,
                  count: c.count,
                  leading: <span className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-sm text-[11px] font-bold", TONES.blue.tile)}>{c.company[0]?.toUpperCase()}</span>,
                }))}
              />
            </Card>
            <Card title="Roles you searched" icon={Sparkles} tone="violet">
              {s.topTitles.length ? (
                <div className="flex flex-wrap gap-2">
                  {s.topTitles.map((t) => (
                    <span key={t.title} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
                      {t.title}
                      <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary tabular-nums">×{t.runs}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">Nothing yet.</p>
              )}
              <p className="text-xs text-text-tertiary">Titles Plato searched for, across all conversations.</p>
            </Card>
          </div>

          {/* Searches · Recent runs */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Your searches" icon={Search} tone="violet" className="xl:col-span-2" action={<span className="text-xs text-text-tertiary">Newest first</span>}>
              <div className="-mx-5 -mb-5 border-t">
                {threads === null && !error && (
                  <ul aria-busy="true" className="px-5">
                    {Array.from({ length: 3 }, (_, i) => (
                      <li key={i} className="flex items-center gap-4 border-b border-divider py-4 last:border-b-0">
                        <Skeleton className="size-10 rounded-sm" />
                        <div className="flex flex-1 flex-col gap-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {threads?.length === 0 && (
                  <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Sparkles className="size-5" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">No searches yet</p>
                    <p className="max-w-sm text-sm text-text-secondary">Tell Plato what you&apos;re after and it will search LinkedIn, Indeed, Google Jobs, ZipRecruiter, Glassdoor and more for you.</p>
                    <Button data-ai="jobs.first-search" onClick={newSearch} disabled={creating} className="mt-1 gap-2 rounded-full">
                      Start your first search
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                )}
                <ul>
                  {threads?.map((t) => {
                    const run = t.discovery_runs[0]
                    const titles = run?.query?.titles?.join(", ")
                    return (
                      <li key={t.id} className="border-b border-divider last:border-b-0">
                        <Link href={threadHref(t.id)} data-ai={`jobs.search:${t.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-primary-tint">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted">
                            {run ? <RunStatusIcon status={run.status} /> : <Activity className="size-4 text-text-tertiary" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-foreground">{t.title ?? "New search"}</p>
                            <p className="truncate text-sm text-text-secondary">{run ? `${titles || "Saved roles"} · ${runSummary(run)}` : "Not started — open to tell Plato what you want"}</p>
                          </div>
                          <span className="hidden text-xs whitespace-nowrap text-text-tertiary sm:block">{timeAgo(t.updated_at)}</span>
                          <ChevronRight className="size-4 shrink-0 text-lavender" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </Card>

            <Card title="Recent runs" icon={Loader2} tone="amber" action={<Link href="/notifications" className="text-xs font-semibold text-primary hover:underline">All</Link>}>
              {s.recentRuns.length === 0 && <p className="text-sm text-text-tertiary">No runs yet.</p>}
              <ul className="flex flex-col gap-3">
                {s.recentRuns.map((r) => (
                  <li key={r.id}>
                    <Link href={runHref(r)} data-ai={`jobs.run:${r.id}`} className="-mx-2 flex items-start gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-primary-tint">
                      <RunStatusIcon status={r.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{r.titles.join(", ") || "Job search"}</span>
                        <span className="block text-xs text-text-tertiary">
                          {r.fetched} fetched → {r.shortlisted} shortlisted{r.seconds !== null ? ` · ${r.seconds}s` : ""} · {timeAgo(r.started_at)}
                        </span>
                      </span>
                      <Bookmark className="mt-1 size-3.5 shrink-0 text-lavender" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </motion.div>
      )}
    </div>
  )
}
