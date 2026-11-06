import { useEffect, useRef, useState } from "react"
import { ArrowUp, Sparkles, X } from "lucide-react"
import { useDerived, useStore, type Store } from "../store"
import { cx, IconBtn, Logo } from "../ui"
import { parseAsk } from "./FeedModal"
import type { ChatAction, ChatMsg, Job, View } from "../types"

const PAGE: Record<View, string> = { today: "Today", jobs: "Jobs", career: "Career", me: "Me" }

// The prototype's Plato reads a handful of intents. The real one is the same
// orchestrator the app already has; what matters here is one thread and replies
// that come with buttons that do the thing.
function reply(text: string, st: Store, ctx: { job?: Job; needs: Job[]; fresh: Job[]; newJobs: Job[] }): Omit<ChatMsg, "id" | "at"> {
  const t = text.toLowerCase()
  const { s } = st
  const j = ctx.job
  if (j && /(should i|worth|this job|this one|apply here|fit)/.test(t)) {
    const warn = j.checks.filter((c) => c.state !== "ok")
    return {
      from: "plato",
      text: `${j.company} is a ${j.match}% match. You have ${j.matched.join(", ")}.${warn.length ? ` Watch out: ${warn.map((w) => w.text.toLowerCase()).join("; ")}.` : " Nothing in the posting rules you out."} ${j.match >= 85 ? "I'd apply." : "Worth it if the location works for you."}`,
      actions: j.stage === "new" || j.stage === "saved" ? [{ label: `Apply to ${j.company}`, act: "apply", arg: j.id, primary: true }, { label: "Practice its interview", act: "interview", arg: j.id }] : [{ label: "Practice its interview", act: "interview", arg: j.id }],
    }
  }
  if (/(need|waiting|todo|to do|attention|stuck|blocked)/.test(t)) {
    if (!ctx.needs.length) return { from: "plato", text: "Nothing is waiting on you right now. I'll say so here and in the bell when something is." }
    return { from: "plato", text: `${ctx.needs.length} thing${ctx.needs.length > 1 ? "s" : ""} need${ctx.needs.length > 1 ? "" : "s"} you:\n${ctx.needs.map((n) => `• ${n.company}: ${n.app?.need?.kind === "questions" ? "questions on the form" : n.app?.need?.kind === "verify" ? "a human check" : n.app?.need?.kind === "manual" ? "submit it yourself, answers are ready" : "link Plato for Chrome"}`).join("\n")}`, actions: ctx.needs.slice(0, 3).map((n) => ({ label: `Open ${n.company}`, act: "open", arg: n.id })) }
  }
  const nApply = t.match(/apply (?:to |for )?(?:my )?(?:the )?(?:top |best )?(\d+)/)
  if (nApply || /apply to (my )?(top|best)/.test(t)) {
    const n = nApply ? Number(nApply[1]) : 5
    const top = ctx.newJobs.sort((a, b) => b.match - a.match).slice(0, n)
    if (!top.length) return { from: "plato", text: "There are no new matches to apply to. Want me to start a new search?", actions: [{ label: "New search", act: "new-feed" }] }
    return { from: "plato", text: `Your top ${top.length} new matches are ${top.map((x) => `${x.company} (${x.match}%)`).join(", ")}. I'll show you what happens to each before anything is sent.`, actions: [{ label: `Review and apply to ${top.length}`, act: "apply-many", arg: top.map((x) => x.id).join(","), primary: true }] }
  }
  if (/(find|search|look|want|show me).*(job|role|position|engineer|developer)|^(senior|remote|backend|frontend|node)/.test(t)) {
    const p = parseAsk(text)
    const chips = [...p.roles, ...p.where, ...p.setup, ...(p.salaryMin ? [`from $${p.salaryMin / 1000}k/mo`] : [])]
    return { from: "plato", text: p.roles.length ? "Here's the search I'd run. It keeps running and tells you about new matches daily." : "Tell me the role and I'll set it up. Here's a start:", chips, actions: [{ label: p.roles.length ? "Start this search" : "Set up the search", act: "new-feed", arg: text, primary: true }] }
  }
  if (/(interview|prepare|practice|mock)/.test(t)) {
    const booked = s.jobs.find((x) => x.app?.interview)
    return { from: "plato", text: booked ? `You have an interview with ${booked.company}. I'll ask what they're likely to ask, based on their posting.` : "Pick a job and I'll ask what that company is likely to ask.", actions: [{ label: booked ? `Practice for ${booked.company}` : "Open interview practice", act: "interview", arg: booked?.id, primary: true }] }
  }
  if (/(resume|cv|tailor)/.test(t)) return { from: "plato", text: j ? `I'll show the resume for ${j.company}: your experience reordered around its keywords.` : "Your base resume and every version I tailored are in Career.", actions: [{ label: "Open resumes", act: "resume", arg: j?.id, primary: true }] }
  if (/(saved|shortlist)/.test(t)) return { from: "plato", text: `You have ${s.jobs.filter((x) => x.stage === "saved").length} saved jobs. They're the Saved column on your board.`, actions: [{ label: "Open Jobs", act: "go-jobs", primary: true }] }
  if (/(salary|pay|money)/.test(t)) {
    const paid = s.jobs.filter((x) => x.salary && x.stage !== "closed")
    const avg = Math.round(paid.reduce((n, x) => n + x.salary![1], 0) / Math.max(1, paid.length) / 100) / 10
    return { from: "plato", text: `${paid.length} of your jobs list pay. Their top of range averages $${avg}k a month, above your $${s.profile.prefs.salaryMin / 1000}k minimum. Dubai roles pay the most.` }
  }
  if (/(notice|profile|details|my info|update)/.test(t)) return { from: "plato", text: "Everything I know about you is in Me. Each field saves on its own.", actions: [{ label: "Open Me", act: "me", arg: "details", primary: true }] }
  if (/(token|plan|price|cost|credit)/.test(t)) return { from: "plato", text: `You have ${s.tokens} tokens. An application costs 2–3, a search run 5. That's roughly ${Math.floor(s.tokens / 3)} more applications this month.`, actions: [{ label: "See plan", act: "me", arg: "plan" }] }
  if (/(hi|hello|hey|salam|morning)/.test(t)) return { from: "plato", text: `Hi ${s.profile.name.split(" ")[0]}. ${ctx.needs.length ? `${ctx.needs.length} things need you, ` : ""}${ctx.fresh.length} new matches since your last visit. What do you want to do?`, actions: [{ label: "What needs me?", act: "needs" }, { label: "Review new matches", act: "go-new" }] }
  return { from: "plato", text: "In this prototype I understand a few requests: find jobs, apply to your top matches, what needs you, practice an interview, your resume, salary, tokens. Try one of these:", actions: [{ label: "Find remote Node.js jobs from $5k", act: "say", arg: "Find remote Node.js jobs from $5k" }, { label: "Apply to my top 3", act: "say", arg: "Apply to my top 3" }, { label: "What needs me?", act: "say", arg: "What needs me?" }] }
}

