"use client"

import Link from "next/link"
import { ClipboardCheck } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { PlatoNote, StatusPill } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { IconTile, Section, scoreTone } from "@/components/career-hub"
import { BANKS, bankFor, levelLabel, slug, type Bank } from "@/lib/career-hub/content"
import { useSnapshot } from "@/lib/career-hub/snapshot"

// Skill assessment: pick a skill. Ones from the CV first, then ones the seeker's matches ask for.
export default function AssessmentsPage() {
  const { data, results } = useSnapshot()
  const last = (b: Bank) => results.find((r) => r.kind === "assessment" && r.skill === b.skill)
  const fromCv = data ? BANKS.filter((b) => data.skills.some((s) => bankFor(s)?.skill === b.skill)) : []
  const fromGaps = data ? BANKS.filter((b) => !fromCv.includes(b) && data.gaps.some((g) => bankFor(g.skill)?.skill === b.skill)) : []
  const rest = BANKS.filter((b) => !fromCv.includes(b) && !fromGaps.includes(b))
  const cvNames = (b: Bank) => data?.skills.filter((s) => bankFor(s)?.skill === b.skill).slice(0, 3) ?? []

  const card = (b: Bank, note?: string) => {
    const r = last(b)
    return (
      <div key={b.skill} className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <IconTile icon={ClipboardCheck} />
          {r ? <StatusPill tone={r.score >= 65 ? "success" : "warning"}>{`${levelLabel(r.score)} · ${r.score}`}</StatusPill> : <StatusPill tone="neutral">Not taken</StatusPill>}
        </div>
        <b className="text-[15px]">{b.skill}</b>
        <p className="text-[13px] text-text-secondary">{b.blurb}</p>
        {note && <p className="text-xs font-medium text-primary">{note}</p>}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[12.5px] font-medium text-text-secondary">7 questions · ~8 min</span>
          <Link href={`/career/assessments/${slug(b.skill)}`} data-ai={`assessment.start:${slug(b.skill)}`} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", r ? "bg-card hover:border-primary-line" : "border-primary bg-primary text-white hover:bg-primary-hover")}>
            {r ? "Retake" : "Start"}
          </Link>
        </div>
        {r && <span className={cn("text-xs", scoreTone(r.score))}>Last score {r.score}/100</span>}
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <PageHeader crumbs={[{ label: "Career", href: "/career" }]} title="Skill assessment" description="Adaptive tests: each answer sets the difficulty of the next question, so seven questions are enough to place your level." />
      <PlatoNote label="How it works">Rate yourself, answer seven questions (they get harder as you get them right), then see your level, the explanation for every question, and how your profile snapshot changed.</PlatoNote>
      {!data && <Skeleton className="h-48 rounded-2xl" />}
      {data && fromCv.length > 0 && (
        <Section title="From your CV">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{fromCv.map((b) => card(b, cvNames(b).length ? `On your CV as ${cvNames(b).join(", ")}` : undefined))}</div>
        </Section>
      )}
      {data && fromGaps.length > 0 && (
        <Section title="Your matches ask for">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{fromGaps.map((b) => card(b, "Not on your CV yet"))}</div>
        </Section>
      )}
      {data && (
        <Section title={fromCv.length || fromGaps.length ? "More assessments" : "All assessments"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{rest.map((b) => card(b))}</div>
        </Section>
      )}
    </div>
  )
}
