import { useMemo, useState } from "react"
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { Bell, BellOff, Bookmark, BookmarkCheck, Check, ChevronDown, Columns3, EyeOff, Hand, LayoutList, Loader2, MapPin, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, X } from "lucide-react"
import { ago, COST, STEPS, useDerived, useStore } from "../store"
import { Button, Card, Chip, CompanyTile, cx, IconBtn, MatchPill, money, placeOf, Segmented, Steps } from "../ui"
import type { Feed, Job, Stage } from "../types"

export const COLUMNS: { stage: Stage; title: string; help: string; tone: string }[] = [
  { stage: "new", title: "New matches", help: "Ranked against your profile", tone: "bg-cobalt" },
  { stage: "saved", title: "Saved", help: "Shortlist to apply later", tone: "bg-azure" },
  { stage: "applying", title: "Plato applying", help: "One at a time, live", tone: "bg-violet" },
  { stage: "needs", title: "Needs you", help: "Plato is waiting on you", tone: "bg-warning" },
  { stage: "applied", title: "Applied", help: "The site confirmed it", tone: "bg-success" },
]

export function Jobs() {
  const st = useStore()
  const { s, ui, setUi, move, markSeen, toast } = st
  const d = useDerived()
  const [q, setQ] = useState("")
  const [setup, setSetup] = useState<"all" | "Remote" | "Hybrid" | "On-site">("all")
  const [mode, setMode] = useState<"board" | "list">("board")
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [showClosed, setShowClosed] = useState(false)
  const [phoneCol, setPhoneCol] = useState<Stage>("new")

  const feed = s.feeds.find((f) => f.id === ui.feed)
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return d.inFeed.filter((j) => (setup === "all" || j.setup === setup) && (!n || `${j.title} ${j.company} ${j.location} ${j.matched.join(" ")}`.toLowerCase().includes(n)))
  }, [d.inFeed, q, setup])
  const col = (stage: Stage) => {
    const rows = filtered.filter((j) => j.stage === stage)
    if (stage === "new") return rows.sort((a, b) => Number(!!b.fresh) - Number(!!a.fresh) || b.match - a.match)
    if (stage === "applying") return rows.sort((a, b) => Number(b.app?.status === "working") - Number(a.app?.status === "working"))
    if (stage === "applied") return rows.sort((a, b) => (b.app?.appliedAt ?? 0) - (a.app?.appliedAt ?? 0))
    return rows.sort((a, b) => b.match - a.match)
  }
  const closed = col("closed")

  const toggle = (id: string) => setSel((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as Stage | undefined
    const id = String(e.active.id)
    const job = s.jobs.find((j) => j.id === id)
    if (!to || !job || job.stage === to) return
    if (to === "needs" || to === "applied") return toast("Plato moves cards there when the site responds")
    if (job.stage === "applying" || job.stage === "needs" || job.stage === "applied") return toast("This one is already in progress. Open it to see what's happening")
    move(id, to)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Jobs</h1>
          <p className="text-[13.5px] text-ink-2">Every job Plato found for you, from first match to applied. Drag a card or use its buttons to move it.</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUi({ newFeed: {} })}>
          New search
        </Button>
      </div>

      <FeedBar />
      {feed && <FeedSummary feed={feed} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-ink-3" />
          <input id="jobs-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, company, skill" className="h-10 w-full rounded-full border border-line bg-white/80 pr-9 pl-10 text-sm outline-none focus:border-cobalt/50 focus:ring-4 focus:ring-cobalt/10" />
          {q && (
            <button type="button" aria-label="Clear filter" onClick={() => setQ("")} className="absolute right-3 text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </label>
        <Segmented size="sm" value={setup} onChange={setSetup} options={[{ value: "all", label: "Any setup" }, { value: "Remote", label: "Remote" }, { value: "Hybrid", label: "Hybrid" }, { value: "On-site", label: "On-site" }]} />
        <div className="ml-auto flex items-center gap-2">
          {d.fresh.length > 0 && (
            <button type="button" onClick={markSeen} className="flex items-center gap-1.5 text-xs font-semibold text-cobalt hover:underline">
              <Check className="size-3.5" /> Mark {d.fresh.length} new as seen
            </button>
          )}
          <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "board", label: <><Columns3 className="size-3.5" /> Board</> }, { value: "list", label: <><LayoutList className="size-3.5" /> List</> }]} />
        </div>
      </div>

      {mode === "board" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {/* Phones: one column at a time */}
          <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
            {COLUMNS.map((c) => (
              <button key={c.stage} type="button" onClick={() => setPhoneCol(c.stage)} className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", phoneCol === c.stage ? "bg-cobalt text-white" : "bg-white/80 text-ink-2")}>
                {c.title}
                <span className="tabular">{col(c.stage).length}</span>
              </button>
            ))}
          </div>
          <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
            <div className="grid grid-cols-1 gap-3 md:min-w-[1060px] md:grid-cols-5">
              {COLUMNS.map((c) => (
                <Column key={c.stage} c={c} jobs={col(c.stage)} sel={sel} toggle={toggle} hiddenOnPhone={phoneCol !== c.stage} />
              ))}
            </div>
          </div>
          <div>
            <button type="button" onClick={() => setShowClosed(!showClosed)} className="flex items-center gap-2 text-[13px] font-semibold text-ink-2 hover:text-ink" aria-expanded={showClosed}>
              <ChevronDown className={cx("size-4 transition-transform", showClosed && "rotate-180")} />
              Didn't go through or hidden · {closed.length}
            </button>
            {showClosed && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {closed.map((j) => (
                  <JobCard key={j.id} job={j} sel={sel} toggle={toggle} />
                ))}
                {closed.length === 0 && <p className="text-sm text-ink-3">Nothing here.</p>}
              </div>
            )}
          </div>
        </DndContext>
      ) : (
        <ListView jobs={filtered.filter((j) => j.stage !== "closed")} sel={sel} toggle={toggle} />
      )}

      <SelectionBar sel={sel} clear={() => setSel(new Set())} />
    </div>
  )
}

