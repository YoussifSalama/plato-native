import { useState } from "react"
import { ArrowLeft, Check, ExternalLink, Loader2, MessageCircle, X } from "lucide-react"
import { ago, STEPS, useStore, type Canvas as C } from "../store"
import { jobOf, label, money, P } from "../engine"
import { Button, Chip, CompanyTile, cx, IconBtn, MatchPill, Steps } from "../ui"
import { ProfileCard, ResumeDoc } from "./Cards"
import type { Job } from "../types"

const TABS: { tab: NonNullable<C>["tab"]; label: string }[] = [
  { tab: "results", label: "Jobs" },
  { tab: "applications", label: "Applications" },
  { tab: "resume", label: "Resume" },
  { tab: "profile", label: "Profile" },
]

// The side panel shows the full version of whatever the conversation is about.
// Everything here can also be done by asking Plato.
export function Canvas() {
  const { ui, patchUi } = useStore()
  const c = ui.canvas
  if (!c) return null
  return (
    <aside className="anim-slide fixed inset-0 z-40 flex flex-col bg-card lg:static lg:z-auto lg:m-3 lg:ml-0 lg:w-[440px] lg:shrink-0 lg:rounded-[24px] lg:border lg:border-line lg:shadow-card xl:w-[500px]" aria-label="Details panel" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center gap-1 border-b border-divider px-3 py-2.5">
        <div className="scroll-thin flex flex-1 gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.tab} type="button" onClick={() => patchUi({ canvas: { ...c, tab: t.tab, jobId: undefined } })} className={cx("rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap", c.tab === t.tab ? "bg-cobalt text-white" : "text-ink-2 hover:bg-paper")}>
              {t.label}
            </button>
          ))}
        </div>
        <IconBtn label="Close panel" onClick={() => patchUi({ canvas: null })}>
          <X className="size-5" />
        </IconBtn>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {c.jobId ? <JobDetail id={c.jobId} /> : c.tab === "results" ? <Results searchId={c.searchId} /> : c.tab === "applications" ? <Applications /> : c.tab === "resume" ? <ResumeTab jobId={c.resumeJobId} /> : <Profile />}
      </div>
    </aside>
  )
}

