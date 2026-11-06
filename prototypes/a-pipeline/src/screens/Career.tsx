import { useMemo, useState } from "react"
import { ArrowRight, BookOpen, Check, FileText, Mic, MessageSquareText, Play, Sparkles, Square, Wand2 } from "lucide-react"
import { ago, useDerived, useStore, type Resume } from "../store"
import { Button, Card, Chip, CompanyTile, cx, inputCls, MatchPill, Segmented } from "../ui"
import type { Job } from "../types"

export function Career() {
  const { ui, setUi } = useStore()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Career</h1>
          <p className="text-[13.5px] text-ink-2">Get the resume, the interview and the skills right for the jobs on your board.</p>
        </div>
        <Segmented
          value={ui.careerTab}
          onChange={(v) => setUi({ careerTab: v })}
          options={[
            { value: "resume", label: <><FileText className="size-3.5" /> Resumes</> },
            { value: "interview", label: <><Mic className="size-3.5" /> Interview practice</> },
            { value: "skills", label: <><BookOpen className="size-3.5" /> Skills</> },
          ]}
        />
      </div>
      {ui.careerTab === "resume" && <Resumes />}
      {ui.careerTab === "interview" && <Interviews />}
      {ui.careerTab === "skills" && <SkillsGap />}
    </div>
  )
}

/* ---------------- Resumes ---------------- */

const BULLETS: Record<string, { before: string; after: string }[]> = {
  e1: [
    { before: "Worked on payments and booking APIs.", after: "Led the payments and booking APIs serving 1.2M monthly riders; cut p95 latency 40% by moving 6 services to NestJS and adding Redis caching." },
    { before: "Helped with migration to NestJS.", after: "Planned and ran the migration of 6 Express services to NestJS with zero downtime, using feature flags and shadow traffic." },
  ],
  e2: [{ before: "Built ingestion pipeline for crash reports.", after: "Built the crash-report ingestion pipeline on Node.js and Kafka, scaling it to 2B events a day at 99.95% availability." }],
}

