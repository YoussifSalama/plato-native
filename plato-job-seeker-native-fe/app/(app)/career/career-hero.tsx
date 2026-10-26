"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Award, BadgeCheck, Briefcase, Building2, FileText, Globe, MapPin, MessagesSquare, Mic, Paperclip, PenLine, Sparkles, Target } from "lucide-react"
import { cn } from "cn"
import { clipReveal, lineReveal, nodeContent, reducedVariants, spring } from "@/lib/motion-system"
import type { CareerMessage, InterviewCard, JobRef, ResumeCard, Searched } from "@/lib/career/api"
import type { Preferences } from "@/lib/preferences/schema"
import { formatPreferenceSummary } from "@/lib/preference-format"
import { PlatoMark } from "@/components/plato-orb"
import { Composer } from "../jobs/components/chat-hero"
import { TypedText } from "../jobs/components/journey/typed-text"
import { useTypedArrivals } from "../jobs/components/use-typed-arrivals"
import { ResumeEditPanel } from "./resume-edit"
import { VoiceInterviewPanel } from "./voice-interview"
import { useRouter } from "next/navigation"
import { TokenCost } from "@/components/plato-tokens"
import type { EstimateAction } from "@/lib/credits/api"
import { startInterview } from "@/lib/interviews/api"
import { ResumeFileCard, ResumePreviewPanel } from "./resume-file"

// Starters adapt to where the seeker is: no resume yet, a target role, and so on. Each one
// opens a guided workflow, so nobody has to know how to prompt it.
type Suggestion = { icon: typeof FileText; title: string; sub: string; prompt: string; primary: boolean; voice?: boolean; badge?: string; cost?: EstimateAction }
function suggestionsFor(hasResume: boolean, role: string | null): Suggestion[] {
  const build: Suggestion = { icon: FileText, title: "Build my resume", sub: "From your profile, ready as a PDF", prompt: "Build my resume", cost: "resume", primary: !hasResume, badge: hasResume ? undefined : "Start here" }
  const tailor: Suggestion = { icon: Target, title: "Tailor to a job", sub: "Paste a posting, get a resume that matches its keywords", prompt: "Tailor my resume to a job", cost: "resume", primary: hasResume, badge: hasResume ? "Next step" : undefined }
  const voice: Suggestion = { icon: Mic, title: "Voice interview", sub: role ? `Talk through a ${role} interview, out loud` : "Talk to Plato out loud, like a real call", prompt: "", primary: false, voice: true, cost: "voice_minute" }
  const rest: Suggestion[] = [
    { icon: PenLine, title: "Improve my resume", sub: "Find what is weak and fix it", prompt: "Improve my resume", primary: false },
    { icon: MessagesSquare, title: "Mock interview (text)", sub: "Real questions, scorecard at the end", prompt: "Give me a mock interview", primary: false, cost: "mock_interview" },
    { icon: BadgeCheck, title: "Prove a skill", sub: "Answer questions, earn it on your CV", prompt: "Test me on a skill I learned", primary: false },
  ]
  return hasResume ? [tailor, voice, build, ...rest] : [build, voice, tailor, ...rest]
}

const resumeOf = (m: CareerMessage): ResumeCard | null => (m.ui?.type === "resume" ? m.ui : null)

// Shows that an answer was learned from the live web, and from where.
function SearchedNote({ searched }: { searched: Searched[] }) {
  const sources = [...new Set(searched.flatMap((s) => s.sources))]
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "")
    } catch {
      return url
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-10 text-xs text-muted-foreground">
      <Globe className="size-3.5 text-primary" />
      <span>Looked this up on the web</span>
      {sources.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-full border bg-card/80 px-2 py-0.5 hover:border-primary/40 hover:text-foreground">
          {host(u)}
        </a>
      ))}
    </div>
  )
}

