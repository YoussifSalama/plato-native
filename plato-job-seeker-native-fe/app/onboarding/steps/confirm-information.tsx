"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import {
  AlertTriangle,
  Briefcase,
  FileText,
  GraduationCap,
  Globe,
  MapPin,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SecureBadge } from "@/components/secure-badge"
import { CollapsibleSectionCard } from "@/components/collapsible-section-card"
import { ListSectionEditor } from "@/components/list-section-editor"
import { SkillsEditor } from "@/components/skills-editor"
import { LocationEditor } from "@/components/location-editor"
import { getProfile, listDocuments, replaceDocument, saveProfile } from "@/lib/documents/api"
import type {
  Certification,
  Education,
  Experience,
  Finding,
  JobSeekerDocument,
  JobSeekerProfile,
  Language,
  SectionKey,
} from "@/lib/documents/schema"
import {
  evaluateCertifications,
  evaluateEducation,
  evaluateExperience,
  evaluateLanguages,
  evaluateLocation,
  evaluateSkills,
} from "@/lib/profile-validation"
import { distributeColors, ICON_COLORS } from "@/lib/icon-colors"
import { staggerContainer, fadeUpItem } from "@/lib/motion-variants"
import { ConfirmInformationSkeleton } from "@/components/onboarding-skeletons"

const SECTION_DEFS = [
  { key: "experience" as const, label: "Work Experience", icon: Briefcase },
  { key: "education" as const, label: "Education", icon: GraduationCap },
  { key: "skills" as const, label: "Skills", icon: Star },
  { key: "certifications" as const, label: "Certifications", icon: FileText },
  { key: "languages" as const, label: "Languages", icon: Globe },
  { key: "location" as const, label: "Location", icon: MapPin },
]
const SECTION_COLORS = distributeColors(SECTION_DEFS.length)
const SECTIONS = SECTION_DEFS.map((s, i) => ({ ...s, color: SECTION_COLORS[i] }))

const CATEGORY_LABELS: Record<Finding["category"], string> = {
  missing_information: "Missing info",
  inconsistency: "Inconsistency",
  data_quality: "Data quality",
  cross_validation: "Cross-check",
  credibility: "Credibility",
}

function summarize(profile: JobSeekerProfile, key: SectionKey): string {
  switch (key) {
    case "experience":
      return `${profile.experiences.length} role${profile.experiences.length === 1 ? "" : "s"}`
    case "education":
      return profile.educations.map((e) => e.institution).join(", ") || "No education found"
    case "skills":
      return `${profile.skills.length} skills found`
    case "certifications":
      return `${profile.certifications.length} certification${profile.certifications.length === 1 ? "" : "s"}`
    case "languages":
      return profile.languages.map((l) => l.language).join(", ") || "No languages found"
    case "location":
      return [profile.location?.city, profile.location?.country].filter(Boolean).join(", ") || "Not found"
  }
}

