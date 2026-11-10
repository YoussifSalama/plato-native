import { useMemo, useSyncExternalStore } from "react"
import type { InterviewFocus, InterviewFormat, InterviewRound, InterviewStyle, InterviewSummary, StartRequest } from "./api"

// The interview flow (/career/interviews/new): one question per screen, every answer in the
// URL so Back, refresh and links work. A link with some answers ("presets") skips them:
//   /career/interviews/new?target=job&job=<id>&jt=<title>&jc=<company>&how=voice
// A pasted job post is too long for a URL: it waits in this tab's sessionStorage (PASTE_KEY).

export type Target = "job" | "general" | "situation"
export type Situation = Exclude<InterviewFormat, "standard">
export type How = "chat" | "voice"
export type FlowAnswers = {
  target?: Target
  // A job of the seeker's (id), or "paste" for a pasted job post.
  job?: string
  // The job's title and company, for the screens (the job list may not hold it).
  jt?: string
  jc?: string
  // Practise a finished written interview again: same job, new run.
  retry?: string
  role?: string
  skill?: string
  // Anything the seeker wants the interviewer to know (level, company type, topics, a job ad).
  notes?: string
  focus?: InterviewFocus
  format?: Situation
  round?: InterviewRound
  how?: How
  style?: InterviewStyle
}
export type StepKey = "target" | "job" | "role" | "focus" | "format" | "round" | "how" | "style" | "ready"

const KEYS = ["target", "job", "jt", "jc", "retry", "role", "skill", "notes", "focus", "format", "round", "how", "style"] as const
const ONE_OF: Partial<Record<keyof FlowAnswers, readonly string[]>> = {
  target: ["job", "general", "situation"],
  focus: ["mixed", "behavioral", "technical", "situational"],
  format: ["negotiation", "case", "pitch", "english"],
  round: ["screen", "manager", "loop"],
  how: ["chat", "voice"],
  style: ["real", "coach"],
}

export const NOTES_MAX = 2000

export function readAnswers(params: URLSearchParams): FlowAnswers {
  const a: Record<string, string> = {}
  for (const k of KEYS) {
    const v = params.get(k)?.trim().slice(0, k === "notes" ? NOTES_MAX : 160)
    if (!v || (ONE_OF[k] && !ONE_OF[k]!.includes(v))) continue
    a[k] = v
  }
  // A job (or a situation) says what the interview is about, so the first question is answered.
  if (!a.target && (a.job || a.retry)) a.target = "job"
  if (!a.target && a.format) a.target = "situation"
  return a as FlowAnswers
}

export function flowHref(a: FlowAnswers, step?: StepKey) {
  const q = new URLSearchParams()
  for (const k of KEYS) if (a[k]) q.set(k, a[k] as string)
  if (step) q.set("step", step)
  const s = q.toString()
  return `/career/interviews/new${s ? `?${s}` : ""}`
}

// The questions of each branch, in order. Every branch has five, then the summary, then the
// interview itself (the last step, shown on the run screens).
export function stepsFor(a: FlowAnswers): StepKey[] {
  const middle: StepKey[] = a.target === "general" ? ["role", "focus"] : a.target === "situation" ? ["format", "role"] : ["job", "round"]
  return ["target", ...middle, "how", "style", "ready"]
}
export const TOTAL_STEPS = 7 // five questions, Ready, the interview

export function isAnswered(step: StepKey, a: FlowAnswers, pasteReady: boolean) {
  switch (step) {
    case "target":
      return !!a.target
    case "job":
      return !!a.retry || (a.job === "paste" ? pasteReady : !!a.job)
    case "role":
      return !!a.role?.trim()
    case "focus":
      return !!a.focus
    case "format":
      return !!a.format
    case "round":
      return !!a.round
    case "how":
      return !!a.how
    case "style":
      return !!a.style
    case "ready":
      return false
  }
}
export const firstOpen = (a: FlowAnswers, pasteReady: boolean) => stepsFor(a).find((s) => !isAnswered(s, a, pasteReady)) ?? "ready"

