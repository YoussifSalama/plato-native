"use client"

import { Suspense, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, BarChart3, BriefcaseBusiness, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Hammer, Languages, LayoutTemplate, Lightbulb, Mic, Search, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { MatchRing, PlatoNote, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityRow, DeviceNote, IconTile, Meter, RecommendationCard, Section, Trend } from "@/components/career-hub"
import { STAGES, STAGE_HINT, useSnapshot, type Snapshot } from "@/lib/career-hub/snapshot"
import type { CareerData } from "@/lib/career-hub/snapshot"
import { timeAgo } from "@/lib/jobs/links"
import { CareerChat } from "./career-chat"

// Career: the hub of the seeker's career development. It answers, top to bottom: where am I,
// what does Plato know about me, what next, which practice, and how I've improved. Each
// activity opens its own screen (assessment, interview, simulation, proof) and returns here.
// The practice library below starts the career coach chat, as before.
type Cat = "All" | "Interviews" | "Aptitude" | "Skills" | "Language" | "Resume"
type Practice = { cat: Exclude<Cat, "All">; title: string; body: string; meta: string; icon: LucideIcon; prompt?: string; href?: string }
const CATALOG: Practice[] = [
  { cat: "Interviews", title: "General AI interview", body: "Behavioral, technical or mixed, scored per answer", meta: "15 min · All levels", icon: Mic, href: "/career/interviews/general" },
  { cat: "Interviews", title: "Job interview simulation", body: "Questions built from a real job post", meta: "20 min · Your level", icon: BriefcaseBusiness, href: "/career/interviews/simulate" },
  { cat: "Interviews", title: "Behavioral interview (STAR)", body: "Common “tell me about a time” questions, scored", meta: "20 min · All levels", icon: Mic, prompt: "Give me a behavioral mock interview with STAR questions and score each answer" },
  { cat: "Interviews", title: "Technical interview for my role", body: "Questions on the tools and projects in your CV", meta: "25 min · Your level", icon: Mic, prompt: "Give me a technical mock interview for the role I'm targeting" },
  { cat: "Interviews", title: "Client demo pitch", body: "Pitch a solution to a skeptical client, then get scored", meta: "15 min · Senior", icon: Mic, prompt: "Role-play a skeptical client and let me pitch a solution demo for my target role, then score my pitch" },
  { cat: "Interviews", title: "Case interview: market sizing", body: "Estimate a market out loud; Plato scores your structure", meta: "30 min · Medium", icon: Mic, prompt: "Give me a market sizing case interview and score my structure" },
  { cat: "Interviews", title: "Case interview: profitability", body: "Find why profits fell, with a structure", meta: "30 min · Hard", icon: Mic, prompt: "Give me a profitability case interview" },
  { cat: "Interviews", title: "Voice mock interview", body: "Talk it through out loud, like the real thing", meta: "20 min · All levels", icon: Mic, href: "/career/interviews" },
  { cat: "Interviews", title: "Salary negotiation role-play", body: "Practice asking for more against a tough recruiter", meta: "10 min · All levels", icon: Mic, prompt: "Role-play a salary negotiation with me as a tough recruiter" },
  { cat: "Aptitude", title: "Numerical reasoning", body: "Timed questions, used by many consulting firms", meta: "18 min · Medium", icon: BarChart3, prompt: "Give me a numerical reasoning practice test, one question at a time" },
  { cat: "Aptitude", title: "Logical reasoning", body: "Patterns and deductions, one question at a time", meta: "15 min · Medium", icon: BarChart3, prompt: "Give me a logical reasoning practice test, one question at a time" },
  { cat: "Skills", title: "Skill assessment", body: "Adaptive test that measures your level", meta: "8 min · Adaptive", icon: ClipboardCheck, href: "/career/assessments" },
  { cat: "Skills", title: "Proof of skills challenge", body: "A real work sample, scored against a rubric", meta: "15–30 min", icon: Hammer, href: "/career/proof" },
  { cat: "Skills", title: "Close a skill gap", body: "Skills your matches ask for that aren't on your CV", meta: "Your matches", icon: Lightbulb, href: "/career/skills" },
  { cat: "Language", title: "Business English", body: "Writing and speaking for interviews, scored", meta: "20 min · All levels", icon: Languages, prompt: "Practice business English with me for job interviews and score me" },
  { cat: "Resume", title: "Resume score", body: "See what to fix before Plato applies", meta: "3 min", icon: FileText, prompt: "Score my resume out of 100 and list the quick fixes" },
  { cat: "Resume", title: "Build my resume", body: "From your profile, ready as a PDF", meta: "5 min", icon: FileText, prompt: "Build my resume" },
  { cat: "Resume", title: "Tailor to a job", body: "Paste a posting, get a resume that matches it", meta: "5 min", icon: LayoutTemplate, prompt: "Tailor my resume to a job. I'll paste the posting." },
]
const PAGE_SIZE = 6
const startHref = (p: Practice) => p.href ?? `/career?prompt=${encodeURIComponent(p.prompt ?? p.title)}`
const firstName = (full?: string) => {
  const f = full?.trim().split(/\s+/)[0]
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""
}

function CareerHome() {
  const { data, snap } = useSnapshot()
  return (
    <div className={PAGE}>
      <PageHeader
        title="Career"
        description="Where you stand, what to improve next, and practice that gets you ready for the jobs you want."
        actions={
          <Link href="/career/snapshot" data-ai="career.snapshot" className="flex h-10 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-semibold hover:border-primary-line">
            <Sparkles className="size-4 text-primary" />
            Profile snapshot
          </Link>
        }
      />
      {!data || !snap ? <HubSkeleton /> : <Hub data={data} snap={snap} />}
      <Library />
    </div>
  )
}

function HubSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl xl:col-span-2" />
    </div>
  )
}