function ConfirmInformationStep({ onContinue }: { onContinue: () => void }) {
  const [profile, setProfile] = useState<JobSeekerProfile | null>(null)
  const [documents, setDocuments] = useState<JobSeekerDocument[]>([])
  const [remainingReplacements, setRemainingReplacements] = useState(3)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null)
  const [editingSection, setEditingSection] = useState<SectionKey | null>(null)
  // Sections the seeker changed by hand (sent with the save). State, not a ref: it is read while rendering the save's handlers.
  const [editedSections, setEditedSections] = useState<SectionKey[]>([])

  useEffect(() => {
    Promise.all([getProfile(), listDocuments()])
      .then(([p, docs]) => {
        setProfile(p)
        setDocuments(docs)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !profile) {
    return <ConfirmInformationSkeleton />
  }

  const evaluation = profile.profile_evaluation
  const findings = evaluation?.findings ?? []
  const flaggedKeys = SECTIONS.filter((s) => evaluation?.[s.key] === "NEEDS_ATTENTION").map((s) => s.key)
  const canContinue = flaggedKeys.length === 0

  function updateProfile(patch: Partial<JobSeekerProfile>, evaluationPatch: Partial<NonNullable<JobSeekerProfile["profile_evaluation"]>>) {
    setProfile((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        ...patch,
        profile_evaluation: prev.profile_evaluation
          ? { ...prev.profile_evaluation, ...evaluationPatch }
          : prev.profile_evaluation,
      }
    })
  }

  function markEdited(key: SectionKey) {
    setEditedSections((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }

  function focusSection(keys: SectionKey[]) {
    if (keys.length === 0) return
    setExpandedSection(keys[0])
    setTimeout(() => document.getElementById(`confirm-section-${keys[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
  }

  async function handleReplaceDocument(id: string, file: File) {
    const updated = await replaceDocument(id, file)
    setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)))
    setRemainingReplacements(updated.remaining_replacements)
  }

  async function handleFinish(bypassGate: boolean) {
    if (!profile) return
    if (!bypassGate && !canContinue) return
    setSaveError(null)
    setSaving(true)
    try {
      await saveProfile({
        experiences: profile.experiences,
        educations: profile.educations,
        certifications: profile.certifications,
        languages: profile.languages,
        skills: profile.skills,
        location: profile.location,
        editedSections,
      })
      onContinue()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <motion.div variants={fadeUpItem} className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              Let&apos;s confirm what I understood
              <motion.span
                animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" as const }}
              >
                <Sparkles className="size-5 text-primary" />
              </motion.span>
            </h1>
            <p className="text-sm text-muted-foreground">
              I&apos;ve built most of your profile from your documents. Please review and confirm the information below.
            </p>
          </div>
          <SecureBadge />
        </motion.div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
          {SECTIONS.map((section) => {
            const isExpanded = expandedSection === section.key
            const isEditing = editingSection === section.key
            const status = evaluation?.[section.key] ?? "NEEDS_ATTENTION"

            return (
              <motion.div
                key={section.key}
                variants={fadeUpItem}
                id={`confirm-section-${section.key}`}
              >
                <CollapsibleSectionCard
                  icon={section.icon}
                  iconColor={section.color}
                  label={section.label}
                  summary={summarize(profile, section.key)}
                  status={status}
                  expanded={isExpanded}
                  onToggleExpand={() => setExpandedSection(isExpanded ? null : section.key)}
                  editing={isEditing}
                  onEdit={() => setEditingSection(section.key)}
                >
                  {renderSectionBody({
                    section: section.key,
                    profile,
                    editing: isEditing,
                    onSave: (data) => {
                      applySectionUpdate(section.key, data, profile, updateProfile)
                      markEdited(section.key)
                      setEditingSection(null)
                    },
                    onCancel: () => setEditingSection(null),
                  })}
                </CollapsibleSectionCard>
              </motion.div>
            )
          })}
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Shield className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Your profile, your control</p>
              <p className="text-xs text-muted-foreground">You decide what&apos;s accurate. You can edit or update anything at any time.</p>
            </div>
          </div>
          <Button variant="outline" disabled={saving} onClick={() => handleFinish(true)}>
            Skip for now
          </Button>
        </motion.div>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <motion.div variants={fadeUpItem}>
          <Button onClick={() => handleFinish(false)} disabled={!canContinue || saving} className="w-fit gap-2 shadow-md shadow-primary/30">
            {saving ? "Saving…" : "Looks correct, continue"}
          </Button>
        </motion.div>
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
        {findings.length > 0 && (
          <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Needs your attention</p>
            <p className="mb-3 text-xs text-muted-foreground">A few things need your confirmation.</p>
            <ul className="flex flex-col gap-1">
              {findings.map((finding, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => focusSection(finding.sections)}
                    className="flex w-full flex-col gap-1 rounded-md p-2 text-left hover:bg-warning-soft/60"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                      <span className="text-xs font-medium text-warning">{CATEGORY_LABELS[finding.category]}</span>
                    </span>
                    <span className="text-sm font-medium text-foreground">{finding.title}</span>
                    <span className="text-xs text-muted-foreground">{finding.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div variants={fadeUpItem} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Your document evidence</p>
          <p className="mb-3 text-xs text-muted-foreground">This is where I found the information.</p>
          <ul className="flex flex-col gap-2">
            {documents.map((doc) => (
              <DocumentEvidenceRow
                key={doc.id}
                document={doc}
                disabled={remainingReplacements <= 0}
                onReplace={(file) => handleReplaceDocument(doc.id, file)}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {remainingReplacements} document replacement{remainingReplacements === 1 ? "" : "s"} left.
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

const DOCUMENT_TYPE_LABELS: Record<JobSeekerDocument["type"], string> = {
  CV_RESUME: "Primary source",
  CERTIFICATE: "Certificate",
  LICENSE: "License",
  DEGREE: "Degree",
  OTHER: "Other document",
}

function extensionColor(name: string | null) {
  const ext = name?.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "rose" as const
  if (ext === "docx") return "sky" as const
  return "brand" as const
}

function DocumentEvidenceRow({
  document,
  disabled,
  onReplace,
}: {
  document: JobSeekerDocument
  disabled: boolean
  onReplace: (file: File) => Promise<void>
}) {
  const [replacing, setReplacing] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setReplacing(true)
    try {
      await onReplace(file)
    } finally {
      setReplacing(false)
    }
  }

  return (
    <li className="flex items-center gap-3">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${ICON_COLORS[extensionColor(document.name)]}`}>
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{document.name ?? document.type}</p>
        <p className="truncate text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[document.type]}</p>
      </div>
      <label
        aria-label={`Replace ${document.name}`}
        className={
          disabled
            ? "flex size-8 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground opacity-40"
            : "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary"
        }
      >
        <RefreshCw className={replacing ? "size-4 animate-spin" : "size-4"} />
        <input
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          disabled={disabled || replacing}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </label>
    </li>
  )
}

function applySectionUpdate(
  section: SectionKey,
  data: unknown,
  profile: JobSeekerProfile,
  updateProfile: (patch: Partial<JobSeekerProfile>, evaluationPatch: Record<string, unknown>) => void,
) {
  switch (section) {
    case "experience": {
      const experiences = (data as Omit<Experience, "id">[]).map((e) => ({ ...e, id: crypto.randomUUID() }))
      updateProfile({ experiences }, { experience: evaluateExperience(experiences) })
      break
    }
    case "education": {
      const educations = (data as Omit<Education, "id">[]).map((e) => ({ ...e, id: crypto.randomUUID() }))
      updateProfile({ educations }, { education: evaluateEducation(educations) })
      break
    }
    case "certifications": {
      const certifications = (data as Omit<Certification, "id">[]).map((c) => ({ ...c, id: crypto.randomUUID() }))
      updateProfile({ certifications }, { certifications: evaluateCertifications(certifications) })
      break
    }
    case "languages": {
      const languages = (data as Omit<Language, "id">[]).map((l) => ({ ...l, id: crypto.randomUUID() }))
      updateProfile({ languages }, { languages: evaluateLanguages(languages) })
      break
    }
    case "skills": {
      const skills = data as string[]
      updateProfile({ skills }, { skills: evaluateSkills(skills) })
      break
    }
    case "location": {
      const location = data as { city: string; country: string }
      updateProfile({ location }, { location: evaluateLocation(location) })
      break
    }
  }
}

function renderSectionBody({
  section,
  profile,
  editing,
  onSave,
  onCancel,
}: {
  section: SectionKey
  profile: JobSeekerProfile
  editing: boolean
  onSave: (data: unknown) => void
  onCancel: () => void
}) {
  if (section === "experience") {
    if (editing) {
      return (
        <ListSectionEditor<Omit<Experience, "id">>
          fields={[
            { key: "company", label: "Company" },
            { key: "title", label: "Title" },
            { key: "start_date", label: "Start date", type: "date" },
            { key: "end_date", label: "End date", type: "date" },
            { key: "description", label: "Description", type: "textarea" },
          ]}
          items={profile.experiences}
          emptyItem={{ company: "", title: "", start_date: null, end_date: null, description: null, technologies: [] }}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    if (profile.experiences.length === 0) return <EmptyState label="No work experience found." />
    return (
      <ul className="flex flex-col gap-2">
        {profile.experiences.map((e) => (
          <li key={e.id} className="rounded-md bg-muted/40 p-2 text-sm">
            <p className="font-medium text-foreground">
              {e.title} at {e.company}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateRange(e.start_date, e.end_date)}
            </p>
            {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
          </li>
        ))}
      </ul>
    )
  }

  if (section === "education") {
    if (editing) {
      return (
        <ListSectionEditor<Omit<Education, "id">>
          fields={[
            { key: "institution", label: "Institution" },
            { key: "degree", label: "Degree" },
            { key: "field", label: "Field" },
            { key: "start_date", label: "Start date", type: "date" },
            { key: "end_date", label: "End date", type: "date" },
          ]}
          items={profile.educations}
          emptyItem={{ institution: "", degree: "", field: null, start_date: null, end_date: null }}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    if (profile.educations.length === 0) return <EmptyState label="No education found." />
    return (
      <ul className="flex flex-col gap-2">
        {profile.educations.map((e) => (
          <li key={e.id} className="rounded-md bg-muted/40 p-2 text-sm">
            <p className="font-medium text-foreground">
              {e.degree}
              {e.field ? ` in ${e.field}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.institution} • {formatDateRange(e.start_date, e.end_date)}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  if (section === "certifications") {
    if (editing) {
      return (
        <ListSectionEditor<Omit<Certification, "id">>
          fields={[
            { key: "name", label: "Name" },
            { key: "issuer", label: "Issuer" },
            { key: "issue_date", label: "Issue date", type: "date" },
            { key: "expiration_date", label: "Expiration date", type: "date" },
          ]}
          items={profile.certifications}
          emptyItem={{ name: "", issuer: null, issue_date: null, expiration_date: null }}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    if (profile.certifications.length === 0) return <EmptyState label="No certifications found." />
    return (
      <ul className="flex flex-col gap-2">
        {profile.certifications.map((c) => (
          <li key={c.id} className="rounded-md bg-muted/40 p-2 text-sm">
            <p className="font-medium text-foreground">{c.name}</p>
            <p className="text-xs text-muted-foreground">{[c.issuer, c.issue_date?.slice(0, 10)].filter(Boolean).join(" • ")}</p>
          </li>
        ))}
      </ul>
    )
  }

  if (section === "languages") {
    if (editing) {
      return (
        <ListSectionEditor<Omit<Language, "id">>
          fields={[
            { key: "language", label: "Language" },
            { key: "proficiency", label: "Proficiency" },
          ]}
          items={profile.languages}
          emptyItem={{ language: "", proficiency: null }}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    if (profile.languages.length === 0) return <EmptyState label="No languages found." />
    return (
      <ul className="flex flex-wrap gap-2">
        {profile.languages.map((l) => (
          <Badge key={l.id} variant="secondary">
            {l.language}
            {l.proficiency ? ` (${l.proficiency})` : ""}
          </Badge>
        ))}
      </ul>
    )
  }

  if (section === "skills") {
    if (editing) return <SkillsEditor value={profile.skills} onSave={onSave} onCancel={onCancel} />
    if (profile.skills.length === 0) return <EmptyState label="No skills found." />
    return (
      <ul className="flex flex-wrap gap-2">
        {profile.skills.map((skill) => (
          <Badge key={skill} variant="secondary">
            {skill}
          </Badge>
        ))}
      </ul>
    )
  }

  // location
  if (editing) return <LocationEditor value={profile.location} onSave={onSave} onCancel={onCancel} />
  const loc = [profile.location?.city, profile.location?.country].filter(Boolean).join(", ")
  return <p className="text-sm text-foreground">{loc || "Not found"}</p>
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>
}

function formatDateRange(start: string | null, end: string | null) {
  const s = start ? start.slice(0, 10) : "?"
  const e = end ? end.slice(0, 10) : "Present"
  return `${s} — ${e}`
}

export { ConfirmInformationStep }
