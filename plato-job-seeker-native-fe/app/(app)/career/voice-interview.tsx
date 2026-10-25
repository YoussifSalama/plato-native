"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react"
import { BadgeCheck, Briefcase, ClipboardCheck, Loader2, MessagesSquare, Mic, MicOff, PhoneOff, RotateCcw, Sparkles, Target, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { resetLabel, useTokens, useVoiceRate } from "@/components/plato-tokens"
import { formatTokens } from "@/lib/credits/api"
import { PlatoMark } from "@/components/plato-orb"
import { spring } from "@/lib/motion-system"
import { getProfile } from "@/lib/documents/api"
import { z } from "zod"
import { saveVoiceTranscript, startVoiceSession, type VoiceMode, type VoiceUsage } from "@/lib/career/api"

type Turn = { role: "user" | "assistant"; text: string }
type Phase = "setup" | "connecting" | "live" | "ending" | "done"
// Only what we call on the realtime session; the library is loaded when a call starts.
type Session = {
  connect: (o: { apiKey: string }) => Promise<void>
  close: () => void
  mute: (m: boolean) => void
  on: (e: string, cb: (...a: never[]) => void) => void
  transport: { sendEvent: (e: { type: string }) => void }
}

const MODES: { key: VoiceMode; title: string; sub: string; icon: typeof Mic }[] = [
  { key: "mock", title: "Mock interview", sub: "6 questions, scorecard at the end", icon: ClipboardCheck },
  { key: "practice", title: "Practice", sub: "Feedback after every answer", icon: MessagesSquare },
  { key: "skill", title: "Prove a skill", sub: "Harder and harder questions", icon: BadgeCheck },
]
const MOCK_QUESTIONS = 6
const EMPTY_USAGE: VoiceUsage = { responses: 0, audioInputTokens: 0, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0 }

type Item = { type: string; role?: string; content?: { type: string; text?: string; transcript?: string | null }[] }
const toTurns = (history: Item[]): Turn[] =>
  history
    .filter((h) => h.type === "message" && (h.role === "user" || h.role === "assistant"))
    .map((h) => ({ role: h.role as Turn["role"], text: (h.content ?? []).map((c) => c.transcript ?? c.text ?? "").join(" ").trim() }))
    .filter((t) => t.text)

// How loud you are right now (0..1), straight into a motion value so nothing re-renders.
// A separate read-only microphone stream is used only for the visuals.
function useMicLevel(active: boolean, level: MotionValue<number>) {
  useEffect(() => {
    if (!active) {
      level.set(0)
      return
    }
    let raf = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        ctx.createMediaStreamSource(s).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += ((v - 128) / 128) ** 2
          level.set(Math.min(1, Math.sqrt(sum / buf.length) * 5))
          raf = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => undefined)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
    }
  }, [active, level])
}

function Bar({ i, smooth, speaking }: { i: number; smooth: MotionValue<number>; speaking: boolean }) {
  const factor = 0.35 + (((i * 37) % 10) / 10) * 0.9
  const height = useTransform(smooth, (v) => 4 + v * 46 * factor)
  return speaking ? (
    <motion.span className="w-1 rounded-full bg-primary" animate={{ height: [6, 12 + ((i * 13) % 26), 8] }} transition={{ duration: 0.6 + (i % 5) * 0.09, repeat: Infinity, repeatType: "mirror", delay: i * 0.03 }} />
  ) : (
    <motion.span className="w-1 rounded-full bg-primary/60" style={{ height }} />
  )
}

// The orb breathes with your voice, ripples when Plato talks, and sits calm when muted.
function VoiceOrb({ level, speaking, muted, working }: { level: MotionValue<number>; speaking: boolean; muted: boolean; working: boolean }) {
  const smooth = useSpring(level, { stiffness: 220, damping: 22 })
  const inner = useTransform(smooth, (v) => 1 + v * 0.5)
  const outer = useTransform(smooth, (v) => 1 + v * 0.95)
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex size-44 items-center justify-center">
        <motion.span style={{ scale: outer }} className={cn("absolute inset-3 rounded-full", muted ? "bg-muted" : "bg-primary/10")} />
        <motion.span style={{ scale: inner }} className={cn("absolute inset-8 rounded-full", muted ? "bg-muted" : "bg-primary/20")} />
        {speaking && <motion.span className="absolute inset-6 rounded-full border-2 border-primary/50" animate={{ scale: [1, 1.3], opacity: [0.7, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }} />}
        <PlatoMark size={84} live={speaking || working} />
      </div>
      <div className="flex h-12 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 26 }, (_, i) => (
          <Bar key={i} i={i} smooth={smooth} speaking={speaking} />
        ))}
      </div>
    </div>
  )
}