// What Plato is doing right now, step by step, instead of a blank "thinking".
function ThinkingSteps({ steps }: { steps: string[] }) {
  const done = steps.slice(0, -1)
  const current = steps.at(-1)
  return (
    <div className="flex items-start gap-3">
      <PlatoMark size={28} live />
      <div className="flex flex-col gap-1.5 pt-0.5">
        <AnimatePresence initial={false}>
          {done.map((t) => (
            <motion.span key={t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5 text-success" />
              {t}
            </motion.span>
          ))}
        </AnimatePresence>
        <motion.span key={current ?? "thinking"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm text-foreground">
          <span className="relative bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_1.6s_linear_infinite]">{current ?? "Plato is thinking"}…</span>
        </motion.span>
      </div>
    </div>
  )
}

// Next steps the assistant offers under its last reply; tapping one sends it.
function Choices({ options, onPick }: { options: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 pl-10">
      {options.map((o, i) => (
        <motion.button key={o} type="button" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.enter, delay: 0.08 * i }} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => onPick(o)} className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint px-3.5 py-1.5 text-sm font-medium text-primary hover:border-primary/60 hover:bg-card">
          <Sparkles className="size-3.5" />
          {o}
        </motion.button>
      ))}
    </div>
  )
}

function Transcript({ messages, busy, error, steps, previewId, onPreview, onEdit, onChoose, onVoice }: { messages: CareerMessage[]; busy: boolean; error: string | null; steps: string[]; previewId: string | null; onPreview: (card: ResumeCard) => void; onEdit: (card: ResumeCard) => void; onChoose: (text: string) => void; onVoice: (job: { title: string; description: string }) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const arrivals = useTypedArrivals(messages)
  // A reply written live is already shown as it streams; only older kinds get the typed effect.
  const isTyping = (m: CareerMessage) => !m.streamed && arrivals(m)
  const last = messages.at(-1)
  const streaming = !!last?.streamed && last.role === "ASSISTANT" && !last.ui && busy
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: busy ? "auto" : "smooth" })
  }, [messages, busy])
  return (
    <div ref={ref} className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2 pr-3">
      {messages.filter((m) => m.content || !m.streamed).map((m) =>
        m.role === "USER" ? (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[75%] rounded-lg rounded-br-[6px] bg-primary px-4 py-2.5 text-sm whitespace-pre-line text-primary-foreground shadow-md shadow-primary/20">
            {m.content}
            {m.ui && "reference" in m.ui && m.ui.reference && (
              <span className="mt-2 flex w-fit items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-xs">
                <Briefcase className="size-3" />
                {m.ui.reference.title} · {m.ui.reference.company}
              </span>
            )}
            {m.ui?.type === "attachment" && m.ui.documents.map((d) => (
              <span key={d.id} className="mt-2 flex w-fit items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-xs">
                <Paperclip className="size-3" />
                {d.name ?? "CV"}
              </span>
            ))}
          </motion.div>
        ) : (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[85%] flex-col gap-3">
            <div className="flex items-start gap-3">
              <PlatoMark size={28} className="mt-0.5" live={isTyping(m)} />
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground">{isTyping(m) ? <TypedText key={m.id} text={m.content} msPerChar={11} /> : m.content}</p>
            </div>
            {m.ui && "searched" in m.ui && m.ui.searched && m.ui.searched.length > 0 && <SearchedNote searched={m.ui.searched} />}
            {m.ui?.type === "interview" && <InterviewStartCard card={m.ui} onVoice={onVoice} />}
            {resumeOf(m) && <ResumeFileCard card={resumeOf(m)!} active={previewId === resumeOf(m)!.resumeId} onPreview={() => onPreview(resumeOf(m)!)} onEdit={() => onEdit(resumeOf(m)!)} />}
          </motion.div>
        ),
      )}
      {busy && !(streaming && last?.content && !steps.length) && <ThinkingSteps steps={steps} />}
      {!busy && last?.role === "ASSISTANT" && last.ui && "choices" in last.ui && last.ui.choices && last.ui.choices.length > 0 && <Choices key={last.id} options={last.ui.choices} onPick={onChoose} />}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Plato set up a mock interview for the pinned job: start it as written questions or as a live voice call.
function InterviewStartCard({ card, onVoice }: { card: InterviewCard; onVoice: (job: { title: string; description: string }) => void }) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const chat = () => {
    setStarting(true)
    setErr(null)
    startInterview({ jobId: card.job.id }).then(
      (i) => router.push(`/career/interviews/${i.id}`),
      (e) => (setStarting(false), setErr(e instanceof Error ? e.message : "Could not start the interview")),
    )
  }
  return (
    <div className="ml-10 flex w-fit flex-col gap-2 rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Briefcase className="size-4 text-primary" />{card.job.title} · {card.job.company}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={starting} onClick={chat} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold", card.mode === "chat" ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-muted")}>
          <MessagesSquare className="size-4" />{starting ? "Preparing…" : "Start chat interview"}
        </button>
        <button type="button" onClick={() => onVoice({ title: card.job.title, description: card.description })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold", card.mode === "voice" ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-muted")}>
          <Mic className="size-4" />Start voice interview
        </button>
      </div>
      <p className="flex flex-wrap gap-x-3 text-[11px] text-text-tertiary">
        <span>
          Chat interview <TokenCost action="mock_interview" suffix=" tokens" />
        </span>
        <span>
          Voice <TokenCost action="voice_minute" suffix=" tokens / min" />
        </span>
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}

