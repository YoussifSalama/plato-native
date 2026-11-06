import { useState } from "react"
import { Award, Check, ChevronRight, Coins, FileText, GraduationCap, Loader2, Mic, Sparkles, Upload } from "lucide-react"
import { ago, STEPS, useStore } from "../store"
import { jobOf, label, P } from "../engine"
import { readiness, stageOf } from "../derive"
import { Button, Card, Chip, CompanyTile, cx, Field, inputCls, Steps } from "../ui"

/* ---------------- Career: the page lists what exists; Plato does the work ---------------- */

export function Career() {
  const { s, askPlato, patchUi } = useStore()
  const p = P(s)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">Career</h1>
        <p className="text-[13.5px] text-ink-2">Your resumes, interview practice and skills. Start anything here and Plato walks you through it.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <Head icon={<FileText className="size-5" />} title="Resumes" sub="One per job. You approve before Plato sends it." />
          {s.resumes.map((r) => {
            const j = jobOf(s, r.jobId)
            return (
              <button key={r.id} type="button" onClick={() => patchUi({ resume: { jobId: r.jobId } })} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-left hover:bg-tint">
                {j ? <CompanyTile job={j} size={30} /> : <FileText className="size-5 text-ink-3" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{j ? label(j) : "Main resume"}</span>
                  <span className="text-xs text-ink-3">Version {r.version}</span>
                </span>
                <Chip tone={r.approved ? "good" : "warn"}>{r.approved ? "Approved" : "Review"}</Chip>
              </button>
            )
          })}
          <Button variant="soft" className="mt-auto self-start" icon={<Sparkles className="size-4" />} onClick={() => askPlato({ mode: "resume" })}>
            Write a resume with Plato
          </Button>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <Head icon={<Mic className="size-5" />} title="Interview practice" sub="Text or voice. Every session scored and kept." />
          {s.interviews.map((i, k) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{i.title}</span>
                <span className="text-xs text-ink-3">{ago(i.at)}</span>
              </span>
              <span className={cx("tabular rounded-full px-2.5 py-0.5 text-sm font-extrabold", i.score >= 75 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{i.score}</span>
            </div>
          ))}
          {!s.interviews.length && <p className="text-sm text-ink-3">No practice yet.</p>}
          <Button variant="soft" className="mt-auto self-start" icon={<Sparkles className="size-4" />} onClick={() => askPlato({ mode: "interview" })}>
            Practice with Plato
          </Button>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <Head icon={<GraduationCap className="size-5" />} title="Skills" sub="What your matches ask for that your CV doesn't show yet." />
          {p.gaps.map((g) => {
            const has = s.proven.find((x) => x.skill === g.skill)
            return (
              <div key={g.skill} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold">{g.skill}</span>
                  <span className="text-xs text-ink-3">
                    {g.jobs} of your jobs ask for it · {g.hours} h course
                  </span>
                </span>
                {has?.level === "Proven" ? (
                  <Chip tone="good">
                    <Award className="size-3" /> Proven
                  </Chip>
                ) : (
                  <Button size="sm" variant={has ? "soft" : "secondary"} onClick={() => askPlato({ text: `I want to prove ${g.skill}` })}>
                    {has ? "Take the check" : "Learn & prove"}
                  </Button>
                )}
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}

function Head({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-soft text-cobalt">{icon}</span>
      <div>
        <h2 className="text-[16px] font-bold">{title}</h2>
        <p className="text-xs text-ink-3">{sub}</p>
      </div>
    </div>
  )
}

/* ---------------- Me: edit directly, or just tell Plato ---------------- */

export function Me() {
  const { s, setFact, askPlato, toast } = useStore()
  const p = P(s)
  const r = readiness(s)
  const [f, setF] = useState(s.facts)
  const dirty = JSON.stringify(f) !== JSON.stringify(s.facts)
  const last = s.searches[s.searches.length - 1]?.params
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <span className="bg-brand flex size-16 items-center justify-center rounded-[22px] text-xl font-extrabold text-white">{p.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{p.name}</h1>
          <p className="text-[13.5px] text-ink-2">
            {p.headline} · {p.years} years · {p.city}
          </p>
        </div>
      </div>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-[16px] font-bold">{r.done === r.total ? "Plato can apply without asking you" : `Ready to apply · ${r.pct}%`}</h2>
          <span className="text-xs text-ink-3">Edit fields here, or tell Plato in your own words</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-divider">
          <div className="bg-brand h-full rounded-full transition-all duration-700" style={{ width: `${r.pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {r.items.map((i) => (
            <span key={i.key} className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", i.done ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              {i.done ? <Check className="size-3" /> : "!"} {i.label}
            </span>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-[16px] font-bold">CV & experience</h2>
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <FileText className="size-5 text-danger" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.cv}</span>
            <button type="button" onClick={() => toast("In the real app this opens a file picker; Plato re-reads it and keeps your edits")} className="flex items-center gap-1 text-xs font-semibold text-cobalt">
              <Upload className="size-3.5" /> Replace
            </button>
          </div>
          {p.experience.map((e) => (
            <p key={e.company} className="text-[13px]">
              <b>
                {e.title}, {e.company}
              </b>{" "}
              <span className="text-ink-3">{e.years}</span>
              <span className="block text-ink-2">{e.did}</span>
            </p>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {p.skills.map((k) => (
              <Chip key={k} tone="brand">
                {k}
              </Chip>
            ))}
            {s.proven.map((k) => (
              <Chip key={k.skill} tone={k.level === "Proven" ? "good" : "violet"}>
                {k.skill} · {k.level === "Proven" ? "proven" : "learning"}
              </Chip>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-[16px] font-bold">Details every form asks</h2>
          <Field label="Notice period" id="me-notice" hint={!s.facts.notice ? "Missing. Plato will ask the first time a form needs it." : undefined}>
            <input id="me-notice" value={f.notice} placeholder="e.g. 1 month" onChange={(e) => setF({ ...f, notice: e.target.value })} className={cx(inputCls, !f.notice && "border-warning/50 bg-warning-soft/30")} />
          </Field>
          <Field label="Work authorization" id="me-auth">
            <input id="me-auth" value={f.workAuth} onChange={(e) => setF({ ...f, workAuth: e.target.value })} className={inputCls} />
          </Field>
          <Field label="LinkedIn" id="me-li">
            <input id="me-li" value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} className={inputCls} />
          </Field>
          {dirty && (
            <Button variant="primary" size="sm" className="self-start" onClick={() => (["notice", "workAuth", "linkedin"] as const).forEach((k) => f[k] !== s.facts[k] && setFact(k, f[k]))}>
              Save changes
            </Button>
          )}
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-[16px] font-bold">What you're looking for</h2>
          {last ? (
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              <b className="text-ink">{last.role}</b> jobs in <b className="text-ink">{last.where.join(", ")}</b>
              {last.setup && last.setup !== "Any" ? `, ${last.setup.toLowerCase()}` : ""}
              {last.salary && last.salary !== "Any" ? `, ${last.salary} a month` : ""}.
            </p>
          ) : (
            <p className="text-sm text-ink-3">Plato learns this from your first search.</p>
          )}
          <Button variant="soft" size="sm" className="self-start" icon={<Sparkles className="size-3.5" />} onClick={() => askPlato({ mode: "search" })}>
            Change it with Plato
          </Button>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-[16px] font-bold">Plan & tokens</h2>
          <p className="flex items-center gap-2 text-[13.5px]">
            <Coins className="size-4 text-warning" /> <b className="tabular">{s.tokens.toLocaleString()}</b> of 1,000 left this month · Free plan
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-divider">
            <div className="bg-brand h-full rounded-full" style={{ width: `${(s.tokens / 1000) * 100}%` }} />
          </div>
          <p className="text-xs text-ink-3">An application costs 2–3 tokens, a search 5, an interview session 4.</p>
          <Button size="sm" className="self-start" onClick={() => toast("Plans and checkout aren't part of this prototype")}>
            See plans
          </Button>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- Today: the side of the Plato home page ---------------- */

export function TodayPanel() {
  const { s, go, patchUi, answer } = useStore()
  const needs = s.apps.filter((a) => a.status === "needs" || a.status === "manual")
  const working = s.apps.find((a) => a.status === "working")
  const running = s.searches.filter((x) => !x.done)
  const ids = [...new Set([...s.searches.flatMap((x) => x.results), ...s.apps.map((a) => a.jobId), ...s.saved])]
  const counts = { new: 0, saved: 0, applying: 0, needs: 0, applied: 0 } as Record<string, number>
  ids.forEach((id) => {
    const st = stageOf(s, id)
    if (st in counts) counts[st]++
  })
  return (
    <aside className="scroll-thin hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto py-6 pr-6 xl:flex" aria-label="Today">
      <p className="eyebrow">Today</p>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[14px] font-bold">
          Needs you {needs.length > 0 && <Chip tone="warn">{needs.length}</Chip>}
        </p>
        {needs.map((a) => {
          const j = jobOf(s, a.jobId)!
          return (
            <div key={a.jobId} className="flex flex-col gap-2 rounded-xl bg-warning-soft/50 p-2.5">
              <button type="button" onClick={() => patchUi({ openJob: j.id })} className="flex items-center gap-2.5 text-left">
                <CompanyTile job={j} size={28} />
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <b>{j.company}</b> <span className="text-ink-2">{a.status === "needs" ? `asks your ${a.ask?.question}` : "only takes it from you"}</span>
                </span>
              </button>
              {a.status === "needs" && a.ask && (
                <div className="flex flex-wrap gap-1">
                  {a.ask.options.map((o) => (
                    <button key={o} type="button" onClick={() => answer(j.id, o)} className="rounded-full border border-warning/40 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-warning">
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {!needs.length && <p className="text-[13px] text-ink-3">Nothing. Plato tells you here and in the chat.</p>}
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <span className={cx("size-2 rounded-full", working || running.length ? "pulse-dot bg-success" : "bg-mist")} /> Plato right now
        </p>
        {working ? (
          <button type="button" onClick={() => patchUi({ openJob: working.jobId })} className="flex flex-col gap-2 rounded-xl bg-violet-soft/60 p-2.5 text-left">
            <span className="flex items-center gap-2 text-[12.5px] font-bold">
              <Loader2 className="size-3.5 animate-spin text-violet" /> Applying to {jobOf(s, working.jobId)?.company}
            </span>
            <Steps step={working.step} compact />
            <span className="text-[11.5px] text-violet">{STEPS[Math.min(working.step, 4)]}</span>
          </button>
        ) : (
          <p className="text-[13px] text-ink-3">Not applying to anything right now.</p>
        )}
        {running.map((x) => (
          <p key={x.id} className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Loader2 className="size-3.5 animate-spin text-cobalt" /> Searching · {x.boards.filter((b) => b.state === "done").length}/{x.boards.length} sources
          </p>
        ))}
      </Card>
      <Card className="flex flex-col gap-1 p-2">
        <p className="px-2.5 pt-2 pb-1 text-[14px] font-bold">Your board</p>
        {[
          ["new", "New matches", "bg-cobalt"],
          ["saved", "Saved", "bg-azure"],
          ["applying", "Plato applying", "bg-violet"],
          ["needs", "Needs you", "bg-warning"],
          ["applied", "Applied", "bg-success"],
        ].map(([k, l, dot]) => (
          <button key={k} type="button" onClick={() => go("jobs", { copilot: true })} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] hover:bg-tint">
            <span className={cx("size-2 rounded-full", dot)} />
            <span className="flex-1 text-left text-ink-2">{l}</span>
            <b className="tabular">{counts[k]}</b>
            <ChevronRight className="size-3.5 text-mist" />
          </button>
        ))}
      </Card>
    </aside>
  )
}
