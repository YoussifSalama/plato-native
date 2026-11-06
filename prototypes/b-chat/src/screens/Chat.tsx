import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, Loader2, Paperclip, Slash, X } from "lucide-react"
import { useStore } from "../store"
import { jobOf, MODES, modeTitle, P } from "../engine"
import { CompanyTile, cx, Logo } from "../ui"
import { CardView, MODE_ICON, ModesGrid } from "./Cards"
import type { Flow, Mode } from "../types"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export function Chat() {
  const { s, ui } = useStore()
  const t = s.threads.find((x) => x.id === s.active)!
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (t.msgs.length || ui.typing) end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [t.msgs.length, ui.typing, t.id])
  const lastCardIdx = t.msgs.map((m) => !!m.card).lastIndexOf(true)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
          {t.msgs.length === 0 && <Welcome />}
          {t.msgs.map((m, i) =>
            m.from === "me" ? (
              <div key={m.id} className="anim-rise flex justify-end">
                <p className={cx("max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-line text-white", m.text?.startsWith("/") ? "bg-cobalt-deep font-mono text-[13px]" : "bg-cobalt")}>{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="anim-rise flex gap-3">
                <span className="mt-0.5 shrink-0">{i === 0 || t.msgs[i - 1].from === "me" ? <Logo size={30} /> : <span className="block w-[30px]" />}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {m.text && <p className="max-w-[min(100%,40rem)] text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{m.text}</p>}
                  {m.card && <CardView msg={m} last={i === lastCardIdx} />}
                </div>
              </div>
            ),
          )}
          {ui.typing === t.id && (
            <div className="flex items-center gap-3">
              <Logo size={30} />
              <span className="flex gap-1 rounded-2xl bg-white px-3.5 py-3" aria-label="Plato is typing">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="pulse-dot size-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${k * 0.18}s` }} />
                ))}
              </span>
            </div>
          )}
          <div ref={end} className="h-2" />
        </div>
      </div>
      <Composer flow={t.flow} />
    </div>
  )
}

