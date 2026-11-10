"use client"

import { ClipboardCheck, FileText, Layers, Target } from "lucide-react"
import { PAGE, PageHeader } from "@/components/page-header"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { SectionHeader, StatusPill } from "@/components/plato-ui"
import { ASSESSMENT_LENGTH, BANKS, bankFor, levelLabel, slug, type Bank } from "@/lib/career-hub/content"
import { useSnapshot } from "@/lib/career-hub/snapshot"
import { CAT_ACCENT, IntroCard, PracticeCard } from "../practice-ui"

// Skill assessments: skills on the CV first, then the ones the seeker's matches ask for, then the rest.
export default function AssessmentsPage() {
  const { data, results } = useSnapshot()
  const last = (b: Bank) => results.find((r) => r.kind === "assessment" && r.skill === b.skill)
  const fromCv = data ? BANKS.filter((b) => data.skills.some((s) => bankFor(s)?.skill === b.skill)) : []
  const fromGaps = data ? BANKS.filter((b) => !fromCv.includes(b) && data.gaps.some((g) => bankFor(g.skill)?.skill === b.skill)) : []
  const rest = BANKS.filter((b) => !fromCv.includes(b) && !fromGaps.includes(b))
  const cvNames = (b: Bank) => data?.skills.filter((s) => bankFor(s)?.skill === b.skill).slice(0, 3) ?? []
  const taken = BANKS.filter((b) => last(b)).length
  // The view's one solid CTA: the first assessment not taken yet, in priority order.
  const firstOpen = [...fromCv, ...fromGaps, ...rest].find((b) => !last(b))

  const card = (b: Bank, i: number, note?: string) => {
    const r = last(b)
    return (
      <PracticeCard
        key={b.skill}
        href={`/career/assessments/${slug(b.skill)}`}
        data-ai={`assessment.start:${slug(b.skill)}`}
        icon={ClipboardCheck}
        accent={CAT_ACCENT.skills}
        status={r ? <StatusPill tone={r.score >= 65 ? "success" : "warning"}>{`${levelLabel(r.score)} · ${r.score}`}</StatusPill> : <StatusPill tone="neutral">Not taken</StatusPill>}
        title={b.skill}
        body={b.blurb}
        note={note}
        meta={`${ASSESSMENT_LENGTH} questions · ~8 min`}
        cta={r ? "Retake" : "Start"}
        solid={b === firstOpen}
        index={i}
      />
    )
  }

  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
  return (
    <div className={PAGE}>
      <PageHeader title="Assessments" description="Short adaptive tests that place your level in a skill, so employers see a score, not just a keyword.">
        <CareerNav />
      </PageHeader>
      <IntroCard
        tour="assessments-intro"
        icon={Target}
        title={
          <span className="inline-flex items-center gap-1.5">
            How assessments work
            <InfoTip text="Your level comes from the score: Beginner under 40, Developing 40–64, Proficient 65–84, Advanced 85+. 65 or more counts as proven on your profile snapshot." label="What the levels mean" />
          </span>
        } aside={<span className="type-meta shrink-0 text-text-secondary tabular-nums">{taken} of {BANKS.length} taken</span>}>
        Rate yourself, then answer {ASSESSMENT_LENGTH} questions that get harder as you get them right. You see your level, an explanation for every question, and your snapshot updates.
      </IntroCard>
      {/* The list is fixed, so it shows at once; it regroups by your CV when the profile arrives. */}
      {!data && (
        <section aria-busy="true" className="flex flex-col gap-3">
          <SectionHeader title="All assessments" icon={Layers} accent="cobalt" />
          <div className={grid}>{BANKS.map((b, i) => card(b, i))}</div>
        </section>
      )}
      {data && fromCv.length > 0 && (
        <section data-tour="assessments-cv" className="flex flex-col gap-3">
          <SectionHeader title="From your CV" icon={FileText} accent="cobalt" />
          <div className={grid}>{fromCv.map((b, i) => card(b, i, cvNames(b).length ? `On your CV as ${cvNames(b).join(", ")}` : undefined))}</div>
        </section>
      )}
      {data && fromGaps.length > 0 && (
        <section data-tour="assessments-gaps" className="flex flex-col gap-3">
          <SectionHeader title="Your matches ask for" icon={Target} accent="cobalt" />
          <div className={grid}>{fromGaps.map((b, i) => card(b, i, "Not on your CV yet"))}</div>
        </section>
      )}
      {data && rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title={fromCv.length || fromGaps.length ? "More assessments" : "All assessments"} icon={Layers} accent="cobalt" />
          <div className={grid}>{rest.map((b, i) => card(b, i))}</div>
        </section>
      )}
    </div>
  )
}
