"use client"

import { FileText, Hammer, Layers, Target, Trophy } from "lucide-react"
import { PAGE, PageHeader } from "@/components/page-header"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { SectionHeader, StatusPill } from "@/components/plato-ui"
import { CHALLENGES, challengeFor, type Challenge } from "@/lib/career-hub/content"
import { proofHref, useSnapshot } from "@/lib/career-hub/snapshot"
import { useHubState } from "@/lib/career-hub/store"
import { CAT_ACCENT, IntroCard, PracticeCard } from "../practice-ui"

type Item = { c: Challenge; href: string; note?: string }

// Proof of skills: short, realistic work samples scored against a visible rubric.
// Challenges for skills on the CV first, then the skills the seeker's matches ask for, then the rest.
export default function ProofPage() {
  const { data } = useSnapshot()
  const { results, drafts } = useHubState()
  const onCv = (c: Challenge) => !!data?.skills.some((s) => s.toLowerCase().includes(c.skill.toLowerCase().split(" ")[0]))
  const forGaps: Item[] = (data?.gaps ?? []).slice(0, 3).map((g) => ({ c: challengeFor(g.skill), href: proofHref(g.skill), note: `${g.missingIn} of your matches ask for ${g.skill}` }))
  const others = CHALLENGES.filter((c) => !forGaps.some((g) => g.c.id === c.id))
  const fromCv: Item[] = data ? others.filter(onCv).map((c) => ({ c, href: `/career/proof/${c.id}`, note: "Matches a skill on your CV" })) : []
  const rest: Item[] = others.filter((c) => !fromCv.some((x) => x.c.id === c.id)).map((c) => ({ c, href: `/career/proof/${c.id}` }))

  const resultFor = (href: string) => results.find((x) => x.kind === "proof" && x.retryHref.split("?")[0] === href.split("?")[0])
  const passed = results.filter((r) => r.kind === "proof" && r.score >= 70).length
  // The view's one solid CTA: a draft to continue, else the first challenge not done yet.
  const ordered = [...fromCv, ...forGaps, ...rest]
  const lead = ordered.find((x) => drafts[x.c.id]) ?? ordered.find((x) => !resultFor(x.href))

  const card = (x: Item, i: number) => {
    const { c, href, note } = x
    const r = resultFor(href)
    const draft = drafts[c.id]
    const status = r ? <StatusPill tone={r.score >= 70 ? "success" : "warning"}>{r.score >= 70 ? `Passed · ${r.score}` : `${r.score} · retry`}</StatusPill> : draft ? <StatusPill tone="info">Draft saved</StatusPill> : <StatusPill tone="neutral">{c.skill}</StatusPill>
    return <PracticeCard key={c.id} href={href} data-ai={`proof.open:${c.id}`} icon={Hammer} accent={CAT_ACCENT.skills} status={status} title={c.title} body={c.summary} note={note} meta={`${c.minutes} min · ${c.level}${r || draft ? ` · ${c.skill}` : ""}`} cta={draft ? "Continue" : r ? "Try again" : "Start"} solid={x === lead} index={i} />
  }

  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
  return (
    <div className={PAGE}>
      <PageHeader title="Proof of skills" description="Show what you can do, not just what you list. Each challenge is a real work sample with the rubric in plain sight.">
        <CareerNav />
      </PageHeader>
      <IntroCard
        tour="proof-intro"
        icon={Trophy}
        title={
          <span className="inline-flex items-center gap-1.5">
            Evidence a hiring manager can read
            <InfoTip text="Scored in your browser: 80% for the rubric points your answer covers and 20% for depth against the challenge's target length. 70 or more passes and counts toward proof of work." label="How challenges are scored" />
          </span>
        } aside={<span className="type-meta shrink-0 text-text-secondary tabular-nums">{passed} passed</span>}>
        Write the work sample, check it against the rubric, then submit. Challenges you pass (70+) raise your readiness and show on your snapshot. Drafts save as you type.
      </IntroCard>
      {fromCv.length > 0 && (
        <section data-tour="proof-cv" className="flex flex-col gap-3">
          <SectionHeader title="From your CV" icon={FileText} accent="cobalt" />
          <div className={grid}>{fromCv.map(card)}</div>
        </section>
      )}
      {forGaps.length > 0 && (
        <section data-tour="proof-gaps" className="flex flex-col gap-3">
          <SectionHeader title="Close your skill gaps" icon={Target} accent="cobalt" />
          <div className={grid}>{forGaps.map(card)}</div>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <SectionHeader title={fromCv.length || forGaps.length ? "More challenges" : "All challenges"} icon={Layers} accent="cobalt" />
        <div className={grid}>{rest.map(card)}</div>
      </section>
    </div>
  )
}
