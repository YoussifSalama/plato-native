// Prototype B: everything happens in one conversation with Plato.
// A "mode" (picked with /) decides what Plato is helping with right now; the
// conversation collects what it needs in plain language, then does the work.

export type Mode = "search" | "resume" | "interview" | "skill" | "applications" | "profile"
export type Setup = "Remote" | "Hybrid" | "On-site"
export type Route = "plato" | "chrome" | "manual"

export type Job = {
  id: string
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
  why: string[] // plain-language reasons it fits
  watch: string[] // plain-language things to know
  about: string
}

export type App = {
  jobId: string
  threadId: string
  status: "queued" | "working" | "needs" | "submitted" | "manual"
  step: number
  ask?: { key: string; question: string; options: string[] }
  appliedAt?: number
  events: string[]
}

export type SearchParams = { role?: string; where: string[]; setup?: Setup | "Any"; salary?: string; avoid?: string }
export type Search = {
  id: string
  threadId: string
  params: SearchParams
  boards: { name: string; state: "wait" | "run" | "done"; found: number }[]
  results: string[]
  alert: "daily" | "weekly" | "off"
  done: boolean
}

export type Card =
  | { type: "modes" }
  | { type: "choices"; key: string; options: string[]; multi?: boolean; picked?: string[] }
  | { type: "summary"; searchDraft: SearchParams; state: "ask" | "go" | "edit" }
  | { type: "searching"; searchId: string }
  | { type: "jobs"; searchId?: string; ids: string[]; total: number }
  | { type: "apply"; ids: string[]; state: "ask" | "done" | "cancelled" }
  | { type: "applying"; ids: string[] }
  | { type: "resume"; jobId?: string; version: number; focus: string }
  | { type: "score"; score: number; notes: string[] }
  | { type: "plan"; skill: string }
  | { type: "skill-done"; skill: string; jobs: number }
  | { type: "status" }
  | { type: "profile" }
  | { type: "cv-read" }

export type Msg = { id: string; from: "plato" | "me"; text?: string; card?: Card; at: number }

export type Flow =
  | { mode: null }
  | { mode: "search"; step: "role" | "where" | "setup" | "salary" | "avoid" | "confirm" | "running" | "results"; draft: SearchParams; searchId?: string }
  | { mode: "resume"; step: "job" | "focus" | "done"; jobId?: string; focus?: string; version: number }
  | { mode: "interview"; step: "job" | "how" | "q" | "done"; jobId?: string; how?: "Text" | "Voice"; i: number; scores: number[] }
  | { mode: "skill"; step: "pick" | "plan" | "quiz" | "done"; skill?: string; qi: number; right: number }
  | { mode: "applications" }
  | { mode: "profile"; step: "view" | "edit" }
  | { mode: "onboard"; step: "cv" | "reading" | "check" }

export type Thread = { id: string; title: string; flow: Flow; msgs: Msg[]; at: number }

export type Quiz = { q: string; options: string[]; answer: number }
export type Gap = { skill: string; jobs: number; course: string; provider: string; hours: number; quiz: Quiz[] }

export type Persona = {
  id: "ahmed" | "mona"
  name: string
  first: string
  headline: string
  city: string
  email: string
  cv: string
  currency: string
  years: number
  experience: { title: string; company: string; years: string; did: string }[]
  skills: string[]
  roleIdeas: string[]
  places: string[]
  salaryChips: string[]
  avoidChips: string[]
  gaps: Gap[]
  facts: { notice: string; workAuth: string; linkedin: string }
  jobs: Job[]
  interview: (j?: Job) => { q: string; hint: string; example: string }[]
}