function Resumes() {
  const { s, ui, approveResume, setUi } = useStore()
  const jobFor = (id?: string) => s.jobs.find((j) => j.id === id)
  const pinned = jobFor(ui.careerJob)
  const forPinned = s.resumes.find((r) => r.jobId === pinned?.id)
  const [sel, setSel] = useState<string>(forPinned?.id ?? (pinned ? "draft" : "base"))
  const [improved, setImproved] = useState<Record<string, boolean>>({})
  const current: Resume | undefined = s.resumes.find((r) => r.id === sel)
  const job = sel === "draft" ? pinned : jobFor(current?.jobId)
  const p = s.profile

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-2">
        <p className="eyebrow px-1">Your resumes</p>
        <ResumeRow on={sel === "base"} onClick={() => setSel("base")} title="Base resume" sub={`From ${p.cv.file}`} />
        {pinned && !forPinned && <ResumeRow on={sel === "draft"} onClick={() => setSel("draft")} title={`${pinned.company} · ${pinned.title}`} sub="Draft for this job · not used yet" tone="draft" />}
        {s.resumes.map((r) => (
          <ResumeRow key={r.id} on={sel === r.id} onClick={() => setSel(r.id)} title={r.name} sub={`${r.match}% keyword match · ${ago(r.at)}`} tone={r.approved ? "ok" : "warn"} />
        ))}
        <p className="px-1 pt-2 text-xs leading-relaxed text-ink-3">Plato writes a version for each job you apply to, if you keep “Write a resume for each job” on. You approve a version before it's sent again.</p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {job && (
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <CompanyTile job={job} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold">
                For {job.company} · {job.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {job.matched.map((k) => (
                  <Chip key={k} tone="good">
                    <Check className="size-3" /> {k}
                  </Chip>
                ))}
                {job.missing.map((k) => (
                  <Chip key={k} tone="warn">
                    {k} not in your resume
                  </Chip>
                ))}
              </div>
            </div>
            <MatchPill m={current?.match ?? Math.min(97, job.match + 3)} big />
          </Card>
        )}
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3">
            <p className="flex-1 text-[13px] font-semibold text-ink-2">{sel === "base" ? "Base resume, as read from your CV" : current?.approved ? "Approved. Plato sends this version" : "Not approved yet"}</p>
            {current && !current.approved && (
              <Button size="sm" variant="primary" onClick={() => approveResume(current.id)}>
                Approve this version
              </Button>
            )}
            {sel === "draft" && pinned && (
              <Button size="sm" variant="primary" onClick={() => setUi({ applyIds: [pinned.id] })}>
                Apply with this resume
              </Button>
            )}
          </div>
          {/* The page itself */}
          <article className="mx-auto flex max-w-[680px] flex-col gap-4 px-6 py-7 font-[Georgia,serif] text-[14px] leading-relaxed text-ink">
            <header className="border-b border-line pb-3">
              <h2 className="font-sans text-[22px] font-extrabold">{p.name}</h2>
              <p className="font-sans text-[12.5px] text-ink-2">
                {job ? `${job.title.replace(/\(.*\)/, "").trim()} · ` : ""}
                {p.city} · {p.email} · {p.facts.linkedin}
              </p>
            </header>
            <section>
              <h3 className="mb-1 font-sans text-[11px] font-bold tracking-widest text-cobalt uppercase">Summary</h3>
              <p>
                Backend engineer with 5 years building Node.js and NestJS APIs for payments and high-volume data{job ? `, the core of ${job.company}'s ${job.title.toLowerCase()} role` : ""}. AWS certified.
              </p>
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="font-sans text-[11px] font-bold tracking-widest text-cobalt uppercase">Experience</h3>
              {p.experiences.map((e) => (
                <div key={e.id}>
                  <p className="font-sans text-[13.5px] font-bold">
                    {e.title} · {e.company} <span className="font-normal text-ink-3">{e.from} – {e.to}</span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {(BULLETS[e.id] ?? []).map((b, i) => {
                      const key = `${sel}-${e.id}-${i}`
                      const better = improved[key] || (sel !== "base" && sel !== "draft")
                      return (
                        <li key={key} className="group flex items-start gap-2">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-ink" />
                          <span className={cx("flex-1", improved[key] && "rounded bg-success-soft/70 px-1")}>{better ? b.after : b.before}</span>
                          {!better && (
                            <button type="button" onClick={() => setImproved({ ...improved, [key]: true })} className="flex shrink-0 items-center gap-1 rounded-full bg-soft px-2 py-0.5 font-sans text-[11px] font-semibold text-cobalt opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                              <Wand2 className="size-3" /> Improve
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </section>
            <section>
              <h3 className="mb-1 font-sans text-[11px] font-bold tracking-widest text-cobalt uppercase">Skills</h3>
              <p>{p.skills.filter((k) => k.level !== "Learning").map((k) => k.name).join(" · ")}</p>
            </section>
            <section>
              <h3 className="mb-1 font-sans text-[11px] font-bold tracking-widest text-cobalt uppercase">Education</h3>
              <p>
                {p.education[0].degree}, {p.education[0].school} · {p.certs[0].name}
              </p>
            </section>
          </article>
        </Card>
      </div>
    </div>
  )
}

function ResumeRow({ on, onClick, title, sub, tone }: { on: boolean; onClick: () => void; title: string; sub: string; tone?: "ok" | "warn" | "draft" }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex items-start gap-2.5 rounded-2xl border p-3 text-left transition", on ? "border-cobalt/40 bg-white shadow-card" : "border-transparent bg-white/50 hover:bg-white")}>
      <FileText className={cx("mt-0.5 size-4 shrink-0", on ? "text-cobalt" : "text-ink-3")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">{title}</span>
        <span className="block truncate text-xs text-ink-3">{sub}</span>
      </span>
      {tone === "ok" && <Chip tone="good">Approved</Chip>}
      {tone === "warn" && <Chip tone="warn">Review</Chip>}
      {tone === "draft" && <Chip tone="brand">Draft</Chip>}
    </button>
  )
}

/* ---------------- Interviews ---------------- */

function questionsFor(job?: Job) {
  const c = job?.company ?? "the company"
  return [
    { q: `Walk me through an API you designed that had to handle a lot of traffic. What would you do differently at ${c}?`, tip: "Name the numbers: requests per second, latency, what broke first." },
    { q: job?.matched.includes("Payments") ? "How do you make a payment endpoint safe to retry?" : "How do you make an endpoint safe to retry?", tip: "Idempotency keys, where you store them, and what the client sees." },
    { q: "Tell me about a disagreement with a teammate about a technical decision. How did it end?", tip: "One concrete story. What you did, not what the team did." },
  ]
}

function Interviews() {
  const { s, ui, setUi, addInterview, spend, go } = useStore()
  const candidates = s.jobs.filter((j) => ["applied", "needs", "applying", "saved"].includes(j.stage))
  const [jobId, setJobId] = useState<string>(ui.careerJob && s.jobs.some((j) => j.id === ui.careerJob) ? ui.careerJob : "general")
  const [mode, setMode] = useState<"Text" | "Voice">("Text")
  const [live, setLive] = useState(false)
  const job = s.jobs.find((j) => j.id === jobId)
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {!live ? (
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div>
              <h2 className="text-[17px] font-bold">Practice an interview</h2>
              <p className="text-[13px] text-ink-3">Pick a job and Plato asks what that company is likely to ask, then scores your answers.</p>
            </div>
            <label className="flex flex-col gap-1.5" htmlFor="iv-job">
              <span className="text-[12.5px] font-semibold text-ink-2">Which interview?</span>
              <select id="iv-job" value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
                <option value="general">General backend engineer interview</option>
                {candidates.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.company} · {j.title}
                    {j.app?.interview ? " (interview booked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-ink-2">How?</span>
              <div className="grid grid-cols-2 gap-2">
                {(["Text", "Voice"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cx("flex items-start gap-3 rounded-2xl border p-3.5 text-left", mode === m ? "border-cobalt bg-soft" : "border-line bg-white hover:bg-tint")}>
                    {m === "Text" ? <MessageSquareText className="mt-0.5 size-5 text-cobalt" /> : <Mic className="mt-0.5 size-5 text-cobalt" />}
                    <span>
                      <span className="block text-[13.5px] font-bold">{m === "Text" ? "Type your answers" : "Talk it through"}</span>
                      <span className="block text-xs text-ink-3">{m === "Text" ? "3 questions · about 10 min · 4 tokens" : "Like a phone screen · 2 tokens a minute"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="primary"
              className="self-start"
              icon={<Play className="size-4" />}
              onClick={() => {
                spend(mode === "Text" ? 4 : 6)
                setLive(true)
              }}
            >
              Start
            </Button>
          </Card>
        ) : mode === "Text" ? (
          <TextSession
            job={job}
            onEnd={(score, notes) => {
              addInterview({ jobId: job?.id, title: job ? `${job.company} · ${job.title}` : "Backend engineer interview", mode: "Text", score, notes })
              setLive(false)
              setUi({ careerJob: undefined })
            }}
          />
        ) : (
          <VoiceSession
            job={job}
            onEnd={(score, notes) => {
              addInterview({ jobId: job?.id, title: job ? `${job.company} · ${job.title}` : "Backend engineer interview", mode: "Voice", score, notes })
              setLive(false)
            }}
          />
        )}
      </div>
      <aside className="flex flex-col gap-3">
        <p className="eyebrow px-1">Your practice so far</p>
        {s.interviews.length === 0 && <p className="text-sm text-ink-3">Your sessions and scores appear here.</p>}
        {s.interviews.map((i) => (
          <Card key={i.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{i.title}</span>
                <span className="text-xs text-ink-3">
                  {i.mode} · {ago(i.at)}
                </span>
              </span>
              <span className={cx("tabular rounded-full px-2.5 py-1 text-sm font-extrabold", i.score >= 80 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{i.score}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{i.notes}</p>
          </Card>
        ))}
        <button type="button" onClick={() => go("jobs")} className="flex items-center gap-1 px-1 text-xs font-semibold text-cobalt hover:underline">
          Got an interview? Mark it on the job card <ArrowRight className="size-3" />
        </button>
      </aside>
    </div>
  )
}

function TextSession({ job, onEnd }: { job?: Job; onEnd: (score: number, notes: string) => void }) {
  const qs = useMemo(() => questionsFor(job), [job])
  const [i, setI] = useState(0)
  const [answer, setAnswer] = useState("")
  const [log, setLog] = useState<{ q: string; a: string; score: number; fb: string }[]>([])
  const [thinking, setThinking] = useState(false)
  const done = log.length === qs.length
  const total = done ? Math.round(log.reduce((n, x) => n + x.score, 0) / log.length) : 0
  const submit = () => {
    setThinking(true)
    setTimeout(() => {
      const words = answer.trim().split(/\s+/).length
      const hasNum = /\d/.test(answer)
      const score = Math.min(95, 55 + Math.min(25, words / 3) + (hasNum ? 12 : 0))
      const fb = words < 25 ? "Too short to judge. Give one real example with what you did and what happened." : hasNum ? "Good: concrete and measured. Say the trade-off you chose against, too." : "Clear story. Add a number (traffic, latency, time saved) to make it stick."
      setLog([...log, { q: qs[i].q, a: answer, score: Math.round(score), fb }])
      setAnswer("")
      setI(i + 1)
      setThinking(false)
    }, 900)
  }
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Chip tone="brand">{job ? `${job.company} interview` : "General interview"}</Chip>
        <span className="tabular ml-auto text-xs text-ink-3">{done ? "Finished" : `Question ${i + 1} of ${qs.length}`}</span>
      </div>
      {log.map((x, k) => (
        <div key={k} className="flex flex-col gap-2 rounded-2xl bg-paper p-4 text-[13px]">
          <p className="font-bold">{x.q}</p>
          <p className="text-ink-2">{x.a}</p>
          <p className="flex items-start gap-2 text-ink-2">
            <span className={cx("tabular rounded-full px-2 py-0.5 text-xs font-bold", x.score >= 80 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{x.score}</span>
            {x.fb}
          </p>
        </div>
      ))}
      {!done ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold">{qs[i].q}</p>
          <p className="text-xs text-ink-3">Tip: {qs[i].tip}</p>
          <textarea id="iv-answer" aria-label="Your answer" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer as you'd say it…" className={cx(inputCls, "h-auto py-3")} />
          <div className="flex gap-2">
            <Button variant="primary" onClick={submit} disabled={!answer.trim()} busy={thinking}>
              Send answer
            </Button>
            <Button variant="ghost" onClick={() => setAnswer("At Swvl our booking API hit 3k requests per second at peak. Latency spiked when Postgres connections ran out, so I added PgBouncer and a Redis cache for seat maps, which cut p95 from 900ms to 380ms.")}>
              Fill an example answer
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-success-soft/60 p-4">
          <p className="text-[15px] font-bold">
            Score {total}/100. {total >= 80 ? "You're ready for this one." : "One more round would help."}
          </p>
          <p className="text-[13px] text-ink-2">Saved to your practice history. Plato uses your weak spots to pick next time's questions.</p>
          <Button variant="primary" className="self-start" onClick={() => onEnd(total, log.find((x) => x.score < 80)?.fb ?? "Concrete, measured answers throughout.")}>
            Done
          </Button>
        </div>
      )}
    </Card>
  )
}

function VoiceSession({ job, onEnd }: { job?: Job; onEnd: (score: number, notes: string) => void }) {
  const qs = useMemo(() => questionsFor(job), [job])
  const [turn, setTurn] = useState(0)
  const [speaking, setSpeaking] = useState<"plato" | "you">("plato")
  const lines = qs.slice(0, turn + 1)
  return (
    <Card className="flex flex-col items-center gap-5 p-6 text-center">
      <Chip tone="violet">Voice is simulated in this prototype: no microphone is used</Chip>
      <div className={cx("bg-brand flex size-28 items-center justify-center rounded-full text-white transition-transform", speaking === "plato" && "scale-105")}>
        <span className="wave flex h-10 items-center gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} style={{ height: 36, animationDelay: `${k * 0.12}s`, background: "white" }} />
          ))}
        </span>
      </div>
      <p className="text-[13px] font-semibold text-ink-3">{speaking === "plato" ? "Plato is asking…" : "Listening to you…"}</p>
      <div className="flex w-full max-w-lg flex-col gap-2 text-left text-[13.5px]">
        {lines.map((x, k) => (
          <p key={k} className="rounded-2xl bg-paper px-4 py-2.5">
            <b className="text-cobalt">Plato: </b>
            {x.q}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {speaking === "plato" ? (
          <Button variant="primary" icon={<Mic className="size-4" />} onClick={() => setSpeaking("you")}>
            Answer
          </Button>
        ) : turn < qs.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => {
              setTurn(turn + 1)
              setSpeaking("plato")
            }}
          >
            I'm done answering
          </Button>
        ) : (
          <Button variant="primary" onClick={() => onEnd(78, "Natural and clear. You rushed the retry question: slow down and name idempotency keys first.")}>
            Finish and score
          </Button>
        )}
        <Button variant="ghost" icon={<Square className="size-3.5" />} onClick={() => onEnd(70, "Ended early.")}>
          End
        </Button>
      </div>
    </Card>
  )
}

/* ---------------- Skills ---------------- */

function SkillsGap() {
  const { s, setCourse, go } = useStore()
  const { visible } = useDerived()
  const gaps = useMemo(() => {
    const count: Record<string, number> = {}
    visible.forEach((j) => j.missing.filter((m) => !/years|experience/i.test(m)).forEach((m) => (count[m] = (count[m] ?? 0) + 1)))
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([skill, n]) => ({ skill, n, pct: Math.round((n / Math.max(1, visible.length)) * 100) }))
  }, [visible])
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-[17px] font-bold">What your matches ask for that you don't have</h2>
          <p className="text-[13px] text-ink-3">Counted across the {visible.length} jobs on your board.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {gaps.map((g) => (
            <li key={g.skill} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[13.5px] font-bold">{g.skill}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-divider">
                <span className="block h-full rounded-full bg-warning" style={{ width: `${Math.max(8, g.pct * 3)}%` }} />
              </span>
              <span className="tabular w-16 text-right text-xs text-ink-3">
                {g.n} job{g.n > 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-3">Adding one of these to Me raises your match on those jobs right away.</p>
      </Card>
      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-[17px] font-bold">Close the gap</h2>
        {s.courses.map((c) => (
          <div key={c.name} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-soft text-cobalt">
              <Sparkles className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold">{c.name}</span>
              <span className="block text-xs text-ink-3">
                {c.skill} · {c.provider} · {c.hours} h
              </span>
            </span>
            {c.state === "todo" && (
              <Button size="sm" onClick={() => setCourse(c.name, "taking")}>
                I'm taking it
              </Button>
            )}
            {c.state === "taking" && (
              <Button size="sm" variant="soft" onClick={() => setCourse(c.name, "done")}>
                I finished it
              </Button>
            )}
            {c.state === "done" && <Chip tone="good">On your profile</Chip>}
          </div>
        ))}
        <button type="button" onClick={() => go("me", { meSection: "skills" })} className="flex items-center gap-1 self-start text-xs font-semibold text-cobalt hover:underline">
          See all your skills in Me <ArrowRight className="size-3" />
        </button>
      </Card>
    </div>
  )
}
