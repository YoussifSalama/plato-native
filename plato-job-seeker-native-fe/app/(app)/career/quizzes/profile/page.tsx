"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ArrowRight, Brain, Briefcase, CheckCircle2, ClipboardList, Compass, Info, Loader2, MessageSquareQuote, Sparkles, Target, UsersRound } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Kpi, MatchRing } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { formatTokens, getTokenEstimates } from "@/lib/credits/api"
import { getCandidateProfile, listAssessments, writeCandidateReport } from "@/lib/quizzes/api"
import type { AssessmentSummary, CandidateProfile, ScaleScore } from "@/lib/quizzes/contract"
import { ActionBar, ago, BTN_PRIMARY, BTN_SECONDARY, CATEGORY, MainCard, SideCard, TestHeader, TestLayout } from "../_ui/shell"

// The candidate profile: every standard assessment in one place, plus a recruiter-style report the AI writes from
// the computed scores (the only paid step).

export default function CandidateProfilePage() {
  const [p, setP] = useState<CandidateProfile | null>(null)
  const [all, setAll] = useState<AssessmentSummary[]>([])
  const [cost, setCost] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getCandidateProfile()
      .then(setP)
      .catch((e: Error) => setError(e.message))
    listAssessments()
      .then(setAll)
      .catch(() => undefined)
    getTokenEstimates()
      .then((e) => setCost(e.estimates.find((x) => x.action === "candidate_report")?.about ?? null))
      .catch(() => undefined)
  }, [])

  async function write() {
    setBusy(true)
    setError(null)
    try {
      const report = await writeCandidateReport()
      setP((x) => (x ? { ...x, report, reportStale: false } : x))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the report")
    } finally {
      setBusy(false)
    }
  }

  if (!p)
    return (
      <div className={PAGE}>
        <Skeleton className="h-16 w-80 rounded-xl" />
        {error ? (
          <p role="alert" className="rounded-2xl border bg-card p-6 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <TestLayout main={<Skeleton className="h-[620px] rounded-2xl" />} side={<Skeleton className="h-72 rounded-2xl" />} />
        )}
      </div>
    )

  const todo = all.filter((a) => a.attempts === 0 && a.category !== "reasoning")
  const nextMatrix = all.find((a) => a.category === "reasoning" && a.attempts === 0)
  const empty = p.done === 0
  return (
    <div className={PAGE}>
      <TestHeader eyebrow="Built from your assessments" title="Your candidate profile" />
      <TestLayout
        main={
          <MainCard
            top={
              <div className="-mx-2 grid grid-cols-2 gap-1 md:grid-cols-4">
                <Kpi icon={ClipboardList} value={`${p.done}/${p.total}`} label="Assessments done" index={0} />
                <Kpi icon={Brain} value={p.reasoning ? `${p.reasoning.percentile}` : "—"} label="Reasoning percentile" index={1} />
                <Kpi icon={Target} accent="teal" value={p.reasoning?.items ?? 0} label="Grids solved or tried" index={2} />
                <Kpi icon={Sparkles} accent="azure" value={p.report ? (p.reportStale ? "Out of date" : "Ready") : "Not yet"} label="Report" index={3} />
              </div>
            }
            bar={
              <ActionBar
                left={
                  <Link href="/career/quizzes" className={BTN_SECONDARY}>
                    <ArrowLeft className="size-4" /> All assessments
                  </Link>
                }
                note={
                  error ? (
                    <span role="alert" className="text-destructive">
                      {error}
                    </span>
                  ) : empty ? (
                    "Finish at least one assessment to write a report."
                  ) : cost ? (
                    `About ${formatTokens(cost)} tokens. Taking assessments is free.`
                  ) : null
                }
                right={
                  <button type="button" onClick={() => void write()} disabled={busy || empty || (!!p.report && !p.reportStale)} className={BTN_PRIMARY}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {busy ? "Writing…" : p.report ? (p.reportStale ? "Update my report" : "Report is up to date") : "Write my report"}
                  </button>
                }
              />
            }
          >
            <div className="flex flex-col gap-8">
              <div className="grid gap-4 md:grid-cols-2">
                <Block title="Reasoning" icon={Brain}>
                  {p.reasoning ? (
                    <div className="flex items-center gap-5">
                      <MatchRing value={p.reasoning.percentile} size={88} stroke={8} label={<span className="text-2xl">{p.reasoning.percentile}</span>} />
                      <p className="text-sm text-text-secondary">
                        Above <b className="text-foreground">{p.reasoning.percentile}%</b> of the calibration group, pooled over {p.reasoning.items} grids from {p.reasoning.tests} set
                        {p.reasoning.tests === 1 ? "" : "s"}. More sets make it more precise.
                      </p>
                    </div>
                  ) : (
                    <Invite
                      text="Matrix reasoning measures the fluid reasoning that IQ tests are built on. 20 grids, 25 minutes."
                      href={`/career/quizzes/assessments/${nextMatrix?.slug ?? "matrix-1"}`}
                      cta="Take Set 1"
                    />
                  )}
                </Block>
                <Block title="Personality" icon={UsersRound}>
                  {p.domains ? (
                    <div className="flex flex-col gap-3">
                      {p.domains.map((d) => (
                        <MiniBar key={d.key} s={d} />
                      ))}
                    </div>
                  ) : (
                    <Invite
                      text="The Big Five is the most researched model of personality. The quick check takes 3 minutes."
                      href="/career/quizzes/assessments/big-five-quick"
                      cta="Take the quick check"
                    />
                  )}
                </Block>
              </div>

              {p.highlights.length > 0 && (
                <Block title="What stands out" icon={Compass}>
                  <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                    {p.highlights.map((s) => (
                      <MiniBar key={s.key} s={s} />
                    ))}
                  </div>
                </Block>
              )}

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                  <MessageSquareQuote className="size-5 text-primary" /> Recruiter&apos;s report
                </h2>
                {p.report ? (
                  <div className="flex flex-col gap-5">
                    {p.reportStale && (
                      <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
                        <AlertTriangle className="size-4 shrink-0" /> You finished assessments after this report. Update it to include them.
                      </p>
                    )}
                    <p className="text-[15px] leading-relaxed text-foreground">{p.report.summary}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <ListBlock title="Strengths" icon={CheckCircle2} tone="text-success-ink" items={p.report.strengths} />
                      <ListBlock title="An interviewer may probe" icon={AlertTriangle} tone="text-warning-ink" items={p.report.watchouts} />
                    </div>
                    <div className="rounded-2xl border p-5">
                      <h3 className="mb-2 text-sm font-semibold">How you likely work</h3>
                      <p className="text-sm leading-relaxed text-text-secondary">{p.report.workStyle}</p>
                    </div>
                    <div className="rounded-2xl border p-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Briefcase className="size-4 text-text-tertiary" /> Roles that fit
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {p.report.roles.map((r) => (
                          <span key={r} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ListBlock title="Prepare for these interview questions" icon={MessageSquareQuote} tone="text-primary" items={p.report.interviewPrep} numbered />
                    <p className="text-xs text-text-tertiary">Written {ago(p.report.createdAt)} from your scores only. It describes tendencies, not fixed traits.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-center">
                    <Sparkles className="mx-auto mb-2 size-6 text-primary" />
                    <p className="font-semibold">Your report appears here</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
                      Plato reads your scores like a recruiter would: a screening note, strengths, what an interviewer may probe, roles that fit and questions to prepare. Use the button below.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </MainCard>
        }
        side={
          <>
            <SideCard title="Latest results" icon={ClipboardList}>
              {p.latest.length === 0 ? (
                <p className="text-sm text-text-secondary">Nothing yet. Start with the 3-minute Big Five quick check, or a matrix set.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {p.latest.map((l) => {
                    const c = CATEGORY[l.category]
                    return (
                      <li key={l.slug}>
                        <Link href={`/career/quizzes/assessments/${l.slug}/results/${l.attemptId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", c.tint)}>
                            <c.icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{l.title}</span>
                            <span className="block truncate text-xs text-text-tertiary">
                              {l.headline} · {ago(l.createdAt)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SideCard>
            {todo.length > 0 && (
              <SideCard title="Complete your profile" icon={Target}>
                <ul className="-mx-2 flex flex-col">
                  {todo.slice(0, 5).map((a) => (
                    <li key={a.slug}>
                      <Link href={`/career/quizzes/assessments/${a.slug}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.title}</span>
                          <span className="block text-xs text-text-tertiary tabular-nums">
                            {a.questionCount} questions · {a.minutes} min
                          </span>
                        </span>
                        <ArrowRight className="size-4 text-text-tertiary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </SideCard>
            )}
            <SideCard title="How this works" icon={Info}>
              <p className="text-sm leading-relaxed text-text-secondary">
                The questions come from validated research banks, not from AI. Scores are computed by formula. The AI only turns your numbers into words, and never sees anything else about you.
              </p>
            </SideCard>
          </>
        }
      />
    </div>
  )
}

function Block({ title, icon: Icon, children }: { title: string; icon: typeof Brain; children: ReactNode }) {
  return (
    <section className="rounded-2xl border p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-text-tertiary" /> {title}
      </h2>
      {children}
    </section>
  )
}

function Invite({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary">{text}</p>
      <Link href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary hover:bg-primary-soft/70">
        {cta} <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

function MiniBar({ s }: { s: ScaleScore }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{s.name}</span>
        <b className="tabular-nums">{s.score}</b>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, s.score)}%` }} />
      </div>
    </div>
  )
}

function ListBlock({ title, icon: Icon, tone, items, numbered }: { title: string; icon: typeof Brain; tone: string; items: string[]; numbered?: boolean }) {
  return (
    <div className="rounded-2xl border p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("size-4", tone)} /> {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-text-secondary">
            {numbered ? <span className="w-5 shrink-0 font-semibold text-primary tabular-nums">{i + 1}.</span> : <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-50" />}
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
