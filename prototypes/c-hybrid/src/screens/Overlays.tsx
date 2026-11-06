import { useState } from "react"
import { Bookmark, Check, Coins, ExternalLink, EyeOff, FileText, Hand, MessageCircle, Mic, Puzzle, Sparkles, X } from "lucide-react"
import { ago, useStore } from "../store"
import { jobOf, label, money, P } from "../engine"
import { stageOf } from "../derive"
import { Button, Chip, CompanyTile, Drawer, IconBtn, MatchPill, Modal, Toggle } from "../ui"
import { ResumeDoc } from "./Cards"
import type { Job } from "../types"

export function JobDrawer() {
  const { s, ui, patchUi, askPlato, setJob, answer, markSubmitted } = useStore()
  const j = jobOf(s, ui.openJob)
  const close = () => patchUi({ openJob: undefined })
  return (
    <Drawer open={!!j} onClose={close} label={j ? label(j) : "Job"}>
      {j && (
        <>
          <div className="flex items-start gap-3 border-b border-divider px-5 py-4">
            <CompanyTile job={j} size={46} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-2">{j.company}</p>
              <h2 className="text-[19px] leading-snug font-extrabold">{j.title}</h2>
              <p className="text-xs text-ink-3">
                {j.location} · {j.setup} · posted {j.postedDays}d ago · via {j.source}
              </p>
            </div>
            <IconBtn label="Close" onClick={close}>
              <X className="size-5" />
            </IconBtn>
          </div>
          <Body j={j} answer={answer} markSubmitted={markSubmitted} />
          {(stageOf(s, j.id) === "new" || stageOf(s, j.id) === "saved") && (
            <div className="flex flex-wrap items-center gap-2 border-t border-divider bg-tint/70 px-5 py-3.5">
              <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => patchUi({ applyIds: [j.id], openJob: undefined })}>
                Apply with Plato
              </Button>
              <Button variant="soft" icon={<MessageCircle className="size-4" />} onClick={() => askPlato({ key: `job:${j.id}`, values: ["more"], show: `Should I apply to ${j.company}?` })}>
                Ask Plato
              </Button>
              <span className="flex-1" />
              <IconBtn label="Save" onClick={() => setJob(j.id, "saved")}>
                <Bookmark className="size-5" />
              </IconBtn>
              <IconBtn label="Not interested" onClick={() => (setJob(j.id, "hidden"), close())}>
                <EyeOff className="size-5" />
              </IconBtn>
            </div>
          )}
        </>
      )}
    </Drawer>
  )
}

function Body({ j, answer, markSubmitted }: { j: Job; answer: (id: string, v: string) => void; markSubmitted: (id: string) => void }) {
  const { s, askPlato } = useStore()
  const a = s.apps.find((x) => x.jobId === j.id)
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
      {a?.status === "needs" && a.ask && (
        <section className="flex flex-col gap-2 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-warning">
            <Hand className="size-4" /> {j.company}'s form asks your {a.ask.question}
          </p>
          <p className="text-xs text-ink-2">Plato saves your answer for every future form. You can also answer in the chat.</p>
          <div className="flex flex-wrap gap-1.5">
            {a.ask.options.map((o) => (
              <Button key={o} size="sm" onClick={() => answer(j.id, o)}>
                {o}
              </Button>
            ))}
          </div>
        </section>
      )}
      {a?.status === "manual" && (
        <section className="flex flex-col gap-2 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4 text-[13px]">
          <p className="font-bold text-warning">{j.source} only accepts applications from you</p>
          <p className="text-ink-2">Plato prepared every answer: tailored resume, years of experience, expected salary, notice period, and why you want this job.</p>
          <div className="flex gap-2">
            <a href="https://example.com" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold">
              Open on {j.source} <ExternalLink className="size-4" />
            </a>
            <Button variant="primary" onClick={() => markSubmitted(j.id)}>
              I submitted it
            </Button>
          </div>
        </section>
      )}
      {a && a.status !== "manual" && (
        <section className="flex flex-col gap-2">
          <p className="eyebrow">What Plato did</p>
          <ol className="flex flex-col gap-1.5 border-l-2 border-divider pl-4 text-[13px] text-ink-2">
            {[...a.events].reverse().map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ol>
          {a.status === "submitted" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Chip tone="good">
                <Check className="size-3" /> Applied {a.appliedAt ? ago(a.appliedAt) : ""}
              </Chip>
              <Button size="sm" variant="soft" icon={<Mic className="size-3.5" />} onClick={() => askPlato({ text: `Practice the interview for ${j.company}` })}>
                Practice its interview
              </Button>
            </div>
          )}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MatchPill m={j.match} big />
          <p className="text-sm font-bold">Why it fits you</p>
        </div>
        {j.why.map((w) => (
          <p key={w} className="flex gap-2 text-[13.5px]">
            <Check className="mt-0.5 size-4 shrink-0 text-success" /> {w}
          </p>
        ))}
        {j.watch.map((w) => (
          <p key={w} className="flex gap-2 text-[13.5px] text-ink-2">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning">!</span> {w}
          </p>
        ))}
        {j.salary && (
          <p className="text-[13.5px]">
            Pays <b>{money(P(s), j.salary)}</b> a month
          </p>
        )}
      </section>
      <p className="text-[13.5px] leading-relaxed text-ink-2">{j.about}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => askPlato({ text: `Build my resume for ${j.company}` })} className="flex items-start gap-3 rounded-2xl border border-line p-3 text-left hover:bg-tint">
          <FileText className="mt-0.5 size-4 text-cobalt" />
          <span>
            <span className="block text-[13px] font-bold">Write a resume for this job</span>
            <span className="block text-xs text-ink-3">Plato asks one question, then writes it</span>
          </span>
        </button>
        <button type="button" onClick={() => askPlato({ text: `Practice the interview for ${j.company}` })} className="flex items-start gap-3 rounded-2xl border border-line p-3 text-left hover:bg-tint">
          <Mic className="mt-0.5 size-4 text-cobalt" />
          <span>
            <span className="block text-[13px] font-bold">Practice its interview</span>
            <span className="block text-xs text-ink-3">Questions written from this posting</span>
          </span>
        </button>
      </div>
    </div>
  )
}

