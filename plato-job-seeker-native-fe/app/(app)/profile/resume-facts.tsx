"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { BadgeCheck, FolderGit2, Loader2, Trash2, TrendingUp, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { CARD, SectionHeader } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { Field as UIField, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FilterChip } from "@/components/filter-controls"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoTip } from "@/components/info-tip"
import { addAchievement, addProject, addSkillProof, getResumeFacts, removeResumeFact, type ResumeFacts } from "@/lib/resume-profile/api"

// What Plato uses to write your resumes and applications. Everything here is
// yours: a resume only ever says what is saved here or in your CV.

const LEVEL = { LEARNING: "Learning", WORKING: "Working", STRONG: "Strong" } as const

// The three add buttons share one view, so they use the soft primary instead of three solid ones.
const SOFT_BTN = "bg-primary-soft text-primary shadow-none hover:bg-primary hover:text-primary-foreground"

function Section({ title, hint, icon, index, children, tour }: { title: string; hint: string; icon: LucideIcon; index: number; children: ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className={cn(CARD, "flex flex-col gap-3 p-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500")} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex flex-col gap-1.5">
        <SectionHeader title={title} icon={icon} accent="cobalt" as="h3" />
        <p className="text-sm text-text-secondary">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Row({ title, sub, onRemove }: { title: string; sub?: string | null; onRemove: () => void }) {
  return (
    <li className="group flex items-start justify-between gap-3 rounded-xl border px-3 py-2 transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint/50">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {sub && <p className="text-xs whitespace-pre-line text-text-secondary">{sub}</p>}
      </div>
      <button type="button" aria-label="Remove" onClick={onRemove} className="-m-1 shrink-0 rounded-md p-2 text-text-tertiary transition-colors duration-200 hover:bg-danger-soft hover:text-destructive">
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <UIField className="gap-1">
      <FieldLabel htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </FieldLabel>
      {children}
    </UIField>
  )
}

// The "Experience & skills" tab of Profile: projects, results and skills with proof.
export function ResumeFactsPanel() {
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
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!facts && !error && <Skeleton className="h-48 rounded-2xl" />}

      {facts && (
        <div className="grid items-start gap-5 2xl:grid-cols-3">
          <Section title="Projects" icon={FolderGit2} index={0} tour="profile-projects" hint="Real things you built. Especially useful early in your career.">
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
              <Button type="submit" data-ai="profile.add-project" size="sm" disabled={busy} className={cn("w-fit", SOFT_BTN)}>
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Add project
              </Button>
            </form>
          </Section>

          <Section title="Results" icon={TrendingUp} index={1} tour="profile-results" hint="What changed because of your work. A real number makes a bullet much stronger.">
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
              <Button type="submit" data-ai="profile.add-result" size="sm" disabled={busy} className={cn("w-fit", SOFT_BTN)}>
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Add result
              </Button>
            </form>
          </Section>

          <Section title="Skills with proof" icon={BadgeCheck} index={2} tour="profile-skill-proof" hint="A skill with proof can go on a resume even if your CV never listed it.">
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
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Level">
                {(["LEARNING", "WORKING", "STRONG"] as const).map((l) => (
                  <FilterChip key={l} on={skill.level === l} onClick={() => setSkill({ ...skill, level: l })}>
                    {LEVEL[l]}
                  </FilterChip>
                ))}
                <InfoTip text="Working and Strong count as proof, so Plato may put the skill on a tailored resume. Learning is shown only as currently learning and never counted as experience." label="What the skill levels mean" />
              </div>
              <Field id="s-proof" label="What you built or did with it">
                <Textarea id="s-proof" value={skill.proof} onChange={(e) => setSkill({ ...skill, proof: e.target.value })} required className="min-h-16 text-sm" />
              </Field>
              <Field id="s-url" label="Link (optional)">
                <Input id="s-url" type="url" value={skill.url} onChange={(e) => setSkill({ ...skill, url: e.target.value })} placeholder="https://" />
              </Field>
              <Button type="submit" data-ai="profile.add-skill" size="sm" disabled={busy} className={cn("w-fit", SOFT_BTN)}>
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
