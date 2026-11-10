"use client"

import Link from "next/link"
import { Hammer } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { PlatoNote, StatusPill } from "@/components/plato-ui"
import { IconTile, Section, scoreTone } from "@/components/career-hub"
import { CHALLENGES, challengeFor, type Challenge } from "@/lib/career-hub/content"
import { proofHref, useSnapshot } from "@/lib/career-hub/snapshot"
import { useHubState } from "@/lib/career-hub/store"

// Proof of skills: short, realistic work samples scored against a visible rubric.
export default function ProofPage() {
  const { data } = useSnapshot()
  const { results, drafts } = useHubState()
  const forGaps = (data?.gaps ?? []).slice(0, 3).map((g) => ({ c: challengeFor(g.skill), href: proofHref(g.skill), note: `${g.missingIn} of your matches ask for ${g.skill}` }))
  const fixed = CHALLENGES.filter((c) => !forGaps.some((g) => g.c.id === c.id)).map((c) => ({ c, href: `/career/proof/${c.id}`, note: data?.skills.some((s) => s.toLowerCase().includes(c.skill.toLowerCase().split(" ")[0])) ? "Matches a skill on your CV" : undefined }))

  const card = ({ c, href, note }: { c: Challenge; href: string; note?: string }) => {
    const r = results.find((x) => x.kind === "proof" && x.retryHref.split("?")[0] === href.split("?")[0])
    const draft = drafts[c.id]
    return (
      <div key={c.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <IconTile icon={Hammer} />
          <span className="flex gap-1.5">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">{c.skill}</span>
            {r ? <StatusPill tone={r.score >= 70 ? "success" : "warning"}>{r.score >= 70 ? "Passed" : "Retry"}</StatusPill> : draft ? <StatusPill tone="info">Draft</StatusPill> : null}
          </span>
        </div>
        <b className="text-[15px] leading-snug">{c.title}</b>
        <p className="text-[13px] text-text-secondary">{c.summary}</p>
        {note && <p className="text-xs font-medium text-primary">{note}</p>}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[12.5px] font-medium text-text-secondary">
            {c.minutes} min · {c.level}
            {r && <b className={cn("ml-2", scoreTone(r.score))}>{r.score}/100</b>}
          </span>
          <Link href={href} data-ai={`proof.open:${c.id}`} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", r ? "bg-card hover:border-primary-line" : "border-primary bg-primary text-white hover:bg-primary-hover")}>
            {draft ? "Continue" : r ? "Try again" : "Start"}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={PAGE}>
      <PageHeader crumbs={[{ label: "Career", href: "/career" }]} title="Proof of skills" description="Show what you can do, not just what you list. Each challenge is a real work sample with the rubric in plain sight." />
      <PlatoNote label="Why this matters">A finished challenge is evidence a hiring manager can read. Passed challenges (70+) count towards your readiness and show on your profile snapshot.</PlatoNote>
      {forGaps.length > 0 && (
        <Section title="Close your skill gaps">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{forGaps.map(card)}</div>
        </Section>
      )}
      <Section title="All challenges">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{fixed.map(card)}</div>
      </Section>
    </div>
  )
}
