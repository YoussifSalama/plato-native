"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, ChevronDown, Compass, ListChecks, RotateCcw, SearchX, Sparkles, Target, TrendingUp, X } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, EmptyState, PlatoNote, SectionHeader, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { CareerGlow, Delta, DeviceNote, KIND, Meter, OUTLINE_CTA, RecommendationCard, ScoreRing, Section, SOFT_CTA, scoreTone } from "@/components/career-hub"
import { levelLabel } from "@/lib/career-hub/content"
import { STAGES, computeSnapshot, useCareerData } from "@/lib/career-hub/snapshot"
import { useHubState, type HubKind } from "@/lib/career-hub/store"
import { FlowShell } from "../../interviews/flow-ui"
import { InterviewResult, fromHub } from "../../interviews/interview-result"

const SELF = ["New to it", "Some exposure", "Comfortable", "Strong", "Expert"]
// The Career tab each kind of result belongs to: the breadcrumb and the way back.
const PARENT: Record<HubKind, { label: string; href: string }> = {
  assessment: { label: "Assessments", href: "/career/assessments" },
  interview: { label: "Interviews", href: "/career/interviews" },
  simulation: { label: "Interviews", href: "/career/interviews" },
  proof: { label: "Proof of skills", href: "/career/proof" },
}

// One plain sentence on what the score means for the seeker's snapshot.
function meaning(kind: HubKind, score: number) {
  if (kind === "assessment")
    return score >= 65 ? "This counts as proven on your profile snapshot, so employers see a measured level instead of a keyword." : "Not proven yet: your snapshot needs 65. Read the explanations below, then retake it."
  if (kind === "proof") return score >= 70 ? "Passed. It counts as proof of work on your snapshot." : "Not passed yet: a challenge needs 70. Cover the rubric points you missed and submit again."
  return score >= 75 ? "Answers like these hold up in a real interview. Keep them fresh before the real one." : score >= 55 ? "A solid base. Tighten the structure and back each answer with a result or a number." : "Start with the feedback on each answer below, then practise again."
}

// How the score was worked out, per kind (lib/career-hub/scoring.ts and the assessment page).
const HOW: Record<HubKind, string> = {
  assessment: "Right answers count by difficulty (harder ones are worth more) out of the most you could get. Levels: Beginner under 40, Developing 40–64, Proficient 65–84, Advanced 85+. The bars show your share right per topic.",
  interview: "Each answer gets 1–5 from fixed checks (length, a number, what you did, a clear result). The total is 80% answers and 20% communication. 75+ is strong, 55+ a solid base.",
  simulation: "Each answer gets 1–5 from fixed checks (length, a number, what you did, a clear result). The total is 80% answers and 20% communication. 75+ is strong, 55+ a solid base.",
  proof: "80% for the rubric points your answer covers and 20% for depth, which is full at the challenge's target length. 70 or more passes.",
}

