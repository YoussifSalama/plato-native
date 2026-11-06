// Plato's side of the conversation, as pure functions over the state.
// The real product uses the orchestrator model; this prototype scripts the
// same behaviour: one question at a time, plain words, suggested answers,
// and it skips anything the person already said.

import { PERSONAS } from "./personas"
import type { Card, Flow, Job, Mode, Msg, Persona, Search, SearchParams, Setup, Thread } from "./types"

export type Facts = { notice: string; workAuth: string; linkedin: string }
export type State = {
  persona: "ahmed" | "mona"
  fresh: boolean // a brand-new account that hasn't uploaded a CV yet
  threads: Thread[]
  active: string
  searches: Search[]
  apps: import("./types").App[]
  saved: string[]
  hidden: string[]
  facts: Facts
  proven: { skill: string; proof: string; level: "Learning" | "Proven" }[]
  resumes: { id: string; jobId?: string; version: number; focus: string; approved: boolean }[]
  interviews: { title: string; score: number; at: number }[]
  tokens: number
  notified: string[]
}

export type Input = { text?: string; key?: string; values?: string[]; show?: string }

export const uid = () => Math.random().toString(36).slice(2, 9)
export const now = () => Date.now()
export const P = (s: State): Persona => PERSONAS[s.persona]
export const jobOf = (s: State, id?: string): Job | undefined => (id ? P(s).jobs.find((j) => j.id === id) : undefined)
export const label = (j: Job) => `${j.company} · ${j.title}`
const plato = (text?: string, card?: Card): Msg => ({ id: uid(), from: "plato", text, card, at: now() })
const choices = (key: string, options: string[], multi = false): Card => ({ type: "choices", key, options, multi })

export const MODES: { mode: Mode; cmd: string; title: string; sub: string }[] = [
  { mode: "search", cmd: "/job-search", title: "Search for jobs", sub: "Tell me what you want; I search every board and rank the jobs for you" },
  { mode: "resume", cmd: "/build-resume", title: "Build my resume", sub: "A resume written for a specific job, from your real experience" },
  { mode: "interview", cmd: "/practice-interview", title: "Practice an interview", sub: "I ask what that company is likely to ask, then score you" },
  { mode: "skill", cmd: "/prove-skill", title: "Learn & prove a new skill", sub: "Pick a skill your matches ask for, learn it, pass a quick check" },
  { mode: "applications", cmd: "/applications", title: "My applications", sub: "Where every application stands and what needs you" },
  { mode: "profile", cmd: "/profile", title: "What you know about me", sub: "Check or change your details by just telling me" },
]
export const modeTitle = (m: Mode) => MODES.find((x) => x.mode === m)!.title

/* ------------------------------------------------------------ search */

const EXTRA_PLACES = ["Jeddah", "Dammam", "Abu Dhabi", "Doha", "Kuwait", "London", "Amsterdam", "Alexandria", "Cairo", "Dubai", "Riyadh", "Berlin"]
const ROLE_NOUNS = ["accountant", "accounting", "finance manager", "financial analyst", "auditor", "controller", "hr", "human resources", "recruiter", "talent", "engineer", "developer", "designer", "product manager", "project manager", "data analyst", "analyst", "sales", "marketing", "nurse", "teacher", "lawyer", "pharmacist", "customer service", "operations"]
const LEVELS = ["senior", "junior", "lead", "head of", "chief", "staff", "financial", "backend", "frontend", "full stack", "node.js", "platform", "mobile", "software", "hr", "data"]
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bHr\b/, "HR").replace(/\bNode\.Js\b/, "Node.js")

