"use client"

import { NextSteps } from "@/components/next-steps"
import { PAGE, PageHeader } from "@/components/page-header"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import {
  Activity,
  ArrowRight,
  Award,
  Banknote,
  Briefcase,
  Building2,
  ChevronRight,
  ClipboardList,
  Filter,
  Globe2,
  Layers,
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
import { getMe } from "@/lib/auth/api"
import { createThread, getDiscoveryStats, listThreads, SOURCE_LABEL, type DiscoveryStats, type JobSourceName, type ThreadSummary } from "@/lib/jobs/api"
import { JOBS_HOME, runSummary, threadHref, timeAgo } from "@/lib/jobs/links"
import { staggerContainer } from "@/lib/motion-variants"
import { RunStatusIcon } from "./jobs/components/notification-bell"
import { Bar, BreakdownRows, Card, KpiCard, Ring, Sparkbars, TONES, type Tone } from "./jobs/components/dashboard-widgets"

const REMOTE: Record<string, { label: string; tone: Tone }> = {
  REMOTE: { label: "Remote", tone: "green" },
  HYBRID: { label: "Hybrid", tone: "blue" },
  ONSITE: { label: "On-site", tone: "amber" },
  UNKNOWN: { label: "Not specified", tone: "slate" },
}
const LEVEL: Record<string, { label: string; tone: Tone }> = {
  junior: { label: "Junior / Entry", tone: "teal" },
  mid: { label: "Mid level", tone: "blue" },
  senior: { label: "Senior / Lead", tone: "brand" },
}

function entries<T extends string>(rec: Partial<Record<T, number>> | undefined) {
  return Object.entries(rec ?? {}).map(([k, v]) => [k as T, v as number] as const)
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}
const firstName = (full?: string) => {
  const f = full?.trim().split(/\s+/)[0]
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""
}

// Home: the seeker's job hunt at a glance. Every number and chart about the
// hunt lives here; /jobs is only for searching.
export default function Home() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // Signed out goes to /login from the app shell; a new account finishes onboarding first.
    getMe()
      .then((me) => (me.onboarding_completed === false ? router.replace("/onboarding") : setName(firstName(me.full_name))))
      .catch(() => {})
    Promise.all([getDiscoveryStats(), listThreads()])
      .then(([s, t]) => {
        setStats(s)
        setThreads(t)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your dashboard"))
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

  const s = stats
  const running = s?.runs.running ?? 0
  const appsTotal = s ? Object.values(s.applications).reduce((n, c) => n + (c ?? 0), 0) : 0
  const fit = s?.shortlisted ? Math.round(((s.quality.excellent + s.quality.strong) / s.shortlisted) * 100) : null
  const funnel = s
    ? [
        { key: "found", label: "Jobs found", count: s.shortlisted, tone: "brand" as Tone },
        { key: "saved", label: "Saved", count: s.saved, tone: "teal" as Tone },
        { key: "queued", label: "Sent to Plato", count: appsTotal, tone: "amber" as Tone },
        { key: "applied", label: "Applied", count: s.applications.submitted, tone: "green" as Tone },
      ]
    : []
  // One line under the greeting: the thing most worth knowing right now.
  const headline = !s
    ? "Here is where your job hunt stands."
    : s.applications.needsInput
      ? `${s.applications.needsInput} application${s.applications.needsInput === 1 ? " needs" : "s need"} an answer from you.`
      : running
        ? `Plato is searching right now. ${s.shortlisted} jobs are ready so far.`
        : s.shortlisted
          ? `${s.shortlisted} jobs are ready for you, ${s.quality.excellent} of them excellent matches.`
          : "Start a search and Plato will rank every posting against your profile."
  const recent = threads?.slice(0, 4) ?? null

  return (
    <div className={PAGE}>
      <PageHeader
        section="Home"
        title={
          <>
            {greeting()}
            {name && <span className="text-brand-gradient">, {name}</span>}
          </>
        }
        description={headline}
        actions={
          <>
            {s?.applications.needsInput ? (
              <Link href="/applications" data-ai="home.needs-you" className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-4 py-2 text-sm font-semibold text-warning transition-colors hover:border-warning/60">
                Answer now
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
            <Button data-ai="home.new-search" onClick={newSearch} disabled={creating} className="gap-2 rounded-full px-5">
              <Plus className="size-4" />
              New search
            </Button>
          </>
        }
      />

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <NextSteps stats={s} onNewSearch={newSearch} />

      {!s && !error && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-72 rounded-lg xl:col-span-2" />
          </div>
        </div>
      )}

      {s && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          {/* KPIs */}
          <div data-tour="home-kpis" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard featured icon={Briefcase} tone="green" value={s.shortlisted} label="Jobs ready for you" hint={`${s.quality.excellent} excellent · ${s.quality.strong} strong`} />
            <KpiCard icon={ClipboardList} tone="amber" value={appsTotal} label="Applications" hint={s.applications.needsInput ? `${s.applications.needsInput} need you · ${s.applications.submitted} applied` : `${s.applications.queued} queued · ${s.applications.submitted} applied`} />
            <KpiCard icon={Search} tone="brand" value={s.threads} label="Searches" hint={`${s.runs.done} finished · ${running} running · ${s.runs.failed} failed`} />
            <KpiCard icon={Layers} tone="blue" value={s.analyzed.toLocaleString()} label="Postings analyzed" hint="LinkedIn · Indeed · Google Jobs · Glassdoor · ATS boards · Plato index" />
          </div>

          {/* Pipeline · Quality · Activity */}
          <div data-tour="home-charts" className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <Card title="Your pipeline" icon={Filter} tone="brand">
              <BreakdownRows rows={funnel} tone="brand" />
              <p className="mt-auto text-xs text-text-tertiary">{s.hidden ? `${s.hidden} hidden as “not interested”.` : "Nothing hidden yet."}</p>
            </Card>
            <Card title="Match quality" icon={Target} tone="green">
              <Ring
                centerLabel="fit"
                centerValue={fit === null ? "—" : `${fit}%`}
                slices={[
                  { label: "Excellent (≥90%)", value: s.quality.excellent, tone: "green", color: "var(--success)" },
                  { label: "Strong (75–89%)", value: s.quality.strong, tone: "blue", color: "var(--info)" },
                  { label: "Other", value: s.quality.other, tone: "slate", color: "var(--lavender)" },
                ]}
              />
            </Card>
            <Card title="Last 14 days" icon={Activity} tone="blue" className="xl:col-span-2" action={<span className="text-xs text-text-tertiary">bars = postings fetched · dots = searches</span>}>
              <Sparkbars points={s.activity} tone="blue" />
              <div className="mt-auto grid grid-cols-3 gap-3 border-t border-divider pt-4">
                {[
                  { label: "Postings fetched", value: s.activity.reduce((n, p) => n + p.jobs, 0).toLocaleString() },
                  { label: "Searches run", value: s.activity.reduce((n, p) => n + p.runs, 0) },
                  { label: "Busiest day", value: busiest(s.activity) },
                ].map((m) => (
                  <div key={m.label} className="min-w-0">
                    <p className="text-lg leading-tight font-bold text-foreground tabular-nums">{m.value}</p>
                    <p className="truncate text-xs text-text-tertiary">{m.label}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Sources · Work setup · Seniority · Salary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Where jobs come from" icon={Globe2} tone="brand">
              <BreakdownRows
                tone="brand"
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
            <Card title="Roles you searched" icon={Sparkles} tone="brand">
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
              <p className="mt-auto text-xs text-text-tertiary">Titles Plato searched for, across all conversations.</p>
            </Card>
          </div>

          {/* Jump back in */}
          <Card
            data-tour="home-recent"
            title="Pick up where you left off"
            icon={Search}
            tone="brand"
            action={
              <Link href={JOBS_HOME} data-ai="home.all-searches" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                All searches
                <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {recent === null && <Skeleton className="h-16 rounded-md" />}
            {recent?.length === 0 && (
              <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-primary-line bg-primary-tint p-5 sm:flex-row sm:items-center">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Sparkles className="size-5" />
                </span>
                <p className="flex-1 text-sm text-text-secondary">No searches yet. Tell Plato what you are after and it searches every board for you.</p>
                <Button data-ai="home.first-search" onClick={newSearch} disabled={creating} className="gap-2 rounded-full">
                  Start your first search
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
            {!!recent?.length && (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {recent.map((t) => {
                  const run = t.discovery_runs[0]
                  return (
                    <li key={t.id}>
                      <Link href={threadHref(t.id)} data-ai={`home.search:${t.id}`} className="group flex h-full items-center gap-3 rounded-md border p-3 transition-colors hover:border-primary-line hover:bg-primary-tint">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted">{run ? <RunStatusIcon status={run.status} /> : <Activity className="size-4 text-text-tertiary" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{t.title ?? "New search"}</span>
                          <span className="block truncate text-xs text-text-tertiary">{run ? runSummary(run) : "Not started"} · {timeAgo(t.updated_at)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-lavender transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  )
}

function busiest(points: { date: string; jobs: number }[]) {
  const top = points.reduce<{ date: string; jobs: number } | null>((b, p) => (p.jobs > (b?.jobs ?? 0) ? p : b), null)
  return top ? new Date(`${top.date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"
}