// One result: the score and what it means, what went well and what to work on, every
// answer, how the profile snapshot moved, and the one thing to do next.
export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const data = useCareerData()
  const { results, drafts } = useHubState()
  const r = results.find((x) => x.id === id)
  const [open, setOpen] = useState<number | null>(null)
  const before = useMemo(() => (data ? computeSnapshot(data, results, drafts, id) : null), [data, results, drafts, id])
  const after = useMemo(() => (data ? computeSnapshot(data, results, drafts) : null), [data, results, drafts])

  if (!r)
    return (
      <div className={PAGE} data-tour-state="result.missing">
        <PageHeader crumbs={[{ label: "Career", href: "/career" }]} title="Result not found" />
        <CareerNav />
        <EmptyState
          icon={SearchX}
          className="bg-card py-10"
          title="This result isn't on this device"
          hint="Practice scores are saved in the browser you took them in. Open it there, or take the practice again."
          action={
            <Link href="/career" data-ai="result.back" className={SOFT_CTA}>
              Back to Career
            </Link>
          }
        />
      </div>
    )

  // Interviews (voice calls and older written practice) share the interview result screen.
  if (r.kind === "interview" || r.kind === "simulation")
    return (
      // The wrapper only names the screen for the page tour; it lays out like FlowShell's own root.
      <div data-tour-state="result.interview" className="flex flex-1 flex-col">
        <FlowShell step={7} name="Result">
          <InterviewResult r={fromHub(r)} />
        </FlowShell>
      </div>
    )

  const k = KIND[r.kind]
  const parent = PARENT[r.kind]
  const skillBefore = r.skill ? before?.skills.find((s) => s.key.toLowerCase() === r.skill!.toLowerCase())?.level ?? null : null
  const skillAfter = r.skill ? after?.skills.find((s) => s.key.toLowerCase() === r.skill!.toLowerCase())?.level ?? null : null
  const measured = r.selfRating ? Math.min(5, Math.max(1, Math.round(r.score / 20))) : null
  const verdict = r.score >= 75 ? "Strong result" : r.score >= 55 ? "Solid base, room to grow" : "A clear starting point"
  const next = after?.recommendations.slice(0, 2) ?? []

  return (
    <div className={PAGE} data-tour-state={`result.${r.kind}`}>
      <PageHeader
        crumbs={[{ label: "Career", href: "/career" }, parent]}
        title={r.title}
        description={`${k.label} · ${new Date(r.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}${r.minutes ? ` · ${r.minutes} min` : ""}`}
        actions={
          <>
            <Link href={parent.href} data-ai="result.back" className={cn(OUTLINE_CTA, "h-10 rounded-xl px-3.5")}>
              <ArrowLeft className="size-4" />
              Back to {parent.label}
            </Link>
            <Link href={r.retryHref} data-ai="result.retry" className={cn(OUTLINE_CTA, "h-10 rounded-xl px-3.5")}>
              <RotateCcw className="size-4" />
              Try again
            </Link>
          </>
        }
      />
      <CareerNav active={parent.href} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section data-tour="results-score" aria-label="Score" className={cn(CARD, "relative isolate flex flex-col gap-5 overflow-hidden p-5 sm:flex-row sm:items-center sm:p-6")}>
            <CareerGlow />
            <div className="flex items-center gap-4 sm:w-[200px] sm:shrink-0 sm:flex-col sm:gap-2 sm:text-center">
              <ScoreRing value={r.score} size={112} />
              <span>
                <b className={cn("block text-sm", scoreTone(r.score))}>{r.kind === "assessment" ? levelLabel(r.score) : verdict}</b>
                <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                  out of 100
                  <InfoTip text={HOW[r.kind]} label="How this score is worked out" />
                </span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <div>
                <p className="eyebrow">What it means</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-foreground">{meaning(r.kind, r.score)}</p>
              </div>
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

          <div data-tour="results-feedback" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-success p-4")}>
              <SectionHeader as="h3" title="What went well" icon={Sparkles} accent="green" />
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {(r.strengths.length ? r.strengths : ["You finished it. That's the first data point."]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-warning p-4")}>
              <SectionHeader as="h3" title="What to work on" icon={Target} accent="amber" />
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

          <Section title={r.kind === "proof" ? "Rubric" : r.kind === "assessment" ? "Every question, explained" : "Answer by answer"} icon={ListChecks} tour="results-items">
            <div className={cn(CARD, "overflow-hidden")}>
              {r.items.map((it, i) => {
                const full = it.score === it.max
                return (
                  <div key={i} className="border-b border-divider last:border-b-0">
                    <button type="button" data-ai={`result.item:${i}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={it.answer ? open === i : undefined} disabled={!it.answer} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-200 enabled:hover:bg-muted/40 disabled:cursor-default">
                      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold", it.max === 1 ? (full ? "bg-success-soft text-success-ink" : "bg-danger-soft text-destructive") : it.score >= 4 ? "bg-success-soft text-success-ink" : it.score >= 3 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive")}>
                        {it.max === 1 ? full ? <Check className="size-3.5" /> : <X className="size-3.5" /> : it.score}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-[14px] leading-snug">{it.label}</b>
                        <span className="mt-0.5 block text-[13px] text-text-secondary">{it.feedback}</span>
                      </span>
                      {it.answer && <ChevronDown className={cn("mt-1 size-4 shrink-0 text-text-tertiary transition-transform duration-200", open === i && "rotate-180")} />}
                    </button>
                    {open === i && it.answer && <p className="mx-4 mb-3 rounded-lg bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap text-text-secondary">{r.kind === "assessment" ? `Your answer: ${it.answer}` : it.answer}</p>}
                  </div>
                )
              })}
            </div>
            {r.submission && (
              <details data-tour="results-submission" className={cn(CARD, "px-4 py-3 text-sm")}>
                <summary className="cursor-pointer font-semibold">Your submission</summary>
                <pre className="scroll-thin mt-2 overflow-x-auto font-mono text-[12.5px] whitespace-pre-wrap text-text-secondary">{r.submission}</pre>
              </details>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          {next.length > 0 && (
            <Section title="Do next" icon={Compass} tour="results-next">
              <div className="flex flex-col gap-3">
                {next.map((rec, i) => (
                  <RecommendationCard key={rec.id} r={rec} index={i} primary={i === 0} />
                ))}
              </div>
            </Section>
          )}

          <section data-tour="results-snapshot" className={cn(CARD, "flex flex-col gap-3.5 p-5")}>
            <SectionHeader
              as="h3"
              title={
                <span className="inline-flex items-center gap-1.5">
                  Your snapshot moved
                  <InfoTip text="Each row shows your snapshot without this result, then with it. The resume, interviewing, skills and proof rows appear only when this result changed them." label="What before and after compare" />
                </span>
              }
              icon={TrendingUp}
            />
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
                <Link href="/career/snapshot" data-ai="result.snapshot" className="group inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover">
                  View profile snapshot
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </>
            )}
          </section>
          <DeviceNote />
        </aside>
      </div>
    </div>
  )
}
