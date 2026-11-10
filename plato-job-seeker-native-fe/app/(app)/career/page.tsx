"use client"

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Activity as ActivityIcon, ArrowRight, BadgeCheck, CalendarClock, Compass, Hammer, History, LayoutTemplate, MessageCircle, Mic, Sparkles, TrendingUp, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, EmptyState, StatTile, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { ActivityRow, CareerGlow, DIMENSION_INFO, DeviceNote, IconTile, LoadError, Meter, OUTLINE_CTA, PartialNote, RecommendationCard, ScoreRing, Section } from "@/components/career-hub"
import { STAGES, STAGE_HINT, useSnapshot, type CareerData, type Snapshot } from "@/lib/career-hub/snapshot"
import { timeAgo } from "@/lib/jobs/links"
import { openCoach } from "@/components/coach-assistant"

// Career overview: where am I, what next, and what I was doing, in that order and nothing more.
// Every part of Career is one click away in the CareerNav under the header; the full practice
// catalog lives in its own tab (/career/library). With ?prompt|job|thread|chat it is the coach chat.
const firstName = (full?: string) => {
  const f = full?.trim().split(/\s+/)[0]
  return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""
}

function CareerHome() {
  const { data, snap, error, partial, reload } = useSnapshot()
  return (
    <div className={PAGE}>
      <PageHeader
        title="Career"
        description="Where you stand, what to improve next, and practice that gets you ready for the jobs you want."
        actions={
          <Link href="/career?chat=new" data-ai="career.coach" className={cn(OUTLINE_CTA, "h-10 rounded-xl px-3.5")}>
            <MessageCircle className="size-4 text-primary" />
            Ask your coach
          </Link>
        }
      />
      <CareerNav />
      {partial && data && <PartialNote missing={data.failed} onRetry={reload} />}
      {error ? <LoadError onRetry={reload} /> : !data || !snap ? <HubSkeleton /> : <Hub data={data} snap={snap} />}
    </div>
  )
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading your career overview">
      <Skeleton className="h-60 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    </div>
  )
}

