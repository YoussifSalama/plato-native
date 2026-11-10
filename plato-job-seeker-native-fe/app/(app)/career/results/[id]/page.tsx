"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ChevronDown, RotateCcw, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { MatchRing, PlatoNote, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { Delta, DeviceNote, KIND, Meter, RecommendationCard, Section, scoreTone } from "@/components/career-hub"
import { levelLabel } from "@/lib/career-hub/content"
import { STAGES, computeSnapshot, useCareerData } from "@/lib/career-hub/snapshot"
import { useHubState } from "@/lib/career-hub/store"

const SELF = ["New to it", "Some exposure", "Comfortable", "Strong", "Expert"]

// One result: the score and why, how the profile snapshot moved, and the refreshed next steps.
export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const data = useCareerData()
  const { results, drafts } = useHubState()
  const r = results.find((x) => x.id === id)
  const [open, setOpen] = useState<number | null>(null)
  const before = useMemo(() => (data ? computeSnapshot(data, results, drafts, id) : null), [data, results, drafts, id])
  const after = useMemo(() => (data ? computeSnapshot(data, results, drafts) : null), [data, results, drafts])

  const crumbs = [{ label: "Career", href: "/career" }]
  if (!r)
    return (
      <div className={PAGE}>
        <PageHeader crumbs={crumbs} title="Result not found" description="Results are saved in the browser you took them in." />
        <Link href="/career" className="text-sm font-semibold text-primary">Back to Career</Link>
      </div>
    )

  const k = KIND[r.kind]
  const skillBefore = r.skill ? before?.skills.find((s) => s.key.toLowerCase() === r.skill!.toLowerCase())?.level ?? null : null
  const skillAfter = r.skill ? after?.skills.find((s) => s.key.toLowerCase() === r.skill!.toLowerCase())?.level ?? null : null
  const measured = r.selfRating ? Math.min(5, Math.max(1, Math.round(r.score / 20))) : null
  const verdict = r.score >= 75 ? "Strong result" : r.score >= 55 ? "Solid base, room to grow" : "A clear starting point"

  return (
    <div className={PAGE}>
      <PageHeader
        crumbs={crumbs}
        title={r.title}
        description={`${k.label} · ${new Date(r.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}${r.minutes ? ` · ${r.minutes} min` : ""}`}
        actions={
          <>
            <Link href={r.retryHref} data-ai="result.retry" className="flex h-10 items-center gap-1.5 rounded-xl border bg-card px-3.5 text-sm font-semibold hover:border-primary-line">
              <RotateCcw className="size-4" />
              Try again
            </Link>
            <Link href="/career" data-ai="result.back" className="flex h-10 items-center gap-1.5 rounded-xl border border-primary bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover">
              Back to Career
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4 sm:flex-col sm:gap-2 sm:px-4">
              <MatchRing value={r.score} size={112} label={<span className="text-[30px] font-extrabold">{r.score}</span>} />
              <span className="text-center">
                <b className={cn("block text-sm", scoreTone(r.score))}>{r.kind === "assessment" ? levelLabel(r.score) : verdict}</b>
                <span className="text-xs text-text-tertiary">out of 100</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              {r.breakdown.map((b) => (
                <Meter key={b.label} label={b.label} value={b.score} tone />
              ))}
              {measured && r.selfRating && (
                <PlatoNote variant="inline">
                  You rated yourself <b className="text-foreground">{SELF[r.selfRating - 1]}</b>; you scored like <b className="text-foreground">{SELF[measured - 1]}</b>.{" "}
                  {measured > r.selfRating ? "You're better than you think. Say so in interviews." : measured < r.selfRating ? "Worth a refresh before interviews that test it." : "Spot on."}
                </PlatoNote>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <b className="text-success-ink">What went well</b>
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {(r.strengths.length ? r.strengths : ["You finished it. That's the first data point."]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <b className="text-warning-ink">What to work on</b>
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {(r.improve.length ? r.improve : ["Nothing major. Try a harder challenge next."]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-warning" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Section title={r.kind === "proof" ? "Rubric" : r.kind === "assessment" ? "Every question, explained" : "Answer by answer"}>
            <div className="flex flex-col gap-2">
              {r.items.map((it, i) => {
                const full = it.score === it.max
                return (
                  <div key={i} className="rounded-2xl border bg-card">
                    <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold", it.max === 1 ? (full ? "bg-success-soft text-success-ink" : "bg-danger-soft text-destructive") : it.score >= 4 ? "bg-success-soft text-success-ink" : it.score >= 3 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive")}>
                        {it.max === 1 ? full ? <Check className="size-3.5" /> : <X className="size-3.5" /> : it.score}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-[14px] leading-snug">{it.label}</b>
                        <span className="mt-0.5 block text-[13px] text-text-secondary">{it.feedback}</span>
                      </span>
                      {it.answer && <ChevronDown className={cn("mt-1 size-4 shrink-0 text-text-tertiary transition-transform", open === i && "rotate-180")} />}
                    </button>
                    {open === i && it.answer && <p className="mx-4 mb-3 rounded-lg bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap text-text-secondary">{r.kind === "assessment" ? `Your answer: ${it.answer}` : it.answer}</p>}
                  </div>
                )
              })}
            </div>
            {r.submission && (
              <details className="rounded-2xl border bg-card px-4 py-3 text-sm">
                <summary className="cursor-pointer font-semibold">Your submission</summary>
                <pre className="scroll-thin mt-2 overflow-x-auto font-mono text-[12.5px] whitespace-pre-wrap text-text-secondary">{r.submission}</pre>
              </details>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          <section data-tour="results-snapshot" className="flex flex-col gap-3.5 rounded-2xl border border-primary-line bg-primary-tint/70 p-5">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.04em] text-primary uppercase">
              <Sparkles className="size-3.5" />
              Profile snapshot updated
            </p>
            {!before || !after ? (
              <Skeleton className="h-28" />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Readiness</span>
                  <span className="flex items-center gap-2">
                    <span className="text-text-tertiary tabular-nums">{before.readiness}</span>
                    <ArrowRight className="size-3.5 text-text-tertiary" />
                    <b className="tabular-nums">{after.readiness}</b>
                    <Delta value={after.readiness - before.readiness} />
                  </span>
                </div>
                {r.skill && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{r.skill}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-text-tertiary tabular-nums">{skillBefore ?? "unproven"}</span>
                      <ArrowRight className="size-3.5 text-text-tertiary" />
                      <b className="tabular-nums">{skillAfter ?? "—"}</b>
                      {skillBefore !== null && skillAfter !== null && <Delta value={skillAfter - skillBefore} />}
                    </span>
                  </div>
                )}
                {after.dimensions.map((d) => {
                  const b = before.dimensions.find((x) => x.key === d.key)?.value
                  return b !== d.value ? (
                    <div key={d.key} className="flex items-center justify-between gap-2 text-sm">
                      <span>{d.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-text-tertiary tabular-nums">{b ?? "—"}</span>
                        <ArrowRight className="size-3.5 text-text-tertiary" />
                        <b className="tabular-nums">{d.value ?? "—"}</b>
                      </span>
                    </div>
                  ) : null
                })}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Stage</span>
                  <StatusPill tone={after.stage > before.stage ? "success" : "primary"}>{STAGES[after.stage]}</StatusPill>
                </div>
                <Link href="/career/snapshot" data-ai="result.snapshot" className="flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:border-primary-line">
                  View profile snapshot
                  <ArrowRight className="size-4" />
                </Link>
              </>
            )}
          </section>

          {after && after.recommendations.length > 0 && (
            <Section title="Your next steps">
              <div className="flex flex-col gap-3">
                {after.recommendations.slice(0, 2).map((rec, i) => (
                  <RecommendationCard key={rec.id} r={rec} index={i} primary={i === 0} />
                ))}
              </div>
            </Section>
          )}
          <DeviceNote />
        </aside>
      </div>
    </div>
  )
}
