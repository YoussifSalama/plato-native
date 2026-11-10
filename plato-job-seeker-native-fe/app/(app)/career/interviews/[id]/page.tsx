"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { SearchX } from "lucide-react"
import { EmptyState } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { SOFT_CTA } from "@/components/career-hub"
import { getInterview, type Interview } from "@/lib/interviews/api"
import { interviewName } from "@/lib/interviews/flow"
import { FlowShell } from "../flow-ui"
import { ChatRun } from "../chat-run"
import { InterviewResult, fromInterview } from "../interview-result"

// A written interview: the flow's last step while it runs, then its result. Reached from the
// flow's Start, from "Continue" on Interviews, and from the history.
export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [iv, setIv] = useState<Interview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getInterview(id).then(setIv, (e) => setError(e instanceof Error ? e.message : "Could not load the interview"))
  }, [id])

  if (error)
    return (
      <FlowShell step={7} name="Interview">
        <EmptyState
          icon={SearchX}
          className="bg-card py-10"
          title="This interview couldn't be opened"
          hint={error}
          action={
            <Link href="/career/interviews" data-ai="interview.back" className={SOFT_CTA}>
              Back to Interviews
            </Link>
          }
        />
      </FlowShell>
    )
  if (!iv)
    return (
      <FlowShell step={7} name="Interview">
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-2/3 rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </FlowShell>
    )
  const title = interviewName({ target: iv.target, jobTitle: iv.target === "general" ? undefined : iv.jobTitle, round: iv.round, focus: iv.focus, format: iv.format })
  if (iv.completedAt && iv.scorecard)
    return (
      <FlowShell step={7} name="Result">
        <div data-tour-state="interview.result">
          <InterviewResult r={fromInterview(iv)} />
        </div>
      </FlowShell>
    )
  return (
    <FlowShell step={7} name="Interview">
      {iv.next ? (
        <div data-tour-state={iv.style === "coach" ? "interview.run.coach" : "interview.run.real"}>
          <ChatRun iv={iv} title={title} onChange={setIv} />
        </div>
      ) : (
        <Skeleton className="h-56 w-full rounded-2xl" />
      )}
    </FlowShell>
  )
}
