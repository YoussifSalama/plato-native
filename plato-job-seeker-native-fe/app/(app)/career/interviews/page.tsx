"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/jobs/links"

// Past mock interviews, newest first. Scores in a row show progress over time.
export default function InterviewsPage() {
  const [items, setItems] = useState<InterviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listInterviews().then(setItems, (e) => setError(e instanceof Error ? e.message : "Could not load interviews"))
  }, [])
  const scored = (items ?? []).filter((i) => i.score !== null).reverse()

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground">Mock interviews</h1>
        <p className="text-sm text-text-secondary">Start one from the bot icon on any job in your results. Your scores are kept here.</p>
      </header>
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
        {items?.length === 0 && <p className="py-8 text-center text-sm text-text-secondary">No interviews yet.</p>}
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
