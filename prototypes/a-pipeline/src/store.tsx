import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { H_MS, now, poolJobs, seedFeeds, seedJobs, seedProfile, SOURCES } from "./data"
import type { Application, ChatMsg, Feed, Job, Note, Profile, Question, Setup, Stage, Toast, View } from "./types"

export const STEPS = ["Read the posting", "Check your fit", "Tailor your resume", "Fill the form", "Submit"]
export const COST = { tailored: 3, base: 2, search: 5 }

export type Interview = { id: string; jobId?: string; title: string; mode: "Text" | "Voice"; score: number; at: number; notes: string }
export type Resume = { id: string; jobId?: string; name: string; match: number; approved: boolean; at: number }
export type Course = { skill: string; name: string; provider: string; hours: number; state: "todo" | "taking" | "done" }

type State = {
  onboarded: boolean
  jobs: Job[]
  feeds: Feed[]
  profile: Profile
  chat: ChatMsg[]
  notes: Note[]
  tokens: number
  plan: "Free" | "Pro"
  interviews: Interview[]
  resumes: Resume[]
  courses: Course[]
  lastSeen: number
}

type Ui = {
  view: View
  feed: string // "all" or a feed id
  openJob?: string
  applyIds?: string[]
  newFeed: boolean | { prompt?: string; edit?: string }
  plato: boolean
  designNotes: boolean
  careerTab: "resume" | "interview" | "skills"
  careerJob?: string
  meSection?: string
  toasts: Toast[]
}

const KEY = "plato-proto-a-v1"
const uid = () => Math.random().toString(36).slice(2, 9)

function fresh(onboarded: boolean): State {
  const t = now()
  return {
    onboarded,
    jobs: onboarded ? seedJobs() : [],
    feeds: onboarded ? seedFeeds() : [],
    profile: seedProfile(),
    chat: [
      {
        id: "c0",
        from: "plato",
        at: t - 2 * H_MS,
        text: "Morning Ahmed. Overnight I found 5 new matches and sent 1 application. 3 things need you: two questions for Talabat, a human check on N26, and Noon's form, which only you can submit.",
        actions: [
          { label: "Show what needs me", act: "needs", primary: true },
          { label: "Review new matches", act: "go-new" },
        ],
      },
    ],
    notes: onboarded
      ? [
          { id: "n1", text: "2 questions for Talabat", sub: "Senior NestJS Engineer · Plato stopped at the form", at: t - 3 * H_MS, read: false, to: { view: "jobs", job: "j12" }, tone: "warn" },
          { id: "n2", text: "Human check needed on N26", sub: "The form is filled. Tick the box and Plato submits", at: t - 5 * H_MS, read: false, to: { view: "jobs", job: "j14" }, tone: "warn" },
          { id: "n3", text: "5 new matches", sub: "Remote backend roles · Senior Node.js in Dubai · Berlin", at: t - 6 * H_MS, read: false, to: { view: "jobs" }, tone: "info" },
          { id: "n4", text: "Applied to Deel", sub: "Workable confirmed your application", at: t - 20 * H_MS, read: true, to: { view: "jobs", job: "j1" }, tone: "good" },
        ]
      : [],
    tokens: 1000,
    plan: "Free",
    interviews: onboarded
      ? [
          { id: "i1", jobId: "j9", title: "Careem · Senior Backend Engineer", mode: "Voice", score: 74, at: t - 30 * H_MS, notes: "Strong on system design. Answers on conflict were vague: use one concrete story." },
          { id: "i2", title: "Backend system design", mode: "Text", score: 81, at: t - 96 * H_MS, notes: "Good trade-off talk. Mention idempotency for payments earlier." },
        ]
      : [],
    resumes: onboarded
      ? [
          { id: "r1", jobId: "j1", name: "Deel · Senior Backend Engineer", match: 92, approved: true, at: t - 21 * H_MS },
          { id: "r2", jobId: "j9", name: "Careem · Senior Backend Engineer", match: 89, approved: true, at: t - 27 * H_MS },
          { id: "r3", jobId: "j3", name: "Toptal · Senior Node.js Engineer", match: 90, approved: false, at: t - 0.1 * H_MS },
        ]
      : [],
    courses: [
      { skill: "Kafka", name: "Kafka for Node.js developers", provider: "Confluent", hours: 6, state: "taking" },
      { skill: "Go", name: "Go for backend engineers", provider: "Coursera", hours: 14, state: "todo" },
      { skill: "Kubernetes", name: "Kubernetes fundamentals (CKAD prep)", provider: "Linux Foundation", hours: 20, state: "todo" },
      { skill: "Rust", name: "Rust in production services", provider: "Udemy", hours: 12, state: "todo" },
    ],
    lastSeen: t - 8 * H_MS,
  }
}

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as State) : null
  } catch {
    return null
  }
}
function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private window: the demo still works, it just won't remember */
  }
}