function Welcome() {
  const { s, openThread, patchUi } = useStore()
  const p = P(s)
  const waiting = s.apps.filter((a) => a.status === "needs" || a.status === "manual")
  const working = s.apps.find((a) => a.status === "working")
  const queued = s.apps.filter((a) => a.status === "queued").length
  const applied = s.apps.filter((a) => a.status === "submitted").length
  return (
    <div className="flex flex-col gap-6 pt-4 sm:pt-10">
      <div className="flex flex-col items-start gap-3">
        <Logo size={48} />
        <h1 className="text-[30px] leading-tight font-extrabold tracking-tight sm:text-[36px]">
          {greeting()}, <span className="text-brand">{p.first}</span>.
          <span className="block text-ink-2">How are you today? How can I help?</span>
        </h1>
        {(applied > 0 || working) && (
          <p className="text-[14.5px] text-ink-2">
            Since yesterday I applied to {applied} job{applied === 1 ? "" : "s"}
            {working ? ` and I'm applying to ${jobOf(s, working.jobId)?.company} right now` : ""}
            {queued ? `, with ${queued} more in line` : ""}.
          </p>
        )}
      </div>
      {waiting.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Waiting for you</p>
          {waiting.map((a) => {
            const j = jobOf(s, a.jobId)!
            return (
              <button
                key={a.jobId}
                type="button"
                onClick={() => (a.status === "needs" ? openThread(a.threadId) : patchUi({ canvas: { tab: "applications" } }))}
                className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft/50 p-3 text-left hover:bg-warning-soft"
              >
                <CompanyTile job={j} size={32} />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <b>{j.company}</b> <span className="text-ink-2">{a.status === "needs" ? "asks for your notice period" : `only takes applications from you. Your answers are ready`}</span>
                </span>
                <span className="text-xs font-bold text-warning">{a.status === "needs" ? "Answer" : "Open"}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="eyebrow">What I can do · type / any time</p>
        <ModesGrid big />
      </div>
    </div>
  )
}

const PLACEHOLDER = (f: Flow) => {
  if (f.mode === "search") return f.step === "results" ? "Ask about these jobs, or say “apply to the top 5”…" : "Answer in your own words, or pick one above…"
  if (f.mode === "interview" && f.step === "q") return "Type your answer like you'd say it…"
  if (f.mode === "profile") return "Tell me what changed, e.g. “my notice period is one month”…"
  if (f.mode === "onboard") return "Send your CV, or tell me about yourself…"
  return "Message Plato, or type /"
}

function Composer({ flow }: { flow: Flow }) {
  const { send, slash, exitMode, uploadCv, ui } = useStore()
  const [text, setText] = useState("")
  const [menu, setMenu] = useState(false)
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)
  const q = text.startsWith("/") ? text.slice(1).toLowerCase() : ""
  const items = useMemo(() => MODES.filter((m) => !q || m.cmd.includes(q) || m.title.toLowerCase().includes(q)), [q])
  const open = menu || (text.startsWith("/") && !text.includes(" "))
  const activeMode = flow.mode && flow.mode !== "onboard" ? (flow.mode as Mode) : null
  const ModeIcon = activeMode ? MODE_ICON[activeMode] : null
  const busy = !!ui.typing

  const pick = (m: Mode) => {
    setText("")
    setMenu(false)
    slash(m)
    ref.current?.focus()
  }
  const submit = () => {
    if (open && items[hi]) return pick(items[hi].mode)
    if (!text.trim()) return
    send({ text })
    setText("")
  }

  return (
    <div className="relative border-t border-white/80 bg-gradient-to-t from-bg via-bg/95 to-bg/70 px-4 pt-3 pb-4 sm:px-6" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
      <div className="relative mx-auto w-full max-w-3xl">
        {open && items.length > 0 && (
          <div role="listbox" aria-label="What Plato can do" className="anim-pop shadow-pop absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-2xl border border-line bg-card p-1.5">
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-ink-3">Choose what we're doing</p>
            {items.map((m, i) => {
              const I = MODE_ICON[m.mode]
              return (
                <button key={m.mode} role="option" aria-selected={i === hi} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(m.mode)} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === hi ? "bg-soft" : "hover:bg-tint")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white text-cobalt shadow-sm">
                    <I className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[13.5px] font-bold">{m.title}</span>
                      <span className="font-mono text-[11.5px] text-blue">{m.cmd}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-3">{m.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="shadow-card flex flex-col rounded-[22px] border border-line bg-white focus-within:border-cobalt/40 focus-within:ring-4 focus-within:ring-cobalt/10">
          {activeMode && ModeIcon && (
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <span className="flex items-center gap-1.5 rounded-full bg-soft py-1 pr-1 pl-2.5 text-xs font-bold text-cobalt">
                <ModeIcon className="size-3.5" /> {modeTitle(activeMode)}
                <button type="button" aria-label="Leave this mode" title="Leave this mode" onClick={exitMode} className="flex size-5 items-center justify-center rounded-full hover:bg-cobalt/10">
                  <X className="size-3" />
                </button>
              </span>
              {flow.mode === "search" && flow.step === "running" && (
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  <Loader2 className="size-3 animate-spin" /> searching
                </span>
              )}
            </div>
          )}
          <div className="flex items-end gap-1.5 p-2">
            <button type="button" aria-label="Show everything Plato can do" title="Everything Plato can do" onClick={() => setMenu(!menu)} className={cx("flex size-9 shrink-0 items-center justify-center rounded-xl", menu ? "bg-soft text-cobalt" : "text-ink-3 hover:bg-paper hover:text-ink")}>
              <Slash className="size-4" />
            </button>
            <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-3 hover:bg-paper hover:text-ink" title="Attach a CV or certificate">
              <Paperclip className="size-4" />
              <input type="file" className="sr-only" aria-label="Attach a file" onChange={() => flow.mode === "onboard" && uploadCv()} />
            </label>
            <textarea
              ref={ref}
              id="composer"
              aria-label="Message Plato"
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setHi(0)
              }}
              onKeyDown={(e) => {
                if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                  e.preventDefault()
                  setHi((h) => (h + (e.key === "ArrowDown" ? 1 : items.length - 1)) % Math.max(1, items.length))
                }
                if (e.key === "Escape") setMenu(false)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={PLACEHOLDER(flow)}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14.5px] outline-none placeholder:text-mist focus-visible:outline-none"
            />
            <button type="button" aria-label="Send" onClick={submit} disabled={busy || (!text.trim() && !open)} className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cobalt text-white transition disabled:opacity-35">
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
