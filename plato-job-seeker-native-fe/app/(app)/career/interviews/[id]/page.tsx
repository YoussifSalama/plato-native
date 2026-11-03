"use client"

import { Breadcrumbs, PAGE, PageHeader } from "@/components/page-header"
import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { answerInterview, getInterview, startInterview, type Interview } from "@/lib/interviews/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [iv, setIv] = useState<Interview | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getInterview(id).then(setIv, (e) => setError(e instanceof Error ? e.message : "Could not load the interview"))
  }, [id])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
    setBusy(false)
  }
  const send = () => run(async () => { setIv(await answerInterview(id, text.trim())); setText("") })
  const retry = () => run(async () => router.push(`/career/interviews/${(await startInterview({ retryOf: id })).id}`))

  return (
    <div className={PAGE}>
      {!iv && !error && (
        <>
          <Breadcrumbs crumbs={[{ label: "Career", href: "/career" }, { label: "Interviews", href: "/career/interviews" }]} />
          <Skeleton className="h-40 w-full" />
        </>
      )}
      {iv && (
        <>
          <PageHeader crumbs={[{ label: "Career", href: "/career" }, { label: "Interviews", href: "/career/interviews" }]} title={iv.jobTitle} description={`${iv.company} · mock interview`} bell={false} />

          {iv.turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">{i + 1}. {t.question}</p>
              <p className="whitespace-pre-wrap text-text-secondary">{t.answer}</p>
              {t.followUp && <p className="font-semibold text-foreground">Follow-up: {t.followUp}</p>}
              {t.followUpAnswer && <p className="whitespace-pre-wrap text-text-secondary">{t.followUpAnswer}</p>}
              {iv.scorecard?.questions.find((q) => q.index === i) && (
                <p className="rounded-md bg-primary-tint px-3 py-2 text-foreground">
                  <b>{iv.scorecard.questions.find((q) => q.index === i)!.score}/5</b> · {iv.scorecard.questions.find((q) => q.index === i)!.feedback}
                </p>
              )}
            </div>
          ))}

          {iv.next && (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-primary/40 bg-card p-4">
              <p className="text-xs text-text-tertiary">{iv.next.followUp ? "Follow-up" : `Question ${iv.next.index + 1} of ${iv.total}`}</p>
              <p className="font-semibold text-foreground">{iv.next.text}</p>
              <textarea data-ai="interview.answer" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={5} disabled={busy} placeholder="Type your answer…" className="w-full rounded-md border bg-background p-3 text-sm" />
              <Button data-ai="interview.send" onClick={send} disabled={busy || !text.trim()} className="self-end">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy && iv.next.index === iv.total - 1 ? "Scoring…" : "Send answer"}
              </Button>
            </div>
          )}

          {iv.scorecard && (
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-5 text-sm">
              <h2 className="text-lg font-bold text-foreground">Scorecard: {iv.scorecard.overall}/100</h2>
              <p className="text-text-secondary">Communication {iv.scorecard.communication.score}/5 · {iv.scorecard.communication.note}</p>
              {([["Strengths", iv.scorecard.strengths], ["Gaps", iv.scorecard.gaps], ["Next steps", iv.scorecard.nextSteps]] as const).map(([h, list]) =>
                list.length ? (
                  <div key={h}>
                    <h3 className="font-semibold text-foreground">{h}</h3>
                    <ul className="list-disc pl-5 text-text-secondary">{list.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                ) : null,
              )}
              <Button data-ai="interview.retry" onClick={retry} disabled={busy} variant="outline" className="self-start">Retry the same interview</Button>
            </section>
          )}
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
