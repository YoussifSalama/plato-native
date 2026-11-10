"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { useEffect, useState } from "react"
import Link from "next/link"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/jobs/links"
import { BriefcaseBusiness, Mic } from "lucide-react"
import { ActivityRow, IconTile } from "@/components/career-hub"
import { useHubState } from "@/lib/career-hub/store"

// Past mock interviews, newest first. Scores in a row show progress over time.
export default function InterviewsPage() {
  const [items, setItems] = useState<InterviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listInterviews().then(setItems, (e) => setError(e instanceof Error ? e.message : "Could not load interviews"))
  }, [])
  const { results } = useHubState()
  const practice = results.filter((r) => r.kind === "interview" || r.kind === "simulation")
  const scored = (items ?? []).filter((i) => i.score !== null).reverse()

  return (
    <div className={PAGE}>
      <PageHeader crumbs={[{ label: "Career", href: "/career" }]} title="Mock interviews" description="Practise a general interview or simulate the one for a specific job. Your scores are kept here." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          { href: "/career/interviews/general", ai: "interviews.general", icon: Mic, title: "General interview", body: "Behavioral, technical or situational questions for any role" },
          { href: "/career/interviews/simulate", ai: "interviews.simulate", icon: BriefcaseBusiness, title: "Job simulation", body: "Questions built from a real job post, with follow-ups" },
        ].map((c) => (
          <Link key={c.href} href={c.href} data-ai={c.ai} className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary-line">
            <IconTile icon={c.icon} />
            <span className="min-w-0 flex-1">
              <b className="block text-[15px]">{c.title}</b>
              <span className="block text-[13px] text-text-secondary">{c.body}</span>
            </span>
            <span className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-white">Start</span>
          </Link>
        ))}
      </div>
      {practice.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold tracking-tight">Practice interviews</h2>
          {practice.map((r) => (
            <ActivityRow key={r.id} a={{ id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, score: r.score, at: r.createdAt, href: `/career/results/${r.id}` }} />
          ))}
        </section>
      )}
      <h2 className="text-lg font-bold tracking-tight">Job interviews</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {scored.length > 1 && (
        <div className="flex items-end gap-2 rounded-lg border bg-card p-4" aria-label="Scores over time">
          {scored.slice(-12).map((i) => (
            <Link key={i.id} href={`/career/interviews/${i.id}`} title={`${i.jobTitle}: ${i.score}`} className="flex w-8 flex-col items-center gap-1 text-[11px] text-text-tertiary">
              <span className="w-full rounded-sm bg-primary" style={{ height: `${Math.max(4, (i.score ?? 0) * 0.8)}px` }} />
              {i.score}
            </Link>
          ))}
        </div>
      )}
      <div className="rounded-lg border bg-card px-5 py-1">
        {!items && !error && <Skeleton className="my-4 h-12 w-full" />}
        {items?.length === 0 && <p className="py-8 text-center text-sm text-text-secondary">No job interviews yet. Start a job simulation above, or use the bot icon on any job in your results.</p>}
        <ul>
          {items?.map((i) => (
            <li key={i.id} className="border-b border-divider last:border-b-0">
              <Link href={`/career/interviews/${i.id}`} data-ai={`interviews.row:${i.id}`} className="flex items-center justify-between gap-4 py-4 hover:text-primary">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{i.jobTitle}</span>
                  <span className="block truncate text-sm text-text-secondary">
                    {i.company} · {timeAgo(i.createdAt)}
                    {i.retryOfId ? " · retry" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">{i.score !== null ? `${i.score}/100` : "In progress"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