function FeedBar() {
  const { s, ui, setUi } = useStore()
  const d = useDerived()
  const count = (id: string) => d.visible.filter((j) => j.feedIds.includes(id) && j.stage === "new").length
  return (
    <div className="scroll-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
      <FeedChip on={ui.feed === "all"} onClick={() => setUi({ feed: "all" })} label="All searches" count={d.visible.filter((j) => j.stage === "new").length} />
      {s.feeds.map((f) => (
        <FeedChip key={f.id} on={ui.feed === f.id} onClick={() => setUi({ feed: f.id })} label={f.name} count={count(f.id)} live={!!f.searching} alert={f.alert} />
      ))}
      <button type="button" onClick={() => setUi({ newFeed: {} })} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-brand-line px-3.5 text-[13px] font-semibold text-blue hover:bg-white/70">
        <Plus className="size-3.5" /> New search
      </button>
    </div>
  )
}

function FeedChip({ on, onClick, label, count, live, alert }: { on: boolean; onClick: () => void; label: string; count: number; live?: boolean; alert?: Feed["alert"] }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-all", on ? "border-cobalt bg-cobalt text-white shadow-[0_8px_20px_-12px_rgb(0_91_167/0.9)]" : "border-white bg-white/75 text-ink-2 hover:bg-white hover:text-ink")}>
      {live && <Loader2 className="size-3.5 animate-spin" />}
      {alert && !live && (alert === "off" ? <BellOff className="size-3.5 opacity-60" /> : <Bell className="size-3.5 opacity-70" />)}
      {label}
      <span className={cx("tabular rounded-full px-1.5 text-[11px]", on ? "bg-white/20" : "bg-paper")}>{count}</span>
    </button>
  )
}