// Same experience as a new job search: intro (orb, headline, starting points)
// collapses into a transcript once the conversation starts.
function CareerHero({ threadId, onVoiceFinished, hasResume, steps, firstName, preferences, messages, onSend, busy, error, pinned, onUnpin }: { threadId: string; onVoiceFinished: () => void; hasResume: boolean; steps: string[]; firstName: string | null; preferences: Preferences | null; messages: CareerMessage[]; onSend: (text: string, file?: File) => void; busy: boolean; error: string | null; pinned?: JobRef | null; onUnpin?: () => void }) {
  const reduced = !!useReducedMotion()
  const v = (x: typeof lineReveal) => (reduced ? reducedVariants(x) : x)
  const started = messages.some((m) => m.role === "USER")
  const opener = (messages.find((m) => m.role === "ASSISTANT")?.content ?? "Where would you like to start?").replace(/^Hi [^!]*! I'm Plato's career assistant\.\s*/, "")
  const [openerDone, setOpenerDone] = useState(false)
  // A resume that arrives while chatting opens beside the chat, like an
  // artifact. Older ones open when picked. All derived, no effects.
  const [initialIds] = useState(() => new Set(messages.map((m) => m.id)))
  const [picked, setPicked] = useState<{ card: ResumeCard; over: string | null } | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  // The resume being edited by hand; replaces the preview panel while open.
  const [editing, setEditing] = useState<ResumeCard | null>(null)
  // The live voice call panel; replaces the other side panels while open.
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceJob, setVoiceJob] = useState<{ title: string; description: string } | undefined>(undefined) // a pinned job's live interview
  const arrivedMsg = [...messages].reverse().find((m) => resumeOf(m) && !initialIds.has(m.id))
  const arrived = arrivedMsg ? resumeOf(arrivedMsg) : null
  const arrivedId = arrived?.resumeId ?? null
  const preview = picked && picked.over === arrivedId ? picked.card : arrived && arrivedId !== closed ? arrived : null
  const summary = preferences ? formatPreferenceSummary(preferences) : null
  const facts = summary
    ? [
        { icon: Briefcase, text: summary.roles },
        { icon: MapPin, text: summary.locations },
        { icon: Building2, text: summary.work_setup },
        { icon: Award, text: summary.experience },
      ].filter((f) => f.text && f.text !== "Not set")
    : []

  return (
    <div className="relative flex h-[calc(100dvh-150px)] min-h-[560px] w-full gap-4">
      <section className="relative flex min-w-0 flex-1 overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[size:22px_22px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(78,8,252,0.14),transparent_65%)]" />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-10 pb-6 sm:px-10">
        <AnimatePresence mode="wait" initial={false}>
          {!started ? (
            <motion.div key="intro" exit={{ opacity: 0, y: -12, transition: { duration: 0.25 } }} className="scroll-thin flex min-h-0 flex-1 flex-col items-center overflow-y-auto text-center">
              <PlatoMark size={88} live className="shrink-0" />
              <motion.div variants={v(nodeContent)} initial="hidden" animate="show" className="mt-4 flex max-w-2xl flex-col items-center gap-4">
                <motion.h1 variants={v(clipReveal)} className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {firstName ? `Hi ${firstName}, I'm your career assistant.` : "I'm your career assistant."}
                </motion.h1>
                <motion.p variants={v(lineReveal)} className="min-h-7 text-lg text-muted-foreground">
                  <TypedText text={opener} onDone={() => setOpenerDone(true)} />
                </motion.p>
                {facts.length > 0 && (
                  <motion.div variants={v(lineReveal)} className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What I know</span>
                    {facts.map((f) => (
                      <span key={f.text} className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs text-foreground backdrop-blur">
                        <f.icon className="size-3.5 text-primary" />
                        <span className="max-w-[220px] truncate">{f.text}</span>
                      </span>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              <motion.div initial="hidden" animate={openerDone || reduced ? "show" : "hidden"} variants={v(nodeContent)} className="mt-10 grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestionsFor(hasResume, preferences?.roles?.[0] ?? null).map((s) => (
                  <motion.button
                    key={s.prompt}
                    data-ai={`career.start:${s.title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
                    variants={v(lineReveal)}
                    type="button"
                    disabled={busy}
                    onClick={() => (s.voice ? setVoiceOpen(true) : onSend(s.prompt))}
                    whileHover={reduced ? undefined : { y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    transition={spring.micro}
                    className={cn("flex flex-col items-start gap-2 rounded-lg border p-4 text-left shadow-sm transition-colors", s.primary ? "border-primary/40 bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-card/90 backdrop-blur hover:border-primary/40")}
                  >
                    <span className="flex w-full items-start justify-between">
                      <span className={cn("flex size-9 items-center justify-center rounded-md", s.primary ? "bg-white/15" : "bg-primary/10 text-primary")}>
                        <s.icon className="size-4" />
                      </span>
                      {s.badge && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase", s.primary ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary")}>{s.badge}</span>}
                    </span>
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className={cn("text-xs", s.primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{s.sub}</span>
                    {s.cost && <TokenCost action={s.cost} suffix={s.cost === "voice_minute" ? " tokens / min" : " tokens"} className={cn("text-[11px]", s.primary ? "text-primary-foreground/70" : "text-text-tertiary")} />}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div key="transcript" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.enter} className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
              <div className="flex items-center gap-3">
                <PlatoMark size={40} live={busy} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Plato Career</p>
                  <p className="text-xs text-muted-foreground">{busy ? "Working on it…" : "Your resume, skills and next steps"}</p>
                </div>
                <button type="button" data-ai="career.voice" onClick={() => setVoiceOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40">
                  <Mic className="size-3.5 text-primary" />
                  Voice interview
                </button>
              </div>
              <Transcript messages={messages} busy={busy} error={error} steps={steps} onChoose={onSend} previewId={preview?.resumeId ?? null} onPreview={(card) => (setEditing(null), setPicked({ card, over: arrivedId }))} onEdit={setEditing} onVoice={(j) => (setVoiceJob(j), setVoiceOpen(true))} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto shrink-0 pt-6">
          <Composer onSend={onSend} busy={busy} autoFocus={started || !!pinned} allowFile=".pdf,.docx" chip={pinned ? { title: pinned.title, sub: pinned.company } : null} onRemoveChip={onUnpin} placeholder="Tell Plato what you need. Paste a job description or attach your CV." cost={<TokenCost action="career_message" suffix=" Plato tokens a message" />} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Plato only uses facts from your profile and what you confirm here. Your data stays private.</p>
        </div>
      </div>
      </section>

      {voiceOpen && <VoiceInterviewPanel key={voiceJob?.title ?? "voice"} initialJob={voiceJob} threadId={threadId} firstName={firstName} roles={preferences?.roles ?? []} onClose={() => (setVoiceOpen(false), setVoiceJob(undefined))} onFinished={onVoiceFinished} onAsk={(t) => onSend(t)} />}
      {!voiceOpen && editing && (
        <ResumeEditPanel
          key={editing.resumeId}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null)
            setPicked({ card: saved, over: arrivedId })
          }}
        />
      )}
      {!voiceOpen && !editing && preview && (
        <ResumePreviewPanel
          key={preview.resumeId}
          card={preview}
          onClose={() => {
            setPicked(null)
            setClosed(arrivedId)
          }}
        />
      )}
    </div>
  )
}

export { CareerHero }
