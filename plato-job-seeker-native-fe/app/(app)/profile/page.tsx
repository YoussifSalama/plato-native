"use client"

import Link from "next/link"
import { PAGE, PageHeader } from "@/components/page-header"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { addAchievement, addProject, addSkillProof, getResumeFacts, removeResumeFact, type ResumeFacts } from "@/lib/resume-profile/api"

// What Plato uses to write your resumes and applications. Everything here is
// yours: a resume only ever says what is saved here or in your CV.

const LEVEL = { LEARNING: "Learning", WORKING: "Working", STRONG: "Strong" } as const

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-text-secondary">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Row({ title, sub, onRemove }: { title: string; sub?: string | null; onRemove: () => void }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {sub && <p className="text-xs whitespace-pre-line text-text-secondary">{sub}</p>}
      </div>
      <button type="button" aria-label="Remove" onClick={onRemove} className="shrink-0 rounded-sm p-1 text-text-tertiary hover:text-destructive">
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
      {label}
      {children}
    </label>
  )
}

export default function ProfilePage() {
  const [facts, setFacts] = useState<ResumeFacts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [project, setProject] = useState({ name: "", role: "", description: "", technologies: "", url: "", result: "" })
  const [achievement, setAchievement] = useState({ text: "", metric: "", company: "" })
  const [skill, setSkill] = useState({ skill: "", level: "WORKING" as "LEARNING" | "WORKING" | "STRONG", proof: "", url: "" })

  const load = useCallback(() => getResumeFacts().then(setFacts).catch((e) => setError(e instanceof Error ? e.message : "Could not load")), [])
  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, reset: () => void) {
    setBusy(true)
    setError(null)
    try {
      await action()
      reset()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }
  const remove = (kind: "projects" | "achievements" | "skills", id: string) => run(() => removeResumeFact(kind, id), () => undefined)

  return (
    <div className={PAGE}>
      <PageHeader
        section="Account"
        title="Profile"
        description="What Plato uses to write your resumes and fill your applications. The more it knows, the fewer questions it asks."
        actions={
          <Link href="/onboarding?step=3" data-ai="profile.edit-details" className="flex h-9 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-muted">
            Edit my details
          </Link>
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!facts && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {facts && (
        <div className="grid items-start gap-5 xl:grid-cols-3">
          <Section title="Projects" hint="Real things you built. Especially useful early in your career.">
            <ul className="flex flex-col gap-2">
              {facts.projects.map((p) => (
                <Row key={p.id} title={p.name} sub={[p.description, p.result && `Result: ${p.result}`].filter(Boolean).join("\n")} onRemove={() => void remove("projects", p.id)} />
              ))}
            </ul>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(
                  () => addProject({ ...project, technologies: project.technologies.split(",").map((t) => t.trim()).filter(Boolean) }),
                  () => setProject({ name: "", role: "", description: "", technologies: "", url: "", result: "" }),
                )
              }}
            >
              <Field id="p-name" label="Name">
                <Input id="p-name" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} required />
              </Field>
              <Field id="p-desc" label="What you built">
                <Textarea id="p-desc" value={project.description} onChange={(e) => setProject({ ...project, description: e.target.value })} required className="min-h-20 text-sm" />
              </Field>
              <Field id="p-tech" label="Technologies (comma separated)">
                <Input id="p-tech" value={project.technologies} onChange={(e) => setProject({ ...project, technologies: e.target.value })} />
              </Field>
              <Field id="p-result" label="Result (only real numbers)">
                <Input id="p-result" value={project.result} onChange={(e) => setProject({ ...project, result: e.target.value })} />
              </Field>
              <Field id="p-url" label="Link">
                <Input id="p-url" type="url" value={project.url} onChange={(e) => setProject({ ...project, url: e.target.value })} placeholder="https://" />
              </Field>
              <Button type="submit" data-ai="profile.add-project" size="sm" disabled={busy} className="w-fit">
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Add project
              </Button>
            </form>
          </Section>

          <Section title="Results" hint="What changed because of your work. A real number makes a bullet much stronger.">
            <ul className="flex flex-col gap-2">
              {facts.achievements.map((a) => (
                <Row key={a.id} title={a.metric ? `${a.text} (${a.metric})` : a.text} sub={a.company ?? a.project_name} onRemove={() => void remove("achievements", a.id)} />
              ))}
            </ul>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => addAchievement(achievement), () => setAchievement({ text: "", metric: "", company: "" }))
              }}
            >
              <Field id="a-text" label="What happened">
                <Textarea id="a-text" value={achievement.text} onChange={(e) => setAchievement({ ...achievement, text: e.target.value })} required className="min-h-16 text-sm" />
              </Field>
              <Field id="a-metric" label="The number, exactly (optional)">
                <Input id="a-metric" value={achievement.metric} onChange={(e) => setAchievement({ ...achievement, metric: e.target.value })} placeholder="40%" />
              </Field>
              <Field id="a-company" label="Employer (as in your CV, optional)">
                <Input id="a-company" value={achievement.company} onChange={(e) => setAchievement({ ...achievement, company: e.target.value })} />
              </Field>
              <Button type="submit" data-ai="profile.add-result" size="sm" disabled={busy} className="w-fit">
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Add result
              </Button>
            </form>
          </Section>

          <Section title="Skills with proof" hint="A skill with proof can go on a resume even if your CV never listed it. Skills you are learning are shown as currently learning.">
            <ul className="flex flex-col gap-2">
              {facts.skills.map((s) => (
                <Row key={s.id} title={`${s.skill} · ${LEVEL[s.level]}`} sub={s.proof} onRemove={() => void remove("skills", s.id)} />
              ))}
            </ul>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => addSkillProof(skill), () => setSkill({ skill: "", level: "WORKING", proof: "", url: "" }))
              }}
            >
              <Field id="s-skill" label="Skill">
                <Input id="s-skill" value={skill.skill} onChange={(e) => setSkill({ ...skill, skill: e.target.value })} required />
              </Field>
              <div className="flex gap-2" role="group" aria-label="Level">
                {(["LEARNING", "WORKING", "STRONG"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setSkill({ ...skill, level: l })} className={`rounded-full border px-3 py-1 text-xs font-medium ${skill.level === l ? "border-primary bg-primary-soft text-primary" : "text-text-secondary"}`}>
                    {LEVEL[l]}
                  </button>
                ))}
              </div>
              <Field id="s-proof" label="What you built or did with it">
                <Textarea id="s-proof" value={skill.proof} onChange={(e) => setSkill({ ...skill, proof: e.target.value })} required className="min-h-16 text-sm" />
              </Field>
              <Field id="s-url" label="Link (optional)">
                <Input id="s-url" type="url" value={skill.url} onChange={(e) => setSkill({ ...skill, url: e.target.value })} placeholder="https://" />
              </Field>
              <Button type="submit" data-ai="profile.add-skill" size="sm" disabled={busy} className="w-fit">
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Add skill
              </Button>
            </form>
          </Section>
        </div>
      )}
    </div>
  )
}