function FeedSummary({ feed }: { feed: Feed }) {
  const { updateFeed, refreshFeed, deleteFeed, setUi } = useStore()
  const [confirmDel, setConfirmDel] = useState(false)
  const done = feed.searching?.sources.filter((x) => x.state === "done").length ?? 0
  return (
    <Card className="anim-rise flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {feed.roles.map((r) => (
            <Chip key={r} tone="brand">{r}</Chip>
          ))}
          {feed.where.map((w) => (
            <Chip key={w}>
              <MapPin className="size-3" /> {w}
            </Chip>
          ))}
          {feed.setup.map((w) => (
            <Chip key={w}>{w}</Chip>
          ))}
          {feed.salaryMin && <Chip>From {money(feed.salaryMin)}/mo</Chip>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-3">Alert me</span>
          <Segmented
            size="sm"
            value={feed.alert}
            onChange={(v) => updateFeed(feed.id, { alert: v })}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "off", label: "Off" },
            ]}
          />
          <IconBtn label="Check for new jobs now" onClick={() => refreshFeed(feed.id)} disabled={!!feed.searching}>
            <RefreshCw className={cx("size-4", feed.searching && "animate-spin")} />
          </IconBtn>
          <IconBtn label="Edit this search" onClick={() => setUi({ newFeed: { edit: feed.id } })}>
            <Pencil className="size-4" />
          </IconBtn>
          {confirmDel ? (
            <span className="flex items-center gap-1">
              <Button size="sm" variant="danger" onClick={() => deleteFeed(feed.id)}>
                Delete search
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <IconBtn label="Delete this search" onClick={() => setConfirmDel(true)}>
              <Trash2 className="size-4" />
            </IconBtn>
          )}
        </div>
      </div>
      {feed.searching ? (
        <div className="flex flex-col gap-2 rounded-xl bg-tint p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-cobalt">
            <Loader2 className="size-4 animate-spin" /> Searching {feed.searching.sources.length} boards · {done} done. Matches appear in New as they arrive.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {feed.searching.sources.map((x) => (
              <span key={x.name} className={cx("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors", x.state === "done" ? "bg-success-soft text-success" : x.state === "run" ? "bg-white text-cobalt" : "bg-white/60 text-mist")}>
                {x.state === "done" ? <Check className="size-3" /> : x.state === "run" ? <Loader2 className="size-3 animate-spin" /> : null}
                {x.name}
                {x.state === "done" && <span className="tabular opacity-70">{x.found}</span>}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-3">
          {feed.alert === "off" ? "Alerts are off for this search. Plato only searches when you press refresh." : `Plato re-runs this search ${feed.alert} and tells you about new matches.`} Last checked {feed.lastRunHours === 0 ? "just now" : `${feed.lastRunHours} h ago`}.
        </p>
      )}
    </Card>
  )
}

function Column({ c, jobs, sel, toggle, hiddenOnPhone }: { c: (typeof COLUMNS)[number]; jobs: Job[]; sel: Set<string>; toggle: (id: string) => void; hiddenOnPhone: boolean }) {
  const { setUi, s } = useStore()
  const { setNodeRef, isOver } = useDroppable({ id: c.stage })
  const top = jobs.filter((j) => j.match >= 85).slice(0, 5)
  return (
    <section ref={setNodeRef} aria-label={c.title} className={cx("flex min-h-[200px] flex-col gap-2.5 rounded-[22px] p-2.5 transition-colors", isOver ? "bg-soft ring-2 ring-cobalt/30" : "bg-white/40", hiddenOnPhone && "hidden md:flex")}>
      <header className="flex items-start gap-2 px-1.5 pt-1">
        <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", c.tone)} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[14px] font-bold">
            {c.title} <span className="tabular text-ink-3">{jobs.length}</span>
          </h2>
          <p className="text-[11.5px] text-ink-3">{c.help}</p>
        </div>
      </header>
      {c.stage === "new" && top.length > 1 && (
        <button type="button" onClick={() => setUi({ applyIds: top.map((j) => j.id) })} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-cobalt/30 bg-white/70 py-2 text-[12.5px] font-semibold text-cobalt hover:bg-white">
          <Sparkles className="size-3.5" /> Apply to top {top.length} (85%+)
        </button>
      )}
      {c.stage === "saved" && jobs.length > 1 && (
        <button type="button" onClick={() => setUi({ applyIds: jobs.map((j) => j.id) })} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-cobalt/30 bg-white/70 py-2 text-[12.5px] font-semibold text-cobalt hover:bg-white">
          <Send className="size-3.5" /> Apply to all {jobs.length} saved
        </button>
      )}
      <div className="flex flex-col gap-2.5">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} sel={sel} toggle={toggle} queuePos={c.stage === "applying" && j.app?.status === "queued" ? jobs.filter((x) => x.app?.status === "queued").indexOf(j) + 1 : undefined} />
        ))}
        {jobs.length === 0 && <EmptyCol stage={c.stage} searching={s.feeds.some((f) => f.searching)} />}
      </div>
    </section>
  )
}

function EmptyCol({ stage, searching }: { stage: Stage; searching: boolean }) {
  const text: Record<string, string> = {
    new: searching ? "Plato is searching. Matches land here as each board reports back." : "You're all caught up. Plato adds new matches here when your searches run.",
    saved: "Save jobs you like. Drag a card here, or press the bookmark.",
    applying: "Nothing in progress. Press Apply on a card and Plato takes it from there.",
    needs: "Nothing needs you right now.",
    applied: "Applications the site confirmed land here, with proof.",
  }
  return <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[12.5px] leading-relaxed text-ink-3">{text[stage]}</p>
}

