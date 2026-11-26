"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Award, Briefcase, Building2, Globe2, MapPin, Paperclip, Send, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group"
import type { ThreadMessage } from "@/lib/jobs/api"
import type { Preferences } from "@/lib/preferences/schema"
import { formatPreferenceSummary } from "@/lib/preference-format"
import { clipReveal, lineReveal, nodeContent, reducedVariants, spring } from "@/lib/motion-system"
import { PlatoMark } from "@/components/plato-orb"
import { TokenCost } from "@/components/plato-tokens"
import { TypedText } from "./journey/typed-text"
import { useTypedArrivals } from "./use-typed-arrivals"
import { pendingCardId, QuestionCardView } from "./question-card"

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

function Composer({ onSend, busy, autoFocus, placeholder = "Tell Plato what you're after…", allowFile, chip, onRemoveChip, cost }: { onSend: (t: string, file?: File) => void; busy: boolean; autoFocus?: boolean; placeholder?: string; allowFile?: string; chip?: { title: string; sub?: string } | null; onRemoveChip?: () => void; cost?: ReactNode }) {
  const [input, setInput] = useState("")
  // `allowFile` is the accepted types (e.g. ".pdf,.docx"); when set the paperclip attaches one file.
  const [file, setFile] = useState<File | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  // Grows with the text up to a cap, then scrolls.
  function fit() {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }
  function submit() {
    const t = input.trim()
    if ((!t && !file && !chip) || busy) return
    setInput("")
    setFile(null)
    onSend(t || (file ? "Improve this CV" : "About this job"), file ?? undefined)
    if (ref.current) ref.current.style.height = "auto"
  }
  return (
    <>
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <InputGroup className="group flex-wrap items-end gap-2 rounded-lg bg-card p-2 pl-4 shadow-[0_12px_40px_-16px_rgba(11,63,122,0.35)] transition-shadow focus-within:shadow-[0_16px_50px_-16px_rgba(11,63,122,0.5)]">
      {chip && (
        // A pinned reference (a job): sent with the next message so Plato knows exactly what it is about.
        <span data-ai="chat.reference" className="flex w-full items-center pt-1">
          <span className="flex max-w-full items-center gap-2 rounded-md border border-primary/25 bg-primary-soft py-1 pr-1 pl-2.5 text-xs font-medium text-primary">
            <Briefcase className="size-3.5 shrink-0" />
            <span className="truncate">{chip.title}{chip.sub ? ` · ${chip.sub}` : ""}</span>
            {onRemoveChip && (
              <button type="button" aria-label="Remove reference" onClick={onRemoveChip} className="rounded p-0.5 hover:bg-primary/15">
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </span>
      )}
      <Sparkles className="mb-3.5 size-4 shrink-0 text-primary/70" />
      {/* Enter sends, Shift+Enter starts a new line. */}
      <InputGroupTextarea
        data-ai="chat.input"
        ref={ref}
        rows={1}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          fit()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        disabled={busy}
        placeholder={placeholder}
        className="scroll-thin max-h-[200px] min-h-11 min-w-0 px-0 py-2.5 text-base leading-6 disabled:opacity-60"
      />
      {allowFile ? (
        <>
          <input ref={picker} type="file" accept={allowFile} hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
          <button type="button" data-ai="chat.attach" disabled={busy} onClick={() => picker.current?.click()} aria-label="Attach a CV" title="Attach your CV (PDF or Word)" className={cn("mb-1.5 flex max-w-40 items-center gap-1.5 rounded-md p-2 text-xs transition-colors duration-200", file ? "bg-primary-tint text-primary" : "text-muted-foreground hover:bg-muted hover:text-primary")}>
            <Paperclip className="size-4 shrink-0" />
            {file && <span className="truncate">{file.name}</span>}
          </button>
        </>
      ) : (
        <button type="button" disabled aria-label="Attach (coming soon)" className="mb-1.5 rounded-sm p-2 text-muted-foreground/50">
          <Paperclip className="size-4" />
        </button>
      )}
      <motion.button
        data-ai="chat.send"
        type="submit"
        disabled={busy || (!input.trim() && !file && !chip)}
        whileTap={{ scale: 0.96 }}
        transition={spring.micro}
        aria-label="Send"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-colors duration-200 hover:bg-primary-hover disabled:opacity-40 disabled:shadow-none"
      >
        <Send className="size-4" />
      </motion.button>
      </InputGroup>
    </form>
    <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
      <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift</kbd> + <kbd className="font-sans font-semibold">Enter</kbd> for a new line
      {cost && <> · {cost}</>}
    </p>
    </>
  )
}

function Transcript({ messages, busy, error, onAnswer }: { messages: ThreadMessage[]; busy: boolean; error: string | null; onAnswer: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const isTyping = useTypedArrivals(messages)
  const openCard = pendingCardId(messages)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])
  return (
    <div ref={ref} data-tour="search-transcript" className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2 pr-3">
      {messages.map((m) =>
        m.role === "USER" ? (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[75%] rounded-lg rounded-br-[6px] bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-md shadow-primary/20">
            {m.content}
          </motion.div>
        ) : (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[85%] flex-col gap-3">
            <div className="flex items-start gap-3">
              <PlatoMark size={28} className="mt-0.5" live={isTyping(m)} />
              <p className="text-[15px] leading-relaxed text-foreground">
                {isTyping(m) ? <TypedText key={m.id} text={m.content} msPerChar={11} /> : m.content}
              </p>
            </div>
            {m.ui && m.id === openCard && (
              <div data-tour="search-question" className="pl-10">
                <QuestionCardView card={m.ui} busy={busy} onSubmit={onAnswer} />
              </div>
            )}
          </motion.div>
        ),
      )}
      {busy && (
        <div className="flex items-center gap-3">
          <PlatoMark size={28} live />
          <span className="text-sm text-muted-foreground">Plato is thinking…</span>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-l-4 border-l-destructive bg-card px-3 py-2 text-xs text-foreground">{error}</p>}
    </div>
  )
}

// First contact after onboarding. Intro (orb, headline, what Plato knows,
// suggestions) collapses into a transcript once the conversation starts.
function ChatHero({
  firstName,
  preferences,
  messages,
  onSend,
  busy,
  error,
}: {
  firstName: string | null
  preferences: Preferences | null
  messages: ThreadMessage[]
  onSend: (text: string) => void
  busy: boolean
  error: string | null
}) {
  const reduced = !!useReducedMotion()
  const v = (x: typeof lineReveal) => (reduced ? reducedVariants(x) : x)
  const started = messages.some((m) => m.role === "USER")
  // Threads created before the opener stopped including the greeting still carry it.
  const opener = (messages.find((m) => m.role === "ASSISTANT")?.content ?? "What kind of role are you looking for today?").replace(
    /^Hi [^!]*! I'm Plato AI\.\s*/,
    "",
  )
  const [openerDone, setOpenerDone] = useState(false)
  const name = firstName ? titleCase(firstName) : null
  const role = preferences?.roles[0]
  const summary = preferences ? formatPreferenceSummary(preferences) : null
  const facts = summary
    ? [
        { icon: Briefcase, text: summary.roles },
        { icon: MapPin, text: summary.locations },
        { icon: Building2, text: summary.work_setup },
        { icon: Award, text: summary.experience },
      ].filter((f) => f.text && f.text !== "Not set")
    : []
  const suggestions = [
    { icon: Sparkles, title: role ? `Search ${role} roles` : "Search my saved roles", sub: "Use what I already know about you", prompt: "Yes, let's search", primary: true },
    { icon: Globe2, title: "Remote roles only", sub: "Anywhere, remote-first", prompt: "Remote roles only", primary: false },
    { icon: ArrowRight, title: "Something different", sub: "Tell me a new title or location", prompt: "I'm looking for something else", primary: false },
  ]

  return (
    <section className="relative isolate flex h-[calc(100dvh-150px)] min-h-[560px] w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-card">
      {/* The Home hero's soft brand glow, led by the Jobs azure. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_0%_0%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_60%),radial-gradient(50%_60%_at_100%_100%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_65%)]" />

      <div className="relative flex min-h-0 flex-1 flex-col px-6 pt-10 pb-6 sm:px-10">
        <AnimatePresence mode="wait" initial={false}>
          {!started ? (
            <motion.div key="intro" exit={{ opacity: 0, y: -12, transition: { duration: 0.25 } }} className="scroll-thin flex min-h-0 flex-1 flex-col items-center overflow-y-auto text-center">
              <PlatoMark size={88} live className="shrink-0" />
              <motion.div variants={v(nodeContent)} initial="hidden" animate="show" className="mt-4 flex max-w-2xl flex-col items-center gap-4">
                <motion.h1 variants={v(clipReveal)} className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {name ? `Hi ${name}, I'm Plato AI.` : "I'm Plato AI."}
                </motion.h1>
                <motion.p variants={v(lineReveal)} className="min-h-7 text-lg text-muted-foreground">
                  <TypedText text={opener} onDone={() => setOpenerDone(true)} />
                </motion.p>
                {facts.length > 0 && (
                  <motion.div data-tour="search-known" variants={v(lineReveal)} className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What I know</span>
                    {facts.map((f) => (
                      <span key={f.text} className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs text-foreground shadow-card backdrop-blur">
                        <f.icon className="size-3.5 text-primary" />
                        <span className="max-w-[220px] truncate">{f.text}</span>
                      </span>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              <motion.div
                data-tour="search-suggestions"
                initial="hidden"
                animate={openerDone || reduced ? "show" : "hidden"}
                variants={v(nodeContent)}
                className="mt-10 grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-3"
              >
                {suggestions.map((s) => (
                  <motion.button
                    key={s.prompt}
                    variants={v(lineReveal)}
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(s.prompt)}
                    whileHover={reduced ? undefined : { y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    transition={spring.micro}
                    className={cn(
                      "group flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-[border-color,box-shadow] duration-200",
                      s.primary ? "border-primary/40 bg-primary text-primary-foreground shadow-brand" : "bg-card/90 shadow-card backdrop-blur hover:border-primary-line hover:shadow-[var(--shadow-lift)]",
                    )}
                  >
                    <span className={cn("flex size-9 items-center justify-center rounded-lg transition-colors duration-200", s.primary ? "bg-white/15" : "bg-info-soft text-info group-hover:bg-primary-soft group-hover:text-primary")}>
                      <s.icon className="size-4" />
                    </span>
                    <span className="type-card-title">{s.title}</span>
                    <span className={cn("type-meta", s.primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{s.sub}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div key="transcript" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.enter} className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
              <div className="flex items-center gap-3">
                <PlatoMark size={40} live={busy} />
                <div>
                  <p className="text-sm font-semibold text-foreground">Plato AI</p>
                  <p className="text-xs text-muted-foreground">{busy ? "Working on it…" : "Pinning down your search"}</p>
                </div>
              </div>
              <Transcript messages={messages} busy={busy} error={error} onAnswer={onSend} />
            </motion.div>
          )}
        </AnimatePresence>

        <div data-tour="search-composer" className="mt-auto shrink-0 pt-6">
          <Composer
            onSend={onSend}
            busy={busy}
            autoFocus={started}
            cost={
              <>
                <TokenCost action="search_message" suffix=" Plato tokens a message" /> · a new search <TokenCost action="deep_search" />
              </>
            }
          />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Plato only searches when you say so. Your data stays private.</p>
        </div>
      </div>
    </section>
  )
}

export { ChatHero, Composer }
