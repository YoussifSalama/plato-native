"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Loader2, MessagesSquare, Mic, Sparkles } from "lucide-react"
import { cn } from "cn"
import { CARD, StatusPill } from "@/components/plato-ui"
import { InfoTip } from "@/components/info-tip"
import { PlatoMark } from "@/components/plato-orb"
import { Textarea } from "@/components/ui/textarea"
import { answerInterview, type AnswerFeedback, type Interview } from "@/lib/interviews/api"
import { invalidateCareerData } from "@/lib/career-hub/snapshot"
import { styleLabel } from "@/lib/interviews/flow"
import { Kbd } from "../practice-ui"
import { useLeaveGuard } from "@/lib/use-leave-guard"

// The run, the same frame for chat and voice: what it is · how · style, the question count,
// whose turn it is, the whole conversation so far, and a way out.
export function RunHeader({ title, how, style, progress, exit }: { title: string; how: "chat" | "voice"; style: "real" | "coach"; progress: ReactNode; exit: ReactNode }) {
  return (
    <div data-tour="interview-run-header" className={cn(CARD, "flex flex-col gap-3 px-4 py-3.5 sm:px-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold text-foreground">{title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill tone="primary">
              {how === "voice" ? <Mic className="size-3" /> : <MessagesSquare className="size-3" />}
              {how === "voice" ? "Voice" : "Chat"}
            </StatusPill>
            <StatusPill tone="neutral">{styleLabel(style)}</StatusPill>
          </p>
        </div>
        {exit}
      </div>
      {progress}
    </div>
  )
}

export function QuestionBar({ n, total, label }: { n: number; total: number; label?: string }) {
  const k = Math.min(Math.max(n, 1), total)
  return (
    <div className="flex items-center gap-3">
      <span className="flex flex-1 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={k} aria-label={`Question ${k} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i < k ? "bg-primary" : "bg-divider")} />
        ))}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-text-secondary">{label ?? `Question ${k} of ${total}`}</span>
    </div>
  )
}

// Coach style: the feedback on one answer, right under it.
function FeedbackCard({ f }: { f: AnswerFeedback }) {
  const tone = f.score >= 4 ? "border-l-success" : f.score >= 3 ? "border-l-warning" : "border-l-destructive"
  return (
    <div data-tour="interview-feedback" className={cn("ml-8 flex flex-col gap-1.5 rounded-xl border border-l-[3px] bg-card px-3.5 py-2.5 text-[13.5px] shadow-card animate-in fade-in-0 slide-in-from-bottom-1 duration-500", tone)}>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Sparkles className="size-3.5 text-primary" />
        Coach · <span className="tabular-nums">{f.score}/5</span>
      </p>
      <p className="text-text-secondary">{f.note}</p>
      {f.better && (
        <p className="text-foreground">
          <b>Try: </b>
          {f.better}
        </p>
      )}
    </div>
  )
}

const Asked = ({ children, follow }: { children: ReactNode; follow?: boolean }) => (
  <div className="flex max-w-[92%] gap-2">
    <PlatoMark size={24} />
    <div className="rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-[14.5px] leading-relaxed text-foreground shadow-sm">
      {follow && <span className="mb-0.5 block text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">Follow-up</span>}
      {children}
    </div>
  </div>
)
const Said = ({ children }: { children: ReactNode }) => <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-primary-foreground">{children}</p>

export function ChatRun({ iv, title, onChange }: { iv: Interview; title: string; onChange: (iv: Interview) => void }) {
  useLeaveGuard(true, "Your interview is still running. Leave now? Your answers so far are saved, but this interview stays unfinished.")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const style = iv.style ?? "real"
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const enough = words >= 10
  const next = iv.next!
  const last = next.index === iv.total - 1

  // The newest question comes into view.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [iv.turns.length, next.followUp])

  async function send() {
    if (!enough || busy) return
    setBusy(true)
    setError(null)
    try {
      const nx = await answerInterview(iv.id, text.trim())
      // A finished interview changes the Career hub's snapshot.
      if (nx.completedAt) invalidateCareerData()
      setText("")
      onChange(nx)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your answer")
    }
    setBusy(false)
  }

  // The turn being answered right now is in `turns` once it has a first answer (a follow-up is open).
  const done = iv.turns.filter((t, i) => !(i === next.index && next.followUp) && t.answer !== undefined)
  const open = next.followUp ? iv.turns[next.index] : null
  return (
    <div className="flex flex-col gap-4">
      <RunHeader
        title={title}
        how="chat"
        style={style}
        progress={<QuestionBar n={next.index + 1} total={iv.total} label={next.followUp ? `Question ${next.index + 1} of ${iv.total} · follow-up` : undefined} />}
        exit={
          <Link href="/career/interviews" data-ai="interview.later" title="Your answers so far are saved. Continue from Interviews." className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-text-secondary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            Finish later
          </Link>
        }
      />

      {/* The conversation so far. */}
      <div data-tour="interview-conversation" className="flex flex-col gap-3">
        {done.map((t, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Asked>{t.question}</Asked>
            <Said>{t.answer}</Said>
            {t.followUp && (
              <>
                <Asked follow>{t.followUp}</Asked>
                {t.followUpAnswer && <Said>{t.followUpAnswer}</Said>}
              </>
            )}
            {style === "coach" && t.feedback && <FeedbackCard f={t.feedback} />}
          </div>
        ))}
        {open && (
          <div className="flex flex-col gap-2.5">
            <Asked>{open.question}</Asked>
            <Said>{open.answer}</Said>
            {style === "coach" && open.feedback && <FeedbackCard f={open.feedback} />}
          </div>
        )}
      </div>

      {/* Whose turn: the question to answer now. */}
      <div ref={end} data-tour="interview-turn" className={cn(CARD, "flex scroll-mt-24 flex-col gap-3 border-primary-line p-4 sm:p-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-500")}>
        <p className="type-meta flex items-center gap-1.5 font-semibold text-primary">
          <PlatoMark size={20} live={busy} />
          {next.followUp ? "Follow-up · your turn" : "Your turn"}
          {next.followUp && <InfoTip text="When an answer is vague or skips part of the question, the interviewer asks one follow-up about it. It is scored together with your first answer." label="Why a follow-up" />}
        </p>
        <h2 className="text-[18px] leading-snug font-bold text-foreground">{next.text}</h2>
        <Textarea
          autoFocus
          data-ai="interview.answer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
          maxLength={4000}
          rows={6}
          disabled={busy}
          placeholder="Answer as you would out loud. Be specific: what you did or would do, how, and the result."
          className="field-sizing-fixed text-[14.5px] leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="type-meta flex items-center gap-1.5 text-text-tertiary">
            {/* Same rule as the server: under 10 words is not sent. */}
            <span className={cn("tabular-nums", !enough && words > 0 && "text-warning-ink")}>
              {words} words{enough ? "" : " · at least 10"}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> to send
            </span>
          </span>
          <button type="button" data-ai="interview.send" onClick={() => void send()} disabled={busy || !enough} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-colors duration-200 hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? (last && !next.followUp ? "Scoring your interview…" : style === "coach" ? "Reading your answer…" : "Sending…") : "Send answer"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