export function JobCard({ job: j, sel, toggle, queuePos }: { job: Job; sel: Set<string>; toggle: (id: string) => void; queuePos?: number }) {
  const { openJob, move, setUi, applyAnyway, s } = useStore()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: j.id })
  const selectable = j.stage === "new" || j.stage === "saved"
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined
  const a = j.app
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${j.title} at ${j.company}`}
      onClick={() => openJob(j.id)}
      onKeyDown={(e) => e.key === "Enter" && openJob(j.id)}
      className={cx("group relative cursor-pointer touch-manipulation rounded-2xl border bg-card p-3 text-left transition-shadow select-none hover:shadow-card", isDragging ? "shadow-pop rotate-[1.5deg] border-cobalt/40" : "border-line/70", sel.has(j.id) && "ring-2 ring-cobalt")}
    >
      <div className="flex items-start gap-2.5">
        <CompanyTile job={j} size={34} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-3">
            {j.fresh && <span className="size-1.5 rounded-full bg-cobalt" aria-label="New" />}
            <span className="truncate">{j.company}</span>
          </p>
          <h3 className="text-[13.5px] leading-snug font-bold">{j.title}</h3>
        </div>
        {selectable && (
          <button
            type="button"
            aria-label={sel.has(j.id) ? "Unselect" : "Select"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              toggle(j.id)
            }}
            className={cx("flex size-5 shrink-0 items-center justify-center rounded-md border transition-opacity", sel.has(j.id) ? "border-cobalt bg-cobalt text-white opacity-100" : "border-mist bg-white opacity-100 md:opacity-0 md:group-hover:opacity-100")}
          >
            {sel.has(j.id) && <Check className="size-3.5" strokeWidth={3} />}
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-2">
        <MatchPill m={j.match} />
        <span className="min-w-0 truncate">{placeOf(j)}</span>
      </div>
      {j.salary && <p className="tabular mt-1 text-[11.5px] font-semibold text-ink">{money(j.salary[0])}–{money(j.salary[1])} / mo</p>}

      {/* Stage footer */}
      {(j.stage === "new" || j.stage === "saved") && (
        <div className="mt-2.5 flex items-center gap-1 border-t border-divider pt-2" onPointerDown={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="soft"
            icon={<Send className="size-3.5" />}
            onClick={(e) => {
              e.stopPropagation()
              setUi({ applyIds: [j.id] })
            }}
          >
            Apply
          </Button>
          <span className="flex-1" />
          <IconBtn
            label={j.stage === "saved" ? "Unsave" : "Save"}
            className="size-8"
            onClick={(e) => {
              e.stopPropagation()
              move(j.id, j.stage === "saved" ? "new" : "saved")
            }}
          >
            {j.stage === "saved" ? <BookmarkCheck className="size-4 text-azure" /> : <Bookmark className="size-4" />}
          </IconBtn>
          <IconBtn
            label="Not interested"
            className="size-8"
            onClick={(e) => {
              e.stopPropagation()
              move(j.id, "closed")
            }}
          >
            <EyeOff className="size-4" />
          </IconBtn>
        </div>
      )}
      {j.stage === "applying" && a && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-divider pt-2">
          {a.status === "working" ? (
            <>
              <Steps step={a.step} compact />
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-violet">
                <Loader2 className="size-3 animate-spin" /> {STEPS[Math.min(a.step, 4)]}…
              </p>
            </>
          ) : (
            <p className="text-[11.5px] text-ink-3">In line{queuePos ? ` · #${queuePos}` : ""}. Starts when the one before finishes</p>
          )}
        </div>
      )}
      {j.stage === "needs" && a?.need && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-divider pt-2">
          <p className="text-[11.5px] leading-snug font-semibold text-warning">
            {a.need.kind === "questions" && `${a.need.questions.length} question${a.need.questions.length > 1 ? "s" : ""} only you can answer`}
            {a.need.kind === "verify" && `${a.need.site} wants a human check`}
            {a.need.kind === "manual" && `${a.need.site} only takes applications from you`}
            {a.need.kind === "chrome" && `${a.need.site} needs Plato for Chrome`}
          </p>
          <Button size="sm" variant="warn" icon={a.need.kind === "verify" ? <ShieldCheck className="size-3.5" /> : <Hand className="size-3.5" />} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), openJob(j.id))}>
            {a.need.kind === "questions" ? "Answer" : a.need.kind === "verify" ? "Do the check" : a.need.kind === "manual" ? "Open prepared answers" : s.profile.connections.chrome ? "Continue" : "Link Plato for Chrome"}
          </Button>
        </div>
      )}
      {j.stage === "applied" && a && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-divider pt-2 text-[11.5px] text-ink-3">
          <Check className="size-3.5 text-success" /> Applied {a.appliedAt ? ago(a.appliedAt) : ""} · {j.source}
          {a.interview && <Chip tone="violet" className="ml-auto">Interview</Chip>}
        </div>
      )}
      {j.stage === "closed" && a && (
        <div className="mt-2.5 flex flex-col gap-1.5 border-t border-divider pt-2">
          <p className="text-[11.5px] leading-snug text-ink-3">{a.reason}</p>
          {a.status !== "closed" || a.events[0]?.text.includes("not interested") ? (
            <Button size="sm" variant="ghost" className="self-start" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), a.events[0]?.text.includes("not interested") ? move(j.id, "new") : applyAnyway(j.id))}>
              {a.events[0]?.text.includes("not interested") ? "Show it again" : "Apply anyway"}
            </Button>
          ) : null}
        </div>
      )}
    </article>
  )
}