const VIEWS: View[] = ["today", "jobs", "career", "me"]
const readHash = (): View | "welcome" => {
  const h = location.hash.replace("#", "")
  return h === "welcome" ? "welcome" : (VIEWS as string[]).includes(h) ? (h as View) : "today"
}

function useStoreValue() {
  const [s, setS] = useState<State>(() => load() ?? fresh(true))
  const [ui, setUi] = useState<Ui>(() => ({ view: "today", feed: "all", newFeed: false, plato: false, designNotes: true, careerTab: "resume", toasts: [] }))
  const [hashView, setHashView] = useState(readHash)
  const sRef = useRef(s)
  sRef.current = s

  useEffect(() => {
    save(s)
  }, [s])
  useEffect(() => {
    const on = () => setHashView(readHash())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  useEffect(() => {
    if (hashView !== "welcome") setUi((u) => ({ ...u, view: hashView }))
  }, [hashView])

  const set = useCallback((fn: (s: State) => State) => setS((p) => fn(p)), [])
  const patchJob = useCallback((id: string, fn: (j: Job) => Job) => set((p) => ({ ...p, jobs: p.jobs.map((j) => (j.id === id ? fn(j) : j)) })), [set])
  const addNote = (p: State, n: Omit<Note, "id" | "at" | "read">): State => ({ ...p, notes: [{ ...n, id: uid(), at: now(), read: false }, ...p.notes] })

  // ---- toasts
  const toast = useCallback((text: string, undo?: () => void) => {
    const id = uid()
    setUi((u) => ({ ...u, toasts: [...u.toasts.slice(-2), { id, text, undo }] }))
    setTimeout(() => setUi((u) => ({ ...u, toasts: u.toasts.filter((t) => t.id !== id) })), 4200)
  }, [])
  const dropToast = (id: string) => setUi((u) => ({ ...u, toasts: u.toasts.filter((t) => t.id !== id) }))

  // ---- navigation
  const go = useCallback((view: View, extra?: Partial<Ui>) => {
    if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`)
    setHashView(view)
    setUi((u) => ({ ...u, view, openJob: undefined, ...extra }))
    document.querySelector("main")?.scrollTo({ top: 0 })
  }, [])
  const openJob = useCallback((id?: string) => {
    setUi((u) => ({ ...u, openJob: id }))
    if (id) patchJob(id, (j) => ({ ...j, fresh: false }))
  }, [patchJob])
  const setUiPart = useCallback((p: Partial<Ui>) => setUi((u) => ({ ...u, ...p })), [])

  // ---- pipeline moves
  const move = useCallback(
    (id: string, stage: Stage) => {
      if (stage === "applying") return setUi((u) => ({ ...u, applyIds: [id] }))
      const before = sRef.current.jobs.find((j) => j.id === id)
      if (!before) return
      patchJob(id, (j) => ({
        ...j,
        fresh: false,
        stage,
        savedAt: stage === "saved" ? now() : j.savedAt,
        app: stage === "closed" && !j.app ? { status: "closed", step: 0, events: [{ at: now(), text: "You marked it not interested" }], resume: "base", reason: "You hid this job. Plato will rank similar jobs lower." } : stage === "new" || stage === "saved" ? undefined : j.app,
      }))
      const label = stage === "saved" ? "Saved" : stage === "closed" ? "Hidden. Plato will show fewer like it" : stage === "new" ? "Moved back to new matches" : "Moved"
      toast(`${label}: ${before.company}`, () => patchJob(id, () => before))
    },
    [patchJob, toast],
  )

  const confirmApply = useCallback(
    (ids: string[], tailor: boolean) => {
      set((p) => {
        let tokens = p.tokens
        let resumes = p.resumes
        const jobs = p.jobs.map((j): Job => {
          if (!ids.includes(j.id)) return j
          tokens -= tailor ? COST.tailored : COST.base
          const base = { step: 0, resume: tailor ? ("tailored" as const) : ("base" as const), events: [{ at: now(), text: "You asked Plato to apply" }] }
          if (j.route === "manual") return { ...j, fresh: false, stage: "needs", app: { ...base, status: "needs", step: 1, need: { kind: "manual", site: j.source }, events: [...base.events, { at: now(), text: `${j.source} doesn't let anyone apply for you. Plato prepared your answers so it takes 2 minutes` }] } }
          if (j.route === "chrome" && !p.profile.connections.chrome) return { ...j, fresh: false, stage: "needs", app: { ...base, status: "needs", need: { kind: "chrome", site: j.source } } }
          if (tailor && !resumes.some((r) => r.jobId === j.id)) resumes = [{ id: uid(), jobId: j.id, name: `${j.company} · ${j.title}`, match: Math.min(97, j.match + 3), approved: false, at: now() }, ...resumes]
          return { ...j, fresh: false, stage: "applying", app: { ...base, status: "queued", willAsk: j.id === "j7" || j.missing.length > 1 } }
        })
        return { ...p, jobs, tokens, resumes }
      })
      setUi((u) => ({ ...u, applyIds: undefined }))
      toast(ids.length === 1 ? "Plato is on it. Follow along in the Applying column" : `Plato will apply to ${ids.length} jobs, one at a time`)
    },
    [set, toast],
  )

  const resolveNeed = useCallback(
    (id: string, answers?: Record<string, string>) => {
      set((p) => {
        const j = p.jobs.find((x) => x.id === id)
        if (!j?.app?.need) return p
        const need = j.app.need
        let profile = p.profile
        if (need.kind === "questions" && answers) {
          need.questions.forEach((q: Question) => {
            if (q.saveToProfile === "notice" && answers[q.id]) profile = { ...profile, facts: { ...profile.facts, notice: answers[q.id] } }
          })
        }
        if (need.kind === "chrome") profile = { ...profile, connections: { ...profile.connections, chrome: true } }
        const done = need.kind === "verify" || need.kind === "manual"
        const app: Application = done
          ? { ...j.app, status: "submitted", step: 5, need: undefined, appliedAt: now(), events: [...j.app.events, { at: now(), text: need.kind === "manual" ? "You submitted it on the site" : "You passed the human check. The site confirmed the application" }] }
          : {
              ...j.app,
              status: "queued",
              need: undefined,
              willAsk: false,
              answers: need.kind === "questions" ? need.questions.map((q) => ({ q: q.label, a: answers?.[q.id] || q.draft || "" })) : j.app.answers,
              events: [...j.app.events, { at: now(), text: need.kind === "chrome" ? "Plato for Chrome linked. Back in line" : "You answered. Plato is finishing the form" }],
            }
        const jobs = p.jobs.map((x) => (x.id === id ? { ...x, stage: (done ? "applied" : "applying") as Stage, app } : x))
        return { ...p, profile, jobs, notes: p.notes.map((n) => (n.to.job === id ? { ...n, read: true } : n)) }
      })
      toast("Done. Plato takes it from here")
    },
    [set, toast],
  )

  const applyAnyway = useCallback((id: string) => setUi((u) => ({ ...u, applyIds: [id] })), [])
  const markInterview = useCallback(
    (id: string) => {
      patchJob(id, (j) => ({ ...j, app: j.app && { ...j.app, interview: true, events: [...j.app.events, { at: now(), text: "You marked: got an interview" }] } }))
      toast("Nice. Plato can prepare you for it in Career")
    },
    [patchJob, toast],
  )

  // ---- feeds (a saved search that keeps running = the job alert)
  const startSearch = (p: State, feed: Feed, count: number): State => {
    const pool = poolJobs(feed.id + "-" + uid().slice(0, 3), feed.roles[0], feed.where[0]).slice(0, count)
    const sources = SOURCES.map((name) => ({ name, state: "wait" as const, found: 0 }))
    return {
      ...p,
      tokens: p.tokens - COST.search,
      jobs: [...p.jobs, ...pool.map((j) => ({ ...j, feedIds: [feed.id], stage: "hidden-pool" as unknown as Stage }))],
      feeds: p.feeds.map((f) => (f.id === feed.id ? { ...f, searching: { sources, startedAt: now() }, pool: pool.map((j) => j.id) } : f)),
    }
  }
  const createFeed = useCallback(
    (f: { name: string; roles: string[]; where: string[]; setup: Setup[]; salaryMin?: number; alert: Feed["alert"] }) => {
      const feed: Feed = { id: "f" + uid(), lastRunHours: 0, ...f }
      set((p) => startSearch({ ...p, feeds: [...p.feeds, feed] }, feed, 6))
      setUi((u) => ({ ...u, newFeed: false, feed: feed.id, view: "jobs" }))
      history.replaceState(null, "", "#jobs")
      setHashView("jobs")
      toast(`Searching 10 boards for “${f.name}”`)
    },
    [set, toast],
  )
  const updateFeed = useCallback((id: string, part: Partial<Feed>) => set((p) => ({ ...p, feeds: p.feeds.map((f) => (f.id === id ? { ...f, ...part } : f)) })), [set])
  const refreshFeed = useCallback(
    (id: string) => {
      set((p) => {
        const f = p.feeds.find((x) => x.id === id)
        return f && !f.searching ? startSearch(p, f, 2) : p
      })
      toast("Checking for new postings")
    },
    [set, toast],
  )
  const deleteFeed = useCallback(
    (id: string) => {
      set((p) => ({
        ...p,
        feeds: p.feeds.filter((f) => f.id !== id),
        jobs: p.jobs.filter((j) => !(j.feedIds.length === 1 && j.feedIds[0] === id && j.stage === "new")).map((j) => ({ ...j, feedIds: j.feedIds.filter((x) => x !== id).length ? j.feedIds.filter((x) => x !== id) : j.feedIds })),
      }))
      setUi((u) => ({ ...u, feed: "all" }))
      toast("Search deleted. Jobs you saved or applied to stay on your board")
    },
    [set, toast],
  )

  // ---- profile
  const updateProfile = useCallback((fn: (p: Profile) => Profile, msg = "Saved to your profile") => {
    set((p) => ({ ...p, profile: fn(p.profile) }))
    toast(msg)
  }, [set, toast])

  // ---- misc
  const markAllRead = useCallback(() => set((p) => ({ ...p, notes: p.notes.map((n) => ({ ...n, read: true })) })), [set])
  const readNote = useCallback((id: string) => set((p) => ({ ...p, notes: p.notes.map((n) => (n.id === id ? { ...n, read: true } : n)) })), [set])
  const markSeen = useCallback(() => set((p) => ({ ...p, lastSeen: now(), jobs: p.jobs.map((j) => ({ ...j, fresh: false })) })), [set])
  const spend = useCallback((n: number) => set((p) => ({ ...p, tokens: p.tokens - n })), [set])
  const reset = useCallback((onboarded: boolean) => {
    const f = fresh(onboarded)
    setS(f)
    save(f)
    setUi((u) => ({ ...u, view: "today", feed: "all", openJob: undefined, applyIds: undefined, newFeed: false, plato: false, toasts: [] }))
    history.replaceState(null, "", onboarded ? "#today" : "#welcome")
    setHashView(onboarded ? "today" : "welcome")
  }, [])
  const finishOnboarding = useCallback(
    (profile: Profile) => {
      const feed: Feed = { id: "f1", name: `${profile.prefs.roles[0] ?? "Backend"} roles`, roles: profile.prefs.roles.slice(0, 2), where: profile.prefs.where.slice(0, 2), setup: profile.prefs.setup, salaryMin: profile.prefs.salaryMin, alert: "daily", lastRunHours: 0 }
      set((p) => {
        const base: State = { ...fresh(true), onboarded: true, profile, jobs: [], feeds: [feed], notes: [], interviews: [], resumes: [], chat: [{ id: "w", from: "plato", at: now(), text: `Welcome, ${profile.name.split(" ")[0]}. I'm searching 10 job boards for ${feed.roles[0]} roles right now. Matches land in the New column as each board reports back, usually within 2 minutes. Nothing gets sent until you say so.`, actions: [{ label: "Watch the search", act: "go-jobs", primary: true }] }] }
        return startSearch(base, feed, 6)
      })
      setUi((u) => ({ ...u, view: "jobs", feed: "f1" }))
      history.replaceState(null, "", "#jobs")
      setHashView("jobs")
    },
    [set],
  )
  const addChat = useCallback((m: Omit<ChatMsg, "id" | "at">) => set((p) => ({ ...p, chat: [...p.chat, { ...m, id: uid(), at: now() }] })), [set])
  const addInterview = useCallback((i: Omit<Interview, "id" | "at">) => set((p) => ({ ...p, interviews: [{ ...i, id: uid(), at: now() }, ...p.interviews] })), [set])
  const approveResume = useCallback((id: string) => {
    set((p) => ({ ...p, resumes: p.resumes.map((r) => (r.id === id ? { ...r, approved: true } : r)) }))
    toast("Approved. Plato will send this version")
  }, [set, toast])
  const setCourse = useCallback((name: string, state: Course["state"]) => {
    set((p) => {
      const c = p.courses.find((x) => x.name === name)
      let profile = p.profile
      if (c && state === "done" && !profile.skills.some((s) => s.name === c.skill)) profile = { ...profile, skills: [...profile.skills, { name: c.skill, level: "Working", proof: `Finished “${c.name}”` }] }
      if (c && state === "taking" && !profile.skills.some((s) => s.name === c.skill)) profile = { ...profile, skills: [...profile.skills, { name: c.skill, level: "Learning", proof: `Taking “${c.name}”` }] }
      return { ...p, profile, courses: p.courses.map((x) => (x.name === name ? { ...x, state } : x)) }
    })
    toast(state === "done" ? "Added to your skills with proof" : state === "taking" ? "Added to your skills as learning" : "Updated")
  }, [set, toast])

  // ---- the live simulation: applications move one at a time, searches report back board by board
  useEffect(() => {
    const t = setInterval(() => {
      setS((p) => {
        let changed = false
        let next = p
        // applications
        const working = next.jobs.find((j) => j.app?.status === "working")
        if (!working) {
          const q = next.jobs.find((j) => j.app?.status === "queued")
          if (q) {
            changed = true
            next = { ...next, jobs: next.jobs.map((j) => (j.id === q.id ? { ...j, stage: "applying", app: { ...j.app!, status: "working", step: Math.max(0, j.app!.step), events: [...j.app!.events, { at: now(), text: "Started" }] } } : j)) }
          }
        } else {
          changed = true
          const a = working.app!
          const step = a.step + 1
          if (step === 3 && a.willAsk) {
            const app: Application = { ...a, step, status: "needs", need: { kind: "questions", questions: [{ id: "salary", label: "Expected monthly salary (USD)?", kind: "number", draft: String(next.profile.prefs.salaryMax), hint: "Plato suggests your target from Me. Saved for next time", saveToProfile: "salary" }] }, events: [...a.events, { at: now(), text: "Stopped: the form asks for a number Plato won't guess" }] }
            next = addNote({ ...next, jobs: next.jobs.map((j) => (j.id === working.id ? { ...j, stage: "needs", app } : j)) }, { text: `1 question for ${working.company}`, sub: working.title, to: { view: "jobs", job: working.id }, tone: "warn" })
          } else if (step >= 5) {
            const app: Application = { ...a, step: 5, status: "submitted", appliedAt: now(), events: [...a.events, { at: now(), text: `${working.source} confirmed the application` }] }
            next = addNote({ ...next, jobs: next.jobs.map((j) => (j.id === working.id ? { ...j, stage: "applied", app } : j)) }, { text: `Applied to ${working.company}`, sub: `${working.title} · ${working.source} confirmed`, to: { view: "jobs", job: working.id }, tone: "good" })
          } else {
            const text = [`Read the posting`, `Fit checked: ${working.match}%`, a.resume === "tailored" ? "Wrote a resume for this job" : "Attached your resume", "Filled the form from your profile", "Submitting"][step]
            next = { ...next, jobs: next.jobs.map((j) => (j.id === working.id ? { ...j, app: { ...a, step, events: [...a.events, { at: now(), text }] } } : j)) }
          }
        }
        // searches
        next.feeds.forEach((f) => {
          if (!f.searching) return
          changed = true
          const sources = f.searching.sources.map((s) => ({ ...s }))
          const running = sources.findIndex((s) => s.state === "run")
          if (running >= 0) {
            sources[running].state = "done"
            sources[running].found = 20 + ((running * 37) % 60)
          }
          const nextIdx = sources.findIndex((s) => s.state === "wait")
          if (nextIdx >= 0) sources[nextIdx].state = "run"
          // reveal one pooled job every other board
          let jobs = next.jobs
          if (running >= 0 && running % 2 === 1 && f.pool?.length) {
            const reveal = jobs.find((j) => f.pool!.includes(j.id) && (j.stage as string) === "hidden-pool")
            if (reveal) jobs = jobs.map((j) => (j.id === reveal.id ? { ...j, stage: "new" as Stage } : j))
          }
          const done = nextIdx < 0
          if (done) jobs = jobs.map((j) => (f.pool?.includes(j.id) && (j.stage as string) === "hidden-pool" ? { ...j, stage: "new" as Stage } : j))
          next = { ...next, jobs, feeds: next.feeds.map((x) => (x.id === f.id ? { ...x, searching: done ? undefined : { ...f.searching!, sources }, lastRunHours: done ? 0 : x.lastRunHours, pool: done ? undefined : x.pool } : x)) }
          if (done) next = addNote(next, { text: `${f.pool?.length ?? 0} new matches for “${f.name}”`, sub: "Ranked against your profile", to: { view: "jobs" }, tone: "info" })
        })
        return changed ? next : p
      })
    }, 1500)
    return () => clearInterval(t)
  }, [])

  return {
    s,
    ui,
    welcome: hashView === "welcome" || !s.onboarded,
    go,
    openJob,
    setUi: setUiPart,
    move,
    confirmApply,
    resolveNeed,
    applyAnyway,
    markInterview,
    createFeed,
    updateFeed,
    refreshFeed,
    deleteFeed,
    updateProfile,
    markAllRead,
    readNote,
    markSeen,
    spend,
    reset,
    finishOnboarding,
    addChat,
    addInterview,
    approveResume,
    setCourse,
    toast,
    dropToast,
  }
}

