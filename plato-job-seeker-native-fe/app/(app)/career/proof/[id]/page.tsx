"use client"

import { Suspense, use, useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Circle, Clock, Loader2, Save } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { PlatoNote } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { challengeById, type Challenge } from "@/lib/career-hub/content"
import { scoreProof } from "@/lib/career-hub/scoring"
import { clearDraft, saveDraft, saveResult, useHubState, type Draft } from "@/lib/career-hub/store"

// The challenge workspace: brief and rubric on the left, the work on the right. Drafts save
// as you type, so the seeker can leave and come back from the Career hub.
function Workspace({ id }: { id: string }) {
  const params = useSearchParams()
  const c = challengeById(id, params.get("skill"))
  const { drafts } = useHubState()
  // The store is only readable in the browser; wait for it so a saved draft is picked up.
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  return hydrated ? <Editor key={c.id} c={c} draft={drafts[c.id]} /> : null
}

function Editor({ c, draft }: { c: Challenge; draft?: Draft }) {
  const router = useRouter()
  const [text, setText] = useState(() => draft?.text ?? "")
  const [startedAt] = useState(() => (draft ? new Date(draft.startedAt).getTime() : Date.now()))
  const [checked, setChecked] = useState<boolean[] | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(startedAt)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!text.trim() || submitting) return
    const t = setTimeout(() => {
      saveDraft(c.id, text)
      setSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    }, 700)
    return () => clearTimeout(t)
  }, [text, c.id, submitting])

  const words = text.trim().split(/\s+/).filter(Boolean).length
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  const left = c.minutes * 60 - secs

  function submit() {
    setSubmitting(true)
    setTimeout(() => {
      const s = scoreProof(c, text)
      const rid = saveResult({ kind: "proof", title: c.title, subtitle: c.skill, skill: c.skill, score: s.score, breakdown: s.breakdown, strengths: s.strengths, improve: s.improve, items: s.items, submission: text, retryHref: c.id.startsWith("skill-") ? `/career/proof/${c.id}?skill=${encodeURIComponent(c.skill)}` : `/career/proof/${c.id}`, minutes: Math.max(1, Math.round(secs / 60)) })
      clearDraft(c.id)
      router.push(`/career/results/${rid}`)
    }, 900)
  }

  return (
    <div className={PAGE}>
      <PageHeader crumbs={[{ label: "Career", href: "/career" }, { label: "Proof of skills", href: "/career/proof" }]} title={c.title} description={`${c.skill} · ${c.level} · about ${c.minutes} minutes`} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <p className="eyebrow">The brief</p>
            <p className="text-[14.5px] leading-relaxed">{c.brief}</p>
            {c.data && <pre className="scroll-thin overflow-x-auto rounded-xl bg-muted p-3 font-mono text-[12px] leading-relaxed text-foreground">{c.data}</pre>}
            <p className="text-[13.5px]">
              <b>Deliver: </b>
              <span className="text-text-secondary">{c.deliverable}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2.5 rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">How it&apos;s scored</p>
              <button type="button" data-ai="proof.check" onClick={() => setChecked(c.rubric.map((r) => r.any.test(text)))} disabled={!text.trim()} className="text-xs font-semibold text-primary hover:underline disabled:opacity-40">
                Check my work
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {c.rubric.map((r, i) => (
                <li key={r.label} className="flex items-start gap-2 text-[13.5px]">
                  {checked ? checked[i] ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Circle className="mt-0.5 size-4 shrink-0 text-text-tertiary" />}
                  <span>
                    <b className="font-semibold">{r.label}</b>
                    <span className="block text-xs text-text-secondary">{r.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-tertiary">80% rubric, 20% depth (about {c.targetWords}+ words).</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
            <span className="font-semibold text-foreground">{c.code ? "Your solution" : "Your answer"}</span>
            <span className="flex items-center gap-3 tabular-nums">
              {saved && (
                <span className="flex items-center gap-1">
                  <Save className="size-3.5" />
                  Draft saved {saved}
                </span>
              )}
              <span className={cn("flex items-center gap-1", left < 0 && "text-warning-ink")}>
                <Clock className="size-3.5" />
                {left >= 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} suggested time left` : "Over the suggested time (that's fine)"}
              </span>
            </span>
          </div>
          <textarea
            data-ai="proof.editor"
            value={text}
            onChange={(e) => (setText(e.target.value), setChecked(null))}
            spellCheck={!c.code}
            rows={20}
            placeholder={c.code ? "Write your code here, then a short note below it." : "Write your answer here."}
            className={cn("min-h-[420px] w-full rounded-xl border bg-background p-4 text-[14px] leading-relaxed outline-none focus:border-primary-line", c.code && "font-mono text-[13px]")}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-text-tertiary tabular-nums">{words} words</span>
            <span className="flex items-center gap-2">
              <Link href="/career" className="px-2 text-sm font-semibold text-text-secondary hover:text-foreground">Save and exit</Link>
              <Button data-ai="proof.submit" onClick={submit} disabled={submitting || words < 10}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Scoring…" : "Submit for scoring"}
              </Button>
            </span>
          </div>
          <PlatoNote variant="inline">Your draft saves as you type and appears under “Continue where you left off” on Career.</PlatoNote>
        </section>
      </div>
    </div>
  )
}

export default function ProofWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={null}>
      <Workspace id={id} />
    </Suspense>
  )
}