export function extract(text: string, p: Persona, step?: string): Partial<SearchParams> {
  const t = ` ${text.toLowerCase()} `
  const out: Partial<SearchParams> = {}
  const places = [...new Set([...p.places, ...EXTRA_PLACES])].filter((x) => x !== "Remote" && t.includes(x.toLowerCase()))
  if (/remote/.test(t) || (/from home|wfh/.test(t) && !places.length)) places.push("Remote")
  if (/anywhere|don't mind where|any city/.test(t)) places.push("Anywhere")
  if (/gulf/.test(t)) places.push("Dubai", "Riyadh")
  if (places.length) out.where = [...new Set(places)]
  if (/hybrid|a mix|mix of/.test(t)) out.setup = "Hybrid"
  else if (/office|on-?site|in person/.test(t)) out.setup = "On-site"
  else if (/remote|from home/.test(t)) out.setup = "Remote"
  else if (step === "setup" && /don'?t mind|any|either|whatever/.test(t)) out.setup = "Any"
  const money = t.match(/(\$|sar|usd|aed|egp)?\s?(\d[\d,.]*)\s?(k|000)?\s?(sar|usd|aed|egp|riyals?|dollars?)?/)
  if (money && (money[1] || money[3] || money[4] || step === "salary") && /\d{2,}|\dk/.test(money[0])) {
    let n = parseFloat(money[2].replace(/,/g, ""))
    if (money[3] || n < 1000) n *= 1000
    const c = (money[1] || money[4] || "").replace(/riyals?/, "sar").replace(/dollars?|\$/, "usd").toUpperCase() || p.currency
    out.salary = c === "USD" ? `$${n.toLocaleString("en-US")}+` : `${c} ${n.toLocaleString("en-US")}+`
  }
  const noun = ROLE_NOUNS.find((n) => new RegExp(`\\b${n.replace(".", "\\.")}s?\\b`).test(t))
  if (noun) {
    const lvl = LEVELS.find((l) => t.includes(`${l} ${noun}`))
    out.role = title(`${lvl ? lvl + " " : ""}${noun === "accounting" ? "accountant" : noun}`)
    if (noun === "engineer" || noun === "developer") {
      const tech = ["backend", "frontend", "full stack", "node.js", "platform", "mobile", "software", "data"].find((x) => t.includes(x))
      out.role = title(`${t.includes("senior") ? "senior " : ""}${tech ? tech + " " : ""}${noun}`)
    }
  } else if (step === "role" && text.trim().length > 2) out.role = title(text.trim().slice(0, 40))
  if (step === "avoid" && text.trim()) out.avoid = text.trim()
  if (step === "salary" && !out.salary && /skip|no|any|don'?t/.test(t)) out.salary = "Any"
  return out
}

const ORDER: (keyof SearchParams)[] = ["role", "where", "setup", "salary", "avoid"]
const missing = (d: SearchParams) => ORDER.find((k) => (k === "where" ? !d.where.length : !d[k]))

function askSearch(p: Persona, d: SearchParams, lead?: string): { step: Extract<Flow, { mode: "search" }>["step"]; msgs: Msg[] } {
  const k = missing(d)
  const pre = lead ? `${lead} ` : ""
  if (k === "role") return { step: "role", msgs: [plato(`${pre}What kind of job are you looking for? These fit your CV, or tell me in your own words.`, choices("search:role", [...p.roleIdeas, "Something else"]))] }
  if (k === "where") return { step: "where", msgs: [plato(`${pre}Where would you like to work? Pick as many as you like.`, choices("search:where", [...p.places, "Anywhere"], true))] }
  if (k === "setup") return { step: "setup", msgs: [plato(`${pre}Do you want to work from home, from the office, or a mix of both?`, choices("search:setup", ["From home", "A mix of both", "From the office", "I don't mind"]))] }
  if (k === "salary") return { step: "salary", msgs: [plato(`${pre}What monthly salary are you hoping for? I use it to rank jobs. I never put it on an application without asking you.`, choices("search:salary", [...p.salaryChips, "Skip"]))] }
  if (k === "avoid") return { step: "avoid", msgs: [plato(`${pre}Is there anything you don't want? Companies, industries, travel, night shifts…`, choices("search:avoid", p.avoidChips))] }
  return { step: "confirm", msgs: [plato(`${pre}Here's what I'll look for. Change anything, or start.`, { type: "summary", searchDraft: d, state: "ask" })] }
}

const SETUP_PICK: Record<string, Setup | "Any"> = { "From home": "Remote", "A mix of both": "Hybrid", "From the office": "On-site", "I don't mind": "Any" }

export function resultsFor(p: Persona, d: SearchParams, hidden: string[]) {
  const where = d.where.filter((w) => w !== "Anywhere")
  let rows = p.jobs.filter((j) => !hidden.includes(j.id))
  const strict = rows.filter((j) => (!where.length || where.some((w) => (w === "Remote" ? j.setup === "Remote" : j.location.toLowerCase().includes(w.toLowerCase())))) && (!d.setup || d.setup === "Any" || j.setup === d.setup || (d.setup === "Hybrid" && j.setup === "Remote")))
  const relaxed = strict.length < 4
  if (!relaxed) rows = strict
  return { ids: rows.sort((a, b) => b.match - a.match).map((j) => j.id), relaxed }
}

export const BOARDS = ["LinkedIn", "Indeed", "Google Jobs", "Bayt", "Glassdoor", "Greenhouse", "Lever", "Workable", "Wuzzuf", "Company sites"]

/* ------------------------------------------------------------ starting modes */

export function startMode(s: State, mode: Mode, seed?: Partial<SearchParams>): { flow: Flow; msgs: Msg[]; state?: Partial<State> } {
  const p = P(s)
  const myJobs = [...new Set([...s.apps.map((a) => a.jobId), ...s.saved])].map((id) => jobOf(s, id)!).filter(Boolean)
  switch (mode) {
    case "search": {
      const d: SearchParams = { where: [], ...seed }
      const bits = [d.role && `${d.role} jobs`, d.where.length && `in ${d.where.join(" or ")}`, d.setup && d.setup !== "Any" && (d.setup === "Remote" ? "from home" : d.setup === "Hybrid" ? "hybrid" : "in the office"), d.salary && d.salary !== "Any" && `paying ${d.salary}`].filter(Boolean)
      const lead = bits.length ? `Got it: ${bits.join(", ")}.` : "Let's find you a job."
      const a = askSearch(p, d, lead)
      return { flow: { mode: "search", step: a.step, draft: d }, msgs: a.msgs }
    }
    case "resume":
      return { flow: { mode: "resume", step: "job", version: 0 }, msgs: [plato("Which job is this resume for? A resume written for one job gets more replies than a general one.", choices("resume:job", [...myJobs.slice(0, 4).map(label), "A general resume"]))] }
    case "interview": {
      const booked = s.apps.find((a) => a.status === "submitted")
      const opts = [...myJobs.slice(0, 4).map(label), "A general interview"]
      return { flow: { mode: "interview", step: "job", i: 0, scores: [] }, msgs: [plato(`Which interview should we practice?${booked ? ` You applied to ${jobOf(s, booked.jobId)?.company}, so that's a good one to start with.` : ""}`, choices("interview:job", opts))] }
    }
    case "skill":
      return { flow: { mode: "skill", step: "pick", qi: 0, right: 0 }, msgs: [plato("Which skill do you want to learn and prove? These are the ones your job matches ask for most that aren't on your CV yet.", choices("skill:pick", [...p.gaps.map((g) => `${g.skill} · ${g.jobs} jobs ask for it`)]))] }
    case "applications": {
      const waiting = s.apps.filter((a) => a.status === "needs" || a.status === "manual")
      return { flow: { mode: "applications" }, msgs: [plato(s.apps.length ? `Here's where your ${s.apps.length} applications stand.${waiting.length ? ` ${waiting.length} need you.` : ""}` : "You haven't applied to anything yet. Want me to find jobs first?", s.apps.length ? { type: "status" } : choices("go", ["Search for jobs"]))] }
    }
    case "profile":
      return { flow: { mode: "profile", step: "view" }, msgs: [plato("This is what I know about you and use on every application.", { type: "profile" }), plato("Want to change anything? Just tell me, like “my notice period is one month” or “I moved to Jeddah”.", choices("profile:edit", [s.facts.notice ? "All good" : "Add my notice period", "Change what I'm looking for", "Upload a new CV"]))] }
  }
}

/* ------------------------------------------------------------ the reply */

export function respond(s: State, tid: string, input: Input): State {
  const t = s.threads.find((x) => x.id === tid)!
  const p = P(s)
  let flow: Flow = t.flow
  let next: State = s
  const out: Msg[] = []
  const say = (text?: string, card?: Card) => out.push(plato(text, card))
  const text = (input.text ?? "").trim()
  const low = text.toLowerCase()
  const v = input.values ?? []
  const key = input.key ?? ""

  // Buttons on job cards and on questions from a running application work in any mode.
  if (key.startsWith("job:")) {
    const j = jobOf(s, key.slice(4))!
    const act = v[0]
    if (act === "more") {
      say(`${j.title} at ${j.company}, ${j.location}. ${j.match}% match.\n\nWhy it fits:\n${j.why.map((w) => `• ${w}`).join("\n")}${j.watch.length ? `\n\nGood to know:\n${j.watch.map((w) => `• ${w}`).join("\n")}` : ""}${j.salary ? `\n\nPays ${money(p, j.salary)} a month.` : ""}`, choices(`job:${j.id}`, ["Apply to this one", "Save it", "Not for me"]))
    } else if (act === "Apply to this one" || act === "apply") {
      say(`Here's what will happen with ${j.company}:`, { type: "apply", ids: [j.id], state: "ask" })
    } else if (act === "Save it" || act === "save") {
      next = { ...next, saved: [...new Set([...next.saved, j.id])] }
      say(`Saved ${j.company}. Say “apply to my saved jobs” whenever you're ready.`)
    } else if (act === "Not for me" || act === "hide") {
      next = { ...next, hidden: [...next.hidden, j.id] }
      say(`Got it, I'll hide ${j.company} and rank jobs like it lower. What didn't you like? It helps me.`, choices("feedback", ["The location", "The salary", "The company", "The role itself"]))
    }
    return commit(next, tid, out, flow)
  }
  if (key === "go-mode") {
    const m: Mode = /interview/i.test(v[0]) ? "interview" : /resume/i.test(v[0]) ? "resume" : /skill/i.test(v[0]) ? "skill" : "search"
    const r = startMode(next, m)
    return commit(next, tid, r.msgs, r.flow)
  }
  if (key.startsWith("ask:")) {
    const [, jobId, field] = key.split(":")
    const answer = v[0] ?? text
    const j = jobOf(s, jobId)
    if (!j) {
      next = { ...next, facts: { ...next.facts, [field]: answer } }
      say(`Saved: ${field === "notice" ? "notice period" : field} “${answer}”. I'll use it on every application.`)
      return commit(next, tid, out, flow)
    }
    // One answer unblocks every application waiting on the same question.
    const waiting = next.apps.filter((a) => a.jobId !== jobId && a.status === "needs" && a.ask?.key === field)
    next = { ...next, facts: field === "notice" ? { ...next.facts, notice: answer } : next.facts, apps: next.apps.map((a) => (a.jobId === jobId || waiting.includes(a) ? { ...a, status: "queued", ask: undefined, events: [...a.events, `You answered: ${answer}`] } : a)) }
    say(`Thanks. I told ${j.company} “${answer}”${waiting.length ? ` and used the same answer for the ${waiting.length} other job${waiting.length > 1 ? "s" : ""} that asked` : ""}. It's saved to your profile, so I won't ask again. Carrying on.`)
    return commit(next, tid, out, flow)
  }
  if (key === "feedback") {
    say(`Noted: ${v[0].toLowerCase()}. I'll weigh that in every search from now on.`)
    return commit(next, tid, out, flow)
  }
  if (key === "go") {
    const r = startMode(next, "search")
    return commit(next, tid, [...out, ...r.msgs], r.flow)
  }

  // A typed answer to a question an application is waiting on.
  const pending = next.apps.find((a) => a.status === "needs" && a.threadId === tid)
  if (pending && text && !key && text.length < 30 && /\d|immediate|week|month/.test(low) && !(flow.mode === "interview" && flow.step === "q")) {
    return respond(s, tid, { key: `ask:${pending.jobId}:notice`, values: [text] })
  }

  // Facts about the person can be told at any time, in any mode.
  const notice = low.match(/notice period (?:is |of )?([\w ]+)/)
  if (text && notice && !(flow.mode === "interview" && flow.step === "q")) {
    next = { ...next, facts: { ...next.facts, notice: notice[1].trim() } }
    say(`Got it: your notice period is ${notice[1].trim()}. I'll use it on every application that asks.`)
    return commit(next, tid, out, flow)
  }
  const moved = low.match(/(?:moved to|live in|based in) ([a-z ]+)/)
  if (text && moved && flow.mode !== "search") {
    say(`Updated: you're in ${title(moved[1].trim())} now. I'll favour jobs there from your next search.`)
    return commit(next, tid, out, flow)
  }

  // Free text that clearly asks for a different mode switches to it, keeping what was said.
  if (text && !key) {
    const want = intent(low)
    const inSearch = flow.mode === "search" && flow.step !== "results" && flow.step !== "running"
    if (want && want !== flow.mode && !(inSearch && want === "search") && !(flow.mode === "interview" && flow.step === "q")) {
      const r = startMode(next, want, want === "search" ? extract(text, p) : undefined)
      return commit(next, tid, [...out, ...r.msgs], r.flow)
    }
  }

  switch (flow.mode) {
    case null: {
      if (/^(hi|hello|hey|salam|good (morning|evening|afternoon))/.test(low)) say(`Hi ${p.first}. I'm good, thanks. What would you like to do?`, { type: "modes" })
      else say("I can help with these. Pick one, or type / any time.", { type: "modes" })
      break
    }
    case "search": {
      const d = { ...flow.draft }
      if (flow.step === "results" || flow.step === "running") {
        const sid = flow.searchId
        const search = next.searches.find((x) => x.id === sid)
        const n = Number(low.match(/(\d+)/)?.[1] ?? 5)
        if (key === "results" || text) {
          const pick = v[0] ?? text
          if (/apply/i.test(pick) && search) {
            const ids = search.results.filter((id) => !next.apps.some((a) => a.jobId === id)).slice(0, /saved/i.test(pick) ? 99 : n)
            const use = /saved/i.test(pick) ? next.saved.filter((id) => !next.apps.some((a) => a.jobId === id)) : ids
            say(use.length ? `Here's what will happen with your ${use.length === 1 ? "pick" : `top ${use.length}`}. Nothing is sent until you confirm.` : "You've already applied to all of these.", use.length ? { type: "apply", ids: use, state: "ask" } : undefined)
          } else if (/show|all|see/i.test(pick) && search) {
            say(`All ${search.results.length} are in the panel on the right, best first. Tap any job to see why it fits.`, choices("results", ["Apply to the top 5 for me", "Change the search"]))
          } else if (/every day|daily|keep looking|alert/i.test(pick) && search) {
            next = { ...next, searches: next.searches.map((x) => (x.id === search.id ? { ...x, alert: "daily" } : x)) }
            say("Done. I'll run this search every morning and tell you here when something new and good comes up.")
          } else if (/change|edit|different/i.test(pick)) {
            const a = askSearch(p, { ...d, role: undefined }, "Sure.")
            flow = { mode: "search", step: a.step, draft: { ...d, role: undefined } }
            out.push(...a.msgs)
          } else {
            const ex = extract(text, p)
            if (Object.keys(ex).length) {
              const nd = { ...d, ...ex }
              say("Updated. Here's the new search:", { type: "summary", searchDraft: nd, state: "ask" })
              flow = { mode: "search", step: "confirm", draft: nd }
            } else say("I can apply to these for you, show them all, keep looking every day, or change the search.", choices("results", ["Apply to the top 5 for me", "Show me all of them", "Keep looking every day", "Change the search"]))
          }
        }
        break
      }
      if (key.startsWith("search:")) {
        const step = key.slice(7)
        const pick = v[0]
        if (step === "change") {
          if (pick === "The job") d.role = undefined
          if (pick === "The place") d.where = []
          if (pick === "From home or office") d.setup = undefined
          if (pick === "The salary") d.salary = undefined
          if (pick === "What to avoid") d.avoid = undefined
        }
        if (step === "role") {
          if (pick === "Something else") {
            say("Tell me in your own words. For example: “accounts payable in a hospital” or “HR for a retail company”.")
            break
          }
          d.role = pick
        }
        if (step === "where") d.where = v
        if (step === "setup") d.setup = SETUP_PICK[pick]
        if (step === "salary") d.salary = pick === "Skip" ? "Any" : pick
        if (step === "avoid") d.avoid = pick
      } else if (text) {
        Object.assign(d, Object.fromEntries(Object.entries(extract(text, p, flow.step)).filter(([, x]) => x !== undefined)))
        if (flow.step === "where" && !d.where.length) d.where = [title(text.slice(0, 30))]
      }
      const a = askSearch(p, d)
      flow = { mode: "search", step: a.step, draft: d }
      out.push(...a.msgs)
      break
    }
    case "resume": {
      if (flow.step === "job") {
        const pick = v[0] ?? text
        const j = p.jobs.find((x) => label(x) === pick || (text && low.includes(x.company.toLowerCase())))
        flow = { ...flow, step: "focus", jobId: j?.id }
        say(j ? `A resume for ${j.company}. What should it make the most of?` : "A general resume. What should it make the most of?", choices("resume:focus", ["My results and numbers", "Leading people", "Skills this job asks for", "Just do your best"]))
      } else {
        const pick = v[0] ?? text
        const j = jobOf(s, flow.jobId)
        if (flow.step === "focus") {
          const id = uid()
          next = { ...next, tokens: next.tokens - 3, resumes: [{ id, jobId: j?.id, version: 1, focus: pick, approved: false }, ...next.resumes] }
          flow = { ...flow, step: "done", focus: pick, version: 1 }
          say(`Here it is. I put ${j ? `what ${j.company} cares about` : "your strongest work"} first, led with ${pick === "Just do your best" ? "your results" : pick.toLowerCase()}, and used the job's own words only where they're true for you.`, { type: "resume", jobId: j?.id, version: 1, focus: pick })
          say("What do you think?", choices("resume:next", [j ? `Use it when I apply to ${j.company}` : "Use it as my main resume", "Make it shorter", "More formal", "Start over"]))
        } else if (/use it/i.test(pick)) {
          next = { ...next, resumes: next.resumes.map((r, i) => (i === 0 ? { ...r, approved: true } : r)) }
          say(`Done. ${j ? `I'll send this version to ${j.company}.` : "It's now your main resume."} Want to practice the interview too?`, choices("go-mode", ["Practice the interview", "Find more jobs"]))
          flow = { mode: null }
        } else if (/shorter|formal/i.test(pick)) {
          const version = flow.version + 1
          next = { ...next, tokens: next.tokens - 1, resumes: [{ id: uid(), jobId: j?.id, version, focus: pick, approved: false }, ...next.resumes] }
          flow = { ...flow, version }
          say(/shorter/i.test(pick) ? "Version " + version + ": one page. I cut the oldest bullets and merged two that said the same thing." : "Version " + version + ": more formal wording, no first person.", { type: "resume", jobId: j?.id, version, focus: pick })
          say("Better?", choices("resume:next", [j ? `Use it when I apply to ${j.company}` : "Use it as my main resume", "Make it shorter", "More formal", "Start over"]))
        } else {
          const r = startMode(next, "resume")
          flow = r.flow
          out.push(...r.msgs)
        }
      }
      break
    }
    case "interview": {
      const qs = p.interview(jobOf(s, flow.jobId))
      if (flow.step === "job") {
        const pick = v[0] ?? text
        const j = p.jobs.find((x) => label(x) === pick || (text && low.includes(x.company.toLowerCase())))
        flow = { ...flow, step: "how", jobId: j?.id }
        say(`${j ? `${j.company} it is.` : "A general interview it is."} Do you want to type your answers or talk them through?`, choices("interview:how", ["Type my answers", "Talk, like a phone call"]))
      } else if (flow.step === "how") {
        const how = /talk|voice|call/i.test(v[0] ?? text) ? "Voice" : "Text"
        next = { ...next, tokens: next.tokens - 4 }
        flow = { ...flow, step: "q", how, i: 0 }
        say(`${how === "Voice" ? "In the real app you'd talk and I'd listen. In this prototype, type your answers instead. " : ""}3 questions. Answer like you would in the room; I'll tell you how it lands after each one.\n\nQuestion 1 of 3: ${qs[0].q}`, choices("interview:help", ["Give me a hint", "Show me a strong answer", "Skip"]))
      } else if (flow.step === "q") {
        const q = qs[flow.i]
        const pick = v[0]
        if (pick === "Give me a hint") {
          say(`Hint: ${q.hint}`)
          break
        }
        if (pick === "Show me a strong answer") {
          say(`A strong answer sounds like this:\n\n“${q.example}”\n\nNow try it in your own words.`)
          break
        }
        const answer = pick === "Skip" ? "" : text
        const words = answer.split(/\s+/).filter(Boolean).length
        const score = answer ? Math.round(Math.min(95, 52 + Math.min(28, words / 2.2) + (/\d/.test(answer) ? 12 : 0))) : 40
        const fb = !answer ? "Skipped. We'll come back to this kind of question." : words < 20 ? "Too short to land. Give one real example: what you did and what happened." : /\d/.test(answer) ? "Strong: concrete, with numbers. Add one sentence on what you'd do differently." : "Clear story. Add a number (time saved, money, volume) to make it stick."
        const scores = [...flow.scores, score]
        if (flow.i + 1 < qs.length) {
          flow = { ...flow, i: flow.i + 1, scores }
          say(`${score}/100. ${fb}\n\nQuestion ${flow.i + 1} of 3: ${qs[flow.i].q}`, choices("interview:help", ["Give me a hint", "Show me a strong answer", "Skip"]))
        } else {
          const total = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          const j = jobOf(s, flow.jobId)
          next = { ...next, interviews: [{ title: j ? label(j) : "General interview", score: total, at: now() }, ...next.interviews] }
          flow = { mode: null }
          say(`${score}/100. ${fb}`)
          say(undefined, { type: "score", score: total, notes: [scores[0] < 75 ? "Open with the numbers on your first story" : "Your first story was concrete and measured", scores[1] < 75 ? "Name the key idea in the first sentence" : "You explained the hard part clearly", scores[2] < 75 ? "Use one real story for behaviour questions" : "Good real-life example"] })
          say("Saved to your practice history. Again, or something else?", choices("go-mode", ["Practice again", "Build my resume", "Find more jobs"]))
        }
      }
      break
    }
    case "skill": {
      if (flow.step === "pick") {
        const pick = (v[0] ?? text).split(" · ")[0]
        const g = p.gaps.find((x) => x.skill.toLowerCase() === pick.toLowerCase() || low.includes(x.skill.toLowerCase().split(" ")[0])) ?? p.gaps[0]
        flow = { ...flow, step: "plan", skill: g.skill }
        say(undefined, { type: "plan", skill: g.skill })
        say("Already know it? I can test you now. 3 quick questions; pass 2 and I add it to your profile with proof.", choices("skill:plan", ["Test me now", "I'll take the course first"]))
      } else if (flow.step === "plan") {
        const sk = flow.skill
        const g = p.gaps.find((x) => x.skill === sk)!
        if (/course/i.test(v[0] ?? text)) {
          next = { ...next, proven: [...next.proven.filter((x) => x.skill !== g.skill), { skill: g.skill, proof: `Taking “${g.course}”`, level: "Learning" }] }
          flow = { mode: null }
          say(`Good plan. I added ${g.skill} to your profile as “learning”, which employers like to see. Type /prove-skill when you've finished and I'll test you.`)
        } else {
          flow = { ...flow, step: "quiz", qi: 0, right: 0 }
          say(`Question 1 of 3: ${g.quiz[0].q}`, choices("skill:quiz", g.quiz[0].options))
        }
      } else if (flow.step === "quiz") {
        const sk = flow.skill
        const g = p.gaps.find((x) => x.skill === sk)!
        const q = g.quiz[flow.qi]
        const ok = (v[0] ?? text) === q.options[q.answer]
        const right = flow.right + (ok ? 1 : 0)
        const fb = ok ? "Right." : `Not quite. The answer is “${q.options[q.answer]}”.`
        if (flow.qi + 1 < g.quiz.length) {
          flow = { ...flow, qi: flow.qi + 1, right }
          say(`${fb}\n\nQuestion ${flow.qi + 1} of 3: ${g.quiz[flow.qi].q}`, choices("skill:quiz", g.quiz[flow.qi].options))
        } else if (right >= 2) {
          next = { ...next, proven: [...next.proven.filter((x) => x.skill !== g.skill), { skill: g.skill, proof: `Passed Plato's check, ${right}/3`, level: "Proven" }] }
          flow = { mode: null }
          say(fb)
          say(undefined, { type: "skill-done", skill: g.skill, jobs: g.jobs })
        } else {
          flow = { mode: null }
          say(`${fb}\n\n${right} of 3. You need 2 to pass. Take “${g.course}” (${g.hours} hours) and try again; I'll keep your place.`, choices("go-mode", ["Learn & prove a new skill", "Find more jobs"]))
        }
      }
      break
    }
    case "applications": {
      say("Anything else about your applications? You can also open the tracker on the right.", choices("go-mode", ["Search for jobs", "Practice an interview"]))
      break
    }
    case "profile": {
      const pick = v[0] ?? ""
      const notice = low.match(/notice[^0-9a-z]*(?:period)?[^0-9a-z]*(?:is|of)?\s*([\w\s]+)/)
      if (pick === "Add my notice period") say("What's your notice period? I'll use it on every form that asks.", choices("ask:none:notice", ["Immediately", "2 weeks", "1 month", "2 months"]))
      else if (pick === "Change what I'm looking for") {
        const r = startMode(next, "search")
        flow = r.flow
        out.push(...r.msgs)
      } else if (pick === "Upload a new CV") say("Drop the new CV here with the paperclip, and I'll read it and keep your edits.")
      else if (notice && /notice/.test(low)) {
        const val = notice[1].trim().replace(/^(is|of)\s+/, "")
        next = { ...next, facts: { ...next.facts, notice: val } }
        say(`Updated: notice period “${val}”. I'll use it on every application.`)
      } else if (/moved to|live in|based in/.test(low)) {
        const city = text.replace(/.*(moved to|live in|based in)\s*/i, "").replace(/[.!]$/, "")
        say(`Updated your city to ${title(city)}. I'll favour jobs there from the next search.`)
      } else say("All set. Your profile is used on every application, so you only tell me things once.")
      break
    }
    case "onboard": {
      if (/fix|wrong|change/i.test(v[0] ?? text)) say("Tell me what's wrong, like “I'm not a manager” or “add Power BI to my skills”, and I'll fix it.")
      else {
        const r = startMode(next, "search")
        flow = r.flow
        next = { ...next, fresh: false }
        out.push(...r.msgs)
      }
      break
    }
  }
  return commit(next, tid, out, flow)
}

function intent(t: string): Mode | null {
  if (/\b(interview|mock|practi[cs]e)\b/.test(t)) return "interview"
  if (/\b(resume|cv|cover letter)\b/.test(t) && !/upload/.test(t)) return "resume"
  if (/\b(learn|course|prove|skill)\b/.test(t)) return "skill"
  if (/\b(my applications|application status|applied|track|waiting|needs me|need me)\b/.test(t)) return "applications"
  if (/\b(about me|my profile|my details|notice period)\b/.test(t)) return "profile"
  if (/\b(job|jobs|work|position|role|hiring|vacanc|opening|looking for)\b/.test(t) || ROLE_NOUNS.some((n) => t.includes(n))) return "search"
  return null
}

export function money(p: Persona, [a, b]: [number, number]) {
  const f = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `${n}`)
  return p.currency === "USD" ? `$${f(a)}–$${f(b)}` : `${p.currency} ${f(a)}–${f(b)}`
}

export function commit(s: State, tid: string, msgs: Msg[], flow: Flow): State {
  return { ...s, threads: s.threads.map((t) => (t.id === tid ? { ...t, flow, msgs: [...t.msgs, ...msgs], at: now(), title: AUTO.includes(t.title) ? titleFor(flow, t) : t.title } : t)) }
}
const AUTO = ["New chat", "Job search", "Resume", "Interview practice", "New skill", "My applications", "My profile"]
function titleFor(f: Flow, t: Thread) {
  if (f.mode === "search") return f.draft.role ? `${f.draft.role}${f.draft.where[0] ? ` · ${f.draft.where[0]}` : ""}` : "Job search"
  if (f.mode === "resume") return "Resume"
  if (f.mode === "interview") return "Interview practice"
  if (f.mode === "skill") return "New skill"
  if (f.mode === "applications") return "My applications"
  if (f.mode === "profile") return "My profile"
  return t.title
}
