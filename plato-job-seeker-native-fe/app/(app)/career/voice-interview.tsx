"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react"
import { BadgeCheck, Briefcase, ClipboardCheck, Loader2, MessagesSquare, Mic, MicOff, PhoneOff, RotateCcw, Sparkles, Target, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FilterChip } from "@/components/filter-controls"
import { resetLabel, useTokens, useVoiceRate } from "@/components/plato-tokens"
import { formatTokens, reportTokensChanged } from "@/lib/credits/api"
import { InfoTip } from "@/components/info-tip"
import { PlatoMark } from "@/components/plato-orb"
import { spring } from "@/lib/motion-system"
import { getProfile } from "@/lib/documents/api"
import { z } from "zod"
import { saveVoiceTranscript, startVoiceSession, type VoiceMode, type VoiceScorecard, type VoiceUnscored, type VoiceUsage } from "@/lib/career/api"

type Turn = { role: "user" | "assistant"; text: string }
// Only what we call on the realtime session; the library is loaded when a call starts.
type Session = {
  connect: (o: { apiKey: string }) => Promise<void>
  close: () => void
  mute: (m: boolean) => void
  on: (e: string, cb: (...a: never[]) => void) => void
  transport: { sendEvent: (e: { type: string }) => void }
}

const MODES: { key: VoiceMode; title: string; sub: string; icon: typeof Mic }[] = [
  { key: "mock", title: "Real interview", sub: "6 questions like the real thing, no hints; your scorecard at the end", icon: ClipboardCheck },
  { key: "practice", title: "Coach me", sub: "After every answer: what worked and one thing to improve", icon: MessagesSquare },
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


// A live voice call with Plato: talk, interrupt, get spoken feedback. The mic and the
// speaker are handled by the browser's WebRTC connection straight to the model.
// useVoiceCall is the call itself (used by the Plato AI panel and by the interview flow's
// last step); VoiceLive is the screen while it runs.
export type VoiceStart = { mode: VoiceMode; focus?: string; role?: string; skill?: string; jobDescription?: string; context?: { title: string; focus?: string; jobDescription?: string } }
export type VoiceOutcome = { seconds: number; exchanges: number; mode: VoiceMode; turns: Turn[]; scorecard: VoiceScorecard | null; unscored: VoiceUnscored | null }
export type CallPhase = "idle" | "connecting" | "live" | "ending" | "done"

export function useVoiceCall() {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [turns, setTurns] = useState<Turn[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<VoiceOutcome | null>(null)
  // Questions the interviewer says it has asked (it reports each NEW one; a repeat is not counted).
  const [asked, setAsked] = useState(0)
  const [mode, setMode] = useState<VoiceMode>("mock")
  // The interviewer asked to hang up: end once its goodbye has finished playing.
  const pendingEnd = useRef(false)
  const speakingRef = useRef(false)
  const session = useRef<Session | null>(null)
  const turnsRef = useRef<Turn[]>([])
  const usage = useRef<VoiceUsage>({ ...EMPTY_USAGE })
  const maxSeconds = useRef(900)
  const [limit, setLimit] = useState(900)
  const startedAt = useRef(0)
  const call = useRef<{ threadId: string; req: VoiceStart } | null>(null)
  const phaseRef = useRef<CallPhase>("idle")
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const level = useMotionValue(0)
  // Latest end(), so the timer can hang up at the limit.
  const endRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    endRef.current = end
  })

  useMicLevel(phase === "live" && !muted, level)

  // Leaving the page hangs up (the microphone must never stay open).
  useEffect(() => () => session.current?.close(), [])

  async function start(threadId: string, req: VoiceStart) {
    setError(null)
    setOutcome(null)
    setPhase("connecting")
    setMode(req.mode)
    call.current = { threadId, req }
    usage.current = { ...EMPTY_USAGE }
    try {
      const s = await startVoiceSession(threadId, { mode: req.mode, focus: req.focus?.trim().slice(0, 300) || undefined, role: req.role, skill: req.skill, jobDescription: req.jobDescription?.slice(0, 6000) || undefined })
      maxSeconds.current = s.maxSeconds
      setLimit(s.maxSeconds)
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
      turnsRef.current = []
      setTurns([])
      setMuted(false)
      setPhase("live")
      return true
    } catch (e) {
      session.current?.close()
      session.current = null
      setError(e instanceof Error ? e.message : "Could not start the call. Check microphone permission.")
      setPhase("idle")
      return false
    }
  }

  async function end() {
    const live = session.current
    if (!live || phaseRef.current === "ending") return
    phaseRef.current = "ending"
    setPhase("ending")
    live.close()
    session.current = null
    setSpeaking(false)
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    const req = call.current?.req
    let saved: { scorecard: VoiceScorecard | null; unscored: VoiceUnscored | null } = { scorecard: null, unscored: "failed" }
    try {
      // Usage goes to our servers for internal reporting only; it is never shown or returned.
      // The answer carries the written scorecard (or why there is none).
      const r = await saveVoiceTranscript(call.current!.threadId, { mode: req?.mode ?? "mock", seconds, turns: turnsRef.current, usage: usage.current, ...(req?.context && { context: req.context }) })
      saved = { scorecard: r.scorecard ?? null, unscored: r.unscored ?? (r.scorecard ? null : "failed") }
    } catch {
      // The call is over either way; the transcript just did not save.
    }
    reportTokensChanged()
    setOutcome({ seconds, exchanges: turnsRef.current.filter((t) => t.role === "user").length, mode: req?.mode ?? "mock", turns: turnsRef.current, ...saved })
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

  const toggleMute = () => {
    session.current?.mute(!muted)
    setMuted(!muted)
  }
  const reset = () => {
    setOutcome(null)
    setTurns([])
    setPhase("idle")
  }
  return { phase, turns, speaking, muted, elapsed, maxSeconds: limit, asked, mode, error, outcome, level, inCall: phase === "live", start, end, toggleMute, reset }
}
export type VoiceCall = ReturnType<typeof useVoiceCall>

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`
export const callClock = (c: VoiceCall) => `${fmt(c.elapsed)} / ${fmt(c.maxSeconds)}`

// The call while it runs: time used, whose turn it is, the question count, the whole
// conversation and the controls. The same screen in the panel and in the interview flow.
export function VoiceLive({ call, className, transcriptClassName }: { call: VoiceCall; className?: string; transcriptClassName?: string }) {
  const { phase, speaking, muted, elapsed, maxSeconds, asked, mode, turns, error, level } = call
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [turns])
  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      {/* Time used of what the balance allows: the call ends on its own at the limit. */}
      <div data-tour="voice-time" className="mx-4 h-1 overflow-hidden rounded-full bg-divider" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-1000", elapsed / maxSeconds > 0.85 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }} />
      </div>

      {/* Whose turn it is, in words big enough to read while talking. */}
      <div data-tour="voice-turn" className="flex items-center gap-4 px-5 pt-4">
        <div className="shrink-0 scale-75 origin-left">
          <VoiceOrb level={level} speaking={speaking} muted={muted} working={phase === "ending"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-lg font-semibold", muted ? "text-muted-foreground" : speaking ? "text-primary" : "text-foreground")}>{phase === "ending" ? "Saving and scoring your call…" : muted ? "You're muted" : speaking ? "Plato is speaking" : "Your turn, speak now"}</p>
          <p className="text-[13px] text-muted-foreground">{phase === "ending" ? "This takes a few seconds." : muted ? "Unmute to answer." : speaking ? "Talk anytime to interrupt." : "Take your time. Say “repeat that” to hear the question again."}</p>
          {mode === "mock" ? (
            <div className="mt-2.5 flex items-center gap-2" aria-label={`Question ${Math.max(asked, 1)} of ${MOCK_QUESTIONS}`}>
              <div className="flex flex-1 gap-1">
                {Array.from({ length: MOCK_QUESTIONS }, (_, n) => (
                  <span key={n} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", n < asked ? "bg-primary" : "bg-divider")} />
                ))}
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">Question {Math.max(asked, 1)} of {MOCK_QUESTIONS}</span>
            </div>
          ) : (
            asked > 0 && <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">Question {asked}</p>
          )}
        </div>
      </div>

      {/* The whole conversation as it happens, newest at the bottom. */}
      <div ref={scroller} data-tour="voice-transcript" className={cn("scroll-thin mt-4 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto border-t bg-muted/30 px-5 py-4", transcriptClassName)}>
        {turns.length === 0 && <p className="m-auto text-sm text-muted-foreground">Plato will start in a moment…</p>}
        {turns.map((t, n) =>
          t.role === "assistant" ? (
            <motion.div key={n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[88%] gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">P</span>
              <p className="rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-[14.5px] leading-relaxed text-foreground shadow-sm">{t.text}</p>
            </motion.div>
          ) : (
            <motion.p key={n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
              {t.text}
            </motion.p>
          ),
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <footer className="relative flex items-center gap-3 border-t p-3">
        <Button variant="outline" data-ai="interview.call.mute" disabled={phase === "ending"} aria-pressed={muted} onClick={call.toggleMute} className={cn("gap-2", muted && "border-warning-line bg-warning-soft text-warning-ink hover:bg-warning-soft")}>
          {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {muted ? "Unmute" : "Mute"}
        </Button>
        <span className="hidden flex-1 text-center text-xs text-muted-foreground sm:block">Your scorecard comes when the call ends.</span>
        <Button variant="destructive" data-ai="interview.call.end" disabled={phase === "ending"} onClick={() => void call.end()} className="ml-auto gap-2">
          {phase === "ending" ? <Loader2 className="size-4 animate-spin" /> : <PhoneOff className="size-4" />}
          End call
        </Button>
      </footer>
    </div>
  )
}

// The Plato AI panel's voice call: a setup screen, the call, then what to do with it.
// A practice format picked elsewhere (e.g. "Behavioral (STAR)") pre-selects the setup and
// sends the format to the interviewer.
export type VoicePreset = { mode?: VoiceMode; focus?: string; focusTitle?: string; role?: string; skill?: string }

function VoiceInterviewPanel({ threadId, firstName, roles, onClose, onFinished, onAsk, initialJob, preset }: { threadId: string; firstName: string | null; roles: string[]; onClose: () => void; onFinished: () => void; onAsk: (text: string) => void; initialJob?: { title: string; description: string }; preset?: VoicePreset }) {
  const call = useVoiceCall()
  const [mode, setMode] = useState<VoiceMode>(preset?.mode ?? "mock")
  const [role, setRole] = useState<string | null>(preset?.role?.trim() || initialJob?.title || roles[0] || null)
  const [customRole, setCustomRole] = useState("")
  const [skill, setSkill] = useState<string | null>(preset?.skill?.trim() || null)
  const [customSkill, setCustomSkill] = useState("")
  // A pinned job rides along as a reference chip (its description is sent, not pasted); the box is for the person's own notes.
  const [pinned, setPinned] = useState(initialJob ?? null)
  const [job, setJob] = useState("")
  const [jobOpen, setJobOpen] = useState(!!initialJob)
  const [known, setKnown] = useState<{ skills: string[]; companies: string[] }>({ skills: [], companies: [] })

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

  const chosenRole = (role === "__other" ? customRole : role)?.trim() || undefined
  const chosenSkill = (skill === "__other" ? customSkill : skill)?.trim() || undefined

  const finished = useRef(false)
  useEffect(() => {
    if (call.phase === "done" && !finished.current) {
      finished.current = true
      onFinished()
    }
    if (call.phase !== "done") finished.current = false
  }, [call.phase, onFinished])

  async function start() {
    const jobDescription = [pinned?.description.trim(), job.trim() && (pinned ? `Notes from the candidate: ${job.trim()}` : job.trim())].filter(Boolean).join("\n\n").slice(0, 6000) || undefined
    await call.start(threadId, { mode, focus: preset?.focus?.trim().slice(0, 300) || undefined, role: chosenRole, skill: mode === "skill" ? chosenSkill : undefined, jobDescription, context: { title: (preset?.focusTitle || pinned?.title || chosenRole || "Voice interview").slice(0, 160), focus: preset?.focus?.trim().slice(0, 300) || undefined, jobDescription } })
  }

  const phase = call.phase === "idle" ? "setup" : call.phase
  const error = call.error
  const result = call.outcome
  const clock = fmt(call.elapsed)
  const limitClock = fmt(call.maxSeconds)
  const inCall = phase === "live" || phase === "ending"
  const modeTitle = MODES.find((m) => m.key === mode)?.title ?? "Voice interview"
  const callTitle = preset?.focusTitle || (mode === "skill" ? chosenSkill && `Prove ${chosenSkill}` : chosenRole) || "Voice interview"
  // A call opened for an interview format or a job offers only the interview modes;
  // "Prove a skill" stays for calls opened without one, or opened to prove a skill.
  const modes = (preset?.focus || initialJob) && preset?.mode !== "skill" ? MODES.filter((m) => m.key !== "skill") : MODES
  // A preset role or skill shows as a chip even when it is not one of the saved ones.
  const roleChoices = [...new Set([...(preset?.role?.trim() ? [preset.role.trim()] : []), ...roles])].slice(0, 4)
  const skillChoices = [...new Set([...(preset?.skill?.trim() ? [preset.skill.trim()] : []), ...known.skills])].slice(0, 8)
  const canStart = mode !== "skill" || !!chosenSkill
  // The call is as long as the seeker's Plato tokens allow (the server enforces it).
  const tokens = useTokens()
  const rate = useVoiceRate()
  const affordable = tokens && rate ? Math.min(15, Math.floor(Math.max(0, tokens.balance) / rate)) : 15
  const callLimit = !tokens || !rate ? "Up to 15 minutes." : affordable < 1 ? `You need about ${formatTokens(rate)} Plato tokens for a call; yours refill on ${resetLabel(tokens.resetsAt)}.` : `Up to ${affordable} minute${affordable === 1 ? "" : "s"} (≈ ${formatTokens(rate)} Plato tokens a minute).`

  return (
    <motion.aside initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} aria-label="Voice interview" className="relative z-20 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-lg shadow-primary/10 max-lg:absolute max-lg:inset-0 lg:w-[46%] lg:max-w-[560px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 glow-top" />
      <header className="relative flex items-center gap-2 px-4 py-3">
        <Mic className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{inCall ? callTitle : "Voice interview"}</p>
          {inCall && <p className="truncate text-xs text-muted-foreground">{modeTitle} · voice</p>}
        </span>
        {inCall && (
          <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
            {clock} <span className="text-muted-foreground">/ {limitClock}</span>
          </span>
        )}
        <Button variant="ghost" size="sm" aria-label={call.inCall ? "End call" : "Close"} title={call.inCall ? "End the call and save the transcript" : undefined} disabled={phase === "ending"} onClick={() => (call.inCall ? void call.end() : onClose())}>
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
              {preset?.focusTitle && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                  <Target className="size-3.5" />
                  Format: {preset.focusTitle}
                </span>
              )}
            </div>

            <div className="grid gap-2">
              {modes.map((m, i) => (
                <motion.button key={m.key} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.enter, delay: 0.05 * i }} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => setMode(m.key)} className={cn("group flex items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200", mode === m.key ? "border-primary bg-primary-tint shadow-sm shadow-primary/10" : "bg-card hover:border-primary-line hover:bg-primary-tint/40")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200", mode === m.key ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary group-hover:bg-primary/15")}>
                    <m.icon className="size-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{m.sub}</span>
                  </span>
                </motion.button>
              ))}
            </div>

            {!(pinned && mode !== "skill") && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Target className="size-3.5 text-primary" />
                {mode === "skill" ? "Which skill?" : "Which role?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(mode === "skill" ? skillChoices : roleChoices).map((x) => (
                  <FilterChip key={x} on={(mode === "skill" ? skill : role) === x} onClick={() => (mode === "skill" ? setSkill(x) : setRole(x))}>
                    {x}
                  </FilterChip>
                ))}
                <FilterChip on={(mode === "skill" ? skill : role) === "__other"} onClick={() => (mode === "skill" ? setSkill("__other") : setRole("__other"))}>
                  Something else…
                </FilterChip>
              </div>
              {(mode === "skill" ? skill : role) === "__other" && (
                <Input autoFocus value={mode === "skill" ? customSkill : customRole} onChange={(e) => (mode === "skill" ? setCustomSkill(e.target.value) : setCustomRole(e.target.value))} maxLength={80} placeholder={mode === "skill" ? "e.g. Docker" : "e.g. Product Manager"} />
              )}
            </div>
            )}

            {(known.companies.length > 0 || known.skills.length > 0) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>I&apos;ll ask about your real work:</span>
                {[...known.companies, ...known.skills.slice(0, 4)].map((k) => (
                  <span key={k} className="rounded-full border bg-card px-2 py-0.5 text-foreground">
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
                <Textarea value={job} onChange={(e) => setJob(e.target.value)} rows={7} maxLength={6000} autoFocus={!initialJob} placeholder={pinned ? "e.g. focus on system design, I'm weaker at testing…" : "Paste the job description. I'll interview you for that exact job."} className="scroll-thin min-h-40 shrink-0 resize-y leading-relaxed font-normal text-foreground field-sizing-fixed" />
              </label>
            ) : (
              <button type="button" onClick={() => setJobOpen(true)} className="w-fit text-sm font-medium text-primary hover:underline">
                + Practise for a specific job
              </button>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              {callLimit}{" "}
              <InfoTip text="When the call starts, Plato sets aside tokens for the longest call your balance allows (15 minutes at most). When it ends, you're charged only for the minutes you used." label="How voice calls use tokens" />{" "}
              Plato will ask for your microphone; headphones help. The transcript is saved to this chat.
            </p>
            <Button size="lg" disabled={phase === "connecting" || !canStart} onClick={() => void start()} className="mt-auto h-12 gap-2 text-base">
              {phase === "connecting" ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
              {phase === "connecting" ? "Connecting…" : "Start the call"}
            </Button>
          </motion.div>
        )}

        {(phase === "live" || phase === "ending") && (
          <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex min-h-0 flex-1 flex-col">
            <VoiceLive call={call} />
          </motion.div>
        )}

        {phase === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.enter} className="scroll-thin relative flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-5">
            {result.exchanges === 0 ? (
              // Nothing was answered: no "nice work", nothing to score.
              <>
                <div className="flex flex-col items-center gap-2 pt-2 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <MicOff className="size-6" />
                  </span>
                  <h3 className="text-lg font-semibold text-foreground">No answers recorded</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">The call ended before you answered, so there is nothing to score. Only the time you were on the call was charged.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button className="flex-1 gap-2" onClick={call.reset}>
                    <RotateCcw className="size-4" />
                    Try again
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2 pt-2 text-center">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.micro, delay: 0.1 }} className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
                    <BadgeCheck className="size-6" />
                  </motion.span>
                  <h3 className="text-lg font-semibold text-foreground">Call saved</h3>
                  <p className="text-sm text-muted-foreground">
                    {Math.max(1, Math.round(result.seconds / 60))} min · {result.exchanges} answer{result.exchanges === 1 ? "" : "s"}. The transcript is in this conversation in Plato AI.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Button className="h-auto justify-start gap-3 py-3 text-left" onClick={() => (onAsk("Give me detailed feedback on the voice interview we just did: my strengths, my gaps, and what to practise next."), onClose())}>
                    <ClipboardCheck className="size-5 shrink-0" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">Get my scorecard</span>
                      <span className="text-xs font-normal opacity-85">Strengths, gaps and what to practise, in Plato AI</span>
                    </span>
                  </Button>
                  <button type="button" onClick={() => (onAsk("Turn my weak answers from the voice interview into stronger example answers I can reuse."), onClose())} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint/40">
                    <Sparkles className="size-5 shrink-0 text-primary" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">Improve my answers</span>
                      <span className="text-xs text-muted-foreground">Plato rewrites the weak ones, using only what you said</span>
                    </span>
                  </button>
                  <button type="button" onClick={call.reset} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint/40">
                    <RotateCcw className="size-5 shrink-0 text-primary" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">Go again</span>
                      <span className="text-xs text-muted-foreground">Another call, same or a different focus</span>
                    </span>
                  </button>
                </div>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

export { VoiceInterviewPanel }