// ---- Pasted job post (this tab only) ----
export type Paste = { title: string; company: string; description: string }
export const PASTE_KEY = "plato.interview.paste"
export const pasteWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
export const pasteOk = (p: Paste | null): p is Paste => !!p && !!p.title.trim() && pasteWords(p.description) >= 30
export function readPaste(): Paste | null {
  try {
    const p = JSON.parse(rawPaste() ?? "null") as Paste | null
    return p && typeof p.description === "string" ? { title: p.title ?? "", company: p.company ?? "", description: p.description } : null
  } catch {
    return null
  }
}
let memo: string | null = null // private mode: kept for this page view
const PASTE_EVENT = "plato:interview-paste"
export function writePaste(p: Paste) {
  memo = JSON.stringify(p)
  try {
    sessionStorage.setItem(PASTE_KEY, memo)
  } catch {
    // private mode: `memo` keeps it
  }
  window.dispatchEvent(new Event(PASTE_EVENT))
}
const rawPaste = () => {
  try {
    return sessionStorage.getItem(PASTE_KEY) ?? memo
  } catch {
    return memo
  }
}
const onPaste = (cb: () => void) => (window.addEventListener(PASTE_EVENT, cb), () => window.removeEventListener(PASTE_EVENT, cb))
// The pasted post: `undefined` until read in the browser (no sessionStorage on the server).
export function usePaste(): Paste | null | undefined {
  const raw = useSyncExternalStore(onPaste, rawPaste, () => undefined)
  return useMemo(() => (raw === undefined ? undefined : raw ? readPaste() : null), [raw])
}

// ---- Words for the choices ----
export const TARGETS: { key: Target; title: string; body: string }[] = [
  { key: "job", title: "A job I'm applying to", body: "Questions built from that job's posting and your CV" },
  { key: "general", title: "Interview practice in general", body: "The questions most interviews share, for the role you want" },
  { key: "situation", title: "A specific situation", body: "Salary negotiation, a case interview, presenting a solution or business English" },
]
export const FOCUS: { key: InterviewFocus; title: string; body: string }[] = [
  { key: "mixed", title: "Mixed", body: "A bit of everything, like a first-round interview" },
  { key: "behavioral", title: "Behavioral", body: "“Tell me about a time…”, judged on structure and results (STAR)" },
  { key: "technical", title: "Technical", body: "Your skills and how you work, built from your CV" },
  { key: "situational", title: "Situational", body: "“What would you do if…” judgement questions" },
]
export const FORMATS: { key: Situation; title: string; body: string; voice: string }[] = [
  { key: "negotiation", title: "Salary negotiation", body: "Ask for more against a tough recruiter", voice: "Salary negotiation role-play: you are a tough recruiter making an offer; let them negotiate, push back realistically, then judge how they argued" },
  { key: "case", title: "Case interview", body: "Size a market or find why profits fell, thinking out loud", voice: "Case interview (market sizing or profitability): they think out loud; judge the structure, the assumptions and the maths" },
  { key: "pitch", title: "Presenting a solution", body: "Pitch to a skeptical client who pushes back", voice: "Client demo pitch: you are a skeptical client; let them pitch a solution, push back with real objections, then judge the pitch" },
  { key: "english", title: "Business English", body: "Interview answers in English, with gentle corrections", voice: "Business English conversation for interviews; correct grammar and word choice gently" },
]
export const ROUNDS: { key: InterviewRound; title: string; short: string; body: string }[] = [
  { key: "screen", title: "First call with a recruiter", short: "First call", body: "Why this job, your motivation, salary and the basics" },
  { key: "manager", title: "Hiring manager", short: "Hiring manager", body: "Your experience and skills against what the job needs" },
  { key: "loop", title: "All rounds", short: "All rounds", body: "Every round in one sitting" },
]
export const HOWS: { key: How; title: string; body: string }[] = [
  { key: "voice", title: "Out loud", body: "A live voice call with Plato. Closest to the real thing" },
  { key: "chat", title: "In writing", body: "Type your answers, one question at a time, at your pace" },
]
export const STYLES: { key: InterviewStyle; title: string; body: string }[] = [
  { key: "real", title: "Like the real interview", body: "No hints along the way. Your scorecard at the end" },
  { key: "coach", title: "Coach me", body: "Feedback after every answer: what worked and one thing to sharpen" },
]

const label = <K extends string>(list: { key: K; title: string }[], k?: K) => list.find((x) => x.key === k)?.title
export const focusLabel = (k?: InterviewFocus | null) => label(FOCUS, k ?? undefined) ?? "Mixed"
export const formatLabel = (k?: InterviewFormat | null) => (k && k !== "standard" ? label(FORMATS, k) : undefined)
export const roundLabel = (k?: InterviewRound | null) => ROUNDS.find((r) => r.key === k)?.short
export const styleLabel = (k?: InterviewStyle | null) => (k === "coach" ? "Coach" : "Real")

