import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Check, FileText, FlaskConical, Lock, Pencil, Upload } from "lucide-react"
import { useStore } from "../store"
import { seedProfile } from "../data"
import { NOTES } from "../notes"
import { Button, Card, cx, Field, inputCls, Logo, TagEditor } from "../ui"
import type { Profile, Setup } from "../types"

const STEPS = ["Create account", "Your CV", "Check what Plato understood", "What you want"]

export function Onboarding() {
  const { reset } = useStore()
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Profile>(() => ({ ...seedProfile(), facts: { ...seedProfile().facts, notice: "" } }))
  const [notes, setNotes] = useState(true)

  return (
    <div className="flex min-h-full flex-col" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
      <div className="backdrop" />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 py-5">
        <Logo />
        <span className="text-[17px] font-extrabold">Plato</span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setNotes(!notes)} className="flex h-8 items-center gap-1.5 rounded-full border border-dashed border-violet/40 bg-violet-soft/80 px-3 text-xs font-semibold text-violet">
            <FlaskConical className="size-3.5" /> {notes ? "Hide" : "Show"} design note
          </button>
          <button type="button" onClick={() => reset(true)} className="text-xs font-semibold text-ink-3 hover:text-ink">
            Skip to the app
          </button>
        </span>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 pb-16">
        {notes && (
          <div className="rounded-2xl border border-dashed border-violet/35 bg-violet-soft/70 px-4 py-3 text-[13px] text-ink-2">
            <p className="font-semibold text-violet">Design note · {NOTES.welcome.title}</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
              {NOTES.welcome.points.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {step > 0 && (
          <ol className="flex items-center gap-2" aria-label="Progress">
            {STEPS.slice(1).map((label, i) => {
              const n = i + 1
              return (
                <li key={label} className="flex flex-1 flex-col gap-1.5">
                  <span className={cx("h-1.5 rounded-full transition-colors", n <= step ? "bg-cobalt" : "bg-white")} />
                  <span className={cx("hidden text-xs font-semibold sm:block", n === step ? "text-cobalt" : "text-ink-3")}>
                    {n}. {label}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        {step === 0 && <Signup p={p} setP={setP} next={() => setStep(1)} />}
        {step === 1 && <CvStep next={() => setStep(2)} back={() => setStep(0)} />}
        {step === 2 && <Understood p={p} setP={setP} next={() => setStep(3)} back={() => setStep(1)} />}
        {step === 3 && <Wants p={p} setP={setP} back={() => setStep(2)} />}
      </main>
    </div>
  )
}

function Signup({ p, setP, next }: { p: Profile; setP: (p: Profile) => void; next: () => void }) {
  const [pw, setPw] = useState("")
  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-4">
        <h1 className="text-[36px] leading-[1.1] font-extrabold tracking-tight sm:text-[44px]">
          Plato finds the jobs, <span className="text-brand">and applies for you.</span>
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-2">Upload your CV once. Plato searches LinkedIn, Indeed, Google Jobs and company career pages, ranks every posting against you, and fills the applications you approve.</p>
        <ul className="flex flex-col gap-2 text-[14px] text-ink-2">
          {["About 3 minutes to set up", "Nothing is sent until you approve it", "Free plan: 1,000 tokens a month"].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <Check className="size-4 text-success" /> {x}
            </li>
          ))}
        </ul>
      </div>
      <Card className="p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            next()
          }}
        >
          <h2 className="text-[19px] font-bold">Create your account</h2>
          <Field label="Full name" id="su-name">
            <input id="su-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className={inputCls} required />
          </Field>
          <Field label="Email" id="su-email">
            <input id="su-email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} className={inputCls} required />
          </Field>
          <Field label="Password" id="su-pw" hint="At least 8 characters. Any value works in this prototype.">
            <input id="su-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" className={inputCls} />
          </Field>
          <Button type="submit" variant="primary" size="lg">
            Continue <ArrowRight className="size-4" />
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <Lock className="size-3" /> By continuing you accept the terms and privacy policy.
          </p>
        </form>
      </Card>
    </div>
  )
}

const READ_LINES = ["Reading Ahmed_Hassan_CV.pdf (2 pages)", "Found 2 roles: Swvl, Instabug", "Found 12 skills, strongest: Node.js, NestJS, PostgreSQL", "Found a degree and an AWS certificate", "Checking what employers will ask that the CV doesn't say"]

function CvStep({ next, back }: { next: () => void; back: () => void }) {
  const [file, setFile] = useState<string | null>(null)
  const [line, setLine] = useState(0)
  const [drag, setDrag] = useState(false)
  useEffect(() => {
    if (!file) return
    if (line >= READ_LINES.length) {
      const t = setTimeout(next, 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setLine(line + 1), 650)
    return () => clearTimeout(t)
  }, [file, line, next])
  return (
    <Card className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6 sm:p-8">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-tight">Upload your CV</h1>
        <p className="text-[14px] text-ink-2">Plato reads it and fills your profile. You'll check everything on the next screen.</p>
      </div>
      {!file ? (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              setFile(e.dataTransfer.files[0]?.name ?? "CV.pdf")
            }}
            className={cx("flex cursor-pointer flex-col items-center gap-3 rounded-[22px] border-2 border-dashed px-6 py-12 text-center transition-colors", drag ? "border-cobalt bg-soft" : "border-brand-line bg-tint hover:bg-soft")}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-cobalt shadow-card">
              <Upload className="size-6" />
            </span>
            <span className="text-[15px] font-bold">Drop your CV here, or choose a file</span>
            <span className="text-xs text-ink-3">PDF or Word, up to 10 MB</span>
            <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>
              Back
            </Button>
            <span className="flex-1" />
            <Button variant="soft" onClick={() => setFile("Ahmed_Hassan_CV.pdf")}>
              Use the sample CV
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-[22px] bg-tint p-5">
          <p className="flex items-center gap-2 text-[14px] font-bold">
            <FileText className="size-4 text-danger" /> {file}
          </p>
          <ul className="flex flex-col gap-2">
            {READ_LINES.map((l, i) => (
              <li key={l} className={cx("flex items-center gap-2 text-[13.5px] transition-opacity", i < line ? "text-ink-2" : i === line ? "text-cobalt" : "opacity-0")}>
                {i < line ? <Check className="size-4 text-success" /> : <span className="pulse-dot size-2 rounded-full bg-cobalt" />}
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Understood({ p, setP, next, back }: { p: Profile; setP: (p: Profile) => void; next: () => void; back: () => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="flex flex-col gap-5 p-6 sm:p-7">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Here's what Plato understood</h1>
          <p className="text-[14px] text-ink-2">Fix anything that's wrong. You can change all of this later in Me.</p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-tint p-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input aria-label="Headline" value={p.headline} onChange={(e) => setP({ ...p, headline: e.target.value })} className={inputCls} autoFocus onBlur={() => setEditing(false)} />
            ) : (
              <p className="text-[16px] font-bold">{p.headline}</p>
            )}
            <p className="text-[13px] text-ink-3">{p.city} · 5 years of experience</p>
          </div>
          <button type="button" aria-label="Edit headline" onClick={() => setEditing(true)} className="text-ink-3 hover:text-cobalt">
            <Pencil className="size-4" />
          </button>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Experience</h2>
          {p.experiences.map((e) => (
            <div key={e.id} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-soft font-bold text-cobalt">{e.company[0]}</span>
              <div>
                <p className="text-[14px] font-bold">
                  {e.title} · {e.company}
                </p>
                <p className="text-xs text-ink-3">
                  {e.from} – {e.to}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-2">{e.summary}</p>
              </div>
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow">Skills</h2>
          <TagEditor values={p.skills.map((x) => x.name)} onChange={(names) => setP({ ...p, skills: names.map((n) => p.skills.find((x) => x.name === n) ?? { name: n, level: "Working" }) })} placeholder="Add a skill" />
        </section>
        <section className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
          <div>
            <h2 className="eyebrow mb-1">Education</h2>
            <p className="font-semibold">{p.education[0].degree}</p>
            <p className="text-ink-3">{p.education[0].school}</p>
          </div>
          <div>
            <h2 className="eyebrow mb-1">Certificate</h2>
            <p className="font-semibold">{p.certs[0].name}</p>
          </div>
          <div>
            <h2 className="eyebrow mb-1">Languages</h2>
            <p className="font-semibold">Arabic, English</p>
          </div>
        </section>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-[15px] font-bold">Plato's notes on your CV</h2>
          <ul className="flex flex-col gap-2.5 text-[13px] text-ink-2">
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" /> Results with numbers (40% latency cut, 2B events a day). Recruiters look for these.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning">!</span> No notice period or work authorization. Most forms ask; you can add them on the next step.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning">!</span> GraphQL appears once with no project. Plato lists it as “learning”, not as a strength.
            </li>
          </ul>
        </Card>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>
            Back
          </Button>
          <span className="flex-1" />
          <Button variant="primary" size="lg" onClick={next}>
            Looks right <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Wants({ p, setP, back }: { p: Profile; setP: (p: Profile) => void; back: () => void }) {
  const { finishOnboarding } = useStore()
  const pr = p.prefs
  const setPrefs = (x: Partial<Profile["prefs"]>) => setP({ ...p, prefs: { ...pr, ...x } })
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="flex flex-col gap-5 p-6 sm:p-7">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">What are you looking for?</h1>
          <p className="text-[14px] text-ink-2">Plato suggested these from your CV. Your first search uses them.</p>
        </div>
        <Field label="Roles" id="ob-roles">
          <TagEditor id="ob-roles" values={pr.roles} onChange={(roles) => setPrefs({ roles })} placeholder="Add a title" suggestions={["Staff Backend Engineer", "Engineering Lead"]} />
        </Field>
        <Field label="Where" id="ob-where">
          <TagEditor id="ob-where" values={pr.where} onChange={(where) => setPrefs({ where })} placeholder="City or Remote" suggestions={["Riyadh", "London", "Cairo"]} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Work setup">
            <div className="flex flex-wrap gap-2">
              {(["Remote", "Hybrid", "On-site"] as Setup[]).map((x) => (
                <button key={x} type="button" aria-pressed={pr.setup.includes(x)} onClick={() => setPrefs({ setup: pr.setup.includes(x) ? pr.setup.filter((y) => y !== x) : [...pr.setup, x] })} className={cx("h-9 rounded-full border px-4 text-[13px] font-semibold", pr.setup.includes(x) ? "border-cobalt bg-soft text-cobalt" : "border-line bg-white text-ink-2")}>
                  {x}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Minimum salary, USD per month" id="ob-sal">
            <input id="ob-sal" inputMode="numeric" value={pr.salaryMin} onChange={(e) => setPrefs({ salaryMin: Number(e.target.value.replace(/\D/g, "")) })} className={inputCls} />
          </Field>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-bold">Questions every form asks</h2>
            <p className="text-xs text-ink-3">Optional now. Fill them and Plato can apply without stopping to ask.</p>
          </div>
          <Field label="Notice period" id="ob-notice">
            <input id="ob-notice" value={p.facts.notice} placeholder="e.g. 30 days" onChange={(e) => setP({ ...p, facts: { ...p.facts, notice: e.target.value } })} className={inputCls} />
          </Field>
          <Field label="Work authorization" id="ob-auth">
            <input id="ob-auth" value={p.facts.workAuth} onChange={(e) => setP({ ...p, facts: { ...p.facts, workAuth: e.target.value } })} className={inputCls} />
          </Field>
          <Field label="LinkedIn" id="ob-li">
            <input id="ob-li" value={p.facts.linkedin} onChange={(e) => setP({ ...p, facts: { ...p.facts, linkedin: e.target.value } })} className={inputCls} />
          </Field>
        </Card>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={back}>
            Back
          </Button>
          <span className="flex-1" />
          <Button variant="primary" size="lg" onClick={() => finishOnboarding(p)} disabled={!pr.roles.length}>
            Start my first search <ArrowRight className="size-4" />
          </Button>
        </div>
        <p className="text-right text-xs text-ink-3">Uses 5 of your 1,000 free tokens. Plato only searches; it applies when you say so.</p>
      </div>
    </div>
  )
}