function ListView({ jobs, sel, toggle }: { jobs: Job[]; sel: Set<string>; toggle: (id: string) => void }) {
  const { openJob } = useStore()
  const [sort, setSort] = useState<"match" | "stage" | "posted">("match")
  const order = COLUMNS.map((c) => c.stage)
  const rows = [...jobs].sort((a, b) => (sort === "match" ? b.match - a.match : sort === "posted" ? a.postedDays - b.postedDays : order.indexOf(a.stage) - order.indexOf(b.stage)))
  const label = Object.fromEntries(COLUMNS.map((c) => [c.stage, c]))
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-divider px-4 py-2.5 text-xs text-ink-3">
        Sort by
        <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: "match", label: "Best match" }, { value: "stage", label: "Stage" }, { value: "posted", label: "Newest" }]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-tint text-xs text-ink-3">
            <tr>
              <th className="w-10 py-2.5 pl-4" aria-label="Select" />
              <th className="py-2.5">Job</th>
              <th className="py-2.5">Match</th>
              <th className="py-2.5">Where</th>
              <th className="py-2.5">Salary / mo</th>
              <th className="py-2.5">Stage</th>
              <th className="py-2.5 pr-4">Posted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} onClick={() => openJob(j.id)} className="cursor-pointer border-t border-divider hover:bg-tint">
                <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                  {(j.stage === "new" || j.stage === "saved") && <input type="checkbox" aria-label={`Select ${j.title}`} checked={sel.has(j.id)} onChange={() => toggle(j.id)} className="size-4 accent-[var(--cobalt)]" />}
                </td>
                <td className="py-2.5">
                  <span className="flex items-center gap-2.5">
                    <CompanyTile job={j} size={28} />
                    <span>
                      <span className="block font-semibold">{j.title}</span>
                      <span className="block text-xs text-ink-3">{j.company}</span>
                    </span>
                  </span>
                </td>
                <td className="py-2.5">
                  <MatchPill m={j.match} />
                </td>
                <td className="py-2.5 text-ink-2">{placeOf(j)}</td>
                <td className="tabular py-2.5 text-ink-2">{j.salary ? `${money(j.salary[0])}–${money(j.salary[1])}` : "—"}</td>
                <td className="py-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={cx("size-2 rounded-full", label[j.stage]?.tone)} /> {label[j.stage]?.title}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-ink-3">{j.postedDays}d ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SelectionBar({ sel, clear }: { sel: Set<string>; clear: () => void }) {
  const { setUi, move, s } = useStore()
  if (sel.size === 0) return null
  const ids = [...sel].filter((id) => s.jobs.some((j) => j.id === id && (j.stage === "new" || j.stage === "saved")))
  return (
    <div className="anim-rise fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6">
      <div className="shadow-pop flex flex-wrap items-center gap-2 rounded-full bg-ink py-2 pr-2 pl-5 text-white">
        <span className="text-sm font-semibold">{ids.length} selected</span>
        <span className="text-xs text-white/60">~{ids.length * COST.tailored} tokens to apply</span>
        <Button
          size="sm"
          variant="primary"
          icon={<Send className="size-3.5" />}
          onClick={() => {
            setUi({ applyIds: ids })
            clear()
          }}
        >
          Apply
        </Button>
        <Button
          size="sm"
          className="bg-white/10 text-white hover:bg-white/20"
          variant="ghost"
          icon={<Bookmark className="size-3.5" />}
          onClick={() => {
            ids.forEach((id) => move(id, "saved"))
            clear()
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          className="bg-white/10 text-white hover:bg-white/20"
          variant="ghost"
          icon={<EyeOff className="size-3.5" />}
          onClick={() => {
            ids.forEach((id) => move(id, "closed"))
            clear()
          }}
        >
          Hide
        </Button>
        <IconBtn label="Clear selection" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={clear}>
          <MoreHorizontal className="hidden" />
          <X className="size-4" />
        </IconBtn>
      </div>
    </div>
  )
}
