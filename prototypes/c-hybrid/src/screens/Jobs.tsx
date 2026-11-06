import { useMemo, useState } from "react"
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { Bell, BellOff, Bookmark, BookmarkCheck, Check, ChevronDown, ExternalLink, EyeOff, Loader2, MapPin, Search, Send, Sparkles, X } from "lucide-react"
import { ago, STEPS, useStore } from "../store"
import { money, P } from "../engine"
import { boardJobs, searchName, stageOf, type Stage } from "../derive"
import { Button, Chip, CompanyTile, cx, IconBtn, MatchPill, Segmented, Steps } from "../ui"
import type { Job } from "../types"

const COLUMNS: { stage: Stage; title: string; help: string; dot: string }[] = [
  { stage: "new", title: "New matches", help: "Ranked against your CV", dot: "bg-cobalt" },
  { stage: "saved", title: "Saved", help: "Shortlist to apply later", dot: "bg-azure" },
  { stage: "applying", title: "Plato applying", help: "One at a time, live", dot: "bg-violet" },
  { stage: "needs", title: "Needs you", help: "Answer right on the card", dot: "bg-warning" },
  { stage: "applied", title: "Applied", help: "The site confirmed it", dot: "bg-success" },
]

export function Jobs() {
  const { s, ui, patchUi, askPlato, setJob, toast } = useStore()
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [phoneCol, setPhoneCol] = useState<Stage>("new")
  const [showHidden, setShowHidden] = useState(false)
  const jobs = useMemo(() => {
    const n = q.trim().toLowerCase()
    return boardJobs(s, ui.feed).filter((j) => !n || `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(n))
  }, [s, ui.feed, q])
  const col = (st: Stage) => jobs.filter((j) => stageOf(s, j.id) === st).sort((a, b) => b.match - a.match)
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as Stage | undefined
    const id = String(e.active.id)
    const from = stageOf(s, id)
    if (!to || to === from) return
    if (from !== "new" && from !== "saved") return toast("Plato is already working on this one")
    if (to === "applying") return patchUi({ applyIds: [id] })
    if (to === "new" || to === "saved") return setJob(id, to)
    toast("Plato moves cards there when the site answers")
  }
  const hidden = jobs.filter((j) => stageOf(s, j.id) === "hidden")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Jobs</h1>
          <p className="text-[13.5px] text-ink-2">Everything Plato found and did for you, in one board. Do it here, or just ask Plato.</p>
        </div>
        <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => askPlato({ mode: "search" })}>
          New search with Plato
        </Button>
      </div>

      {/* Searches: each one keeps running, and its alert lives on it */}
      <div className="scroll-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
        <Feed on={ui.feed === "all"} onClick={() => patchUi({ feed: "all" })} label="All searches" />
        {s.searches.map((x) => (
          <Feed key={x.id} on={ui.feed === x.id} onClick={() => patchUi({ feed: x.id })} label={searchName(s, x.id)} live={!x.done} alert={x.alert} />
        ))}
      </div>
      {ui.feed !== "all" && <FeedBar id={ui.feed} />}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-ink-3" />
          <input id="jobs-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title or company" className="h-10 w-full rounded-full border border-line bg-white/80 pr-9 pl-10 text-sm outline-none focus:border-cobalt/50 focus:ring-4 focus:ring-cobalt/10" />
          {q && (
            <button type="button" aria-label="Clear filter" onClick={() => setQ("")} className="absolute right-3 text-ink-3">
              <X className="size-4" />
            </button>
          )}
        </label>
        <p className="text-xs text-ink-3">Drag cards between columns, or tick several and act on them together.</p>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 md:hidden">
          {COLUMNS.map((c) => (
            <button key={c.stage} type="button" onClick={() => setPhoneCol(c.stage)} className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", phoneCol === c.stage ? "bg-cobalt text-white" : "bg-white/80 text-ink-2")}>
              {c.title} <span className="tabular">{col(c.stage).length}</span>
            </button>
          ))}
        </div>
        <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
          <div className={cx("grid grid-cols-1 gap-3 md:grid-cols-5", ui.copilot ? "md:min-w-[980px]" : "md:min-w-[1000px]")}>
            {COLUMNS.map((c) => (
              <Column key={c.stage} c={c} jobs={col(c.stage)} sel={sel} toggle={toggle} hiddenOnPhone={phoneCol !== c.stage} />
            ))}
          </div>
        </div>
      </DndContext>
      <div>
        <button type="button" onClick={() => setShowHidden(!showHidden)} aria-expanded={showHidden} className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <ChevronDown className={cx("size-4 transition-transform", showHidden && "rotate-180")} /> Hidden · {hidden.length}
        </button>
        {showHidden && (
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((j) => (
              <span key={j.id} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px]">
                {j.company} · {j.title}
                <button type="button" onClick={() => setJob(j.id, "new")} className="text-xs font-semibold text-cobalt">
                  Show again
                </button>
              </span>
            ))}
            {!hidden.length && <p className="text-sm text-ink-3">Nothing hidden.</p>}
          </div>
        )}
      </div>
      {sel.size > 0 && <SelectionBar ids={[...sel]} clear={() => setSel(new Set())} />}
    </div>
  )
}

function Feed({ on, onClick, label, live, alert }: { on: boolean; onClick: () => void; label: string; live?: boolean; alert?: "daily" | "weekly" | "off" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold", on ? "border-cobalt bg-cobalt text-white" : "border-white bg-white/75 text-ink-2 hover:bg-white")}>
      {live ? <Loader2 className="size-3.5 animate-spin" /> : alert ? alert === "off" ? <BellOff className="size-3.5 opacity-60" /> : <Bell className="size-3.5 opacity-70" /> : null}
      {label}
    </button>
  )
}

function FeedBar({ id }: { id: string }) {
  const { s, setAlert, askPlato } = useStore()
  const x = s.searches.find((y) => y.id === id)
  if (!x) return null
  const done = x.boards.filter((b) => b.state === "done").length
  return (
    <div className="anim-rise flex flex-col gap-3 rounded-[20px] border border-line/70 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {x.params.role && <Chip tone="brand">{x.params.role}</Chip>}
          {x.params.where.map((w) => (
            <Chip key={w}>
              <MapPin className="size-3" /> {w}
            </Chip>
          ))}
          {x.params.setup && x.params.setup !== "Any" && <Chip>{x.params.setup}</Chip>}
          {x.params.salary && x.params.salary !== "Any" && <Chip>{x.params.salary}</Chip>}
        </div>
        <span className="text-xs font-semibold text-ink-3">Alert me</span>
        <Segmented size="sm" value={x.alert} onChange={(v) => setAlert(x.id, v)} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "off", label: "Off" }]} />
        <Button size="sm" variant="soft" icon={<Sparkles className="size-3.5" />} onClick={() => askPlato({ text: "I want to change my job search", show: `Change my “${searchName(s, x.id)}” search` })}>
          Change with Plato
        </Button>
      </div>
      {!x.done && (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-cobalt">
          <Loader2 className="size-4 animate-spin" /> Checking {done + 1} of {x.boards.length} sources. New matches appear here as they arrive.
        </p>
      )}
    </div>
  )
}

function Column({ c, jobs, sel, toggle, hiddenOnPhone }: { c: (typeof COLUMNS)[number]; jobs: Job[]; sel: Set<string>; toggle: (id: string) => void; hiddenOnPhone: boolean }) {
  const { patchUi } = useStore()
  const { setNodeRef, isOver } = useDroppable({ id: c.stage })
  const top = jobs.filter((j) => j.match >= 85).slice(0, 5)
  return (
    <section ref={setNodeRef} aria-label={c.title} className={cx("flex min-h-[220px] flex-col gap-2.5 rounded-[22px] p-2.5 transition-colors", isOver ? "bg-soft ring-2 ring-cobalt/30" : "bg-white/40", hiddenOnPhone && "hidden md:flex")}>
      <header className="flex items-start gap-2 px-1.5 pt-1">
        <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", c.dot)} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold">
            {c.title} <span className="tabular text-ink-3">{jobs.length}</span>
          </h2>
          <p className="text-[11.5px] text-ink-3">{c.help}</p>
        </div>
      </header>
      {c.stage === "new" && top.length > 1 && (
        <button type="button" onClick={() => patchUi({ applyIds: top.map((j) => j.id) })} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-cobalt/30 bg-white/70 py-2 text-[12.5px] font-semibold text-cobalt hover:bg-white">
          <Sparkles className="size-3.5" /> Apply to top {top.length} (85%+)
        </button>
      )}
      {jobs.map((j) => (
        <JobCard key={j.id} j={j} sel={sel} toggle={toggle} />
      ))}
      {!jobs.length && <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-3">{c.stage === "new" ? "Ask Plato for a search and matches land here." : c.stage === "needs" ? "Nothing needs you." : "Nothing here yet."}</p>}
    </section>
  )
}

function JobCard({ j, sel, toggle }: { j: Job; sel: Set<string>; toggle: (id: string) => void }) {
  const { s, patchUi, setJob, answer, markSubmitted } = useStore()
  const st = stageOf(s, j.id)
  const a = s.apps.find((x) => x.jobId === j.id)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: j.id, disabled: st !== "new" && st !== "saved" })
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() }
  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined}
      {...attributes}
      {...listeners}
      aria-disabled={undefined}
      role="button"
      tabIndex={0}
      aria-label={`${j.title} at ${j.company}`}
      onClick={() => patchUi({ openJob: j.id })}
      onKeyDown={(e) => e.key === "Enter" && patchUi({ openJob: j.id })}
      className={cx("group cursor-pointer touch-manipulation rounded-2xl border bg-card p-3 text-left transition-shadow select-none hover:shadow-card", isDragging ? "shadow-pop rotate-[1.5deg] border-cobalt/40" : "border-line/70", sel.has(j.id) && "ring-2 ring-cobalt")}
    >
      <div className="flex items-start gap-2.5">
        <CompanyTile job={j} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold text-ink-3">{j.company}</p>
          <h3 className="text-[13.5px] leading-snug font-bold">{j.title}</h3>
        </div>
        {(st === "new" || st === "saved") && (
          <button type="button" aria-label={sel.has(j.id) ? "Unselect" : "Select"} {...stop} onClick={(e) => (e.stopPropagation(), toggle(j.id))} className={cx("flex size-5 shrink-0 items-center justify-center rounded-md border", sel.has(j.id) ? "border-cobalt bg-cobalt text-white" : "border-mist bg-white md:opacity-0 md:group-hover:opacity-100")}>
            {sel.has(j.id) && <Check className="size-3.5" strokeWidth={3} />}
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-2">
        <MatchPill m={j.match} />
        <span className="min-w-0 truncate">{j.location}</span>
      </div>
      {j.salary && <p className="tabular mt-1 text-[11.5px] font-semibold">{money(P(s), j.salary)} / mo</p>}
      {(st === "new" || st === "saved") && (
        <div className="mt-2.5 flex items-center gap-1 border-t border-divider pt-2" {...stop}>
          <Button size="sm" variant="soft" icon={<Send className="size-3.5" />} onClick={(e) => (e.stopPropagation(), patchUi({ applyIds: [j.id] }))}>
            Apply
          </Button>
          <span className="flex-1" />
          <IconBtn label={st === "saved" ? "Unsave" : "Save"} className="size-8" onClick={(e) => (e.stopPropagation(), setJob(j.id, st === "saved" ? "new" : "saved"))}>
            {st === "saved" ? <BookmarkCheck className="size-4 text-azure" /> : <Bookmark className="size-4" />}
          </IconBtn>
          <IconBtn label="Not interested" className="size-8" onClick={(e) => (e.stopPropagation(), setJob(j.id, "hidden"))}>
            <EyeOff className="size-4" />
          </IconBtn>
        </div>
      )}
      {st === "applying" && a && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-divider pt-2">
          {a.status === "working" ? (
            <>
              <Steps step={a.step} compact />
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-violet">
                <Loader2 className="size-3 animate-spin" /> {STEPS[Math.min(a.step, 4)]}…
              </p>
            </>
          ) : (
            <p className="text-[11.5px] text-ink-3">In line. Starts when the one before finishes</p>
          )}
        </div>
      )}
      {st === "needs" && a?.status === "needs" && a.ask && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-divider pt-2" {...stop}>
          <p className="text-[11.5px] font-semibold text-warning">Asks your {a.ask.question}:</p>
          <div className="flex flex-wrap gap-1">
            {a.ask.options.map((o) => (
              <button key={o} type="button" onClick={(e) => (e.stopPropagation(), answer(j.id, o))} className="rounded-full border border-warning/40 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-warning hover:bg-warning-soft">
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
      {st === "needs" && a?.status === "manual" && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-divider pt-2" {...stop}>
          <p className="text-[11.5px] font-semibold text-warning">{j.source} only takes it from you. Answers ready.</p>
          <div className="flex gap-1.5">
            <a href="https://example.com" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-[11.5px] font-semibold">
              Open <ExternalLink className="size-3" />
            </a>
            <Button size="sm" variant="soft" onClick={(e) => (e.stopPropagation(), markSubmitted(j.id))}>
              I submitted it
            </Button>
          </div>
        </div>
      )}
      {st === "applied" && a && (
        <p className="mt-2.5 flex items-center gap-1.5 border-t border-divider pt-2 text-[11.5px] text-ink-3">
          <Check className="size-3.5 text-success" /> Applied {a.appliedAt ? ago(a.appliedAt) : ""} · {j.source}
        </p>
      )}
    </article>
  )
}

function SelectionBar({ ids, clear }: { ids: string[]; clear: () => void }) {
  const { patchUi, setJob } = useStore()
  return (
    <div className="anim-rise fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6">
      <div className="shadow-pop flex flex-wrap items-center gap-2 rounded-full bg-ink py-2 pr-2 pl-5 text-white">
        <span className="text-sm font-semibold">{ids.length} selected</span>
        <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} onClick={() => (patchUi({ applyIds: ids }), clear())}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => (ids.forEach((id) => setJob(id, "saved")), clear())}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => (ids.forEach((id) => setJob(id, "hidden")), clear())}>
          Hide
        </Button>
        <IconBtn label="Clear selection" className="text-white/70 hover:bg-white/10" onClick={clear}>
          <X className="size-4" />
        </IconBtn>
      </div>
    </div>
  )
}