// One name for an interview everywhere: "<Job> · <round>", "General · <focus>", "<Format>".
export function interviewName(x: { target?: Target | "paste"; jobTitle?: string; round?: InterviewRound | null; focus?: InterviewFocus | null; format?: InterviewFormat | null }) {
  const f = formatLabel(x.format)
  if (f) return f
  if (x.target === "general") return `General · ${focusLabel(x.focus)}`
  return [x.jobTitle || "Job interview", roundLabel(x.round)].filter(Boolean).join(" · ")
}
// The same name for a summary from the server (older ones are job interviews).
export const summaryName = (s: InterviewSummary) => interviewName({ target: s.target, jobTitle: s.jobTitle, round: s.round, focus: s.focus, format: s.format })

// How many questions and roughly how long (the server's defaults).
export function lengthOf(a: FlowAnswers) {
  if (a.how === "voice") return { questions: a.style === "coach" ? null : 6, minutes: "up to 15" }
  const n = a.target === "general" || a.style === "coach" ? 5 : 6
  return { questions: n, minutes: `about ${n * 3}` }
}

// What the server's start call needs (a written interview).
export function startRequest(a: FlowAnswers, paste: Paste | null): StartRequest | null {
  const opts = { style: a.style, ...(a.format && { format: a.format }), ...(a.target === "general" && a.focus && { focus: a.focus }), ...(a.target === "job" && a.round && { round: a.round }) }
  if (a.retry) return { retryOf: a.retry, ...opts }
  if (a.target === "job" && a.job === "paste") return pasteOk(paste) ? { paste: { title: paste.title.trim(), company: paste.company.trim() || undefined, description: paste.description.trim().slice(0, 12_000) }, ...opts } : null
  if (a.target === "job" && a.job) return { jobId: a.job, ...opts }
  if ((a.target === "general" || a.target === "situation") && a.role?.trim()) return { general: { role: a.role.trim(), skill: a.skill?.trim() || undefined, notes: a.notes?.trim().slice(0, NOTES_MAX) || undefined }, ...opts }
  return null
}

// What the voice call needs: the interviewer's mode, the format it runs and the job, if any.
export function voiceSetup(a: FlowAnswers, paste: Paste | null) {
  const mode = a.style === "coach" ? ("practice" as const) : ("mock" as const)
  const fmt = FORMATS.find((f) => f.key === a.format)
  const round = ROUNDS.find((r) => r.key === a.round)
  const focus = FOCUS.find((f) => f.key === a.focus)
  const pasted = a.job === "paste" && pasteOk(paste)
  const job = a.target === "job" ? (pasted ? { title: paste.title.trim(), company: paste.company.trim(), description: paste.description.trim() } : { title: a.jt || "This job", company: a.jc || "", description: `${a.jt || "The job"}${a.jc ? ` at ${a.jc}` : ""}.` }) : null
  const what = fmt
    ? fmt.voice
    : a.target === "general"
      ? a.focus === "technical"
        ? `Technical interview${a.skill?.trim() ? ` focused on ${a.skill.trim()}` : ""}: their skills and how they work, built from their CV`
        : a.focus && a.focus !== "mixed"
          ? `${focus!.title} interview: ${focus!.body}`
          : "General interview: a mix of behavioral, technical and situational questions"
      : `${round?.title ?? "Hiring manager"} interview for this job: ${round?.body ?? ""}`
  const title = interviewName({ target: a.target === "situation" ? undefined : a.target, jobTitle: job?.title, round: a.round, focus: a.focus, format: a.format })
  const notes = a.target !== "job" && a.notes?.trim() ? `Notes from the candidate (what they want practised): ${a.notes.trim().slice(0, NOTES_MAX)}` : ""
  const description = (job ? (pasted && job.company ? `Company: ${job.company}\n\n${job.description}` : job.description) : notes).slice(0, 6000) || undefined
  return { mode, focus: what.slice(0, 300), role: (job?.title || a.role?.trim() || undefined)?.slice(0, 80), skill: a.skill?.trim() || undefined, jobDescription: description, title }
}
