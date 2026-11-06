import { useState } from "react"
import { Bookmark, BookmarkCheck, Check, ExternalLink, EyeOff, FileText, Hand, Loader2, MessageSquareText, Mic, PartyPopper, Puzzle, ShieldCheck, Sparkles, X } from "lucide-react"
import { ago, COST, STEPS, useStore } from "../store"
import { Button, CheckRow, Chip, CompanyTile, cx, Drawer, IconBtn, inputCls, MatchPill, matchTone, money, Steps } from "../ui"
import type { Job } from "../types"

export function JobDrawer() {
  const { s, ui, openJob } = useStore()
  const job = s.jobs.find((j) => j.id === ui.openJob)
  return (
    <Drawer open={!!job} onClose={() => openJob(undefined)} label={job ? `${job.title} at ${job.company}` : "Job"}>
      {job && <Body job={job} />}
    </Drawer>
  )
}

function Body({ job: j }: { job: Job }) {
  const { openJob, move, setUi, go, markInterview, applyAnyway } = useStore()
  const a = j.app
  const t = matchTone(j.match)
  return (
    <>
      <div className="flex items-start gap-3 border-b border-divider px-5 py-4">
        <CompanyTile job={j} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-2">{j.company}</p>
          <h2 className="text-[19px] leading-snug font-extrabold">{j.title}</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {j.location} · {j.setup} · Posted {j.postedDays === 1 ? "yesterday" : `${j.postedDays} days ago`} · via {j.source}
          </p>
        </div>
        <IconBtn label="Close" onClick={() => openJob(undefined)}>
          <X className="size-5" />
        </IconBtn>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* Where this job is in the pipeline */}
        {j.stage === "needs" && a?.need && <NeedPanel job={j} />}
        {j.stage === "applying" && a && (
          <section className="flex flex-col gap-3 rounded-2xl border border-violet/20 bg-violet-soft/60 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-violet">
              {a.status === "working" ? <Loader2 className="size-4 animate-spin" /> : null}
              {a.status === "working" ? `Plato is applying · ${STEPS[Math.min(a.step, 4)]}` : "In line. Plato applies to one job at a time"}
            </p>
            <Steps step={a.step} />
            <div className="grid grid-cols-5 gap-1 text-[10.5px] text-ink-3">
              {STEPS.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </section>
        )}
        {j.stage === "applied" && a && (
          <section className="flex flex-col gap-3 rounded-2xl border border-success/20 bg-success-soft/60 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-success">
              <Check className="size-4" /> Applied {a.appliedAt ? ago(a.appliedAt) : ""}. {j.source} confirmed it.
            </p>
            {a.interview ? (
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="violet">
                  <PartyPopper className="size-3" /> You got an interview
                </Chip>
                <Button size="sm" variant="primary" icon={<Mic className="size-3.5" />} onClick={() => go("career", { careerTab: "interview", careerJob: j.id })}>
                  Practice for this interview
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                Heard back?
                <Button size="sm" onClick={() => markInterview(j.id)}>
                  I got an interview
                </Button>
              </div>
            )}
          </section>
        )}
        {j.stage === "closed" && a && (
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-paper p-4 text-[13px] text-ink-2">
            <p>{a.reason}</p>
            {a.status === "skipped" && (
              <Button size="sm" className="self-start" onClick={() => applyAnyway(j.id)}>
                Apply anyway
              </Button>
            )}
            {a.events[0]?.text.includes("not interested") && (
              <Button size="sm" className="self-start" onClick={() => move(j.id, "new")}>
                Show it again
              </Button>
            )}
          </section>
        )}

        {/* Fit */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <MatchPill m={j.match} big />
            <div>
              <p className="text-sm font-bold">{t.label} match for you</p>
              <p className="text-xs text-ink-3">Compared with your CV, skills and what you're looking for</p>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {j.checks.map((c) => (
              <CheckRow key={c.text} state={c.state}>
                {c.text}
              </CheckRow>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            {j.matched.map((m) => (
              <Chip key={m} tone="good">
                <Check className="size-3" /> {m}
              </Chip>
            ))}
            {j.missing.map((m) => (
              <Chip key={m} tone="warn">
                {m}
              </Chip>
            ))}
          </div>
          {j.salary && (
            <p className="tabular text-[13px] text-ink-2">
              Pays <b className="text-ink">{money(j.salary[0])}–{money(j.salary[1])}</b> a month. You asked for $4.5k–$7k.
            </p>
          )}
        </section>

        {/* What Plato did */}
        {a && a.events.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="eyebrow">What Plato did</h3>
            <ol className="flex flex-col gap-2.5 border-l-2 border-divider pl-4">
              {[...a.events].reverse().map((e, i) => (
                <li key={i} className="relative text-[13px]">
                  <span className={cx("absolute top-1.5 -left-[21px] size-2 rounded-full", i === 0 ? "bg-cobalt" : "bg-mist")} />
                  <span className="text-ink-2">{e.text}</span>
                  <span className="block text-[11px] text-ink-3">{ago(e.at)}</span>
                </li>
              ))}
            </ol>
            {a.answers && (
              <div className="rounded-xl bg-paper p-3 text-[12.5px]">
                <p className="mb-1.5 font-semibold">Answers you gave for this application</p>
                {a.answers.map((x) => (
                  <p key={x.q} className="text-ink-2">
                    {x.q} <b className="text-ink">{x.a}</b>
                  </p>
                ))}
              </div>
            )}
            {j.stage === "applied" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => go("career", { careerTab: "resume", careerJob: j.id })}>
                  Resume Plato sent
                </Button>
                <ProofButton job={j} />
              </div>
            )}
          </section>
        )}

        {/* The posting */}
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">About the job</h3>
          <p className="text-[13.5px] leading-relaxed text-ink-2">{j.about}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-relaxed text-ink-2">
            {j.duties.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <a href="https://example.com" target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 self-start text-[13px] font-semibold text-cobalt hover:underline">
            Original posting on {j.source} <ExternalLink className="size-3.5" />
          </a>
        </section>

        {/* Prepare */}
        {(j.stage === "new" || j.stage === "saved" || j.stage === "applying") && (
          <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => go("career", { careerTab: "resume", careerJob: j.id })} className="flex items-start gap-3 rounded-2xl border border-line p-3 text-left hover:border-brand-line hover:bg-tint">
              <FileText className="mt-0.5 size-4 text-cobalt" />
              <span>
                <span className="block text-[13px] font-bold">See the resume for this job</span>
                <span className="block text-xs text-ink-3">Plato rewrites yours around its keywords</span>
              </span>
            </button>
            <button type="button" onClick={() => go("career", { careerTab: "interview", careerJob: j.id })} className="flex items-start gap-3 rounded-2xl border border-line p-3 text-left hover:border-brand-line hover:bg-tint">
              <MessageSquareText className="mt-0.5 size-4 text-cobalt" />
              <span>
                <span className="block text-[13px] font-bold">Practice its interview</span>
                <span className="block text-xs text-ink-3">Questions written from this posting</span>
              </span>
            </button>
          </section>
        )}
      </div>

      {(j.stage === "new" || j.stage === "saved") && (
        <div className="flex flex-wrap items-center gap-2 border-t border-divider bg-tint/70 px-5 py-3.5">
          <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => setUi({ applyIds: [j.id] })}>
            Apply with Plato
          </Button>
          <span className="text-xs text-ink-3">~{COST.tailored} tokens</span>
          <span className="flex-1" />
          <IconBtn label={j.stage === "saved" ? "Unsave" : "Save"} onClick={() => move(j.id, j.stage === "saved" ? "new" : "saved")}>
            {j.stage === "saved" ? <BookmarkCheck className="size-5 text-azure" /> : <Bookmark className="size-5" />}
          </IconBtn>
          <IconBtn
            label="Not interested"
            onClick={() => {
              move(j.id, "closed")
              openJob(undefined)
            }}
          >
            <EyeOff className="size-5" />
          </IconBtn>
        </div>
      )}
    </>
  )
}

function ProofButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" icon={<ShieldCheck className="size-3.5" />} onClick={() => setOpen(!open)}>
        {open ? "Hide proof" : "Proof of submission"}
      </Button>
      {open && (
        <div className="anim-rise w-full overflow-hidden rounded-xl border border-line">
          <div className="flex items-center gap-1.5 border-b border-divider bg-paper px-3 py-2">
            <span className="size-2 rounded-full bg-danger/60" />
            <span className="size-2 rounded-full bg-warning/60" />
            <span className="size-2 rounded-full bg-success/60" />
            <span className="ml-2 truncate font-mono text-[11px] text-ink-3">{job.source.toLowerCase().replace(" ", "")}.com/{job.company.toLowerCase().replace(/\W/g, "")}/apply</span>
          </div>
          <div className="flex flex-col items-center gap-2 bg-white px-4 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" />
            </span>
            <p className="font-bold">Thank you for applying to {job.company}!</p>
            <p className="text-xs text-ink-3">Screenshot Plato took when the site confirmed. Example image in this prototype.</p>
          </div>
        </div>
      )}
    </>
  )
}

function NeedPanel({ job: j }: { job: Job }) {
  const { resolveNeed, s } = useStore()
  const need = j.app!.need!
  const [vals, setVals] = useState<Record<string, string>>(() => (need.kind === "questions" ? Object.fromEntries(need.questions.map((q) => [q.id, q.draft ?? ""])) : {}))
  const [opened, setOpened] = useState(false)
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-warning">
        <Hand className="size-4" /> Plato needs you to finish this one
      </p>
      {need.kind === "questions" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            resolveNeed(j.id, vals)
          }}
        >
          {need.questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1.5">
              {q.kind === "yesno" ? (
                <p id={`q-${j.id}-${q.id}-l`} className="text-[13px] font-semibold">
                  {q.label}
                </p>
              ) : (
                <label htmlFor={`q-${j.id}-${q.id}`} className="text-[13px] font-semibold">
                  {q.label}
                </label>
              )}
              {q.kind === "yesno" ? (
                <div className="flex gap-2" role="radiogroup" aria-labelledby={`q-${j.id}-${q.id}-l`}>
                  {["Yes", "No"].map((o) => (
                    <button key={o} type="button" role="radio" aria-checked={vals[q.id] === o} onClick={() => setVals({ ...vals, [q.id]: o })} className={cx("h-9 rounded-full border px-5 text-sm font-semibold", vals[q.id] === o ? "border-cobalt bg-cobalt text-white" : "border-line bg-white")}>
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <input id={`q-${j.id}-${q.id}`} inputMode={q.kind === "number" ? "numeric" : undefined} value={vals[q.id] ?? ""} onChange={(e) => setVals({ ...vals, [q.id]: e.target.value })} className={inputCls} />
              )}
              {q.hint && <span className="text-xs text-ink-3">{q.hint}</span>}
            </div>
          ))}
          <Button type="submit" variant="primary" className="self-start" disabled={need.questions.some((q) => !vals[q.id])}>
            Send answers and continue
          </Button>
        </form>
      )}
      {need.kind === "verify" && (
        <div className="flex flex-col gap-3 text-[13px] text-ink-2">
          <p>The form is filled and your resume is attached. {need.site} asks for a “Verify you are human” check, which Plato never solves for you. Open the page, tick the box, and Plato submits.</p>
          <div className="flex flex-wrap gap-2">
            <a href="https://example.com" target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">
              Open the filled form <ExternalLink className="size-4" />
            </a>
            <Button variant="primary" onClick={() => resolveNeed(j.id)}>
              {opened ? "I did the check" : "Done, submit it"}
            </Button>
          </div>
        </div>
      )}
      {need.kind === "manual" && (
        <div className="flex flex-col gap-3 text-[13px] text-ink-2">
          <p>{need.site} only accepts applications from you. Plato prepared everything, so copy it in and submit.</p>
          <div className="flex flex-col gap-1.5 rounded-xl bg-white p-3 text-[12.5px]">
            {[
              ["Resume", "Ahmed_Hassan_" + j.company.replace(/\W/g, "") + ".pdf (tailored)"],
              ["Years of experience", "5"],
              ["Expected salary", `$${s.profile.prefs.salaryMax.toLocaleString()} / month`],
              ["Notice period", s.profile.facts.notice || "30 days"],
              ["Why this role", `I've spent 5 years building Node.js payment and booking APIs at Swvl and Instabug. ${j.company}'s ${j.title} role is the same problem at bigger scale.`],
            ].map(([k, v]) => (
              <p key={k}>
                <span className="text-ink-3">{k}: </span>
                <b className="text-ink">{v}</b>
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://example.com" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold hover:bg-tint">
              Open on {need.site} <ExternalLink className="size-4" />
            </a>
            <Button variant="primary" onClick={() => resolveNeed(j.id)}>
              I submitted it
            </Button>
          </div>
        </div>
      )}
      {need.kind === "chrome" && (
        <div className="flex flex-col gap-3 text-[13px] text-ink-2">
          <p>{need.site} blocks automated browsers. Plato for Chrome fills the form inside your own browser, where you're already signed in. You link it once.</p>
          <ol className="flex flex-col gap-1.5 rounded-xl bg-white p-3 text-[12.5px]">
            <li>1. Install Plato for Chrome</li>
            <li>
              2. Enter this code in it: <b className="font-mono text-ink">K7Q-42M</b>
            </li>
            <li>3. Plato continues every job waiting on it</li>
          </ol>
          <Button variant="primary" className="self-start" icon={<Puzzle className="size-4" />} onClick={() => resolveNeed(j.id)}>
            I linked it, continue
          </Button>
        </div>
      )}
    </section>
  )
}
