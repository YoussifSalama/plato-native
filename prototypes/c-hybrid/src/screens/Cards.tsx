import { useState } from "react"
import { ArrowRight, Bookmark, Briefcase, Check, Coins, ExternalLink, EyeOff, FileText, GraduationCap, Hand, Loader2, Mic, Search, Sparkles, Upload, UserRound, Award } from "lucide-react"
import { ago, STEPS, useStore } from "../store"
import { jobOf, label, MODES, money, P } from "../engine"
import { Button, Chip, CompanyTile, cx, MatchPill, Segmented, Steps } from "../ui"
import type { Card, Job, Mode, Msg } from "../types"

export const MODE_ICON: Record<Mode, typeof Search> = { search: Search, resume: FileText, interview: Mic, skill: GraduationCap, applications: Briefcase, profile: UserRound }

export function CardView({ msg, last }: { msg: Msg; last: boolean }) {
  const c = msg.card!
  switch (c.type) {
    case "modes":
      return <ModesGrid />
    case "choices":
      return <Choices card={c} live={last || !c.picked} />
    case "summary":
      return <Summary card={c} msgId={msg.id} />
    case "searching":
      return <Searching id={c.searchId} />
    case "jobs":
      return <JobsCard card={c} />
    case "apply":
      return <ApplyCard card={c} msgId={msg.id} />
    case "applying":
      return <Applying ids={c.ids} />
    case "resume":
      return <ResumeMini jobId={c.jobId} version={c.version} focus={c.focus} />
    case "score":
      return <Score score={c.score} notes={c.notes} />
    case "plan":
      return <Plan skill={c.skill} />
    case "skill-done":
      return <SkillDone skill={c.skill} jobs={c.jobs} />
    case "status":
      return <Status />
    case "profile":
      return <ProfileCard />
    case "cv-read":
      return <CvDrop />
  }
}

const box = "rounded-2xl border border-line bg-card shadow-card"