export function ApplyModal() {
  const { s, ui, patchUi, applyDirect } = useStore()
  const [tailor, setTailor] = useState(true)
  const jobs = (ui.applyIds ?? []).map((id) => jobOf(s, id)).filter((j): j is Job => !!j)
  const groups = [
    { t: "Plato applies for you", sub: "Fills the form, attaches your resume, submits, keeps proof", icon: <Sparkles className="size-4 text-cobalt" />, jobs: jobs.filter((j) => j.route === "plato") },
    { t: "Plato applies in your browser", sub: "Sites that block bots: Plato for Chrome fills them where you're signed in", icon: <Puzzle className="size-4 text-violet" />, jobs: jobs.filter((j) => j.route === "chrome") },
    { t: "You submit these yourself", sub: "The site only takes people. Plato prepares every answer", icon: <Hand className="size-4 text-warning" />, jobs: jobs.filter((j) => j.route === "manual") },
  ].filter((g) => g.jobs.length)
  const cost = jobs.length * (tailor ? 3 : 2)
  const close = () => patchUi({ applyIds: undefined })
  return (
    <Modal
      open={jobs.length > 0}
      onClose={close}
      title={jobs.length === 1 ? `Apply to ${jobs[0].company}?` : `Apply to ${jobs.length} jobs?`}
      sub="Here's what happens to each one. Nothing is sent until you confirm. Plato posts the progress in your chat too."
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-[13px] text-ink-2">
            <Coins className="size-4 text-warning" /> <b className="tabular">{cost}</b> tokens · you have {s.tokens}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => applyDirect(jobs.map((j) => j.id), tailor)}>
            {jobs.length === 1 ? "Apply" : `Apply to ${jobs.length}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.t} className="flex flex-col gap-2">
            <p className="flex items-start gap-2 text-sm font-bold">
              {g.icon}
              <span>
                {g.t} · {g.jobs.length}
                <span className="block text-xs font-normal text-ink-3">{g.sub}</span>
              </span>
            </p>
            <ul className="flex flex-col divide-y divide-divider rounded-2xl border border-line">
              {g.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-3 py-2.5">
                  <CompanyTile job={j} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label(j)}</span>
                  <MatchPill m={j.match} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <label className="flex items-start gap-3 rounded-2xl bg-tint p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold">Write a resume for each job</span>
            <span className="block text-xs text-ink-3">Same facts, reordered around each job's own words.</span>
          </span>
          <Toggle on={tailor} onChange={setTailor} label="Tailor resume per job" />
        </label>
      </div>
    </Modal>
  )
}

export function ResumeViewer() {
  const { s, ui, patchUi, askPlato } = useStore()
  const open = !!ui.resume
  const jobId = ui.resume?.jobId
  const r = s.resumes.find((x) => x.jobId === jobId)
  const j = jobOf(s, jobId)
  return (
    <Modal
      open={open}
      onClose={() => patchUi({ resume: undefined })}
      wide
      title={j ? `Resume for ${j.company}` : "Your resume"}
      sub={r ? `Version ${r.version} · ${r.approved ? "approved, Plato sends this one" : "not approved yet"}` : undefined}
      footer={
        <Button variant="soft" icon={<Sparkles className="size-4" />} onClick={() => (patchUi({ resume: undefined }), askPlato({ text: j ? `Build my resume for ${j.company}` : "Build my resume" }))}>
          Change it with Plato
        </Button>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-line">
        <ResumeDoc jobId={jobId} version={r?.version} focus={r?.focus} full />
      </div>
    </Modal>
  )
}
