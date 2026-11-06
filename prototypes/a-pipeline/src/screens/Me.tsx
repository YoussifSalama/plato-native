import { useEffect, useState, type ReactNode } from "react"
import { Check, Coins, FileText, Mail, Pencil, Plus, Puzzle, RefreshCw, Trash2, Upload } from "lucide-react"
import { useDerived, useStore } from "../store"
import { Button, Card, Chip, cx, Field, IconBtn, inputCls, Segmented, TagEditor, Toggle } from "../ui"
import type { Profile, Setup, Skill } from "../types"

const SECTIONS = [
  { id: "ready", label: "Ready to apply" },
  { id: "cv", label: "CV & experience" },
  { id: "skills", label: "Skills & proof" },
  { id: "looking", label: "What you're looking for" },
  { id: "details", label: "Application details" },
  { id: "connections", label: "Connections & alerts" },
  { id: "plan", label: "Plan & tokens" },
]

export function Me() {
  const { s, ui, setUi } = useStore()
  useEffect(() => {
    if (!ui.meSection) return
    const el = document.getElementById(`me-${ui.meSection}`)
    setTimeout(() => {
      el?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 60)
    el?.classList.add("ring-4", "ring-cobalt/20")
    const t = setTimeout(() => el?.classList.remove("ring-4", "ring-cobalt/20"), 1800)
    setUi({ meSection: undefined })
    return () => clearTimeout(t)
  }, [ui.meSection, setUi])
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <span className="bg-brand flex size-16 items-center justify-center rounded-[22px] text-xl font-extrabold text-white">AH</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{s.profile.name}</h1>
          <p className="text-[13.5px] text-ink-2">
            {s.profile.headline} · {s.profile.city}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0" aria-label="Sections">
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" onClick={() => setUi({ meSection: x.id })} className="shrink-0 rounded-xl px-3 py-2 text-left text-[13px] font-semibold whitespace-nowrap text-ink-2 hover:bg-white/70 hover:text-ink">
              {x.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          <Ready />
          <Cv />
          <Skills />
          <Looking />
          <Details />
          <Connections />
          <Plan />
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, sub, children, action }: { id: string; title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card id={`me-${id}`} className="scroll-mt-20 p-5 transition-shadow sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold">{title}</h2>
          {sub && <p className="text-[12.5px] text-ink-3">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function Ready() {
  const { readiness: r } = useDerived()
  const { setUi } = useStore()
  return (
    <Section id="ready" title={r.done === r.total ? "Plato can apply for you without asking" : `Ready to apply · ${r.pct}%`} sub="Forms ask the same things. Answer each once here and Plato fills every application from it.">
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-divider">
        <div className="bg-brand h-full rounded-full transition-all duration-700" style={{ width: `${r.pct}%` }} />
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {r.items.map((i) => (
          <li key={i.key}>
            <button type="button" onClick={() => setUi({ meSection: i.where })} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-tint">
              <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full", i.done ? "bg-success-soft text-success" : "border border-dashed border-warning bg-warning-soft/50")}>{i.done && <Check className="size-3" strokeWidth={3} />}</span>
              <span className={i.done ? "text-ink-3" : "font-semibold"}>{i.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Cv() {
  const { s, updateProfile, toast } = useStore()
  const p = s.profile
  const [edit, setEdit] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: "", company: "", from: "", to: "", summary: "" })
  const [reading, setReading] = useState(false)
  const startEdit = (id: string) => {
    const e = p.experiences.find((x) => x.id === id) ?? { title: "", company: "", from: "", to: "Present", summary: "" }
    setDraft({ title: e.title, company: e.company, from: e.from, to: e.to, summary: e.summary })
    setEdit(id)
  }
  const saveExp = () => {
    updateProfile((x) => ({ ...x, experiences: edit === "new" ? [{ id: Math.random().toString(36).slice(2), ...draft }, ...x.experiences] : x.experiences.map((e) => (e.id === edit ? { ...e, ...draft } : e)) }))
    setEdit(null)
  }
  return (
    <Section id="cv" title="CV & experience" sub="What Plato read from your CV. Fix anything here; it never sends you back through sign-up.">
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3.5">
        <span className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold">{p.cv.file}</p>
          <p className="text-xs text-ink-3">
            {p.cv.pages} pages · uploaded {p.cv.updated} · read by Plato
          </p>
        </div>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12.5px] font-semibold hover:bg-tint">
          {reading ? <RefreshCw className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {reading ? "Reading…" : "Replace CV"}
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setReading(true)
              setTimeout(() => {
                setReading(false)
                updateProfile((x) => ({ ...x, cv: { ...x.cv, file: f.name, updated: "today" } }), "CV replaced. Plato re-read it and kept your edits")
              }, 1600)
            }}
          />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Experience</h3>
        <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => startEdit("new")}>
          Add
        </Button>
      </div>
      <ul className="mt-2 flex flex-col gap-3">
        {edit === "new" && <ExpForm draft={draft} setDraft={setDraft} onSave={saveExp} onCancel={() => setEdit(null)} />}
        {p.experiences.map((e) =>
          edit === e.id ? (
            <ExpForm key={e.id} draft={draft} setDraft={setDraft} onSave={saveExp} onCancel={() => setEdit(null)} />
          ) : (
            <li key={e.id} className="group flex gap-3 rounded-xl p-2 hover:bg-tint">
              <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-soft text-sm font-bold text-cobalt">{e.company[0]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold">{e.title}</p>
                <p className="text-[12.5px] text-ink-3">
                  {e.company} · {e.from} – {e.to}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{e.summary}</p>
              </div>
              <span className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <IconBtn label="Edit" className="size-8" onClick={() => startEdit(e.id)}>
                  <Pencil className="size-3.5" />
                </IconBtn>
                <IconBtn label="Remove" className="size-8" onClick={() => updateProfile((x) => ({ ...x, experiences: x.experiences.filter((y) => y.id !== e.id) }), "Removed")}>
                  <Trash2 className="size-3.5" />
                </IconBtn>
              </span>
            </li>
          ),
        )}
      </ul>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <h3 className="eyebrow mb-2">Education</h3>
          {p.education.map((e) => (
            <p key={e.school} className="text-[13px]">
              <b>{e.degree}</b>
              <span className="block text-ink-3">
                {e.school} · {e.years}
              </span>
            </p>
          ))}
        </div>
        <div>
          <h3 className="eyebrow mb-2">Certificates</h3>
          {p.certs.map((c) => (
            <p key={c.name} className="text-[13px]">
              <b>{c.name}</b>
              <span className="block text-ink-3">
                {c.issuer} · {c.year}
              </span>
            </p>
          ))}
          <button type="button" onClick={() => toast("In the full app this opens a file picker for the certificate")} className="mt-1 text-xs font-semibold text-cobalt hover:underline">
            + Add certificate
          </button>
        </div>
        <div>
          <h3 className="eyebrow mb-2">Languages</h3>
          {p.languages.map((l) => (
            <p key={l.name} className="text-[13px]">
              <b>{l.name}</b> <span className="text-ink-3">· {l.level}</span>
            </p>
          ))}
        </div>
      </div>
    </Section>
  )
}

function ExpForm({ draft, setDraft, onSave, onCancel }: { draft: { title: string; company: string; from: string; to: string; summary: string }; setDraft: (d: typeof draft) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <li className="anim-rise flex flex-col gap-3 rounded-2xl border border-brand-line bg-tint p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Title" id="exp-title">
          <input id="exp-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Company" id="exp-company">
          <input id="exp-company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className={inputCls} />
        </Field>
        <Field label="From" id="exp-from">
          <input id="exp-from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} placeholder="Feb 2023" className={inputCls} />
        </Field>
        <Field label="To" id="exp-to">
          <input id="exp-to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="Present" className={inputCls} />
        </Field>
      </div>
      <Field label="What you did, with numbers if you have them" id="exp-summary">
        <textarea id="exp-summary" rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className={cx(inputCls, "h-auto py-2.5")} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onSave} disabled={!draft.title || !draft.company}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </li>
  )
}

function Skills() {
  const { s, updateProfile, go } = useStore()
  const [name, setName] = useState("")
  const [level, setLevel] = useState<Skill["level"]>("Working")
  const lv: Skill["level"][] = ["Strong", "Working", "Learning"]
  return (
    <Section id="skills" title="Skills & proof" sub="One list. Plato matches jobs against it and only puts proven skills on your resumes." action={<Button size="sm" variant="ghost" onClick={() => go("career", { careerTab: "skills" })}>See your skill gaps</Button>}>
      <div className="flex flex-col gap-4">
        {lv.map((l) => {
          const rows = s.profile.skills.filter((x) => x.level === l)
          if (!rows.length) return null
          return (
            <div key={l}>
              <h3 className="eyebrow mb-2">{l === "Strong" ? "Strong · daily use" : l === "Working" ? "Working knowledge" : "Learning now"}</h3>
              <div className="flex flex-wrap gap-2">
                {rows.map((k) => (
                  <span key={k.name} className={cx("group flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px]", l === "Strong" ? "border-cobalt/25 bg-soft" : l === "Learning" ? "border-dashed border-violet/30 bg-violet-soft/50" : "border-line bg-white")}>
                    <b>{k.name}</b>
                    {k.proof && <span className="text-xs text-ink-3">{k.proof}</span>}
                    <button type="button" aria-label={`Remove ${k.name}`} onClick={() => updateProfile((x) => ({ ...x, skills: x.skills.filter((y) => y.name !== k.name) }), `${k.name} removed`)} className="text-mist hover:text-danger">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
        <form
          className="flex flex-wrap items-end gap-2 border-t border-divider pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            updateProfile((x) => ({ ...x, skills: [...x.skills.filter((y) => y.name.toLowerCase() !== name.trim().toLowerCase()), { name: name.trim(), level }] }), `${name.trim()} added`)
            setName("")
          }}
        >
          <Field label="Add a skill" id="skill-name">
            <input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kubernetes" className={cx(inputCls, "w-56")} />
          </Field>
          <Segmented size="sm" value={level} onChange={setLevel} options={lv.map((x) => ({ value: x, label: x }))} />
          <Button type="submit" size="sm" variant="primary" icon={<Plus className="size-3.5" />}>
            Add
          </Button>
        </form>
      </div>
    </Section>
  )
}

function Looking() {
  const { s, updateProfile } = useStore()
  const [p, setP] = useState(s.profile.prefs)
  const dirty = JSON.stringify(p) !== JSON.stringify(s.profile.prefs)
  return (
    <Section id="looking" title="What you're looking for" sub="New searches start from this. Each search can still narrow it.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Roles" id="pref-roles">
          <TagEditor id="pref-roles" values={p.roles} onChange={(roles) => setP({ ...p, roles })} placeholder="Add a title" suggestions={["Staff Backend Engineer", "Engineering Lead"]} />
        </Field>
        <Field label="Where" id="pref-where">
          <TagEditor id="pref-where" values={p.where} onChange={(where) => setP({ ...p, where })} placeholder="City or Remote" suggestions={["Riyadh", "London"]} />
        </Field>
        <Field label="Work setup">
          <div className="flex flex-wrap gap-2">
            {(["Remote", "Hybrid", "On-site"] as Setup[]).map((x) => (
              <button key={x} type="button" aria-pressed={p.setup.includes(x)} onClick={() => setP({ ...p, setup: p.setup.includes(x) ? p.setup.filter((y) => y !== x) : [...p.setup, x] })} className={cx("h-9 rounded-full border px-4 text-[13px] font-semibold", p.setup.includes(x) ? "border-cobalt bg-soft text-cobalt" : "border-line bg-white text-ink-2")}>
                {x}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Salary, USD per month" id="pref-min">
          <div className="flex items-center gap-2">
            <input id="pref-min" inputMode="numeric" aria-label="Minimum" value={p.salaryMin} onChange={(e) => setP({ ...p, salaryMin: Number(e.target.value.replace(/\D/g, "")) })} className={inputCls} />
            <span className="text-ink-3">to</span>
            <input inputMode="numeric" aria-label="Target" value={p.salaryMax} onChange={(e) => setP({ ...p, salaryMax: Number(e.target.value.replace(/\D/g, "")) })} className={inputCls} />
          </div>
        </Field>
        <Field label="Never show me" id="pref-avoid" hint="Plato ranks these down and skips them when applying.">
          <input id="pref-avoid" value={p.avoid} onChange={(e) => setP({ ...p, avoid: e.target.value })} className={inputCls} />
        </Field>
      </div>
      {dirty && (
        <div className="anim-rise mt-4 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => updateProfile((x) => ({ ...x, prefs: p }))}>
            Save changes
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setP(s.profile.prefs)}>
            Undo
          </Button>
        </div>
      )}
    </Section>
  )
}

function Details() {
  const { s, updateProfile } = useStore()
  const [f, setF] = useState(s.profile.facts)
  useEffect(() => {
    setF(s.profile.facts)
  }, [s.profile.facts])
  const dirty = JSON.stringify(f) !== JSON.stringify(s.profile.facts)
  const rows: { k: keyof Profile["facts"]; label: string; hint?: string; ph?: string }[] = [
    { k: "notice", label: "Notice period", hint: "Asked by most forms", ph: "e.g. 30 days" },
    { k: "workAuth", label: "Work authorization" },
    { k: "sponsorship", label: "Needs visa sponsorship" },
    { k: "relocate", label: "Willing to relocate" },
    { k: "linkedin", label: "LinkedIn" },
    { k: "github", label: "GitHub" },
    { k: "portfolio", label: "Portfolio or website", ph: "Optional" },
    { k: "currentSalary", label: "Current salary", hint: "Optional. Plato leaves it blank unless a form requires it", ph: "Prefer not to say" },
  ]
  return (
    <Section id="details" title="Application details" sub="The questions every form asks. Plato never guesses these; if one is empty and a form needs it, Plato asks you once.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <Field key={r.k} label={r.label} id={`fact-${r.k}`} hint={r.hint}>
            <input id={`fact-${r.k}`} value={f[r.k]} placeholder={r.ph} onChange={(e) => setF({ ...f, [r.k]: e.target.value })} className={cx(inputCls, !f[r.k] && r.k === "notice" && "border-warning/50 bg-warning-soft/30")} />
          </Field>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-3">Sensitive questions (gender, date of birth, health) are always answered “Prefer not to say”. If a form won't accept that, Plato asks you before sending.</p>
      {dirty && (
        <div className="anim-rise mt-4 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => updateProfile((x) => ({ ...x, facts: f }))}>
            Save changes
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setF(s.profile.facts)}>
            Undo
          </Button>
        </div>
      )}
    </Section>
  )
}

function Connections() {
  const { s, updateProfile } = useStore()
  const c = s.profile.connections
  const [pairing, setPairing] = useState(false)
  return (
    <Section id="connections" title="Connections & alerts" sub="Where Plato works for you and how it tells you about it.">
      <div className="flex flex-col divide-y divide-divider">
        <div className="flex flex-wrap items-center gap-3 pb-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-soft text-violet">
            <Puzzle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">
              Plato for Chrome {c.chrome ? <Chip tone="good">Linked</Chip> : <Chip tone="warn">Not linked</Chip>}
            </p>
            <p className="text-xs text-ink-3">Applies on LinkedIn and sites that block bots, inside your own browser.</p>
          </div>
          {c.chrome ? (
            <Button size="sm" variant="danger" onClick={() => updateProfile((x) => ({ ...x, connections: { ...x.connections, chrome: false } }), "Chrome unlinked")}>
              Unlink
            </Button>
          ) : pairing ? (
            <span className="flex flex-wrap items-center gap-2 text-[13px]">
              Enter <b className="rounded-lg bg-paper px-2 py-1 font-mono">K7Q-42M</b> in the extension
              <Button size="sm" variant="primary" onClick={() => updateProfile((x) => ({ ...x, connections: { ...x.connections, chrome: true } }), "Plato for Chrome linked")}>
                Done
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setPairing(true)}>
              Link Chrome
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-soft text-cobalt">
            <Mail className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Email me</p>
            <p className="text-xs text-ink-3">When Plato needs you, and a digest of new matches from your searches.</p>
          </div>
          <Toggle on={c.email} onChange={(v) => updateProfile((x) => ({ ...x, connections: { ...x.connections, email: v } }), v ? "Emails on" : "Emails off")} label="Email me" />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">New-match digest</p>
            <p className="text-xs text-ink-3">Each search also has its own alert setting on the Jobs page.</p>
          </div>
          <Segmented size="sm" value={c.digest} onChange={(v) => updateProfile((x) => ({ ...x, connections: { ...x.connections, digest: v } }), "Digest updated")} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "off", label: "Off" }]} />
        </div>
      </div>
    </Section>
  )
}

function Plan() {
  const { s, toast } = useStore()
  const used = 1000 - s.tokens
  const rows = [
    { what: "Applications", n: Math.max(0, used - 15), each: "2–3 per application" },
    { what: "Searches", n: 15, each: "5 per run" },
    { what: "Interview practice", n: 0, each: "4 per text session · 2/min voice" },
  ]
  return (
    <Section id="plan" title="Plan & tokens" sub="Tokens pay for the AI work. Every action shows its cost before you confirm.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="bg-brand flex flex-col gap-2 rounded-2xl p-5 text-white">
          <span className="flex items-center gap-1.5 text-[13px] text-white/80">
            <Coins className="size-4" /> Balance
          </span>
          <span className="tabular text-[34px] leading-none font-extrabold">{s.tokens.toLocaleString()}</span>
          <span className="text-[12.5px] text-white/80">{s.plan} plan · 1,000 tokens a month · refills Dec 1</span>
          <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full rounded-full bg-white" style={{ width: `${(s.tokens / 1000) * 100}%` }} />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Spent this month</p>
          {rows.map((r) => (
            <div key={r.what} className="flex items-center gap-3 text-[13px]">
              <span className="flex-1">
                <b>{r.what}</b> <span className="text-ink-3">· {r.each}</span>
              </span>
              <span className="tabular font-semibold">{r.n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { name: "Free", price: "$0", tokens: "1,000 / month", note: "About 300 applications", on: s.plan === "Free" },
          { name: "Pro", price: "$19 / month", tokens: "5,000 / month", note: "Voice interviews included", on: false },
          { name: "Max", price: "$49 / month", tokens: "15,000 / month", note: "For an intense month of hunting", on: false },
        ].map((p) => (
          <div key={p.name} className={cx("flex flex-col gap-1 rounded-2xl border p-4", p.on ? "border-cobalt bg-soft" : "border-line")}>
            <p className="font-bold">{p.name}</p>
            <p className="tabular text-[18px] font-extrabold">{p.price}</p>
            <p className="text-xs text-ink-2">{p.tokens}</p>
            <p className="text-xs text-ink-3">{p.note}</p>
            {p.on ? (
              <span className="mt-2 text-xs font-semibold text-cobalt">Your plan</span>
            ) : (
              <Button size="sm" className="mt-2 self-start" onClick={() => toast("Checkout isn't part of this prototype")}>
                Switch to {p.name}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}
