"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, BriefcaseBusiness, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, CloudOff, Compass, Hammer, History, LayoutTemplate, ListChecks, Mic, Search, SearchX, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, EmptyState, MatchPill, MonoTile, StatusPill, type Tone } from "@/components/plato-ui"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { DeviceNote, IconTile, KIND, KIND_ACCENT, LoadError, OUTLINE_CTA, PartialNote, PracticeCard, SOFT_CTA, SOLID_CTA, Section } from "@/components/career-hub"
import { CATALOG, PRACTICE_CATS, fromAssessment, withTests, type Practice, type PracticeCat } from "@/lib/career-hub/catalog"
import { listAssessments } from "@/lib/quizzes/api"
import { useSnapshot, type CareerData, type Dimension, type Snapshot } from "@/lib/career-hub/snapshot"
import { getMatches, listApplications, type JobApplication, type JobMatch } from "@/lib/jobs/api"
import { APPLICATION_STATUS } from "@/lib/jobs/application-status"
import { PAGE_PATH, timeAgo } from "@/lib/jobs/links"
import { openCoach } from "@/components/coach-assistant"

// Career overview, the owner's layout: readiness in the header, every test and practice on the
// left (search, category, 6 per page), and on the right interview prep for the seeker's jobs,
// what they left unfinished and what to do next. Other Career parts are one click away in the
// CareerNav. With ?prompt|job|thread|chat it opens the coach (see CareerPageContent).
function CareerHome() {
  const { data, snap, error, partial, reload } = useSnapshot()
  return (
    <div className={PAGE}>
      <PageHeader title="Career" description="Tests and practice for the jobs you want." actions={data && snap ? <Readiness role={data.role} snap={snap} /> : undefined} />
      <CareerNav />
      {partial && data && <PartialNote missing={data.failed} onRetry={reload} />}
      {error ? <LoadError onRetry={reload} /> : !data || !snap ? <HubSkeleton /> : <Hub data={data} snap={snap} />}
    </div>
  )
}

const dimTone = (v: number | null): Tone => (v === null ? "neutral" : v >= 75 ? "success" : v >= 55 ? "info" : "warning")

