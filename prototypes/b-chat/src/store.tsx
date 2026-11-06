import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { BOARDS, commit, jobOf, label, MODES, now, P, respond, resultsFor, startMode, uid, type Input, type State } from "./engine"
import { PERSONAS } from "./personas"
import type { App, Card, Mode, Msg, Thread } from "./types"

export const STEPS = ["Read the posting", "Check your fit", "Tailor your resume", "Fill the form", "Submit"]
const KEY = "plato-proto-b-v1"
const H = 3_600_000

export type Canvas = null | { tab: "results" | "applications" | "resume" | "profile"; searchId?: string; jobId?: string; resumeJobId?: string }
type Ui = { canvas: Canvas; typing: string | null; designNotes: boolean; threads: boolean; toasts: { id: string; text: string }[] }

const pm = (text?: string, card?: Card, ago = 0): Msg => ({ id: uid(), from: "plato", text, card, at: now() - ago })
const me = (text: string, ago = 0): Msg => ({ id: uid(), from: "me", text, at: now() - ago })

function seed(persona: "ahmed" | "mona", fresh: boolean): State {
  const p = PERSONAS[persona]
  const home: Thread = { id: "t-home", title: "New chat", flow: fresh ? { mode: "onboard", step: "cv" } : { mode: null }, msgs: fresh ? [pm(`Hi, I'm Plato. I find jobs that fit you and apply to them for you. To start, send me your CV. I'll read it and ask you a few simple questions. No forms.`, { type: "cv-read" })] : [], at: now() }
  const base: State = { persona, fresh, threads: [home], active: home.id, searches: [], apps: [], saved: [], hidden: [], facts: { ...p.facts }, proven: [], resumes: [], interviews: [], tokens: 1000, notified: [] }
  if (fresh) return base
  const J = (n: number) => p.jobs[n].id
  const tid = "t-search"
  const role = p.roleIdeas[0]
  const where = persona === "ahmed" ? ["Remote", "Dubai"] : ["Riyadh"]
  const draft = { role, where, setup: (persona === "ahmed" ? "Any" : "Hybrid") as "Any" | "Hybrid", salary: p.salaryChips[1], avoid: "Nothing" }
  const results = resultsFor(p, draft, []).ids
  const applyIds = [J(0), J(2), J(4), J(6), J(1)].filter((id) => results.includes(id) || true)
  const search = { id: "s1", threadId: tid, params: draft, boards: BOARDS.map((name, i) => ({ name, state: "done" as const, found: 20 + ((i * 37) % 60) })), results, alert: "daily" as const, done: true }
  const t2: Thread = {
    id: tid,
    title: `${role} · ${where[0]}`,
    flow: { mode: "search", step: "results", draft, searchId: "s1" },
    at: now() - 20 * H,
    msgs: [
      me(`/job-search`, 26 * H),
      pm(`Let's find you a job. What kind of job are you looking for?`, { type: "choices", key: "search:role", options: [...p.roleIdeas, "Something else"], picked: [role] }, 26 * H),
      me(role, 26 * H),
      pm(`Where would you like to work? Pick as many as you like.`, { type: "choices", key: "search:where", options: [...p.places, "Anywhere"], multi: true, picked: where }, 26 * H),
      me(where.join(", "), 26 * H),
      pm(`Here's what I'll look for. Change anything, or start.`, { type: "summary", searchDraft: draft, state: "go" }, 26 * H),
      me("Start searching", 26 * H),
      pm(`I checked 10 job boards and found ${results.length} jobs that fit. These are the best 3:`, { type: "jobs", searchId: "s1", ids: results.slice(0, 3), total: results.length }, 25 * H),
      me("Apply to the top 5 for me", 25 * H),
      pm(`Here's what will happen with your top 5. Nothing is sent until you confirm.`, { type: "apply", ids: applyIds, state: "done" }, 25 * H),
      pm(`On it. I apply one at a time and keep you posted here.`, { type: "applying", ids: applyIds }, 25 * H),
    ],
  }
  const t3: Thread = {
    id: "t-resume",
    title: `Resume · ${p.jobs[2].company}`,
    flow: { mode: null },
    at: now() - 50 * H,
    msgs: [me("/build-resume", 50 * H), pm(`Here it is, written for ${p.jobs[2].company}.`, { type: "resume", jobId: J(2), version: 1, focus: "My results and numbers" }, 50 * H), me(`Use it when I apply to ${p.jobs[2].company}`, 50 * H), pm(`Done. I'll send this version to ${p.jobs[2].company}.`, undefined, 50 * H)],
  }
  const apps: App[] = [
    { jobId: J(0), threadId: tid, status: "submitted", step: 5, appliedAt: now() - 24 * H, events: ["Wrote a resume for this job", `${p.jobs[0].source} confirmed the application`] },
    { jobId: J(2), threadId: tid, status: "submitted", step: 5, appliedAt: now() - 22 * H, events: ["Filled the form in your browser with Plato for Chrome", `${p.jobs[2].source} confirmed it`] },
    { jobId: J(4), threadId: tid, status: "working", step: 1, events: ["Read the posting"] },
    { jobId: J(6), threadId: tid, status: "queued", step: 0, events: [] },
    { jobId: J(1), threadId: tid, status: p.jobs[1].route === "manual" ? "manual" : "queued", step: 0, events: [] },
  ]
  return { ...base, threads: [home, t2, t3], searches: [search], apps, saved: [J(3)], resumes: [{ id: "r1", jobId: J(2), version: 1, focus: "My results and numbers", approved: true }], interviews: [{ title: label(p.jobs[2]), score: 74, at: now() - 40 * H }] }
}

