"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Award, Briefcase, GraduationCap, Languages, Link2, Loader2, MapPin, Sparkles, X, type LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "cn"
import { CARD, SectionHeader } from "@/components/plato-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListSectionEditor } from "@/components/list-section-editor"
import { LocationEditor } from "@/components/location-editor"
import { SkillsEditor } from "@/components/skills-editor"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { saveProfile } from "@/lib/documents/api"
import type { Certification, Education, Experience, JobSeekerProfile, Language, SectionKey } from "@/lib/documents/schema"
import { savePreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"

// The Profile's "Experience & skills" tab, edited in place: where you live, your links, and
// every section Plato read from your CV. Each card saves on its own (PATCH /job-seeker/profile).

export const ROW = "transition-colors duration-200 hover:bg-muted/60"

export function Card({ id, title, icon, action, children, tour }: { id?: string; title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <section id={id} data-tour={tour} className={cn(CARD, "flex scroll-mt-24 flex-col gap-4 p-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500")}>
      <div className="flex items-center justify-between gap-3">
        <SectionHeader title={title} icon={icon} accent="cobalt" />
        {action && <span className="flex shrink-0 rounded-lg border bg-card text-[13px] font-semibold transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint [&>*]:px-3 [&>*]:py-1.5">{action}</span>}
      </div>
      {children}
    </section>
  )
}

const years = (from: string | null, to: string | null, open = "now") => [from?.slice(0, 4), to?.slice(0, 4) ?? (from ? open : null)].filter(Boolean).join(" – ")
const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-text-tertiary">{children}</p>

type Editing = SectionKey | "links" | null

export function ProfileSections({ profile, onProfile, prefs, onPrefs, initialEdit }: { profile: JobSeekerProfile; onProfile: (p: JobSeekerProfile) => void; prefs: Preferences | null; onPrefs: (p: Preferences) => void; initialEdit: string | null }) {
  const [editing, setEditing] = useState<Editing>(initialEdit === "location" ? "location" : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ at: Editing; message: string } | null>(null)

  // ?edit=location (or links) from a suggestion: that card opens (above) and comes into view.
  // The page remounts this on a new ?edit=.
  useEffect(() => {
    if (initialEdit !== "location" && initialEdit !== "links") return
    requestAnimationFrame(() => document.getElementById(`profile-${initialEdit}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }, [initialEdit])

  async function save(section: SectionKey, patch: Partial<Pick<JobSeekerProfile, "experiences" | "educations" | "certifications" | "languages" | "skills" | "location">>) {
    setBusy(true)
    setError(null)
    try {
      const r = await saveProfile({ experiences: profile.experiences, educations: profile.educations, certifications: profile.certifications, languages: profile.languages, skills: profile.skills, location: profile.location, editedSections: [section], ...patch })
      onProfile(r.profile)
      setEditing(null)
    } catch (e) {
      setError({ at: section, message: e instanceof Error ? e.message : "Could not save" })
    } finally {
      setBusy(false)
    }
  }

  const edit = (k: Editing) => (
    <button type="button" data-ai={`profile.edit-${k}`} onClick={() => (setError(null), setEditing(editing === k ? null : k))}>
      {editing === k ? "Close" : "Edit"}
    </button>
  )
  const status = (k: Editing) => (
    <>
      {busy && editing === k && (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="size-4 animate-spin" />
          Saving…
        </p>
      )}
      {error?.at === k && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </>
  )
  const where = [profile.location?.city, profile.location?.country].filter(Boolean).join(", ")

  return (
    <div className="flex flex-col gap-4">
      <Card id="profile-location" title="Where you live" icon={MapPin} action={edit("location")}>
        {editing === "location" ? (
          <LocationEditor value={profile.location} onSave={(v) => void save("location", { location: { city: v.city.trim(), country: v.country.trim() } })} onCancel={() => setEditing(null)} />
        ) : where ? (
          <p className="font-semibold">{where}</p>
        ) : (
          <Empty>Not set. Application forms ask where you live, so Plato needs your city and country.</Empty>
        )}
        {status("location")}
      </Card>

      <LinksCard prefs={prefs} onPrefs={onPrefs} />

      <Card title="Experience" icon={Briefcase} tour="profile-cv" action={edit("experience")}>
        {editing === "experience" ? (
          <ListSectionEditor<Experience>
            fields={[
              { key: "title", label: "Job title" },
              { key: "company", label: "Company" },
              { key: "start_date", label: "Started", type: "date" },
              { key: "end_date", label: "Ended (empty if current)", type: "date" },
              { key: "description", label: "What you did", type: "textarea" },
            ]}
            items={profile.experiences}
            emptyItem={{ id: "", company: "", title: "", start_date: null, end_date: null, description: null, technologies: [] }}
            onSave={(experiences) => void save("experience", { experiences })}
            onCancel={() => setEditing(null)}
          />
        ) : profile.experiences.length ? (
          <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="-mx-2 flex flex-col divide-y divide-divider">
            {profile.experiences.map((x) => (
              <motion.li key={x.id} variants={fadeUpItem} className={cn("rounded-lg px-2 py-2.5", ROW)}>
                <b>{x.title}</b> <span className="text-text-secondary">· {x.company}</span>
                <p className="type-meta text-text-tertiary">{years(x.start_date, x.end_date)}</p>
                {x.description && <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{x.description}</p>}
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <Empty>No experience yet. Add it, or upload your CV and Plato reads it.</Empty>
        )}
        {status("experience")}
      </Card>

      <Card title="Education" icon={GraduationCap} action={edit("education")}>
        {editing === "education" ? (
          <ListSectionEditor<Education>
            fields={[
              { key: "institution", label: "School or university" },
              { key: "degree", label: "Degree" },
              { key: "field", label: "Field of study" },
              { key: "start_date", label: "Started", type: "date" },
              { key: "end_date", label: "Finished", type: "date" },
            ]}
            items={profile.educations}
            emptyItem={{ id: "", institution: "", degree: "", field: null, start_date: null, end_date: null }}
            onSave={(educations) => void save("education", { educations })}
            onCancel={() => setEditing(null)}
          />
        ) : profile.educations.length ? (
          <ul className="-mx-2 flex flex-col divide-y divide-divider">
            {profile.educations.map((x) => (
              <li key={x.id} className={cn("rounded-lg px-2 py-2.5", ROW)}>
                <b>{[x.degree, x.field].filter(Boolean).join(", ") || x.institution}</b>
                {(x.degree || x.field) && <span className="text-text-secondary"> · {x.institution}</span>}
                <p className="type-meta text-text-tertiary">{years(x.start_date, x.end_date, "")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No education added.</Empty>
        )}
        {status("education")}
      </Card>

      <Card title="Certifications" icon={Award} action={edit("certifications")}>
        {editing === "certifications" ? (
          <ListSectionEditor<Certification>
            fields={[
              { key: "name", label: "Name" },
              { key: "issuer", label: "Issued by" },
              { key: "issue_date", label: "Issued", type: "date" },
              { key: "expiration_date", label: "Expires", type: "date" },
            ]}
            items={profile.certifications}
            emptyItem={{ id: "", name: "", issuer: null, issue_date: null, expiration_date: null }}
            onSave={(certifications) => void save("certifications", { certifications })}
            onCancel={() => setEditing(null)}
          />
        ) : profile.certifications.length ? (
          <ul className="-mx-2 flex flex-col divide-y divide-divider">
            {profile.certifications.map((x) => (
              <li key={x.id} className={cn("rounded-lg px-2 py-2.5", ROW)}>
                <b>{x.name}</b>
                {x.issuer && <span className="text-text-secondary"> · {x.issuer}</span>}
                {(x.issue_date || x.expiration_date) && <p className="type-meta text-text-tertiary">{[x.issue_date && `Issued ${x.issue_date.slice(0, 7)}`, x.expiration_date && `expires ${x.expiration_date.slice(0, 7)}`].filter(Boolean).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No certifications added.</Empty>
        )}
        {status("certifications")}
      </Card>

      <Card title="Languages" icon={Languages} action={edit("languages")}>
        {editing === "languages" ? (
          <ListSectionEditor<Language>
            fields={[
              { key: "language", label: "Language" },
              { key: "proficiency", label: "Level, e.g. Native, Fluent" },
            ]}
            items={profile.languages}
            emptyItem={{ id: "", language: "", proficiency: null }}
            onSave={(languages) => void save("languages", { languages })}
            onCancel={() => setEditing(null)}
          />
        ) : profile.languages.length ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.languages.map((x) => (
              <span key={x.id} className="rounded-md bg-muted px-2 py-0.5 text-[13px] font-medium text-text-secondary">
                {x.language}
                {x.proficiency && ` · ${x.proficiency}`}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No languages added.</Empty>
        )}
        {status("languages")}
      </Card>

      <Card title="Skills" icon={Sparkles} action={edit("skills")}>
        {editing === "skills" ? (
          <SkillsEditor value={profile.skills} onSave={(skills) => void save("skills", { skills })} onCancel={() => setEditing(null)} />
        ) : profile.skills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-[12.5px] font-medium text-text-secondary">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No skills added.</Empty>
        )}
        {status("skills")}
      </Card>
    </div>
  )
}

const LINKS = [
  ["linkedin_url", "LinkedIn", "linkedin.com/in/you"],
  ["github_url", "GitHub", "github.com/you"],
  ["portfolio_url", "Portfolio or website", "yourname.com"],
] as const
type LinkKey = (typeof LINKS)[number][0]

// The links Plato pastes into forms that ask for them. Saved with the preferences; the
// server keeps web links only and adds https:// when it is missing.
function LinksCard({ prefs, onPrefs }: { prefs: Preferences | null; onPrefs: (p: Preferences) => void }) {
  const [draft, setDraft] = useState<Record<LinkKey, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const value = draft ?? { linkedin_url: prefs?.linkedin_url ?? "", github_url: prefs?.github_url ?? "", portfolio_url: prefs?.portfolio_url ?? "" }

  async function save() {
    if (!prefs) return
    setBusy(true)
    setNote(null)
    try {
      // The whole preferences object goes back (the server ignores `source`), only the links changed.
      const saved = await savePreferences({ ...prefs, linkedin_url: value.linkedin_url.trim() || null, github_url: value.github_url.trim() || null, portfolio_url: value.portfolio_url.trim() || null })
      onPrefs(saved)
      setDraft(null)
      setNote({ ok: true, text: "Saved. Plato uses these on every form that asks." })
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Could not save your links" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card id="profile-links" title="Links" icon={Link2}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {LINKS.map(([k, label, hint]) => (
            <label key={k} className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">{label}</span>
              <span className="relative flex">
                <Input inputMode="url" autoComplete="url" maxLength={300} value={value[k]} placeholder={hint} disabled={!prefs} onChange={(e) => setDraft({ ...value, [k]: e.target.value })} className="h-9 pr-8 text-sm" />
                {value[k] && (
                  <button type="button" aria-label={`Clear ${label}`} onClick={() => setDraft({ ...value, [k]: "" })} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-text-tertiary transition-colors duration-200 hover:bg-muted hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" data-ai="profile.save-links" disabled={!prefs || busy || !draft}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Save links
          </Button>
          {draft && (
            <Button type="button" size="sm" variant="ghost" onClick={() => (setDraft(null), setNote(null))}>
              Cancel
            </Button>
          )}
          {note && (
            <span role={note.ok ? "status" : "alert"} className={cn("text-sm", note.ok ? "text-success-ink" : "text-destructive")}>
              {note.text}
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}