function Hub({ data, snap }: { data: CareerData; snap: Snapshot }) {
  const name = firstName(data.name)
  const own = snap.skills.filter((s) => s.status !== "gap")
  const proven = own.filter((s) => s.status === "proven").length
  const continueRows = [
    ...snap.continueItems.slice(0, 3).map((c) => ({ id: c.id, icon: c.href.startsWith("/career/interviews") ? Mic : Hammer, title: c.title, sub: c.sub, href: c.href })),
    ...data.threads.slice(0, 2).map((t) => ({ id: t.id, icon: LayoutTemplate, title: t.title ?? "Career conversation", sub: `Coach chat · last active ${timeAgo(t.updated_at)}`, href: `/career?thread=${t.id}` })),
  ]
  return (
    <>
      {/* 1. Where am I: stage, readiness and the four dimensions, with what Plato knows beside it. */}
      <section data-tour="career-overview" data-tour-state={snap.history.length ? "career.results" : "career.new"} aria-label="Career development overview" className={cn(CARD, "relative isolate grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]")}>
        <CareerGlow />
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="min-w-0 flex-1 basis-[260px]">
              <p className="eyebrow">Your career development</p>
              <h2 className="mt-1 text-[22px] leading-tight font-extrabold tracking-tight text-balance">
                {name ? `${name}, you're at ` : "You're at "}
                <span className="text-primary">{STAGES[snap.stage]}</span>{" "}
                <InfoTip text="Your stage follows your scores: Get started until your first scored activity, then Build evidence while readiness is under 55, Practise interviews under 75, and Stand out from 75." label="How your stage is set" />
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary">{STAGE_HINT[snap.stage]}</p>
            </div>
            <div className="flex items-center gap-3">
              <ScoreRing value={snap.readiness} size={84} />
              <span className="max-w-[140px] text-[13px] leading-snug text-text-secondary">
                Readiness for <b className="text-foreground">{data.role ? `${data.role} roles` : "the roles you want"}</b>{" "}
                <InfoTip text="A 0–100 estimate of how ready you look to employers for this role: your resume score, interview practice, skills you've proven and your work samples. It rises as you complete the steps below." label="What readiness means" />
              </span>
            </div>
          </div>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4" aria-label="Your journey">
            {STAGES.map((s, i) => (
              <li key={s} aria-current={i === snap.stage ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5 text-[13px]">
                <span className={cn("h-1.5 rounded-full", i < snap.stage ? "bg-primary" : i === snap.stage ? "bg-primary/60" : "bg-divider")} />
                <span className={cn("truncate font-semibold", i === snap.stage ? "text-primary" : i < snap.stage ? "text-foreground" : "text-text-tertiary")}>
                  {i + 1}. {s}
                </span>
              </li>
            ))}
          </ol>
          <div data-tour="career-dimensions" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {snap.dimensions.map((d) => (
              <Meter key={d.key} label={d.label} value={d.value} hint={d.hint} href={d.href} info={DIMENSION_INFO[d.key]} tone />
            ))}
          </div>
        </div>

        <div data-tour="career-snapshot" aria-label="Profile snapshot" className="flex min-w-0 flex-col gap-3 border-t border-divider bg-card/60 p-5 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Profile snapshot</p>
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span>
                <b className="text-success-ink tabular-nums">{proven}</b> proven · <b className="tabular-nums text-foreground">{own.length - proven}</b> to prove
              </span>
              <InfoTip text="Proven: your latest assessment or challenge score is 65 or more, or you have a verified certificate. Unproven skills are on your CV with no score yet; a Gap is a skill your matches ask for that your CV doesn't show." label="What proven and unproven mean" />
            </span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {snap.skills.slice(0, 5).map((s) => (
              <li key={s.key}>
                {s.level !== null ? (
                  <Meter label={s.name} value={s.level} tone />
                ) : (
                  <span className="flex items-center justify-between gap-2 text-[13.5px]">
                    <b className="min-w-0 truncate">{s.name}</b>
                    <StatusPill tone={s.status === "gap" ? "warning" : "neutral"}>{s.status === "gap" ? "Gap" : "Unproven"}</StatusPill>
                  </span>
                )}
              </li>
            ))}
            {!snap.skills.length && <li className="text-sm text-text-secondary">Add skills to your profile so Plato can assess them.</li>}
          </ul>
          <Link href="/career/snapshot" data-ai="career.snapshot" className="group mt-auto inline-flex items-center gap-1 text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
            Full snapshot
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* 2. What next: three steps ranked by impact; the first is the one solid action. */}
      {snap.recommendations.length > 0 && (
        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              Recommended next
            </span>
          }
          icon={Compass} tour="career-recommendations" action={
            <span className="type-meta flex items-center gap-1.5 text-text-secondary">
              Ranked by how much each raises your readiness
              <InfoTip text="High impact: your first interview, scoring a CV skill that has no level yet, a skill your matches ask for, or rehearsing your best match once you've practised. Retakes, resume fixes and extra practice are Medium." label="What impact means" />
            </span>
          }>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {snap.recommendations.slice(0, 3).map((r, i) => (
              <RecommendationCard key={r.id} r={r} index={i} primary={i === 0} />
            ))}
          </div>
        </Section>
      )}

      {/* 3. Continue | Recent results */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Section title="Continue where you left off" icon={History} tour="career-continue">
          <div className={cn(CARD, "p-2")}>
            {continueRows.length ? (
              continueRows.map((c) => <ContinueRow key={c.id} {...c} />)
            ) : (
              <EmptyState icon={CalendarClock} className="m-2 border-none" title="Nothing in progress" hint="Unfinished interviews, proof drafts and coach chats wait here for you." />
            )}
          </div>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1.5">
              Recent results
              <InfoTip text="Scored counts every finished assessment, interview and challenge. Skills improved counts skills whose latest score beats the first time you measured them." label="What these numbers mean" />
            </span>
          }
          icon={TrendingUp}
          tour="career-results"
          action={
            snap.history.length > 0 ? (
              <Link href="/career/snapshot#history" data-ai="career.results.all" className="group inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover">
                All results
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={snap.activities} label="Scored" icon={ActivityIcon} accent="cobalt" index={0} className="min-w-0 px-3" />
            <StatTile value={snap.recent30} label="Last 30 days" icon={CalendarClock} accent="azure" index={1} className="min-w-0 px-3" />
            <StatTile value={snap.improvements.length} label="Skills improved" icon={BadgeCheck} accent="cobalt" index={2} className="min-w-0 px-3" />
          </div>
          <div className={cn(CARD, "p-2")}>
            {snap.history.length ? (
              [...snap.history].reverse().slice(0, 5).map((a) => <ActivityRow key={a.id} a={a} />)
            ) : (
              <EmptyState icon={Sparkles} className="m-2 border-none" title="No results yet" hint="Scores and reports show up here after your first assessment, interview or challenge." />
            )}
          </div>
          <DeviceNote />
        </Section>
      </div>
    </>
  )
}

function ContinueRow({ icon, title, sub, href }: { icon: LucideIcon; title: string; sub: string; href: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-muted/60">
      <IconTile icon={icon} accent="cobalt" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{title}</b>
        <span className="block truncate text-xs text-text-secondary">{sub}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-primary">Resume</span>
      <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
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