function Readiness({ role, snap }: { role: string | null; snap: Snapshot }) {
  // Skills proven and Proof of work are 0 by formula before any attempt: show "not started", not a failing 0.
  const started = (d: Dimension) => (d.key === "skills" ? snap.skills.some((s) => s.level !== null) : d.key === "proof" ? snap.history.some((h) => h.kind === "proof") : d.value !== null)
  return (
    <div data-tour="career-overview" className="flex flex-col items-start gap-2 lg:items-end">
      <p className="flex items-center gap-1.5 text-[13px] text-text-secondary">
        How ready you are for <b className="text-foreground">{role ?? "the roles you want"}</b>
        {snap.dimensions.some(started) && (
          <>
            <span className="text-text-tertiary">·</span>
            <b className="text-foreground tabular-nums">{snap.readiness}/100</b>
          </>
        )}
        <InfoTip text="A 0–100 estimate of how ready you look to employers for your first preferred role: your resume score, interview practice, skills you've proven and your work samples. Click a part to work on it." label="What readiness means" />
      </p>
      <ul data-tour="career-dimensions" className="flex flex-wrap gap-1.5 lg:justify-end">
        {snap.dimensions.map((d: Dimension) => (
          <li key={d.key}>
            <Link href={d.href} title={d.hint} data-ai={`career.dim:${d.key}`} className="rounded-full transition-opacity duration-200 hover:opacity-80">
              <StatusPill tone={started(d) ? dimTone(d.value) : "neutral"}>
                {d.label} {!started(d) ? <span className="font-medium">not started</span> : <span className="tabular-nums">{d.value}/100</span>}
              </StatusPill>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HubSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Loading your career overview">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  )
}

function Hub({ data, snap }: { data: CareerData; snap: Snapshot }) {
  const continueRows = [
    ...snap.continueItems.slice(0, 3).map((c) => ({ id: c.id, icon: c.href.startsWith("/career/interviews") ? Mic : Hammer, title: c.title, sub: c.sub, href: c.href, cta: "Resume" })),
    ...data.threads.slice(0, 2).map((t) => ({ id: t.id, icon: LayoutTemplate, title: t.title ?? "Career conversation", sub: `Coach chat · last active ${timeAgo(t.updated_at)}`, href: `/career?thread=${t.id}`, cta: "Resume" })),
  ]
  // The prep card already covers rehearsing a job, so job simulations aren't repeated here.
  const recRows = snap.recommendations.filter((r) => r.kind !== "simulation").slice(0, 3).map((r) => ({ id: r.id, icon: KIND[r.kind].icon, accent: KIND_ACCENT[r.kind], title: r.title, sub: r.why, href: r.href, cta: r.cta }))
  return (
    // Phone: prep (the seeker's own jobs) first, then the catalog, then the rest. From lg: catalog on
    // the left across both rows, prep and the rest on the right.
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <PrepCard />
      </div>
      <div className="min-w-0 self-stretch lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <Catalog />
      </div>
      <aside className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-2" aria-label="Your progress and next steps">
        {continueRows.length > 0 && (
          <Section title="Continue where you left off" icon={History} tour="career-continue">
            <div className="flex flex-col gap-2">
              {continueRows.map((c) => (
                <ActionRow key={c.id} {...c} />
              ))}
            </div>
          </Section>
        )}
        {recRows.length > 0 && (
          <Section
            title="Recommended next"
            icon={Compass}
            tour="career-recommendations"
            action={<InfoTip text="Ranked by how much each step raises your readiness. The first is the best next step." label="How these are ranked" />}
          >
            <div className="flex flex-col gap-2">
              {recRows.map((r, i) => (
                <ActionRow key={r.id} {...r} dataAi={`career.rec:${i}`} />
              ))}
            </div>
          </Section>
        )}
        <DeviceNote />
      </aside>
    </div>
  )
}

// ---------- All tests and practice ----------

type Cat = "All" | PracticeCat
const PER_PAGE = 6

function Catalog() {
  const [cat, setCat] = useState<Cat>("All")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  // The fixed items show at once; the server's scored tests join when they arrive (none if it fails).
  const [catalog, setCatalog] = useState<Practice[]>(CATALOG)
  useEffect(() => {
    let alive = true
    listAssessments()
      .then((xs) => alive && setCatalog(withTests(xs.map(fromAssessment))))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  const query = q.trim().toLowerCase()
  const matches = useMemo(() => catalog.filter((p) => !query || `${p.title} ${p.body} ${p.cat}`.toLowerCase().includes(query)), [catalog, query])
  const list = matches.filter((p) => cat === "All" || p.cat === cat)
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const at = Math.min(page, pages - 1)
  const shown = list.slice(at * PER_PAGE, at * PER_PAGE + PER_PAGE)
  const tabs = (["All", ...PRACTICE_CATS.filter((c) => catalog.some((p) => p.cat === c))] as Cat[]).map((c) => ({ key: c, label: c, count: c === "All" ? matches.length : matches.filter((p) => p.cat === c).length }))
  return (
    // ponytail: sticky only from xl (3 columns, 2 rows fit under the 64px app header); at lg the
    // 2-column grid is taller than short screens and would hide its own pager.
    <section data-tour="career-catalog" aria-labelledby="career-catalog-title" className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[88px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="career-catalog-title" className="text-xl font-bold tracking-tight">
          All tests and practice
        </h2>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border bg-card px-3 transition-colors duration-200 focus-within:border-primary-line sm:max-w-[290px]">
          <Search className="size-4 text-text-tertiary" />
          <span className="sr-only">Search tests</span>
          <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} data-ai="career.search" placeholder="Search tests" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
        </label>
      </div>
      <PillTabs id="career-cat" label="Category" dataAi="career.cat" tabs={tabs} value={cat} onChange={(c) => (setCat(c), setPage(0))} />
      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="bg-card"
          title="Nothing matches that search"
          hint="Try a shorter word, or look through all categories."
          action={
            <button type="button" data-ai="career.clear" onClick={() => (setQ(""), setCat("All"), setPage(0))} className={SOFT_CTA}>
              Clear search
            </button>
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => (
              <li key={p.id} className="min-w-0">
                <PracticeCard p={p} dataAi={`career.start:${p.id}`} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <span className="type-meta text-text-secondary tabular-nums">
              Showing {at * PER_PAGE + 1}–{at * PER_PAGE + shown.length} of {list.length}
            </span>
            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center gap-2">
                <button type="button" aria-label="Previous page" data-ai="career.page.prev" disabled={at === 0} onClick={() => setPage(at - 1)} className={cn(OUTLINE_CTA, "size-9 px-0 disabled:pointer-events-none disabled:opacity-40")}>
                  <ChevronLeft className="size-4" />
                </button>
                <span className="min-w-12 text-center text-sm font-semibold tabular-nums">
                  {at + 1} of {pages}
                </span>
                <button type="button" aria-label="Next page" data-ai="career.page.next" disabled={at === pages - 1} onClick={() => setPage(at + 1)} className={cn(OUTLINE_CTA, "size-9 px-0 disabled:pointer-events-none disabled:opacity-40")}>
                  <ChevronRight className="size-4" />
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ---------- Prep for an interview ----------

const PREP_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Practice interview", href: "/career/interviews/new?target=general", icon: Mic },
  { label: "Your interviews", href: "/career/interviews", icon: ListChecks },
  { label: "A test like theirs", href: "/career/quizzes", icon: ClipboardCheck },
]
type PrepJob = { id: string; title: string; company: string; interview?: boolean; match?: JobMatch }
type PrepList = { jobs: PrepJob[]; all: { tab: "applied" | "saved" | "discover"; total: number } | null }
const MATCH_TABS = ["applied", "saved", "discover"] as const
// The count is that list's, so the label names that list.
const ALL_LABEL = { applied: "See all your applications", saved: "See all your saved jobs", discover: "See all your matches" } as const
const jobPrepHref = (j: PrepJob) => `/career/interviews/new?${new URLSearchParams({ target: "job", job: j.id, jt: j.title, ...(j.company && { jc: j.company }) })}`

// The three jobs most worth preparing for: an interview the seeker marked on a sent application,
// then sent applications, saved jobs and best matches. "See all" opens the first non-empty list.
function pickPrepJobs(interviews: JobApplication[], lists: ({ total: number; items: JobMatch[] } | null)[]): PrepList {
  const seen = new Set<string>()
  const jobs = [
    ...[...interviews].sort((a, b) => (b.outcome_at ?? "").localeCompare(a.outcome_at ?? "")).map((a): PrepJob => ({ id: a.job.id, title: a.job.title, company: a.job.company, interview: true })),
    ...lists.flatMap((l) => l?.items ?? []).map((m): PrepJob => ({ id: m.job.id, title: m.job.title, company: m.job.company, match: m })),
  ]
    .filter((j) => !seen.has(j.id) && !!seen.add(j.id))
    .slice(0, 3)
  const i = lists.findIndex((l) => (l?.total ?? 0) > 0)
  return { jobs, all: i < 0 ? null : { tab: MATCH_TABS[i], total: lists[i]!.total } }
}

function PrepCard() {
  const [tab, setTab] = useState<"plato" | "other">("plato")
  const [list, setList] = useState<PrepList | "error" | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null)
    Promise.allSettled([listApplications({ status: ["SUBMITTED"] }), ...MATCH_TABS.map((t) => getMatches({ tab: t, sort: "best", take: 3 }))]).then(([apps, ...rs]) => {
      if (!alive) return
      // Nothing reachable: say so, don't pretend the seeker has no jobs.
      if ([apps, ...rs].every((r) => r.status === "rejected")) return setList("error")
      setList(pickPrepJobs((ok(apps) ?? []).filter((a) => a.outcome === "INTERVIEW"), rs.map(ok)))
    })
    return () => {
      alive = false
    }
  }, [attempt])
  const jobs = list && list !== "error" ? list.jobs : null
  return (
    <section data-tour="career-prep" aria-labelledby="career-prep-title" className={cn(CARD, "overflow-hidden")}>
      <div className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
          <CalendarClock className="size-5" />
        </span>
        <span className="min-w-0">
          <h2 id="career-prep-title" className="text-lg leading-tight font-bold">
            Prep for an interview
          </h2>
          <p className="text-[13px] opacity-85">Pick a job. Plato builds your practice for it.</p>
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {PREP_LINKS.map((l) => (
            <Link key={l.href} href={l.href} data-ai={`career.prep.link:${l.href}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/70 px-2.5 py-2 text-[12.5px] leading-tight font-semibold text-primary transition-colors duration-200 hover:bg-primary-soft">
              <l.icon className="size-4 shrink-0" />
              <span className="min-w-0">{l.label}</span>
            </Link>
          ))}
        </div>
        <PillTabs id="career-prep-tab" label="Which job" dataAi="career.prep.tab" className="w-full" tabs={[{ key: "plato", label: "A job on Plato" }, { key: "other", label: "Any other job" }]} value={tab} onChange={setTab} />
        {tab === "other" ? (
          <div className="flex flex-col items-start gap-3 py-1">
            <p className="text-[13px] text-text-secondary">Paste the post of any job, from any site. Plato asks what that employer would ask.</p>
            <Link href="/career/interviews/new?target=job&job=paste&step=job" data-ai="career.prep.paste" className={SOLID_CTA}>
              Paste a job post
              <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-text-secondary">Jobs you applied to, saved or matched with on Plato.</p>
            {list === "error" ? (
              <EmptyState
                icon={CloudOff}
                className="border-none p-3"
                title="Your jobs didn't load"
                hint="Plato couldn't reach your jobs just now."
                action={
                  <button type="button" data-ai="career.prep.retry" onClick={() => (setList(null), setAttempt((n) => n + 1))} className={SOFT_CTA}>
                    Try again
                  </button>
                }
              />
            ) : jobs === null ? (
              <div aria-busy="true" className="flex flex-col gap-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-[62px] rounded-xl" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={BriefcaseBusiness}
                className="border-none p-3"
                title="No jobs yet"
                hint="Find jobs to apply to, or practise for any job by pasting its post."
                action={
                  <span className="flex flex-wrap justify-center gap-2">
                    <Link href={PAGE_PATH.jobs} data-ai="career.prep.find" className={SOFT_CTA}>
                      Find jobs
                    </Link>
                    <button type="button" data-ai="career.prep.other" onClick={() => setTab("other")} className={OUTLINE_CTA}>
                      Paste a job post
                    </button>
                  </span>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <MonoTile name={j.company || j.title} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px]">{j.title}</b>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
                        {j.company && <span className="truncate">{j.company}</span>}
                        {j.interview ? (
                          <StatusPill tone="warning" className="px-2">
                            Interview
                          </StatusPill>
                        ) : (
                          j.match && <JobTag m={j.match} />
                        )}
                      </span>
                    </span>
                    <Link href={jobPrepHref(j)} aria-label={`Prep for ${j.title}${j.company ? ` at ${j.company}` : ""}`} data-ai={`career.prep.job:${j.id}`} className={cn(SOLID_CTA, "px-3 py-1.5")}>
                      Prep
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {list && list !== "error" && list.all && (
              <Link href={`/career/interviews/new?target=job&jobs=${list.all.tab}`} data-ai="career.prep.all" className="group inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover">
                {ALL_LABEL[list.all.tab]}
                <span className="font-medium text-text-tertiary tabular-nums">· {list.all.total}</span>
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// Sent = Applied; still in flight = its state; didn't go through = treated like any other job.
const DEAD = new Set(["FAILED", "EXPIRED", "SKIPPED"])
function JobTag({ m }: { m: JobMatch }) {
  const s = m.application_status
  if (s === "SUBMITTED") return <StatusPill tone="success" className="px-2">Applied</StatusPill>
  if (s && !DEAD.has(s)) return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", APPLICATION_STATUS[s].tone)}>{APPLICATION_STATUS[s].label}</span>
  return m.saved ? <StatusPill tone="neutral" className="px-2">Saved</StatusPill> : <MatchPill value={m.match_percent} />
}

// One row in the right column: something to resume or do next, with its button.
function ActionRow({ icon, accent = "cobalt", title, sub, href, cta, dataAi }: { icon: LucideIcon; accent?: Parameters<typeof IconTile>[0]["accent"]; title: string; sub: string; href: string; cta: string; dataAi?: string }) {
  return (
    <Link href={href} data-ai={dataAi} className={cn(CARD, "group flex items-center gap-3 px-3.5 py-3 transition-colors duration-200 hover:border-primary-line")}>
      <IconTile icon={icon} accent={accent} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{title}</b>
        <span className="block truncate text-xs text-text-secondary">{sub}</span>
      </span>
      <span className={cn(OUTLINE_CTA, "group-hover:border-primary-line group-hover:text-primary")}>{cta}</span>
    </Link>
  )
}

// The chat opens when something was started (?prompt, ?job, ?thread, ?chat); otherwise the hub.
// The coach lives in the side panel now. Old coach links (/career?prompt=…, ?job=…, ?thread=…, ?chat=new),
// from the command palette, job cards, the Plato AI agent and other pages, still work: they open the
// coach panel with the same request and the address is cleaned back to /career.
function CareerPageContent() {
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const prompt = params.get("prompt")
    const job = params.get("job")
    const thread = params.get("thread")
    const chat = params.get("chat")
    if (!prompt && !job && !thread && !chat) return
    openCoach({
      ...(prompt && { prompt, newConversation: true }),
      ...(job && { jobRef: { jobId: job, searchId: params.get("search"), title: params.get("jt") ?? "This job", company: params.get("jc") ?? "" } }),
      ...(thread && { threadId: thread }),
      ...(chat && !prompt && !thread && { newConversation: true }),
    })
    router.replace("/career", { scroll: false })
  }, [params, router])
  return <CareerHome />
}

export default function CareerPage() {
  return (
    <Suspense fallback={null}>
      <CareerPageContent />
    </Suspense>
  )
}

