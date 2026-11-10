"use client"

import Link from "next/link"
import { ArrowRight, Check, Compass, History, ListChecks, Sparkles, Target } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { CARD, EmptyState, SectionHeader, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { ActivityRow, CareerGlow, DIMENSION_INFO, Delta, DeviceNote, LoadError, Meter, OUTLINE_CTA, PartialNote, RecommendationCard, ScoreRing, Section, SOFT_CTA, Trend } from "@/components/career-hub"
import { STAGES, STAGE_HINT, useSnapshot, type SkillStatus } from "@/lib/career-hub/snapshot"

const STATUS: Record<SkillStatus, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  proven: { label: "Proven", tone: "success" },
  "needs-work": { label: "Needs work", tone: "warning" },
  unproven: { label: "Unproven", tone: "neutral" },
  gap: { label: "Gap", tone: "danger" },
}

// The full profile snapshot: readiness, every skill with its evidence, strengths and
// weaknesses, everything Plato recommends, and the history of scored activities.
// It used to wait on every source forever (one stalled request kept the grey skeleton up);
// the load now times out per source and the page shows what arrived, or an error with a retry.
export default function SnapshotPage() {
  const { data, snap, error, partial, reload } = useSnapshot()
  return (
    <div className={PAGE}>
      <PageHeader title="Profile snapshot" description="What Plato knows about your professional capabilities, from your CV, your scores and your work samples." />
      <CareerNav />
      {partial && data && <PartialNote missing={data.failed} onRetry={reload} />}
      {error ? (
        <LoadError onRetry={reload} />
      ) : !data || !snap ? (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading your snapshot">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <>
          <section data-tour="snapshot-readiness" aria-label="Readiness" className={cn(CARD, "relative isolate flex flex-col gap-6 overflow-hidden p-5 sm:p-6 lg:flex-row lg:items-center")}>
            <CareerGlow />
            <div className="flex items-center gap-4 lg:w-[380px] lg:shrink-0">
              <ScoreRing value={snap.readiness} size={104} />
              <div className="min-w-0">
                <p className="eyebrow flex items-center gap-1.5">
                  Readiness
                  <InfoTip text="A 0–100 estimate of how ready you look to employers for this role, weighted from the four bars beside it: resume 30%, interviewing 30%, skills proven 25%, proof of work 15%. Bars with no score yet are left out." label="How readiness is worked out" />
                </p>
                <b className="block text-lg leading-snug">{data.role ? `${data.role} roles` : "Your target roles"}</b>
                <StatusPill tone="primary" className="mt-1.5">{`Stage ${snap.stage + 1} of 4 · ${STAGES[snap.stage]}`}</StatusPill>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{STAGE_HINT[snap.stage]}</p>
              </div>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {snap.dimensions.map((d) => (
                <Meter key={d.key} label={d.label} value={d.value} hint={d.hint} href={d.href} info={DIMENSION_INFO[d.key]} tone />
              ))}
            </div>
          </section>

          <Section title="Skills" icon={ListChecks} tour="snapshot-skills" action={
              <span className="type-meta flex items-center gap-1.5 text-text-secondary">
                From your CV and your matches
                <InfoTip text="Proven: your latest assessment or challenge score is 65 or more, or you have a verified certificate. Needs work: measured below 65. Unproven: on your CV with no score yet. Gap: your matches ask for it and your CV doesn't show it." label="What the skill statuses mean" />
              </span>
            }>
            <div className={cn(CARD, "overflow-hidden")}>
              {snap.skills.length === 0 && (
                <EmptyState
                  icon={ListChecks}
                  className="m-3 border-none"
                  title="No skills yet"
                  hint="Add skills to your profile so Plato can assess them."
                  action={
                    <Link href="/profile" data-ai="snapshot.profile" className={SOFT_CTA}>
                      Open profile
                    </Link>
                  }
                />
              )}
              {snap.skills.map((s) => {
                // The row's main step is soft; the other is a quiet outline.
                const assessMain = s.status !== "gap" && !!s.assessHref
                return (
                  <div key={s.key} className="grid grid-cols-1 items-center gap-3 border-b border-divider px-4 py-3.5 transition-colors duration-200 last:border-b-0 hover:bg-muted/40 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="type-card-title">{s.name}</b>
                        <StatusPill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusPill>
                        {s.trend !== null && <Delta value={s.trend} />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">{s.evidence}</p>
                    </div>
                    <div className="min-w-0">{s.level !== null ? <Meter label="Level" value={s.level} tone /> : <span className="text-xs text-text-tertiary">No measured level yet</span>}</div>
                    <div className="flex gap-2">
                      {s.assessHref && (
                        <Link href={s.assessHref} data-ai={`snapshot.assess:${s.key}`} className={assessMain ? SOFT_CTA : OUTLINE_CTA}>
                          {s.level !== null ? "Retake" : "Assess"}
                        </Link>
                      )}
                      <Link href={s.proofHref} data-ai={`snapshot.prove:${s.key}`} className={assessMain ? OUTLINE_CTA : SOFT_CTA}>
                        Prove it
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          <div data-tour="snapshot-strengths" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-success p-4")}>
              <SectionHeader as="h3" title="Strengths" icon={Sparkles} accent="green" />
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {(snap.strengths.length ? snap.strengths : ["Take an assessment or interview to measure your strengths."]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn(CARD, "flex flex-col gap-3 border-l-[3px] border-l-warning p-4")}>
              <SectionHeader as="h3" title="To work on" icon={Target} accent="amber" />
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {(snap.weaknesses.length ? snap.weaknesses : ["Nothing flagged yet."]).map((s) => (
                  <li key={s} className="flex gap-2">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-warning" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {snap.recommendations.length > 0 && (
            <Section title="Recommendations" icon={Compass} tour="snapshot-recommendations">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {snap.recommendations.map((r, i) => (
                  <RecommendationCard key={r.id} r={r} index={i} primary={i === 0} />
                ))}
              </div>
            </Section>
          )}

          <section id="history" data-tour="snapshot-history" className="flex scroll-mt-24 flex-col gap-3">
            <SectionHeader title="History" icon={History} />
            {snap.history.length ? (
              <div className={cn(CARD, "flex flex-col gap-2 p-2")}>
                <div className="px-3 pt-3 pb-1">
                  <Trend points={snap.history} height={96} />
                </div>
                {[...snap.history].reverse().map((a) => (
                  <ActivityRow key={a.id} a={a} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={History}
                className="bg-card"
                title="No scored activities yet"
                hint="Every assessment, interview and challenge you finish is listed here with its score."
                action={
                  <Link href="/career/library" data-ai="snapshot.library" className={SOFT_CTA}>
                    Browse practice
                  </Link>
                }
              />
            )}
            <DeviceNote />
          </section>
        </>
      )}
    </div>
  )
}
