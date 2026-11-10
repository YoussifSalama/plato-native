"use client"

import Link from "next/link"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { MatchRing, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityRow, Delta, DeviceNote, Meter, RecommendationCard, Section, Trend } from "@/components/career-hub"
import { STAGES, STAGE_HINT, useSnapshot, type SkillStatus } from "@/lib/career-hub/snapshot"

const STATUS: Record<SkillStatus, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  proven: { label: "Proven", tone: "success" },
  "needs-work": { label: "Needs work", tone: "warning" },
  unproven: { label: "Unproven", tone: "neutral" },
  gap: { label: "Gap", tone: "danger" },
}

// The full profile snapshot: readiness, every skill with its evidence, strengths and
// weaknesses, everything Plato recommends, and the history of scored activities.
export default function SnapshotPage() {
  const { data, snap } = useSnapshot()
  return (
    <div className={PAGE}>
      <PageHeader crumbs={[{ label: "Career", href: "/career" }]} title="Profile snapshot" description="What Plato knows about your professional capabilities, from your CV, your scores and your work samples." />
      {!data || !snap ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <MatchRing value={snap.readiness} size={104} label={<span className="text-[28px] font-extrabold">{snap.readiness}</span>} />
              <div className="max-w-[240px]">
                <p className="eyebrow">Readiness</p>
                <b className="block text-lg">{data.role ? `${data.role} roles` : "Your target roles"}</b>
                <StatusPill tone="primary" className="mt-1">{`Stage ${snap.stage + 1} of 4 · ${STAGES[snap.stage]}`}</StatusPill>
                <p className="mt-1.5 text-xs text-text-secondary">{STAGE_HINT[snap.stage]}</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              {snap.dimensions.map((d) => (
                <Meter key={d.key} label={d.label} value={d.value} hint={d.hint} href={d.href} tone />
              ))}
            </div>
          </section>

          <Section title="Skills" action={<span className="text-[13px] text-text-secondary">From your CV and your matches</span>}>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {snap.skills.length === 0 && <p className="p-5 text-sm text-text-secondary">No skills yet. Add them in your profile.</p>}
              {snap.skills.map((s) => (
                <div key={s.key} className="grid grid-cols-1 items-center gap-3 border-b border-divider px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[15px]">{s.name}</b>
                      <StatusPill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusPill>
                      {s.trend !== null && <Delta value={s.trend} />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">{s.evidence}</p>
                  </div>
                  <div className="min-w-0">{s.level !== null ? <Meter label="Level" value={s.level} tone /> : <span className="text-xs text-text-tertiary">No measured level yet</span>}</div>
                  <div className="flex gap-2">
                    {s.assessHref && (
                      <Link href={s.assessHref} data-ai={`snapshot.assess:${s.key}`} className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-semibold", s.status === "unproven" ? "border-primary bg-primary text-white" : "bg-card hover:border-primary-line")}>
                        {s.level !== null ? "Retake" : "Assess"}
                      </Link>
                    )}
                    <Link href={s.proofHref} data-ai={`snapshot.prove:${s.key}`} className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-semibold", s.status === "gap" ? "border-primary bg-primary text-white" : "bg-card hover:border-primary-line")}>
                      Prove it
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <b className="text-success-ink">Strengths</b>
              <ul className="list-disc pl-5 text-[13.5px] text-text-secondary">{snap.strengths.length ? snap.strengths.map((s) => <li key={s}>{s}</li>) : <li>Take an assessment or interview to measure your strengths.</li>}</ul>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
              <b className="text-warning-ink">Weaknesses to work on</b>
              <ul className="list-disc pl-5 text-[13.5px] text-text-secondary">{snap.weaknesses.length ? snap.weaknesses.map((s) => <li key={s}>{s}</li>) : <li>Nothing flagged yet.</li>}</ul>
            </div>
          </div>

          <Section title="Recommendations">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snap.recommendations.map((r, i) => (
                <RecommendationCard key={r.id} r={r} index={i} primary={i === 0} />
              ))}
            </div>
          </Section>

          <section id="history" className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="text-xl font-bold tracking-tight">History</h2>
            <div className="rounded-2xl border bg-card p-4">
              <Trend points={snap.history} height={96} />
            </div>
            <div className="flex flex-col gap-2">
              {[...snap.history].reverse().map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </div>
            <DeviceNote />
          </section>
        </>
      )}
    </div>
  )
}