export function ModesGrid({ big }: { big?: boolean }) {
  const { slash } = useStore()
  return (
    <div className={cx("grid gap-2", big ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
      {MODES.map((m) => {
        const I = MODE_ICON[m.mode]
        return (
          <button key={m.mode} type="button" onClick={() => slash(m.mode)} className={cx(box, "group flex items-start gap-3 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-brand-line")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft text-cobalt">
              <I className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold">{m.title}</span>
              <span className="block font-mono text-[11px] text-blue">{m.cmd}</span>
              {big && <span className="mt-1 block text-xs leading-snug text-ink-3">{m.sub}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Choices({ card, live }: { card: Extract<Card, { type: "choices" }>; live: boolean }) {
  const { send } = useStore()
  const [sel, setSel] = useState<string[]>([])
  const done = !!card.picked
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {card.options.map((o) => {
        const on = done ? card.picked!.includes(o) : sel.includes(o)
        return (
          <button
            key={o}
            type="button"
            disabled={done || !live}
            aria-pressed={on}
            onClick={() => (card.multi ? setSel(on ? sel.filter((x) => x !== o) : [...sel, o]) : send({ key: card.key, values: [o] }))}
            className={cx("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition", on ? "border-cobalt bg-cobalt text-white" : done ? "border-line bg-white/50 text-mist" : "border-brand-line bg-white text-cobalt hover:bg-soft")}
          >
            {card.multi && !done && on && <Check className="mr-1 inline size-3.5" />}
            {o}
          </button>
        )
      })}
      {card.multi && !done && (
        <Button size="sm" variant="primary" disabled={!sel.length} onClick={() => send({ key: card.key, values: sel })}>
          Done <ArrowRight className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function Summary({ card, msgId }: { card: Extract<Card, { type: "summary" }>; msgId: string }) {
  const { s, startSearch, changeSearch } = useStore()
  const [alert, setAlert] = useState<"daily" | "weekly" | "off">("daily")
  const d = card.searchDraft
  const B = ({ children }: { children: React.ReactNode }) => <b className="rounded-md bg-soft px-1.5 py-0.5 font-semibold text-cobalt">{children}</b>
  const setupText = d.setup === "Remote" ? "from home" : d.setup === "Hybrid" ? "a mix of home and office" : d.setup === "On-site" ? "in the office" : "any way of working"
  return (
    <div className={cx(box, "flex max-w-xl flex-col gap-3 p-4")}>
      <p className="text-[14px] leading-loose text-ink-2">
        I'll look for <B>{d.role}</B> jobs in <B>{d.where.join(", ") || "any city"}</B>, <B>{setupText}</B>
        {d.salary && d.salary !== "Any" ? <>, paying <B>{d.salary}</B> a month</> : null}
        {d.avoid && d.avoid !== "Nothing" ? <>, and I'll skip <B>{d.avoid.replace(/^no /i, "")}</B></> : null}. I'll rank every job against your CV.
      </p>
      {card.state === "ask" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            Keep looking and tell me about new jobs
            <Segmented size="sm" value={alert} onChange={setAlert} options={[{ value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "off", label: "No" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Search className="size-4" />} onClick={() => startSearch(msgId, alert)}>
              Start searching
            </Button>
            <Button variant="ghost" onClick={() => changeSearch(msgId)}>
              Change something
            </Button>
            <span className="ml-auto flex items-center gap-1 text-xs text-ink-3">
              <Coins className="size-3.5 text-warning" /> 5 of your {s.tokens} tokens
            </span>
          </div>
        </>
      ) : (
        <p className="text-xs font-semibold text-ink-3">{card.state === "go" ? "Search started" : "Changing it…"}</p>
      )}
    </div>
  )
}

function Searching({ id }: { id: string }) {
  const { s } = useStore()
  const sr = s.searches.find((x) => x.id === id)
  if (!sr) return null
  const done = sr.boards.filter((b) => b.state === "done").length
  return (
    <div className={cx(box, "flex max-w-xl flex-col gap-3 p-4")}>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-cobalt">
        {sr.done ? <Check className="size-4 text-success" /> : <Loader2 className="size-4 animate-spin" />}
        {sr.done ? `Checked ${sr.boards.length} sources · ${sr.boards.reduce((n, b) => n + b.found, 0)} postings read · ${sr.results.length} fit you` : `Checking ${done + 1} of ${sr.boards.length} sources…`}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-divider">
        <div className="bg-brand h-full rounded-full transition-all duration-700" style={{ width: `${(done / sr.boards.length) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sr.boards.map((b) => (
          <span key={b.name} className={cx("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold", b.state === "done" ? "bg-success-soft text-success" : b.state === "run" ? "bg-soft text-cobalt" : "bg-paper text-mist")}>
            {b.state === "done" ? <Check className="size-3" /> : b.state === "run" ? <Loader2 className="size-3 animate-spin" /> : null}
            {b.name}
            {b.state === "done" && <span className="tabular opacity-70">{b.found}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

export function JobRow({ j, compact }: { j: Job; compact?: boolean }) {
  const { s, send } = useStore()
  const p = P(s)
  const app = s.apps.find((a) => a.jobId === j.id)
  const saved = s.saved.includes(j.id)
  return (
    <div className={cx(box, "flex flex-col gap-2.5 p-3.5")}>
      <div className="flex items-start gap-3">
        <CompanyTile job={j} size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-bold">{j.title}</p>
          <p className="text-[12.5px] text-ink-3">
            {j.company} · {j.location}
            {j.setup !== "Remote" ? ` · ${j.setup}` : ""}
            {j.salary ? ` · ${money(p, j.salary)}/mo` : ""}
          </p>
        </div>
        <MatchPill m={j.match} />
      </div>
      {!compact && <p className="text-[12.5px] leading-snug text-success">✓ {j.why[0]}</p>}
      {app ? (
        <p className="text-xs font-semibold text-ink-3">{app.status === "submitted" ? "Applied" : app.status === "manual" ? "Waiting for you to submit" : "Plato is applying"}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="primary" onClick={() => send({ key: `job:${j.id}`, values: ["apply"], show: `Apply to ${j.company}` })}>
            Apply
          </Button>
          <Button size="sm" variant="soft" onClick={() => send({ key: `job:${j.id}`, values: ["more"], show: `Tell me more about ${j.company}` })}>
            Tell me more
          </Button>
          <span className="flex-1" />
          <button type="button" aria-label={saved ? "Saved" : "Save"} title={saved ? "Saved" : "Save"} disabled={saved} onClick={() => send({ key: `job:${j.id}`, values: ["save"], show: `Save ${j.company}` })} className={cx("flex size-8 items-center justify-center rounded-full", saved ? "text-azure" : "text-ink-3 hover:bg-paper hover:text-ink")}>
            <Bookmark className={cx("size-4", saved && "fill-current")} />
          </button>
          <button type="button" aria-label="Not for me" title="Not for me" onClick={() => send({ key: `job:${j.id}`, values: ["hide"], show: `Not interested in ${j.company}` })} className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-paper hover:text-ink">
            <EyeOff className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function JobsCard({ card }: { card: Extract<Card, { type: "jobs" }> }) {
  const { s, go } = useStore()
  const jobs = card.ids.map((id) => jobOf(s, id)).filter((j): j is Job => !!j && !s.hidden.includes(j.id))
  return (
    <div className="flex max-w-xl flex-col gap-2">
      {jobs.map((j) => (
        <JobRow key={j.id} j={j} />
      ))}
      {card.total > card.ids.length && (
        <button type="button" onClick={() => go("jobs", { feed: card.searchId ?? "all", copilot: true })} className="flex items-center gap-1.5 self-start rounded-full px-1 py-1 text-[13px] font-semibold text-cobalt hover:underline">
          See all {card.total} on your Jobs board <ArrowRight className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function ApplyCard({ card, msgId }: { card: Extract<Card, { type: "apply" }>; msgId: string }) {
  const { s, confirmApply, cancelApply } = useStore()
  const [tailor, setTailor] = useState(true)
  const jobs = card.ids.map((id) => jobOf(s, id)!).filter(Boolean)
  if (card.state !== "ask") return <p className="text-xs font-semibold text-ink-3">{card.state === "done" ? `Confirmed: ${jobs.map((j) => j.company).join(", ")}` : "Cancelled. Nothing was sent."}</p>
  const groups = [
    { t: "I apply for you", sub: "Fill the form, attach your resume, submit, keep the proof", icon: <Sparkles className="size-4 text-cobalt" />, jobs: jobs.filter((j) => j.route !== "manual") },
    { t: "You submit these yourself", sub: "These sites only take applications from a person. I'll prepare every answer", icon: <Hand className="size-4 text-warning" />, jobs: jobs.filter((j) => j.route === "manual") },
  ].filter((g) => g.jobs.length)
  return (
    <div className={cx(box, "flex max-w-xl flex-col gap-4 p-4")}>
      {groups.map((g) => (
        <div key={g.t} className="flex flex-col gap-2">
          <p className="flex items-start gap-2 text-[13.5px] font-bold">
            {g.icon}
            <span>
              {g.t} · {g.jobs.length}
              <span className="block text-xs font-normal text-ink-3">{g.sub}</span>
            </span>
          </p>
          <ul className="flex flex-col divide-y divide-divider rounded-xl border border-line">
            {g.jobs.map((j) => (
              <li key={j.id} className="flex items-center gap-2.5 px-3 py-2">
                <CompanyTile job={j} size={26} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label(j)}</span>
                {j.route === "chrome" && <Chip tone="violet">In your browser</Chip>}
                <MatchPill m={j.match} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <label className="flex items-center gap-3 rounded-xl bg-tint px-3 py-2.5 text-[13px]">
        <input type="checkbox" checked={tailor} onChange={(e) => setTailor(e.target.checked)} className="size-4 accent-[var(--cobalt)]" />
        <span>
          <b>Write a resume for each job</b>
          <span className="block text-xs text-ink-3">Same facts, reordered around each job's words</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => confirmApply(msgId)}>
          {jobs.length === 1 ? "Yes, apply" : `Yes, apply to ${jobs.length}`}
        </Button>
        <Button variant="ghost" onClick={() => cancelApply(msgId)}>
          Not now
        </Button>
        <span className="ml-auto flex items-center gap-1 text-xs text-ink-3">
          <Coins className="size-3.5 text-warning" /> {jobs.length * (tailor ? 3 : 2)} tokens
        </span>
      </div>
    </div>
  )
}

function Applying({ ids }: { ids: string[] }) {
  const { s, markSubmitted } = useStore()
  return (
    <div className={cx(box, "flex max-w-xl flex-col divide-y divide-divider")}>
      {ids.map((id) => {
        const j = jobOf(s, id)
        const a = s.apps.find((x) => x.jobId === id)
        if (!j || !a) return null
        return (
          <div key={id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <CompanyTile job={j} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{j.company}</span>
                <span className="block truncate text-xs text-ink-3">{j.title}</span>
              </span>
              {a.status === "submitted" && (
                <Chip tone="good">
                  <Check className="size-3" /> Applied {a.appliedAt ? ago(a.appliedAt) : ""}
                </Chip>
              )}
              {a.status === "queued" && <Chip>In line</Chip>}
              {a.status === "needs" && <Chip tone="warn">Needs your answer</Chip>}
              {a.status === "manual" && <Chip tone="warn">Your turn</Chip>}
              {a.status === "working" && (
                <Chip tone="violet">
                  <Loader2 className="size-3 animate-spin" /> {STEPS[Math.min(a.step, 4)]}
                </Chip>
              )}
            </div>
            {a.status === "working" && <Steps step={a.step} compact />}
            {a.status === "manual" && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                {j.source} only accepts applications from you. Your answers are ready to paste.
                <a href="https://example.com" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-3 font-semibold hover:bg-tint">
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
    </div>
  )
}

export function ResumeDoc({ jobId, version = 1, focus = "", full }: { jobId?: string; version?: number; focus?: string; full?: boolean }) {
  const { s } = useStore()
  const p = P(s)
  const j = jobOf(s, jobId)
  const short = /shorter/i.test(focus)
  const formal = /formal/i.test(focus)
  const lines = p.experience.flatMap((e) => [e.did])
  return (
    <article className={cx("flex flex-col gap-3 bg-white font-[Georgia,serif] text-ink", full ? "px-7 py-8 text-[14px]" : "px-5 py-4 text-[12.5px]")}>
      <header className="border-b border-line pb-2">
        <p className={cx("font-sans font-extrabold", full ? "text-[22px]" : "text-[16px]")}>{p.name}</p>
        <p className="font-sans text-[11.5px] text-ink-3">
          {j ? j.title.replace(/\(.*\)/, "").trim() : p.headline} · {p.city} · {p.email}
        </p>
      </header>
      <p>
        {formal ? `${p.headline} with ${p.years} years of experience` : `${p.headline}, ${p.years} years`}
        {j ? `, focused on what ${j.company} needs: ${j.why[0].toLowerCase().replace(/^you('ve| have)? /, "")}.` : `. ${p.experience[0].did}`}
      </p>
      {p.experience.slice(0, short && !full ? 1 : 2).map((e, i) => (
        <div key={e.company}>
          <p className="font-sans font-bold">
            {e.title} · {e.company} <span className="font-normal text-ink-3">{e.years}</span>
          </p>
          <p className="pl-3">• {formal ? lines[i].replace(/^(\w)/, (c) => c.toUpperCase()) : lines[i]}</p>
        </div>
      ))}
      <p className="font-sans text-[11px] tracking-wide text-ink-3 uppercase">Skills: {[...p.skills, ...s.proven.filter((x) => x.level === "Proven").map((x) => x.skill)].join(" · ")}</p>
      {!full && <p className="font-sans text-[11px] text-ink-3">Version {version}{focus ? ` · ${focus}` : ""}</p>}
    </article>
  )
}

function ResumeMini({ jobId, version, focus }: { jobId?: string; version: number; focus: string }) {
  const { patchUi } = useStore()
  return (
    <div className={cx(box, "max-w-md overflow-hidden")}>
      <ResumeDoc jobId={jobId} version={version} focus={focus} />
      <button type="button" onClick={() => patchUi({ resume: { jobId } })} className="flex w-full items-center justify-center gap-1.5 border-t border-divider bg-tint py-2 text-[12.5px] font-semibold text-cobalt hover:bg-soft">
        <FileText className="size-3.5" /> Open the full resume
      </button>
    </div>
  )
}

function Score({ score, notes }: { score: number; notes: string[] }) {
  return (
    <div className={cx(box, "flex max-w-md items-center gap-4 p-4")}>
      <div className="relative size-20 shrink-0">
        <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--divider)" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={score >= 75 ? "var(--success)" : "var(--warning)"} strokeWidth="3.5" strokeDasharray={`${(score / 100) * 97.4} 97.4`} strokeLinecap="round" />
        </svg>
        <span className="tabular absolute inset-0 flex flex-col items-center justify-center text-xl font-extrabold">{score}</span>
      </div>
      <div>
        <p className="text-[14px] font-bold">{score >= 80 ? "You're ready for this one" : score >= 65 ? "Nearly there" : "One more round would help"}</p>
        <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-ink-2">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Plan({ skill }: { skill: string }) {
  const { s } = useStore()
  const g = P(s).gaps.find((x) => x.skill === skill)!
  return (
    <div className={cx(box, "flex max-w-md flex-col gap-3 p-4")}>
      <p className="flex items-center gap-2 text-[15px] font-bold">
        <GraduationCap className="size-5 text-cobalt" /> {g.skill}
      </p>
      <p className="text-[13px] text-ink-2">
        <b>{g.jobs} of your job matches</b> ask for it. Adding it with proof moves you up on all of them.
      </p>
      <div className="flex items-center gap-3 rounded-xl bg-tint p-3 text-[13px]">
        <span className="min-w-0 flex-1">
          <b className="block">{g.course}</b>
          <span className="text-xs text-ink-3">
            {g.provider} · about {g.hours} hours
          </span>
        </span>
        <a href="https://example.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-cobalt hover:underline">
          Open <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}

function SkillDone({ skill, jobs }: { skill: string; jobs: number }) {
  return (
    <div className={cx(box, "flex max-w-md items-start gap-3 border-success/30 bg-success-soft/50 p-4")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <Award className="size-5" />
      </span>
      <div>
        <p className="text-[14.5px] font-bold">You passed. {skill} is on your profile with proof.</p>
        <p className="mt-0.5 text-[13px] text-ink-2">Your match went up on {jobs} jobs, and I'll put it on the resumes I write for them.</p>
      </div>
    </div>
  )
}

function Status() {
  const { s, go } = useStore()
  const c = (st: string[]) => s.apps.filter((a) => st.includes(a.status)).length
  const rows = [
    { l: "Applied", n: c(["submitted"]), tone: "text-success" },
    { l: "In progress", n: c(["queued", "working"]), tone: "text-violet" },
    { l: "Need you", n: c(["needs", "manual"]), tone: "text-warning" },
  ]
  return (
    <div className={cx(box, "flex max-w-md flex-col gap-3 p-4")}>
      <div className="grid grid-cols-3 divide-x divide-divider">
        {rows.map((r) => (
          <div key={r.l} className="px-3 first:pl-0">
            <p className={cx("tabular text-2xl font-extrabold", r.tone)}>{r.n}</p>
            <p className="text-xs text-ink-3">{r.l}</p>
          </div>
        ))}
      </div>
      <Button size="sm" variant="soft" className="self-start" onClick={() => go("jobs", { copilot: true })}>
        Open the board <ArrowRight className="size-3.5" />
      </Button>
    </div>
  )
}

export function ProfileCard({ wide }: { wide?: boolean }) {
  const { s } = useStore()
  const p = P(s)
  const F = ({ k, v }: { k: string; v: string }) => (
    <p className="flex gap-2 text-[13px]">
      <span className="w-32 shrink-0 text-ink-3">{k}</span>
      <span className={cx("min-w-0", !v && "font-semibold text-warning")}>{v || "Not yet: I'll ask when a form needs it"}</span>
    </p>
  )
  return (
    <div className={cx(wide ? "" : box, "flex max-w-xl flex-col gap-3", !wide && "p-4")}>
      <div className="flex items-center gap-3">
        <span className="bg-brand flex size-11 items-center justify-center rounded-2xl text-sm font-bold text-white">{p.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
        <div>
          <p className="text-[15px] font-bold">{p.name}</p>
          <p className="text-xs text-ink-3">
            {p.headline} · {p.years} years · {p.city}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {p.experience.map((e) => (
          <p key={e.company} className="text-[13px]">
            <b>
              {e.title}, {e.company}
            </b>{" "}
            <span className="text-ink-3">{e.years}</span>
            <span className="block text-ink-2">{e.did}</span>
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.skills.map((k) => (
          <Chip key={k} tone="brand">
            {k}
          </Chip>
        ))}
        {s.proven.map((k) => (
          <Chip key={k.skill} tone={k.level === "Proven" ? "good" : "violet"}>
            {k.level === "Proven" ? <Award className="size-3" /> : null} {k.skill} · {k.level === "Proven" ? "proven" : "learning"}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-divider pt-3">
        <F k="Notice period" v={s.facts.notice} />
        <F k="Work authorization" v={s.facts.workAuth} />
        <F k="LinkedIn" v={s.facts.linkedin} />
      </div>
    </div>
  )
}

function CvDrop() {
  const { s, uploadCv } = useStore()
  const done = s.threads.find((t) => t.id === s.active)?.flow.mode === "onboard" && (s.threads.find((t) => t.id === s.active)!.flow as { step: string }).step !== "cv"
  if (done) return null
  return (
    <label
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        uploadCv()
      }}
      className="flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-line bg-tint px-5 py-7 text-center hover:bg-soft"
    >
      <Upload className="size-6 text-cobalt" />
      <span className="text-[14px] font-bold">Drop your CV here or choose a file</span>
      <span className="text-xs text-ink-3">PDF or Word. Any file works in this prototype.</span>
      <input type="file" className="sr-only" onChange={() => uploadCv()} />
      <span className="mt-1 text-xs font-semibold text-cobalt underline" onClick={(e) => (e.preventDefault(), uploadCv())}>
        or use the sample CV
      </span>
    </label>
  )
}