function load(): State | null {
  try {
    const r = localStorage.getItem(KEY)
    return r ? (JSON.parse(r) as State) : null
  } catch {
    return null
  }
}

function useValue() {
  const [s, setS] = useState<State>(() => load() ?? seed("ahmed", false))
  const [ui, setUi] = useState<Ui>({ canvas: null, typing: null, designNotes: true, threads: false, toasts: [] })
  const sRef = useRef(s)
  sRef.current = s
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* the demo still works without storage */
    }
  }, [s])

  const patchUi = useCallback((p: Partial<Ui>) => setUi((u) => ({ ...u, ...p })), [])
  const toast = useCallback((text: string) => {
    const id = uid()
    setUi((u) => ({ ...u, toasts: [...u.toasts, { id, text }] }))
    setTimeout(() => setUi((u) => ({ ...u, toasts: u.toasts.filter((t) => t.id !== id) })), 3500)
  }, [])

  // Plato "thinks" for a moment before answering, like the real one.
  const later = useCallback((tid: string, fn: (s: State) => State, ms = 650) => {
    setUi((u) => ({ ...u, typing: tid }))
    setTimeout(() => {
      setS(fn)
      setUi((u) => ({ ...u, typing: null }))
    }, ms)
  }, [])

  const markPicked = (st: State, tid: string, key: string | undefined, values: string[] | undefined): State =>
    !key
      ? st
      : {
          ...st,
          threads: st.threads.map((t) => {
            if (t.id !== tid) return t
            const idx = [...t.msgs].reverse().findIndex((m) => m.card?.type === "choices" && m.card.key === key && !m.card.picked)
            if (idx < 0) return t
            const at = t.msgs.length - 1 - idx
            return { ...t, msgs: t.msgs.map((m, i) => (i === at && m.card?.type === "choices" ? { ...m, card: { ...m.card, picked: values } } : m)) }
          }),
        }

  const send = useCallback(
    (input: Input) => {
      const tid = sRef.current.active
      const shown = input.show ?? input.text ?? (input.values ?? []).join(", ")
      setS((st) => {
        const withMe = { ...st, threads: st.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me(shown)], at: now() } : t)) }
        return markPicked(withMe, tid, input.key, input.values)
      })
      if (input.key === "results" && /show/i.test(input.values?.[0] ?? "")) {
        const f = sRef.current.threads.find((t) => t.id === tid)?.flow
        if (f?.mode === "search") setUi((u) => ({ ...u, canvas: { tab: "results", searchId: f.searchId } }))
      }
      if (input.key === "go" || /tracker/i.test(input.values?.[0] ?? "")) setUi((u) => ({ ...u, canvas: { tab: "applications" } }))
      later(tid, (st) => respond(st, tid, input))
    },
    [later],
  )

  const slash = useCallback(
    (mode: Mode) => {
      const tid = sRef.current.active
      const cmd = MODES.find((m) => m.mode === mode)!.cmd
      setS((st) => ({ ...st, threads: st.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me(cmd)] } : t)) }))
      if (mode === "applications") setUi((u) => ({ ...u, canvas: { tab: "applications" } }))
      if (mode === "profile") setUi((u) => ({ ...u, canvas: { tab: "profile" } }))
      later(tid, (st) => {
        const r = startMode(st, mode)
        return commit(st, tid, r.msgs, r.flow)
      })
    },
    [later],
  )

  const newChat = useCallback(() => {
    const t: Thread = { id: uid(), title: "New chat", flow: { mode: null }, msgs: [], at: now() }
    setS((st) => (st.threads.find((x) => x.id === st.active)?.msgs.length === 0 ? st : { ...st, threads: [t, ...st.threads], active: t.id }))
    setUi((u) => ({ ...u, threads: false, canvas: null }))
  }, [])
  const openThread = useCallback((id: string) => {
    setS((st) => ({ ...st, active: id }))
    setUi((u) => ({ ...u, threads: false }))
  }, [])

  const setCard = (st: State, msgId: string, fn: (c: Card) => Card): State => ({ ...st, threads: st.threads.map((t) => ({ ...t, msgs: t.msgs.map((m) => (m.id === msgId && m.card ? { ...m, card: fn(m.card) } : m)) })) })

  const startSearch = useCallback(
    (msgId: string, alert: "daily" | "weekly" | "off") => {
      const tid = sRef.current.active
      setS((st) => {
        const m = st.threads.find((t) => t.id === tid)!.msgs.find((x) => x.id === msgId)!
        if (m.card?.type !== "summary") return st
        const id = uid()
        const draft = m.card.searchDraft
        let n = setCard(st, msgId, (c) => ({ ...c, state: "go" }) as Card)
        n = { ...n, tokens: n.tokens - 5, searches: [...n.searches, { id, threadId: tid, params: draft, boards: BOARDS.map((name, i) => ({ name, state: i === 0 ? "run" : "wait", found: 0 })), results: [], alert, done: false }] }
        n = { ...n, threads: n.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me("Start searching")] } : t)) }
        return commit(n, tid, [pm(`On it. I'm checking 10 job boards and company career pages for ${draft.role} jobs. It takes about a minute; you can keep chatting.`, { type: "searching", searchId: id })], { mode: "search", step: "running", draft, searchId: id })
      })
    },
    [],
  )
  const changeSearch = useCallback(
    (msgId: string) => {
      const tid = sRef.current.active
      setS((st) => setCard({ ...st, threads: st.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me("Change something")] } : t)) }, msgId, (c) => ({ ...c, state: "edit" }) as Card))
      later(tid, (st) => commit(st, tid, [pm("What do you want to change?", { type: "choices", key: "search:change", options: ["The job", "The place", "From home or office", "The salary", "What to avoid"] })], st.threads.find((t) => t.id === tid)!.flow))
    },
    [later],
  )
  const confirmApply = useCallback((msgId: string) => {
    const tid = sRef.current.active
    setS((st) => {
      const m = st.threads.flatMap((t) => t.msgs).find((x) => x.id === msgId)
      if (m?.card?.type !== "apply") return st
      const ids = m.card.ids.filter((id) => !st.apps.some((a) => a.jobId === id))
      let n = setCard(st, msgId, (c) => ({ ...c, state: "done" }) as Card)
      const apps: App[] = ids.map((id) => ({ jobId: id, threadId: tid, status: jobOf(st, id)!.route === "manual" ? "manual" : "queued", step: 0, events: ["You asked Plato to apply"] }))
      n = { ...n, tokens: n.tokens - ids.length * 3, apps: [...n.apps, ...apps], threads: n.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me(ids.length === 1 ? "Yes, apply" : `Yes, apply to ${ids.length}`)] } : t)) }
      const manual = apps.filter((a) => a.status === "manual").length
      return commit(n, tid, [pm(`On it. I apply one at a time and keep you posted here.${manual ? ` ${manual} of them only accept applications from you; I prepared your answers so it takes 2 minutes.` : ""}`, { type: "applying", ids })], { mode: null })
    })
  }, [])
  const cancelApply = useCallback((msgId: string) => {
    const tid = sRef.current.active
    setS((st) => commit(setCard(st, msgId, (c) => ({ ...c, state: "cancelled" }) as Card), tid, [pm("No problem, nothing was sent. They're still in your results.")], st.threads.find((t) => t.id === tid)!.flow))
  }, [])
  const markSubmitted = useCallback((jobId: string) => {
    setS((st) => ({ ...st, apps: st.apps.map((a) => (a.jobId === jobId ? { ...a, status: "submitted", step: 5, appliedAt: now(), events: [...a.events, "You submitted it on the site"] } : a)) }))
    toast("Marked as applied")
  }, [toast])

  const uploadCv = useCallback(() => {
    const tid = sRef.current.active
    const p = P(sRef.current)
    setS((st) => ({ ...st, threads: st.threads.map((t) => (t.id === tid ? { ...t, msgs: [...t.msgs, me(`📎 ${p.cv}`)], flow: { mode: "onboard", step: "reading" } } : t)) }))
    later(
      tid,
      (st) => commit(st, tid, [pm(`Thanks! I read your CV. Here's what I understood about you:`, { type: "profile" }), pm(`Is that right?`, { type: "choices", key: "onboard", options: ["Looks right, find me jobs", "Fix something"] })], { mode: "onboard", step: "check" }),
      2600,
    )
  }, [later])

  const exitMode = useCallback(() => {
    const tid = sRef.current.active
    setS((st) => commit(st, tid, [pm("Okay, stopped. What would you like to do now?", { type: "modes" })], { mode: null }))
  }, [])

  const switchPersona = useCallback((persona: "ahmed" | "mona", fresh = false) => {
    setS(seed(persona, fresh))
    setUi((u) => ({ ...u, canvas: null, typing: null, threads: false }))
  }, [])

  // Live: searches report back board by board; applications run one at a time.
  useEffect(() => {
    const t = setInterval(() => {
      setS((st) => {
        let n = st
        let changed = false
        n.searches.forEach((sr) => {
          if (sr.done) return
          changed = true
          const boards = sr.boards.map((b) => ({ ...b }))
          const run = boards.findIndex((b) => b.state === "run")
          if (run >= 0) {
            boards[run].state = "done"
            boards[run].found = 18 + ((run * 41) % 70)
          }
          const nx = boards.findIndex((b) => b.state === "wait")
          if (nx >= 0) boards[nx].state = "run"
          const done = nx < 0
          const p = P(n)
          const r = done ? resultsFor(p, sr.params, n.hidden) : null
          n = { ...n, searches: n.searches.map((x) => (x.id === sr.id ? { ...x, boards, done, results: r ? r.ids : x.results } : x)) }
          if (r) {
            const fresh = r.ids.filter((id) => !n.apps.some((a) => a.jobId === id))
            const top = (fresh.length >= 3 ? fresh : r.ids).slice(0, 3)
            const already = r.ids.length - fresh.length
            const best = jobOf(n, top[0])!
            n = commit(
              n,
              sr.threadId,
              [
                pm(`Done. I checked 10 job boards and found ${r.ids.length} jobs that fit you${r.relaxed ? ` (I widened the area a little: there weren't many exact matches)` : ""}. ${already ? `You already applied to ${already} of them, so here are the best 3 new ones:` : `The best is ${best.company} at ${best.match}%. Here are the top 3:`}`, { type: "jobs", searchId: sr.id, ids: top, total: r.ids.length }),
                pm(sr.alert !== "off" ? `I'll also check every ${sr.alert === "daily" ? "morning" : "week"} and tell you about new ones. What next?` : "What next?", { type: "choices", key: "results", options: ["Apply to the top 5 for me", "Show me all of them", "Change the search"] }),
              ],
              { mode: "search", step: "results", draft: sr.params, searchId: sr.id },
            )
          }
        })
        const working = n.apps.find((a) => a.status === "working")
        if (!working) {
          const q = n.apps.find((a) => a.status === "queued")
          if (q) {
            changed = true
            n = { ...n, apps: n.apps.map((a) => (a === q ? { ...a, status: "working", step: 0, events: [...a.events, "Started"] } : a)) }
          }
        } else {
          changed = true
          const j = jobOf(n, working.jobId)!
          const step = working.step + 1
          if (step === 3 && !n.facts.notice && !working.events.some((e) => e.startsWith("You answered"))) {
            // Ask once: later jobs that hit the same question wait quietly for the same answer.
            const asked = n.apps.some((a) => a !== working && a.status === "needs" && a.ask?.key === "notice")
            n = { ...n, apps: n.apps.map((a) => (a === working ? { ...a, step, status: "needs", ask: { key: "notice", question: "notice period", options: ["Immediately", "2 weeks", "1 month", "2 months"] }, events: [...a.events, asked ? "Waiting for your notice-period answer (asked once in the chat)" : "Stopped: the form asks your notice period"] } : a)) }
            if (!asked) n = commit(n, working.threadId, [pm(`Quick question while I apply to ${j.company}: their form asks for your notice period. What should I tell them? I'll remember it for every application.`, { type: "choices", key: `ask:${j.id}:notice`, options: ["Immediately", "2 weeks", "1 month", "2 months"] })], n.threads.find((t) => t.id === working.threadId)!.flow)
          } else if (step >= 5) {
            n = { ...n, apps: n.apps.map((a) => (a === working ? { ...a, step: 5, status: "submitted", appliedAt: now(), events: [...a.events, `${j.source} confirmed the application`] } : a)) }
          } else n = { ...n, apps: n.apps.map((a) => (a === working ? { ...a, step, events: [...a.events, STEPS[step]] } : a)) }
        }
        // Tell the person once when a batch they started has finished.
        n.threads.forEach((t) =>
          t.msgs.forEach((m) => {
            if (m.card?.type !== "applying" || n.notified.includes(m.id)) return
            const apps = m.card.ids.map((id) => n.apps.find((a) => a.jobId === id)).filter(Boolean) as App[]
            if (!apps.length || apps.some((a) => a.status === "queued" || a.status === "working" || a.status === "needs")) return
            changed = true
            const sent = apps.filter((a) => a.status === "submitted").length
            const manual = apps.filter((a) => a.status === "manual")
            n = { ...n, notified: [...n.notified, m.id] }
            n = commit(n, t.id, [pm(`All done: I applied to ${sent} job${sent === 1 ? "" : "s"} and each site confirmed it.${manual.length ? ` ${manual.map((a) => jobOf(n, a.jobId)!.company).join(" and ")} only take applications from you; your answers are ready in the tracker.` : ""} Want to get ready for the interviews?`, { type: "choices", key: "go-mode", options: ["Practice an interview", "Build my resume", "Find more jobs"] })], t.flow)
          }),
        )
        return changed ? n : st
      })
    }, 1300)
    return () => clearInterval(t)
  }, [])

  return { s, ui, patchUi, toast, send, slash, newChat, openThread, startSearch, changeSearch, confirmApply, cancelApply, markSubmitted, uploadCv, switchPersona, exitMode }
}

export type Store = ReturnType<typeof useValue>
const Ctx = createContext<Store | null>(null)
export function StoreProvider({ children }: { children: ReactNode }) {
  const v = useValue()
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error("no store")
  return v
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