const chip = (on: boolean) => cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "bg-card text-foreground hover:border-primary/50")

// A live voice call with Plato: talk, interrupt, get spoken feedback. The mic and the
// speaker are handled by the browser's WebRTC connection straight to the model.
function VoiceInterviewPanel({ threadId, firstName, roles, onClose, onFinished, onAsk, initialJob }: { threadId: string; firstName: string | null; roles: string[]; onClose: () => void; onFinished: () => void; onAsk: (text: string) => void; initialJob?: { title: string; description: string } }) {
  const [phase, setPhase] = useState<Phase>("setup")
  const [mode, setMode] = useState<VoiceMode>("mock")
  const [role, setRole] = useState<string | null>(initialJob?.title ?? roles[0] ?? null)
  const [customRole, setCustomRole] = useState("")
  const [skill, setSkill] = useState<string | null>(null)
  const [customSkill, setCustomSkill] = useState("")
  // A pinned job rides along as a reference chip (its description is sent, not pasted); the box is for the person's own notes.
  const [pinned, setPinned] = useState(initialJob ?? null)
  const [job, setJob] = useState("")
  const [jobOpen, setJobOpen] = useState(!!initialJob)
  const [known, setKnown] = useState<{ skills: string[]; companies: string[] }>({ skills: [], companies: [] })
  const [turns, setTurns] = useState<Turn[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ seconds: number; exchanges: number } | null>(null)
  // Questions the interviewer says it has asked (it reports each NEW one; a repeat is not counted).
  const [asked, setAsked] = useState(0)
  // The interviewer asked to hang up: end once its goodbye has finished playing.
  const pendingEnd = useRef(false)
  const speakingRef = useRef(false)
  const session = useRef<Session | null>(null)
  const turnsRef = useRef<Turn[]>([])
  const usage = useRef<VoiceUsage>({ ...EMPTY_USAGE })
  const maxSeconds = useRef(900)
  const startedAt = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)
  const level = useMotionValue(0)
  // Latest end(), so the timer can hang up at the limit.
  const endRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    endRef.current = end
  })

  useMicLevel(phase === "live" && !muted, level)

  // What Plato knows, so the setup feels like it already knows you.
  useEffect(() => {
    let cancelled = false
    getProfile()
      .then((p) => !cancelled && setKnown({ skills: p.skills.slice(0, 8), companies: [...new Set(p.experiences.map((e) => e.company).filter(Boolean))].slice(0, 3) }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  // Leaving the page hangs up (the microphone must never stay open).
  useEffect(() => () => session.current?.close(), [])

  const chosenRole = (role === "__other" ? customRole : role)?.trim() || undefined
  const chosenSkill = (skill === "__other" ? customSkill : skill)?.trim() || undefined

  async function start() {
    setError(null)
    setPhase("connecting")
    usage.current = { ...EMPTY_USAGE }
    try {
      const s = await startVoiceSession(threadId, { mode, role: chosenRole, skill: mode === "skill" ? chosenSkill : undefined, jobDescription: [pinned?.description.trim(), job.trim() && (pinned ? `Notes from the candidate: ${job.trim()}` : job.trim())].filter(Boolean).join("\n\n").slice(0, 6000) || undefined })
      maxSeconds.current = s.maxSeconds
      const { RealtimeAgent, RealtimeSession, tool } = await import("@openai/agents/realtime")
      pendingEnd.current = false
      setAsked(0)
      // Two silent tools: the interviewer reports each NEW question (so a repeated question is
      // not counted), and hangs up by itself once it has said goodbye.
      const markQuestion = tool({
        name: "mark_question",
        description: "Call once each time you ask a NEW interview question. Not when repeating or rephrasing one.",
        parameters: z.object({ number: z.number().int().min(1).max(30) }),
        execute: async ({ number }) => {
          setAsked((n) => Math.max(n, number))
          return "ok"
        },
      })
      const endSession = tool({
        name: "end_session",
        description: "Hang up the call after your goodbye.",
        parameters: z.object({}),
        execute: async () => {
          pendingEnd.current = true
          // If nothing is playing, hang up shortly; otherwise audio_stopped does it.
          if (!speakingRef.current) setTimeout(() => void endRef.current(), 1500)
          return "ok"
        },
      })
      const agent = new RealtimeAgent({ name: "Plato", instructions: s.instructions, tools: [markQuestion, endSession] })
      const live = new RealtimeSession(agent, { model: s.model, config: { audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" } }, output: { voice: "marin" } } } }) as unknown as Session
      live.on("history_updated", ((history: Item[]) => {
        turnsRef.current = toTurns(history)
        setTurns(turnsRef.current)
      }) as never)
      live.on("audio_start", (() => (speakingRef.current = true, setSpeaking(true))) as never)
      live.on("audio_stopped", (() => {
        speakingRef.current = false
        setSpeaking(false)
        if (pendingEnd.current) setTimeout(() => void endRef.current(), 900)
      }) as never)
      live.on("audio_interrupted", (() => (speakingRef.current = false, setSpeaking(false))) as never)
      // Token counts as the model reports them: audio and text are billed differently.
      live.on("transport_event", ((e: { type?: string; response?: { usage?: { input_token_details?: { text_tokens?: number; audio_tokens?: number; cached_tokens_details?: { audio_tokens?: number } }; output_token_details?: { text_tokens?: number; audio_tokens?: number } } } }) => {
        if (e.type !== "response.done") return
        const u = e.response?.usage
        const t = usage.current
        t.responses += 1
        t.audioInputTokens += u?.input_token_details?.audio_tokens ?? 0
        t.textInputTokens += u?.input_token_details?.text_tokens ?? 0
        t.cachedInputTokens += u?.input_token_details?.cached_tokens_details?.audio_tokens ?? 0
        t.audioOutputTokens += u?.output_token_details?.audio_tokens ?? 0
        t.textOutputTokens += u?.output_token_details?.text_tokens ?? 0
      }) as never)
      live.on("error", ((e: { error?: unknown }) => setError(e?.error instanceof Error ? e.error.message : "The voice connection had a problem.")) as never)
      session.current = live
      await live.connect({ apiKey: s.clientSecret })
      // The interviewer speaks first.
      live.transport.sendEvent({ type: "response.create" })
      startedAt.current = Date.now()
      setElapsed(0)
      setTurns([])
      setPhase("live")
    } catch (e) {
      session.current?.close()
      session.current = null
      setError(e instanceof Error ? e.message : "Could not start the call. Check microphone permission.")
      setPhase("setup")
    }
  }

  async function end() {
    const live = session.current
    if (!live || phase === "ending") return
    setPhase("ending")
    live.close()
    session.current = null
    setSpeaking(false)
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    try {
      // Usage goes to our servers for internal reporting only; it is never shown or returned.
      await saveVoiceTranscript(threadId, { mode, seconds, turns: turnsRef.current, usage: usage.current })
    } catch {
      // The call is over either way; the transcript just did not save.
    }
    setResult({ seconds, exchanges: turnsRef.current.filter((t) => t.role === "user").length })
    onFinished()
    setPhase("done")
  }

  // Timer, and the hard stop at the session limit.
  useEffect(() => {
    if (phase !== "live") return
    const id = setInterval(() => {
      const s = Math.round((Date.now() - startedAt.current) / 1000)
      setElapsed(s)
      if (s >= maxSeconds.current) void endRef.current()
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
  const lastPlato = [...turns].reverse().find((t) => t.role === "assistant")
  const lastYou = turns.at(-1)?.role === "user" ? turns.at(-1) : undefined
  const roleChoices = [...new Set(roles)].slice(0, 4)
  const canStart = mode !== "skill" || !!chosenSkill
  // The call is as long as the seeker's Plato tokens allow (the server enforces it).
  const tokens = useTokens()
  const rate = useVoiceRate()
  const affordable = tokens && rate ? Math.min(15, Math.floor(Math.max(0, tokens.balance) / rate)) : 15
  const callLimit = !tokens || !rate ? "Up to 15 minutes." : affordable < 1 ? `You need about ${formatTokens(rate)} Plato tokens for a call; yours refill on ${resetLabel(tokens.resetsAt)}.` : `Up to ${affordable} minute${affordable === 1 ? "" : "s"} (≈ ${formatTokens(rate)} Plato tokens a minute).`

  return (
    <motion.aside initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} aria-label="Voice interview" className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-lg shadow-primary/10 max-lg:absolute max-lg:inset-0 lg:w-[46%] lg:max-w-[560px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(78,8,252,0.14),transparent_70%)]" />
      <header className="relative flex items-center gap-2 px-4 py-3">
        <Mic className="size-4 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Voice interview</p>
        {phase === "live" && (
          <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
            {clock}
          </span>
        )}
        <Button variant="ghost" size="sm" aria-label="Close" disabled={phase === "ending"} onClick={() => (session.current ? void end() : onClose())}>
          <X className="size-4" />
        </Button>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {(phase === "setup" || phase === "connecting") && (
          <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.enter} className="scroll-thin relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col items-center gap-3 pt-2 text-center">
              <PlatoMark size={64} live />
              <h3 className="text-lg font-semibold text-foreground">{firstName ? `Ready when you are, ${firstName}.` : "Ready when you are."}</h3>
              <p className="text-sm text-muted-foreground">I&apos;ll ask, listen and answer out loud. Pick what we&apos;re doing:</p>
            </div>

            <div className="grid gap-2">
              {MODES.map((m, i) => (
                <motion.button key={m.key} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.enter, delay: 0.05 * i }} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => setMode(m.key)} className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors", mode === m.key ? "border-primary bg-primary-tint" : "bg-card hover:border-primary/40")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", mode === m.key ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                    <m.icon className="size-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{m.sub}</span>
                  </span>
                </motion.button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Target className="size-3.5" />
                {mode === "skill" ? "Which skill?" : "Which role?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(mode === "skill" ? known.skills : roleChoices).map((x) => (
                  <button key={x} type="button" onClick={() => (mode === "skill" ? setSkill(x) : setRole(x))} className={chip((mode === "skill" ? skill : role) === x)}>
                    {x}
                  </button>
                ))}
                <button type="button" onClick={() => (mode === "skill" ? setSkill("__other") : setRole("__other"))} className={chip((mode === "skill" ? skill : role) === "__other")}>
                  Something else…
                </button>
              </div>
              {(mode === "skill" ? skill : role) === "__other" && (
                <input autoFocus value={mode === "skill" ? customSkill : customRole} onChange={(e) => (mode === "skill" ? setCustomSkill(e.target.value) : setCustomRole(e.target.value))} maxLength={80} placeholder={mode === "skill" ? "e.g. Docker" : "e.g. Product Manager"} className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" />
              )}
            </div>

            {(known.companies.length > 0 || known.skills.length > 0) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>I&apos;ll ask about your real work:</span>
                {[...known.companies, ...known.skills.slice(0, 4)].map((k) => (
                  <span key={k} className="rounded-full bg-card px-2 py-0.5 text-foreground">
                    {k}
                  </span>
                ))}
              </motion.div>
            )}

            {jobOpen ? (
              <label className="flex shrink-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {pinned && (
                  <span className="flex w-fit max-w-full items-center gap-2 rounded-md border border-primary/25 bg-primary-soft py-1 pr-1 pl-2.5 text-xs font-medium text-primary">
                    <Briefcase className="size-3.5 shrink-0" />
                    <span className="truncate">{pinned.title}</span>
                    <button type="button" aria-label="Remove the job" onClick={() => (setPinned(null), role === pinned.title && setRole(roles[0] ?? null))} className="rounded p-0.5 hover:bg-primary/15">
                      <X className="size-3.5" />
                    </button>
                  </span>
                )}
                {pinned ? "Anything to add? (optional)" : "Job description"}
                {/* shrink-0 + min height: in the panel's flex column it was squeezed to one line */}
                <textarea value={job} onChange={(e) => setJob(e.target.value)} rows={7} maxLength={6000} autoFocus={!initialJob} placeholder={pinned ? "e.g. focus on system design, I'm weaker at testing…" : "Paste the job description. I'll interview you for that exact job."} className="scroll-thin min-h-40 shrink-0 resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed font-normal text-foreground outline-none focus:border-primary/50" />
              </label>
            ) : (
              <button type="button" onClick={() => setJobOpen(true)} className="w-fit text-sm font-medium text-primary hover:underline">
                + Practise for a specific job
              </button>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">{callLimit} Plato will ask for your microphone; headphones help. The transcript is saved to this chat.</p>
            <Button size="lg" disabled={phase === "connecting" || !canStart} onClick={() => void start()} className="mt-auto h-12 gap-2 text-base">
              {phase === "connecting" ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
              {phase === "connecting" ? "Connecting…" : "Start the call"}
            </Button>
          </motion.div>
        )}

        {(phase === "live" || phase === "ending") && (
          <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col items-center gap-3 px-5 pt-2">
              <VoiceOrb level={level} speaking={speaking} muted={muted} working={phase === "ending"} />
              <p className="text-sm text-muted-foreground">{phase === "ending" ? "Saving your transcript…" : muted ? "Microphone muted" : speaking ? "Plato is speaking. Talk to interrupt." : "Listening…"}</p>
              {mode === "mock" && (
                <div className="flex items-center gap-1.5" aria-label={`Question ${asked} of ${MOCK_QUESTIONS}`}>
                  {Array.from({ length: MOCK_QUESTIONS }, (_, i) => (
                    <motion.span key={i} animate={{ scale: i < asked ? 1 : 0.8, backgroundColor: i < asked ? "var(--primary)" : "var(--border)" }} className="size-2 rounded-full" />
                  ))}
                  <span className="ml-1.5 text-xs text-muted-foreground">Question {Math.max(asked, 1)} of {MOCK_QUESTIONS}</span>
                </div>
              )}
            </div>

            <div ref={scroller} className="scroll-thin mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-3">
              <AnimatePresence initial={false}>
                {lastPlato && (
                  <motion.div key={lastPlato.text.slice(0, 40)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border bg-card/80 p-4 shadow-sm">
                    <p className="mb-1 text-[11px] font-semibold tracking-wide text-primary uppercase">Plato</p>
                    <p className="text-[15px] leading-relaxed text-foreground">{lastPlato.text}</p>
                  </motion.div>
                )}
                {lastYou && (
                  <motion.div key={`you-${lastYou.text.slice(0, 40)}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[90%] rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-md shadow-primary/20">
                    {lastYou.text}
                  </motion.div>
                )}
              </AnimatePresence>
              {turns.length > 2 && <p className="text-center text-xs text-muted-foreground">{turns.length} turns so far. The full transcript lands in your chat.</p>}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <footer className="relative flex justify-center gap-3 border-t p-3">
              <Button variant="outline" disabled={phase === "ending"} onClick={() => (session.current?.mute(!muted), setMuted(!muted))} className="gap-2">
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {muted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="destructive" disabled={phase === "ending"} onClick={() => void end()} className="gap-2">
                <PhoneOff className="size-4" />
                End call
              </Button>
            </footer>
          </motion.div>
        )}

        {phase === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.enter} className="scroll-thin relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col items-center gap-2 pt-2 text-center">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.micro, delay: 0.1 }} className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                <BadgeCheck className="size-7" />
              </motion.span>
              <h3 className="text-lg font-semibold text-foreground">Nice work. Session saved.</h3>
              <p className="text-sm text-muted-foreground">{Math.max(1, Math.round(result.seconds / 60))} min · {result.exchanges} answers. The transcript is in your chat.</p>
            </div>

            <div className="grid gap-2">
              <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => (onAsk("Give me detailed feedback on the voice interview we just did: my strengths, my gaps, and what to practise next."), onClose())} className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-tint p-3 text-left">
                <ClipboardCheck className="size-5 text-primary" />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">Get my scorecard</span>
                  <span className="text-xs text-muted-foreground">Strengths, gaps and what to practise, in the chat</span>
                </span>
              </motion.button>
              <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => (onAsk("Turn my weak answers from the voice interview into stronger example answers I can reuse."), onClose())} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40">
                <Sparkles className="size-5 text-primary" />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">Improve my answers</span>
                  <span className="text-xs text-muted-foreground">Plato rewrites the weak ones, using only what you said</span>
                </span>
              </motion.button>
              <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => (setResult(null), setTurns([]), setPhase("setup"))} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left hover:border-primary/40">
                <RotateCcw className="size-5 text-primary" />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">Go again</span>
                  <span className="text-xs text-muted-foreground">Another round, same or different focus</span>
                </span>
              </motion.button>
            </div>

            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

export { VoiceInterviewPanel }
