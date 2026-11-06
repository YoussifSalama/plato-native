// The prototype's whole world. One job card moves through one pipeline:
// new match -> saved -> Plato applying -> needs you -> applied (or closed).

export type Stage = "new" | "saved" | "applying" | "needs" | "applied" | "closed"
export type Setup = "Remote" | "Hybrid" | "On-site"
// How an application can be sent: Plato fills the form itself, Plato fills it in the
// seeker's own browser (sites that block bots), or the seeker applies on the site.
export type Route = "plato" | "chrome" | "manual"

export type Question = { id: string; label: string; kind: "text" | "yesno" | "number"; draft?: string; hint?: string; saveToProfile?: string }
export type Need =
  | { kind: "questions"; questions: Question[] }
  | { kind: "verify"; site: string }
  | { kind: "manual"; site: string }
  | { kind: "chrome"; site: string }

export type AppEvent = { at: number; text: string }
export type Application = {
  status: "queued" | "working" | "needs" | "submitted" | "skipped" | "failed" | "closed"
  step: number // 0..4 = Read posting, Check fit, Tailor resume, Fill form, Submit
  need?: Need
  events: AppEvent[]
  answers?: { q: string; a: string }[]
  appliedAt?: number
  reason?: string
  resume: "tailored" | "base"
  interview?: boolean
  // scripted: this one stops for a question when it reaches the form
  willAsk?: boolean
}

export type Check = { state: "ok" | "warn" | "no"; text: string }
export type Job = {
  id: string
  feedIds: string[]
  title: string
  company: string
  tint: string
  location: string
  setup: Setup
  salary?: [number, number]
  source: string
  route: Route
  postedDays: number
  match: number
  matched: string[]
  missing: string[]
  checks: Check[]
  about: string
  duties: string[]
  stage: Stage
  fresh?: boolean // arrived since the seeker last looked
  savedAt?: number
  app?: Application
}

export type SourceState = { name: string; state: "wait" | "run" | "done"; found: number }
export type Feed = {
  id: string
  name: string
  roles: string[]
  where: string[]
  setup: Setup[]
  salaryMin?: number
  alert: "off" | "daily" | "weekly"
  searching?: { sources: SourceState[]; startedAt: number }
  lastRunHours: number
  pool?: string[] // job ids that the running search will reveal
}

export type Experience = { id: string; title: string; company: string; from: string; to: string; summary: string }
export type Skill = { name: string; level: "Learning" | "Working" | "Strong"; proof?: string }
export type Profile = {
  name: string
  email: string
  phone: string
  headline: string
  city: string
  cv: { file: string; updated: string; pages: number }
  experiences: Experience[]
  education: { school: string; degree: string; years: string }[]
  certs: { name: string; issuer: string; year: string }[]
  languages: { name: string; level: string }[]
  skills: Skill[]
  projects: { name: string; what: string; result?: string }[]
  prefs: { roles: string[]; where: string[]; setup: Setup[]; salaryMin: number; salaryMax: number; types: string[]; avoid: string }
  facts: { notice: string; workAuth: string; linkedin: string; github: string; portfolio: string; relocate: string; sponsorship: string; currentSalary: string }
  connections: { chrome: boolean; email: boolean; digest: "daily" | "weekly" | "off" }
}

export type ChatAction = { label: string; act: string; arg?: string; primary?: boolean }
export type ChatMsg = { id: string; from: "plato" | "me"; text: string; actions?: ChatAction[]; chips?: string[]; at: number }

export type Note = { id: string; text: string; sub: string; at: number; read: boolean; to: { view: View; job?: string } ; tone: "info" | "good" | "warn" }

export type View = "today" | "jobs" | "career" | "me"
export type Toast = { id: string; text: string; undo?: () => void }
