"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { BadgeCheck, ChevronDown, ExternalLink, GraduationCap, Loader2, PlayCircle, ShieldCheck, Trash2, Upload } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { uploadDocument } from "@/lib/documents/api"
import { addCredential, deleteCredential, getSkillGap, listCredentials, updateCredential, type Course, type Credential, type SkillGap } from "@/lib/skills/api"

const KIND: Record<Course["kind"], string> = { "professional-certificate": "Certificate programme", course: "Course", "certification-exam": "Certification exam" }

// What the dialog is finishing: a catalogue course for a skill, or an in-progress credential.
type Finishing = { skill: string; course?: Course; credential?: Credential } | null

export default function SkillsPage() {
  const [data, setData] = useState<{ jobsAnalysed: number; skills: SkillGap[] } | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [finishing, setFinishing] = useState<Finishing>(null)
  const [link, setLink] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => listCredentials().then(setCredentials).catch(() => undefined), [])
  useEffect(() => {
    getSkillGap().then(setData, () => setError(true))
    void reload()
  }, [reload])

  const credentialFor = (courseId: string) => credentials.find((c) => c.course_id === courseId)

  async function start(skill: string, course: Course) {
    await addCredential({ skill, courseId: course.id, status: "IN_PROGRESS" })
    await reload()
  }

  function begin(f: NonNullable<Finishing>) {
    setLink("")
    setFile(null)
    setFormError(null)
    setFinishing(f)
  }

  async function finish() {
    if (!finishing) return
    setSaving(true)
    setFormError(null)
    try {
      // A certificate file is uploaded the same way as in onboarding; it stays self-reported (a file cannot be checked).
      const doc = file ? await uploadDocument(file, "CERTIFICATE") : null
      const body = { status: "COMPLETED" as const, credentialUrl: link.trim() || undefined, documentId: doc?.id }
      if (finishing.credential) await updateCredential(finishing.credential.id, body)
      else await addCredential({ skill: finishing.skill, courseId: finishing.course?.id, ...body })
      await reload()
      setFinishing(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:pr-6 lg:pl-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground">Skills gap</h1>
        <p className="text-sm text-text-secondary">Skills your best-matching jobs ask for that your profile does not show yet, with ways to learn them. Finish one, add your public certificate link, and Plato checks it before adding it to your profile.</p>
      </header>
      {error && <p className="text-sm text-destructive">Could not load your skills gap.</p>}
      {!data && !error && <Skeleton className="h-40 w-full" />}
      {data && (
        <div className="rounded-lg border bg-card px-5 py-1">
          {!data.skills.length && <p className="py-8 text-center text-sm text-text-secondary">No gaps found in {data.jobsAnalysed} jobs. Run a search to analyse more.</p>}
          <ul>
            {data.skills.map((s) => (
              <li key={s.skill} className="border-b border-divider py-3.5 last:border-b-0">
                <button type="button" onClick={() => setOpen(open === s.skill ? null : s.skill)} aria-expanded={open === s.skill} className="flex w-full items-center justify-between gap-4 text-left">
                  <span className="font-semibold text-foreground">{s.skill}</span>
                  <span className="flex items-center gap-3 text-sm text-text-secondary">
                    <span>
                      missing in {s.missingIn} of {data.jobsAnalysed} jobs
                      {s.unlocks > 0 && <b className="ml-2 text-success">unlocks {s.unlocks}</b>}
                    </span>
                    {s.courses.length > 0 && (
                      <span className="flex items-center gap-1 text-primary">
                        <GraduationCap className="size-4" />
                        {s.courses.length} way{s.courses.length === 1 ? "" : "s"} to learn
                        <ChevronDown className={cn("size-4 transition-transform", open === s.skill && "rotate-180")} />
                      </span>
                    )}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open === s.skill && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="grid gap-2.5 pt-3">
                        {s.courses.length === 0 && <p className="text-sm text-text-secondary">No curated course for this one yet. Ask Plato in Career chat for a way to learn it.</p>}
                        {s.courses.map((c) => {
                          const mine = credentialFor(c.id)
                          return (
                            <div key={c.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{c.title}</p>
                                  <p className="text-xs text-text-secondary">
                                    {c.provider} · {KIND[c.kind]} · {c.cost} · {c.duration}
                                  </p>
                                </div>
                                <a href={c.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                                  Open <ExternalLink className="size-3" />
                                </a>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!mine && (
                                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void start(s.skill, c)}>
                                    <PlayCircle className="size-3.5" />
                                    I&apos;m taking it
                                  </Button>
                                )}
                                {mine?.status === "IN_PROGRESS" && <span className="text-xs font-medium text-warning">In progress</span>}
                                {mine?.status === "COMPLETED" && <span className="text-xs font-medium text-success">Completed</span>}
                                {mine?.status !== "COMPLETED" && (
                                  <Button size="sm" className="gap-1.5" onClick={() => begin(mine ? { skill: s.skill, credential: mine } : { skill: s.skill, course: c })}>
                                    <BadgeCheck className="size-3.5" />
                                    I finished it
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">Your courses and certificates</h2>
        {credentials.length === 0 && <p className="text-sm text-text-secondary">Nothing yet. Start a course above, or finish one and add its link.</p>}
        {credentials.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {c.title} <span className="font-normal text-text-secondary">· {c.skill}</span>
              </p>
              <div className="flex items-center gap-2">
                {c.status === "IN_PROGRESS" ? (
                  <>
                    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">In progress</span>
                    <Button size="sm" onClick={() => begin({ skill: c.skill, credential: c })}>
                      Mark finished
                    </Button>
                  </>
                ) : c.verification === "VERIFIED" ? (
                  <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                    <ShieldCheck className="size-3.5" />
                    Verified{c.verified_issuer ? ` · ${c.verified_issuer}` : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">Self-reported</span>
                )}
                <button type="button" aria-label="Remove" onClick={() => void deleteCredential(c.id).then(reload)} className="rounded-sm p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            {c.status === "COMPLETED" && c.verification_note && <p className="text-xs text-text-secondary">{c.verification_note}</p>}
            {c.verification === "VERIFIED" && <p className="text-xs text-success">Added to your profile and your matching.</p>}
          </div>
        ))}
      </section>

      <ConfirmDialog open={!!finishing} title={`Finished: ${finishing?.course?.title ?? finishing?.credential?.title ?? ""}`} confirmLabel={saving ? "Checking…" : "Save"} onCancel={() => !saving && setFinishing(null)} onConfirm={() => void finish()}>
        <div className="flex flex-col gap-3">
          <p>Add the public link to your certificate (Coursera, Credly, Microsoft and a few other issuers) and Plato checks it. Only a checked link is added to your profile.</p>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.credly.com/badges/…" className="rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          <input ref={picker} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
          <button type="button" onClick={() => picker.current?.click()} className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Upload className="size-4" />
            {file ? file.name : "Or upload the certificate file (kept as self-reported)"}
          </button>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>
      </ConfirmDialog>
    </div>
  )
}