function Results({ searchId }: { searchId?: string }) {
  const { s, ui, patchUi } = useStore()
  const searches = s.searches.filter((x) => x.done)
  const sr = searches.find((x) => x.id === searchId) ?? searches[searches.length - 1]
  const [sort, setSort] = useState<"match" | "pay">("match")
  if (!sr) return <p className="p-6 text-sm text-ink-3">No searches yet. Ask Plato to find you jobs, or type /job-search.</p>
  const p = P(s)
  const jobs = sr.results.map((id) => jobOf(s, id)!).filter((j) => j && !s.hidden.includes(j.id)).sort((a, b) => (sort === "match" ? b.match - a.match : (b.salary?.[1] ?? 0) - (a.salary?.[1] ?? 0)))
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        {searches.length > 1 && (
          <select aria-label="Which search" value={sr.id} onChange={(e) => patchUi({ canvas: { ...ui.canvas!, searchId: e.target.value } })} className="h-9 rounded-xl border border-line bg-white px-2 text-[13px] font-semibold">
            {searches.map((x) => (
              <option key={x.id} value={x.id}>
                {x.params.role} · {x.params.where.join(", ")}
              </option>
            ))}
          </select>
        )}
        <p className="text-[13px] text-ink-2">
          <b>{jobs.length} jobs</b> for {sr.params.role} in {sr.params.where.join(", ")}. {sr.alert !== "off" ? `Plato checks again every ${sr.alert === "daily" ? "day" : "week"}.` : ""}
        </p>
        <div className="flex gap-1 text-xs">
          {(["match", "pay"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} className={cx("rounded-full px-2.5 py-1 font-semibold", sort === k ? "bg-soft text-cobalt" : "text-ink-3 hover:bg-paper")}>
              {k === "match" ? "Best match" : "Best pay"}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-divider rounded-2xl border border-line">
        {jobs.map((j) => {
          const a = s.apps.find((x) => x.jobId === j.id)
          return (
            <li key={j.id}>
              <button type="button" onClick={() => patchUi({ canvas: { ...ui.canvas!, jobId: j.id } })} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-tint">
                <CompanyTile job={j} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{j.title}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {j.company} · {j.location}
                    {j.salary ? ` · ${money(p, j.salary)}` : ""}
                  </span>
                </span>
                {a ? <Chip tone={a.status === "submitted" ? "good" : "violet"}>{a.status === "submitted" ? "Applied" : "Applying"}</Chip> : s.saved.includes(j.id) ? <Chip tone="brand">Saved</Chip> : null}
                <MatchPill m={j.match} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function JobDetail({ id }: { id: string }) {
  const { s, ui, patchUi, send } = useStore()
  const j = jobOf(s, id) as Job
  const a = s.apps.find((x) => x.jobId === id)
  const p = P(s)
  return (
    <div className="flex flex-col gap-4 p-4">
      <button type="button" onClick={() => patchUi({ canvas: { ...ui.canvas!, jobId: undefined } })} className="flex items-center gap-1 self-start text-[13px] font-semibold text-cobalt hover:underline">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="flex items-start gap-3">
        <CompanyTile job={j} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-2">{j.company}</p>
          <h2 className="text-[18px] leading-snug font-extrabold">{j.title}</h2>
          <p className="text-xs text-ink-3">
            {j.location} · {j.setup} · posted {j.postedDays} day{j.postedDays > 1 ? "s" : ""} ago · {j.source}
          </p>
        </div>
        <MatchPill m={j.match} big />
      </div>
      {j.salary && (
        <p className="text-[13.5px]">
          Pays <b>{money(p, j.salary)}</b> a month
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="eyebrow">Why it fits you</p>
        {j.why.map((w) => (
          <p key={w} className="flex gap-2 text-[13.5px]">
            <Check className="mt-0.5 size-4 shrink-0 text-success" /> {w}
          </p>
        ))}
      </div>
      {j.watch.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow">Good to know</p>
          {j.watch.map((w) => (
            <p key={w} className="flex gap-2 text-[13.5px] text-ink-2">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning">!</span> {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-[13.5px] leading-relaxed text-ink-2">{j.about}</p>
      <a href="https://example.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start text-[13px] font-semibold text-cobalt hover:underline">
        Original posting on {j.source} <ExternalLink className="size-3.5" />
      </a>
      {a ? (
        <div className="rounded-2xl bg-tint p-3 text-[13px]">
          <p className="font-bold">{a.status === "submitted" ? `Applied ${a.appliedAt ? ago(a.appliedAt) : ""}` : a.status === "manual" ? "Waiting for you to submit it" : "Plato is applying"}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-ink-2">
            {a.events.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
          <Button variant="primary" onClick={() => send({ key: `job:${j.id}`, values: ["apply"], show: `Apply to ${j.company}` })}>
            Apply
          </Button>
          <Button variant="soft" icon={<MessageCircle className="size-4" />} onClick={() => send({ key: `job:${j.id}`, values: ["more"], show: `Should I apply to ${j.company}?` })}>
            Ask Plato about it
          </Button>
          <Button variant="ghost" onClick={() => send({ key: `job:${j.id}`, values: ["save"], show: `Save ${j.company}` })}>
            Save
          </Button>
        </div>
      )}
    </div>
  )
}

function Applications() {
  const { s, patchUi, ui, markSubmitted } = useStore()
  const groups = [
    { t: "Needs you", st: ["needs", "manual"] },
    { t: "In progress", st: ["working", "queued"] },
    { t: "Applied", st: ["submitted"] },
  ]
  if (!s.apps.length) return <p className="p-6 text-sm text-ink-3">No applications yet. Ask Plato to find and apply to jobs for you.</p>
  return (
    <div className="flex flex-col gap-5 p-4">
      {groups.map((g) => {
        const rows = s.apps.filter((a) => g.st.includes(a.status))
        if (!rows.length) return null
        return (
          <section key={g.t} className="flex flex-col gap-2">
            <p className="eyebrow">
              {g.t} · {rows.length}
            </p>
            {rows.map((a) => {
              const j = jobOf(s, a.jobId)!
              return (
                <div key={a.jobId} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                  <button type="button" onClick={() => patchUi({ canvas: { ...ui.canvas!, jobId: j.id } })} className="flex items-center gap-3 text-left">
                    <CompanyTile job={j} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{label(j)}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {a.status === "submitted" ? `Applied ${a.appliedAt ? ago(a.appliedAt) : ""} · ${j.source} confirmed` : a.status === "working" ? STEPS[Math.min(a.step, 4)] : a.status === "queued" ? "In line" : a.status === "needs" ? "Plato asked you a question in the chat" : `${j.source} only takes applications from you`}
                      </span>
                    </span>
                    {a.status === "working" && <Loader2 className="size-4 animate-spin text-violet" />}
                  </button>
                  {a.status === "working" && <Steps step={a.step} compact />}
                  {a.status === "manual" && (
                    <div className="flex flex-wrap gap-2">
                      <a href="https://example.com" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold hover:bg-tint">
                        Open on {j.source} <ExternalLink className="size-3.5" />
                      </a>
                      <Button size="sm" variant="soft" onClick={() => markSubmitted(j.id)}>
                        I submitted it
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function ResumeTab({ jobId }: { jobId?: string }) {
  const { s, send } = useStore()
  const r = s.resumes.find((x) => x.jobId === jobId) ?? s.resumes[0]
  return (
    <div className="flex flex-col gap-3 p-4">
      {s.resumes.length > 0 && (
        <p className="text-[13px] text-ink-2">
          {r?.jobId ? `Written for ${jobOf(s, r.jobId)?.company}` : "Your main resume"} · version {r?.version ?? 1} · {r?.approved ? <b className="text-success">approved</b> : "not approved yet"}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-line">
        <ResumeDoc jobId={r?.jobId ?? jobId} version={r?.version} focus={r?.focus} full />
      </div>
      <Button variant="soft" className="self-start" onClick={() => send({ text: "Build my resume for another job" })}>
        Ask Plato for another version
      </Button>
    </div>
  )
}

function Profile() {
  const { send } = useStore()
  return (
    <div className="flex flex-col gap-4 p-4">
      <ProfileCard wide />
      <div className="rounded-2xl bg-tint p-3 text-[13px] text-ink-2">
        To change anything, just tell Plato. For example:
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["My notice period is one month", "I moved to Jeddah"].map((x) => (
            <button key={x} type="button" onClick={() => send({ text: x })} className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-cobalt hover:bg-soft">
              “{x}”
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
