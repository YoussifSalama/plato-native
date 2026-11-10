"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CircleCheck, Gauge, History, LineChart, MessagesSquare, Mic, PlayCircle, Trophy } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { CARD, EmptyState, MatchRing, SectionHeader, StatTile, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerGlow, Trend } from "@/components/career-hub"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
import { timeAgo } from "@/lib/jobs/links"
import { useHubState } from "@/lib/career-hub/store"
import { styleLabel, summaryName } from "@/lib/interviews/flow"
import { enter } from "../practice-ui"

// Interviews: ONE way in (the interview flow asks what you want to practise and takes you
// there), what is unfinished, how you're doing, and every interview you did.
type Row = { id: string; server: boolean; title: string; sub: string; how: "chat" | "voice"; style: "real" | "coach"; score: number | null; at: string; href: string }

export default function InterviewsPage() {
  const [jobs, setJobs] = useState<InterviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listInterviews().then(setJobs, (e) => setError(e instanceof Error ? e.message : "Could not load your interviews"))
  }, [])
  const { results } = useHubState()

  const rows = useMemo<Row[]>(() => {
    const local: Row[] = results
      .filter((r) => r.kind === "interview" || r.kind === "simulation")
      .map((r) => ({ id: r.id, server: false, title: r.title, sub: r.subtitle, how: r.how ?? "chat", style: r.style ?? "real", score: r.score, at: r.createdAt, href: `/career/results/${r.id}` }))
    const server: Row[] = (jobs ?? []).map((i) => ({ id: i.id, server: true, title: summaryName(i), sub: i.target === "general" ? (i.role ?? i.jobTitle ?? "") : i.company, how: "chat", style: i.style ?? "real", score: i.completedAt ? i.score : null, at: i.completedAt ?? i.createdAt, href: `/career/interviews/${i.id}` }))
    return [...local, ...server].sort((a, b) => b.at.localeCompare(a.at))
  }, [results, jobs])

  const unfinished = rows.filter((r) => r.server && r.score === null).slice(0, 3)
  const done = rows.filter((r) => r.score !== null)
  const scores = done.map((r) => r.score as number)
  const loading = !jobs && !error
  const stat = (v: number | null) => (loading || v === null ? "—" : v)
  const trend = [...done].reverse().map((r) => ({ id: r.id, kind: "interview" as const, title: r.title, subtitle: r.sub, score: r.score as number, at: r.at, href: r.href }))

  return (
    <div className={PAGE} data-tour-state={loading ? undefined : rows.length ? "interviews.history" : "interviews.empty"}>
      <PageHeader title="Interviews" description="Practise any interview, for a job, a role or a tough situation, and keep every score in one place.">
        <CareerNav />
      </PageHeader>

      {/* The one way in. */}
      <section data-tour="interviews-start" className={cn(CARD, "relative isolate flex flex-col gap-5 overflow-hidden p-5 sm:flex-row sm:items-center sm:p-7")}>
        <CareerGlow />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Interview practice</p>
          <h2 className="mt-1 text-[22px] leading-tight font-extrabold tracking-tight text-balance text-foreground sm:text-[26px]">What are you preparing for?</h2>
          <p className="mt-1.5 max-w-[58ch] text-[14.5px] leading-relaxed text-text-secondary">A few quick questions: the job or role, out loud or in writing, real or coached. Then Plato takes you straight into the interview, with your score and feedback at the end.</p>
        </div>
        <Link href="/career/interviews/new" data-ai="interviews.new" className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-[background-color,box-shadow] duration-200 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/35">
          Practise an interview
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </section>

      {unfinished.length > 0 && (
        <section data-tour="interviews-continue" className="flex flex-col gap-3">
          <SectionHeader title="Continue" icon={PlayCircle} accent="cobalt" />
          <div className={cn(CARD, "p-1.5 sm:p-2")}>
            {unfinished.map((r) => (
              <Link key={r.id} href={r.href} data-ai={`interviews.continue:${r.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-primary-tint">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary-line text-primary">
                  <MessagesSquare className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px] text-foreground">{r.title}</b>
                  <span className="type-meta block truncate text-text-secondary">
                    {r.sub ? `${r.sub} · ` : ""}started {timeAgo(r.at)}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">Continue</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section data-tour="interviews-stats" className="flex flex-col gap-3">
        <SectionHeader title="Your progress" icon={LineChart} accent="cobalt" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile value={stat(rows.length)} label="Interviews" icon={Mic} accent="cobalt" index={0} />
          <StatTile value={stat(done.length)} label="Finished" icon={CircleCheck} accent="green" index={1} />
          <StatTile value={stat(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null)} label="Average score" icon={Gauge} accent="azure" index={2} />
          <StatTile value={stat(scores.length ? Math.max(...scores) : null)} label="Best score" icon={Trophy} accent="amber" index={3} />
        </div>
        {done.length >= 2 && (
          <div data-tour="interviews-trend" className={cn(CARD, "p-4")}>
            <Trend points={trend} />
          </div>
        )}
      </section>

      <section data-tour="interviews-history" className="flex flex-col gap-3">
        <SectionHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Your interviews
              <InfoTip text="Written interviews are saved to your account. Voice calls are scored on Plato's server and their results kept in this browser. Average and best count finished interviews only." label="Where interviews are saved" />
            </span>
          }
          icon={History}
          accent="cobalt"
        />
        {error && <p className="rounded-xl border border-l-[3px] border-l-destructive bg-card p-3 text-sm text-destructive shadow-card">{error}. Interviews kept in this browser are still listed below.</p>}
        <div className={cn(CARD, "p-1.5 sm:p-2")}>
          {loading && (
            <div aria-busy="true" className="flex flex-col gap-2 p-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          )}
          {!loading && rows.length === 0 && <EmptyState icon={Mic} className="m-2 border-0" title="No interviews yet" hint="Your first one takes about 15 minutes and shows exactly what to fix." />}
          {!loading && rows.length > 0 && (
            <ul className="flex flex-col">
              {rows.map((r, i) => {
                const e = enter(i)
                const body = (
                  <>
                    {r.score !== null ? <MatchRing value={r.score} size={40} label={r.score} /> : <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border text-text-tertiary">{r.how === "voice" ? <Mic className="size-4" /> : <MessagesSquare className="size-4" />}</span>}
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] text-foreground">{r.title}</b>
                      <span className="type-meta block truncate text-text-secondary">
                        {r.sub ? `${r.sub} · ` : ""}
                        {timeAgo(r.at)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      <StatusPill tone="primary">
                        {r.how === "voice" ? <Mic className="size-3" /> : <MessagesSquare className="size-3" />}
                        {r.how === "voice" ? "Voice" : "Chat"}
                      </StatusPill>
                      <StatusPill tone="neutral">{styleLabel(r.style)}</StatusPill>
                    </span>
                    {r.score === null && <StatusPill tone="warning">Not finished</StatusPill>}
                    <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </>
                )
                const cls = "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-muted/60"
                return (
                  <li key={`${r.server ? "s" : "l"}-${r.id}`} className={e.className} style={e.style}>
                    {r.server ? (
                      <Link href={r.href} data-ai={`interviews.row:${r.id}`} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <Link href={r.href} data-ai={`career.result:${r.id}`} className={cls}>
                        {body}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
