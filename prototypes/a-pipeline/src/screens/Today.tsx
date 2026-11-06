import { ArrowRight, Bookmark, Check, ChevronRight, EyeOff, Hand, Loader2, Mic, Plus, Send, ShieldCheck } from "lucide-react"
import { ago, STEPS, useDerived, useStore } from "../store"
import { Button, Card, Chip, CompanyTile, cx, IconBtn, MatchPill, money, placeOf, Steps } from "../ui"
import type { Job } from "../types"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export function Today({ first }: { first: string }) {
  const { s, go, openJob, setUi } = useStore()
  const d = useDerived()
  const working = d.visible.find((j) => j.app?.status === "working")
  const queued = d.visible.filter((j) => j.app?.status === "queued")
  const searching = s.feeds.filter((f) => f.searching)
  const fresh = d.visible.filter((j) => j.stage === "new").sort((a, b) => Number(!!b.fresh) - Number(!!a.fresh) || b.match - a.match).slice(0, 4)
  const applied = d.visible.filter((j) => j.stage === "applied")
  const week = applied.filter((j) => (j.app?.appliedAt ?? 0) > Date.now() - 7 * 86_400_000).length
  const interviews = applied.filter((j) => j.app?.interview)
  const newCount = d.visible.filter((j) => j.stage === "new" && j.fresh).length

  const headline = d.needs.length ? `${d.needs.length} thing${d.needs.length > 1 ? "s need" : " needs"} you. Plato handled the rest.` : working ? `Plato is applying to ${working.company} right now.` : newCount ? `${newCount} new matches since your last visit.` : "You're all caught up."

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
            {greeting()}, <span className="text-brand">{first}</span>
          </h1>
          <p className="text-[14.5px] text-ink-2">{headline}</p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setUi({ newFeed: {} })}>
          New search
        </Button>
      </div>

      <Readiness />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* Needs you */}
        <section className="flex flex-col gap-3" aria-labelledby="needs-h">
          <div className="flex items-center gap-2">
            <h2 id="needs-h" className="text-[17px] font-bold">
              Needs you
            </h2>
            {d.needs.length > 0 && <Chip tone="warn">{d.needs.length}</Chip>}
          </div>
          {d.needs.length === 0 ? (
            <Card className="flex items-center gap-3 p-5 text-sm text-ink-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="size-4" />
              </span>
              Nothing is waiting on you. Plato will tell you here and in the bell when something is.
            </Card>
          ) : (
            d.needs.map((j) => <NeedRow key={j.id} job={j} />)
          )}

          {/* New matches */}
          <div className="mt-4 flex items-center gap-2">
            <h2 className="text-[17px] font-bold">Best new matches</h2>
            <button type="button" onClick={() => go("jobs")} className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-cobalt hover:underline">
              All jobs <ArrowRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fresh.map((j) => (
              <MatchTile key={j.id} job={j} />
            ))}
            {fresh.length === 0 && <p className="text-sm text-ink-3">No unreviewed matches. Plato checks your searches again tonight.</p>}
          </div>
        </section>

        {/* Plato right now + numbers */}
        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <span className={cx("size-2 rounded-full", working || searching.length ? "pulse-dot bg-success" : "bg-mist")} />
              <h2 className="text-[15px] font-bold">Plato right now</h2>
            </div>
            {working ? (
              <button type="button" onClick={() => openJob(working.id)} className="flex flex-col gap-2.5 rounded-2xl bg-violet-soft/60 p-3.5 text-left hover:bg-violet-soft">
                <span className="flex items-center gap-2.5">
                  <CompanyTile job={working} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold">Applying to {working.company}</span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-violet">
                      <Loader2 className="size-3 animate-spin" /> {STEPS[Math.min(working.app!.step, 4)]}
                    </span>
                  </span>
                </span>
                <Steps step={working.app!.step} />
              </button>
            ) : (
              <p className="text-[13px] text-ink-3">Not applying to anything right now.</p>
            )}
            {queued.length > 0 && <p className="text-[12.5px] text-ink-2">{queued.length} more in line: {queued.map((j) => j.company).join(", ")}</p>}
            {searching.map((f) => (
              <p key={f.id} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <Loader2 className="size-3.5 animate-spin text-cobalt" /> Searching for “{f.name}” · {f.searching!.sources.filter((x) => x.state === "done").length}/{f.searching!.sources.length} boards
              </p>
            ))}
            <div className="border-t border-divider pt-3">
              <p className="eyebrow mb-2">Last 24 hours</p>
              <ul className="flex flex-col gap-2 text-[13px]">
                {s.notes.slice(0, 4).map((n) => (
                  <li key={n.id} className="flex items-start gap-2">
                    <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", n.tone === "good" ? "bg-success" : n.tone === "warn" ? "bg-warning" : "bg-cobalt")} />
                    <span className="min-w-0 flex-1 text-ink-2">{n.text}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{ago(n.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="grid grid-cols-3 divide-x divide-divider p-0">
            {[
              { n: d.visible.filter((j) => j.stage === "new").length, l: "jobs to review", to: () => go("jobs") },
              { n: week, l: "applied this week", to: () => go("jobs") },
              { n: interviews.length, l: interviews.length === 1 ? "interview" : "interviews", to: () => go("career", { careerTab: "interview" }) },
            ].map((m) => (
              <button key={m.l} type="button" onClick={m.to} className="flex flex-col gap-0.5 p-4 text-left hover:bg-tint">
                <span className="tabular text-[26px] leading-none font-extrabold">{m.n}</span>
                <span className="text-xs text-ink-3">{m.l}</span>
              </button>
            ))}
          </Card>

          {interviews[0] && (
            <Card className="flex items-center gap-3 p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-violet-soft text-violet">
                <Mic className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold">Interview with {interviews[0].company}</p>
                <p className="text-xs text-ink-3">Practice with questions from that posting</p>
              </div>
              <Button size="sm" variant="soft" onClick={() => go("career", { careerTab: "interview", careerJob: interviews[0].id })}>
                Practice
              </Button>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function Readiness() {
  const { go } = useStore()
  const { readiness: r } = useDerived()
  if (r.done === r.total) return null
  const next = r.items.find((i) => !i.done)!
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="relative size-12 shrink-0">
        <svg viewBox="0 0 36 36" className="size-12 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--divider)" strokeWidth="4" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--cobalt)" strokeWidth="4" strokeDasharray={`${(r.done / r.total) * 97.4} 97.4`} strokeLinecap="round" />
        </svg>
        <span className="tabular absolute inset-0 flex items-center justify-center text-[11px] font-bold">
          {r.done}/{r.total}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold">Plato can apply without asking once these are done</p>
        <p className="text-[12.5px] text-ink-3">
          Next: <b className="text-ink-2">{next.label}</b>. {r.total - r.done - 1 > 0 ? `${r.total - r.done - 1} more after that.` : "That's the last one."}
        </p>
      </div>
      <Button variant="soft" onClick={() => go("me", { meSection: next.where })}>
        Add it now <ChevronRight className="size-4" />
      </Button>
    </Card>
  )
}

function NeedRow({ job: j }: { job: Job }) {
  const { openJob } = useStore()
  const need = j.app!.need!
  const what = need.kind === "questions" ? `${need.questions.length} question${need.questions.length > 1 ? "s" : ""}: ${need.questions.map((q) => q.label.replace(/\?.*/, "?")).join(" · ")}` : need.kind === "verify" ? `${need.site} wants a human check. The form is already filled.` : need.kind === "manual" ? `${need.site} only takes applications from you. Your answers are ready to paste.` : `${need.site} needs Plato for Chrome. You link it once.`
  const cta = need.kind === "questions" ? "Answer" : need.kind === "verify" ? "Do the check" : need.kind === "manual" ? "Submit it" : "Link Chrome"
  return (
    <Card className="flex items-center gap-3 border-warning/25 p-3.5">
      <CompanyTile job={j} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold">
          {j.company} <span className="font-medium text-ink-3">· {j.title}</span>
        </p>
        <p className="line-clamp-2 text-[12.5px] text-ink-2">{what}</p>
      </div>
      <Button size="sm" variant="warn" icon={need.kind === "verify" ? <ShieldCheck className="size-3.5" /> : <Hand className="size-3.5" />} onClick={() => openJob(j.id)}>
        {cta}
      </Button>
    </Card>
  )
}

function MatchTile({ job: j }: { job: Job }) {
  const { openJob, move, setUi } = useStore()
  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <button type="button" onClick={() => openJob(j.id)} className="flex items-start gap-2.5 text-left">
        <CompanyTile job={j} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            {j.fresh && <span className="size-1.5 rounded-full bg-cobalt" />}
            {j.company}
          </span>
          <span className="block text-[13.5px] leading-snug font-bold">{j.title}</span>
        </span>
        <MatchPill m={j.match} />
      </button>
      <p className="text-xs text-ink-3">
        {placeOf(j)}
        {j.salary ? ` · ${money(j.salary[0])}–${money(j.salary[1])} / mo` : ""}
      </p>
      <p className="line-clamp-1 text-xs text-success">Matches {j.matched.slice(0, 3).join(", ")}</p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="soft" icon={<Send className="size-3.5" />} onClick={() => setUi({ applyIds: [j.id] })}>
          Apply
        </Button>
        <span className="flex-1" />
        <IconBtn label="Save" className="size-8" onClick={() => move(j.id, "saved")}>
          <Bookmark className="size-4" />
        </IconBtn>
        <IconBtn label="Not interested" className="size-8" onClick={() => move(j.id, "closed")}>
          <EyeOff className="size-4" />
        </IconBtn>
      </div>
    </Card>
  )
}