export type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)
export function StoreProvider({ children }: { children: ReactNode }) {
  const v = useStoreValue()
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useStore outside provider")
  return v
}

// Derived views every screen agrees on.
export function useDerived() {
  const { s, ui } = useStore()
  return useMemo(() => {
    const visible = s.jobs.filter((j) => (j.stage as string) !== "hidden-pool")
    const inFeed = ui.feed === "all" ? visible : visible.filter((j) => j.feedIds.includes(ui.feed))
    const by = (st: Stage) => inFeed.filter((j) => j.stage === st)
    const needs = visible.filter((j) => j.stage === "needs")
    const readiness = readinessOf(s.profile)
    return { visible, inFeed, by, needs, readiness, fresh: visible.filter((j) => j.fresh && j.stage === "new") }
  }, [s.jobs, s.profile, ui.feed])
}

export function readinessOf(p: Profile) {
  const items = [
    { key: "cv", label: "CV uploaded and read", done: !!p.cv.file, where: "cv" },
    { key: "prefs", label: "What you're looking for", done: p.prefs.roles.length > 0, where: "looking" },
    { key: "notice", label: "Notice period", done: !!p.facts.notice, where: "details" },
    { key: "auth", label: "Work authorization", done: !!p.facts.workAuth, where: "details" },
    { key: "links", label: "LinkedIn or portfolio link", done: !!(p.facts.linkedin || p.facts.portfolio), where: "details" },
    { key: "chrome", label: "Plato for Chrome (for LinkedIn and sites that block bots)", done: p.connections.chrome, where: "connections" },
  ]
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

export const ago = (t: number) => {
  const m = Math.round((now() - t) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? "yesterday" : `${d} days ago`
}