function Hub({ data, snap }: { data: CareerData; snap: Snapshot }) {
  const name = firstName(data.name)
  const next = snap.recommendations[0]
  const known = snap.skills.filter((s) => s.status !== "gap").length
  return (
    <>
      {/* A. Where am I + B. What Plato knows */}
      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section data-tour="career-overview" aria-label="Career development overview" className="flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-0 flex-1 basis-[260px]">
              <p className="eyebrow">Your career development</p>
              <h2 className="mt-1 text-[22px] leading-tight font-extrabold tracking-tight">
                {name ? `${name}, you're at ` : "You're at "}
                <span className="text-primary">{STAGES[snap.stage]}</span>
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary">{STAGE_HINT[snap.stage]}</p>
            </div>
            <div className="flex items-center gap-3">
              <MatchRing value={snap.readiness} size={84} label={<span className="text-[22px] font-extrabold">{snap.readiness}</span>} />
              <span className="max-w-[130px] text-[13px] leading-snug text-text-secondary">
                Readiness for <b className="text-foreground">{data.role ? `${data.role} roles` : "the roles you want"}</b>
              </span>
            </div>
          </div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Your journey">
            {STAGES.map((s, i) => (
              <li key={s} aria-current={i === snap.stage ? "step" : undefined} className={cn("flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-[13px]", i === snap.stage ? "border-primary-line bg-primary-tint" : "bg-card")}>
                <span className={cn("h-1 rounded-full", i < snap.stage ? "bg-primary" : i === snap.stage ? "bg-primary/60" : "bg-divider")} />
                <span className={cn("font-semibold", i <= snap.stage ? "text-foreground" : "text-text-tertiary")}>
                  {i + 1}. {s}
                </span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {snap.dimensions.map((d) => (
              <Meter key={d.key} label={d.label} value={d.value} hint={d.hint} href={d.href} tone />
            ))}
          </div>
          {next && (
            <PlatoNote variant="headline" className="mt-auto">
              Plato has looked at {known} skill{known === 1 ? "" : "s"} from your profile{snap.activities ? `, ${snap.activities} scored activit${snap.activities === 1 ? "y" : "ies"}` : ""}
              {data.matches.length ? ` and your top ${data.matches.length} job matches` : ""}. Best next step: <b className="text-foreground">{next.title.replace(/^./, (c) => c.toLowerCase())}</b>.
            </PlatoNote>
          )}
        </section>

        <section data-tour="career-snapshot" aria-label="Profile snapshot" className="flex min-w-0 flex-col gap-3.5 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Profile snapshot</p>
            <span className="text-xs text-text-tertiary">What Plato knows</span>
          </div>
          <div className="flex flex-col gap-3">
            {snap.skills.slice(0, 5).map((s) =>
              s.level !== null ? (
                <Meter key={s.key} label={s.name} value={s.level} tone hint={s.evidence} />
              ) : (
                <div key={s.key} className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="min-w-0">
                    <b className="block truncate">{s.name}</b>
                    <span className="block truncate text-xs text-text-secondary">{s.evidence}</span>
                  </span>
                  <StatusPill tone={s.status === "gap" ? "warning" : "neutral"}>{s.status === "gap" ? "Gap" : "Unproven"}</StatusPill>
                </div>
              ),
            )}
            {!snap.skills.length && <p className="text-sm text-text-secondary">Add skills to your profile so Plato can assess them.</p>}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-divider pt-3 text-[13px]">
            <p>
              <b className="text-success-ink">Strengths: </b>
              <span className="text-text-secondary">{snap.strengths.slice(0, 2).join(" · ") || "Not measured yet"}</span>
            </p>
            <p>
              <b className="text-warning-ink">To improve: </b>
              <span className="text-text-secondary">{snap.weaknesses.slice(0, 2).join(" · ") || "Nothing flagged"}</span>
            </p>
          </div>
          <Link href="/career/snapshot" data-ai="career.snapshot.open" className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:border-primary-line">
            View full snapshot
            <ArrowRight className="size-4" />
          </Link>
        </section>
      </div>

      {/* C. What should I improve next */}
      <Section title="Recommended next" tour="career-recommendations" action={<span className="text-[13px] text-text-secondary">Ranked by how much each raises your readiness</span>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {snap.recommendations.slice(0, 3).map((r, i) => (
            <RecommendationCard key={r.id} r={r} index={i} primary={i === 0} />
          ))}
        </div>
      </Section>

      {/* D. Which practice */}
      <Section title="Assessment & practice" tour="career-modules">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Module icon={ClipboardCheck} title="Skill assessment" body="Adaptive tests that measure your real level in the skills on your CV and the ones your matches ask for." stat={snap.modules.assessment.done ? `${snap.modules.assessment.done} taken · best ${snap.modules.assessment.best}` : "Not started"}>
            <ModuleLink href="/career/assessments" data-ai="career.module.assessment" primary>
              Choose a skill
            </ModuleLink>
          </Module>
          <Module icon={Mic} title="AI interview" body="Practise answering out loud in writing, then get a score and feedback on every answer." stat={`${snap.modules.interview.done} general · ${snap.modules.simulation.done} job simulation${snap.modules.simulation.done === 1 ? "" : "s"}`} extra={<Link href="/career/interviews" data-ai="career.interviews.history" className="text-xs font-semibold text-primary hover:underline">History</Link>}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ModuleLink href="/career/interviews/general" data-ai="career.module.interview-general" primary sub="Any role, your focus">
                General interview
              </ModuleLink>
              <ModuleLink href="/career/interviews/simulate" data-ai="career.module.interview-job" sub="From a real job post">
                Job simulation
              </ModuleLink>
            </div>
          </Module>
          <Module icon={Hammer} title="Proof of skills" body="Real work samples (a query, a plan, a client email) scored against the rubric hiring managers use." stat={snap.modules.proof.done ? `${snap.modules.proof.done} submitted · best ${snap.modules.proof.best}` : "Not started"}>
            <ModuleLink href="/career/proof" data-ai="career.module.proof" primary>
              Browse challenges
            </ModuleLink>
          </Module>
        </div>
      </Section>

      {/* E. How have I improved + F. Latest results */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Section title="Development progress" tour="career-progress">
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat value={snap.activities} label="Activities scored" />
              <Stat value={snap.recent30} label="In the last 30 days" />
              <Stat value={snap.improvements.length} label="Skills improved" />
            </div>
            <Trend points={snap.history} />
            {snap.improvements.slice(0, 3).map((x) => (
              <p key={x.skill} className="text-[13px] text-text-secondary">
                <b className="text-foreground">{x.skill}</b> went from {x.from} to <b className="text-success-ink">{x.to}</b>
              </p>
            ))}
          </div>
          {(snap.continueItems.length > 0 || data.threads.length > 0) && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-text-secondary">Continue where you left off</h3>
              {snap.continueItems.slice(0, 2).map((c) => (
                <Row key={c.id} icon={Hammer} title={c.title} sub={c.sub} href={c.href} />
              ))}
              {data.threads.slice(0, 2).map((t) => (
                <Row key={t.id} icon={LayoutTemplate} title={t.title ?? "Career conversation"} sub={`Coach chat · last active ${timeAgo(t.updated_at)}`} href={`/career?thread=${t.id}`} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent results" tour="career-results" action={snap.history.length > 0 ? <Link href="/career/snapshot#history" className="text-sm font-semibold text-primary hover:underline">All results</Link> : undefined}>
          {snap.history.length ? (
            <div className="flex flex-col gap-2">
              {[...snap.history].reverse().slice(0, 5).map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card p-5 text-sm text-text-secondary">
              <b className="text-foreground">No results yet</b>
              Your scores and reports show up here after your first assessment, interview or challenge.
            </div>
          )}
          <DeviceNote />
        </Section>
      </div>
    </>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-primary-tint px-2 py-2.5">
      <b className={cn("block text-xl font-extrabold tabular-nums", value ? "text-primary" : "text-text-tertiary")}>{value}</b>
      <span className="text-[11.5px] text-text-secondary">{label}</span>
    </div>
  )
}

function Module({ icon, title, body, stat, extra, children }: { icon: LucideIcon; title: string; body: string; stat: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} />
        <b className="flex-1 text-base">{title}</b>
        {extra}
      </div>
      <p className="text-[13px] leading-relaxed text-text-secondary">{body}</p>
      <span className={cn("text-xs font-semibold", stat === "Not started" ? "text-text-tertiary" : "text-primary")}>{stat}</span>
      <div className="mt-auto">{children}</div>
    </div>
  )
}

function ModuleLink({ href, primary, sub, children, ...rest }: { href: string; "data-ai": string; primary?: boolean; sub?: string; children: ReactNode }) {
  return (
    <Link href={href} data-ai={rest["data-ai"]} className={cn("flex w-full flex-col items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-semibold transition-colors", primary ? "border-primary bg-primary text-white hover:bg-primary-hover" : "bg-card hover:border-primary-line")}>
      {children}
      {sub && <span className={cn("text-[11.5px] font-medium", primary ? "text-white/80" : "text-text-secondary")}>{sub}</span>}
    </Link>
  )
}

function Row({ icon, title, sub, href, action = "Resume" }: { icon: LucideIcon; title: string; sub: string; href: string; action?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3">
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{title}</b>
        <span className="block truncate text-xs text-text-secondary">{sub}</span>
      </span>
      <Link href={href} className="shrink-0 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary-line">
        {action}
      </Link>
    </div>
  )
}

// The practice library: every test and practice session, most start the career coach chat.
function Library() {
  const [cat, setCat] = useState<Cat>("All")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const list = useMemo(() => CATALOG.filter((p) => (cat === "All" || p.cat === cat) && (!q.trim() || `${p.title} ${p.body}`.toLowerCase().includes(q.trim().toLowerCase()))), [cat, q])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const shown = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  return (
    <section data-tour="career-library" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">
          Practice library <span className="text-base font-medium text-text-tertiary">· {CATALOG.length}</span>
        </h2>
        <label className="surface-panel flex h-10 w-full max-w-[260px] items-center gap-2 rounded-xl px-3">
          <Search className="size-4 text-text-tertiary" />
          <span className="sr-only">Search tests</span>
          <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search tests" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
        </label>
      </div>
      <div role="tablist" aria-label="Category" className="flex flex-wrap gap-2">
        {(["All", "Interviews", "Aptitude", "Skills", "Language", "Resume"] as Cat[]).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => (setCat(c), setPage(0))} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", cat === c ? "border-primary bg-primary text-white" : "bg-card text-foreground hover:border-primary-line")}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <div key={p.title} className="flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-card p-3.5">
            <div className="flex items-center justify-between">
              <IconTile icon={p.icon} />
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">{p.cat}</span>
            </div>
            <b className="line-clamp-2 min-h-[2.6em] text-[15px] leading-snug">{p.title}</b>
            <span className="line-clamp-1 text-[13px] text-text-secondary">{p.body}</span>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <span className="truncate text-[12.5px] font-medium text-text-secondary">{p.meta}</span>
              <Link href={startHref(p)} data-ai={`career.start:${p.title}`} className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 text-[13.5px] font-semibold hover:border-primary-line">
                Start
              </Link>
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-text-secondary">Nothing matches that search.</p>}
      </div>
      <div className="flex items-center justify-between text-[13px] text-text-tertiary">
        <span>
          Showing {list.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + shown.length} of {list.length}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
            <ChevronLeft className="size-4" />
          </button>
          <span className="tabular-nums">
            {page + 1} of {pages}
          </span>
          <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="flex size-8 items-center justify-center rounded-lg border bg-card disabled:opacity-40">
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>
    </section>
  )
}

// The chat opens when something was started (?prompt, ?job, ?thread, ?chat); otherwise the hub.
function CareerPageContent() {
  const params = useSearchParams()
  const chat = ["prompt", "job", "thread", "chat"].some((k) => params.has(k))
  return chat ? <CareerChat /> : <CareerHome />
}

export default function CareerPage() {
  return (
    <Suspense fallback={null}>
      <CareerPageContent />
    </Suspense>
  )
}