export function PlatoLauncher() {
  const { ui, setUi } = useStore()
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault()
        setUi({ plato: true })
      }
    }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [setUi])
  if (ui.plato) return null
  return (
    <button type="button" onClick={() => setUi({ plato: true })} className="glass fixed z-30 flex items-center lg:hidden gap-2.5 rounded-full py-2 pr-4 pl-2 text-left transition hover:-translate-y-0.5" style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "calc(max(16px, env(safe-area-inset-bottom, 0px)) + var(--tabbar, 0px))" }} aria-label="Ask Plato">
      <Logo size={34} />
      <span className="hidden sm:block">
        <span className="block text-[13.5px] font-bold">Ask Plato</span>
        <span className="block text-[11px] text-ink-3">Knows what you're looking at</span>
      </span>
    </button>
  )
}

export function Plato() {
  const st = useStore()
  const { s, ui, setUi, addChat, go, openJob } = st
  const d = useDerived()
  const [text, setText] = useState("")
  const [typing, setTyping] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const job = s.jobs.find((j) => j.id === ui.openJob)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [s.chat.length, typing, ui.plato])

  const send = (msg: string) => {
    if (!msg.trim()) return
    addChat({ from: "me", text: msg })
    setText("")
    setTyping(true)
    setTimeout(() => {
      addChat(reply(msg, st, { job, needs: d.needs, fresh: d.fresh, newJobs: d.visible.filter((x) => x.stage === "new") }))
      setTyping(false)
    }, 700)
  }
  const run = (a: ChatAction) => {
    switch (a.act) {
      case "needs":
        return send("What needs me?")
      case "say":
        return send(a.arg ?? "")
      case "go-new":
      case "go-jobs":
        setUi({ plato: false })
        return go("jobs")
      case "open":
        setUi({ plato: false })
        go("jobs")
        return setTimeout(() => openJob(a.arg), 0)
      case "apply":
        return setUi({ applyIds: [a.arg!], plato: false })
      case "apply-many":
        return setUi({ applyIds: a.arg!.split(","), plato: false })
      case "new-feed":
        return setUi({ newFeed: { prompt: a.arg }, plato: false })
      case "interview":
        setUi({ plato: false })
        return go("career", { careerTab: "interview", careerJob: a.arg })
      case "resume":
        setUi({ plato: false })
        return go("career", { careerTab: "resume", careerJob: a.arg })
      case "me":
        setUi({ plato: false })
        return go("me", { meSection: a.arg })
    }
  }

  if (!ui.plato) return null
  const suggestions = job ? [`Should I apply to ${job.company}?`, "Tailor my resume for this job", "Practice this interview"] : ui.view === "career" ? ["Prepare me for my interview", "Improve my resume"] : ui.view === "me" ? ["What's missing from my profile?", "How many tokens do I have?"] : ["What needs me?", "Apply to my top 3", "Find remote Node.js jobs from $5k"]

  return (
    <div className="fixed inset-0 z-[45] flex justify-end bg-ink/15 sm:bg-transparent" onMouseDown={(e) => e.target === e.currentTarget && setUi({ plato: false })}>
      <aside className="anim-slide shadow-pop flex h-full w-full flex-col bg-card sm:m-3 sm:h-[calc(100%-24px)] sm:w-[400px] sm:rounded-[24px]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Plato assistant">
        <header className="flex items-center gap-3 border-b border-divider px-4 py-3">
          <Logo size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold">Plato</p>
            <p className="truncate text-[11.5px] text-ink-3">One conversation, everywhere · sees: {job ? `${job.company} job` : PAGE[ui.view]}</p>
          </div>
          <IconBtn label="Close Plato" onClick={() => setUi({ plato: false })}>
            <X className="size-5" />
          </IconBtn>
        </header>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {s.chat.map((m) => (
            <div key={m.id} className={cx("flex flex-col gap-2", m.from === "me" ? "items-end" : "items-start")}>
              <p className={cx("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line", m.from === "me" ? "rounded-br-md bg-cobalt text-white" : "rounded-bl-md bg-paper text-ink")}>{m.text}</p>
              {m.chips && (
                <div className="flex max-w-[88%] flex-wrap gap-1.5">
                  {m.chips.map((c) => (
                    <span key={c} className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold text-cobalt">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {m.actions && (
                <div className="flex max-w-[92%] flex-wrap gap-1.5">
                  {m.actions.map((a) => (
                    <button key={a.label} type="button" onClick={() => run(a)} className={cx("rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition", a.primary ? "bg-cobalt text-white hover:bg-cobalt-hover" : "border border-brand-line bg-white text-cobalt hover:bg-tint")}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {typing && (
            <p className="flex items-center gap-1 self-start rounded-2xl bg-paper px-3.5 py-3" aria-label="Plato is typing">
              {[0, 1, 2].map((k) => (
                <span key={k} className="pulse-dot size-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${k * 0.2}s` }} />
              ))}
            </p>
          )}
          <div ref={end} />
        </div>
        <div className="border-t border-divider p-3">
          <div className="scroll-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {suggestions.map((x) => (
              <button key={x} type="button" onClick={() => send(x)} className="flex shrink-0 items-center gap-1 rounded-full border border-brand-line bg-tint px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-blue hover:bg-soft">
                <Sparkles className="size-3" /> {x}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(text)
            }}
            className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 focus-within:border-cobalt/50 focus-within:ring-4 focus-within:ring-cobalt/10"
          >
            <textarea
              id="plato-input"
              aria-label="Message Plato"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send(text)
                }
              }}
              placeholder="Ask or tell Plato anything…"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-mist"
            />
            <button type="submit" aria-label="Send" disabled={!text.trim()} className="flex size-9 items-center justify-center rounded-xl bg-cobalt text-white disabled:opacity-40">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </div>
      </aside>
    </div>
  )
}
