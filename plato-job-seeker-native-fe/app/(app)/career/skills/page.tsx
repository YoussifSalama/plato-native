"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { ArrowRight, BadgeCheck, ChevronDown, ExternalLink, GraduationCap, Lightbulb, Loader2, PlayCircle, ScanSearch, ShieldCheck, Target, Trash2, Upload } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/plato-ui"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { CareerNav } from "@/components/career-nav"
import { InfoTip } from "@/components/info-tip"
import { bankFor, slug } from "@/lib/career-hub/content"
import { proofHref } from "@/lib/career-hub/snapshot"
import { uploadDocument } from "@/lib/documents/api"
import { addCredential, deleteCredential, getSkillGap, listCredentials, updateCredential, type Course, type Credential, type SkillGap } from "@/lib/skills/api"

// Repeated row CTAs use the soft primary (the page has no single main action).
const SOFT = "border-transparent bg-primary-soft text-primary shadow-none transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
const KIND: Record<Course["kind"], string> = { "professional-certificate": "Certificate programme", course: "Course", "certification-exam": "Certification exam" }

// What the dialog is finishing: a catalogue course for a skill, or an in-progress credential.
type Finishing = { skill: string; course?: Course; credential?: Credential } | null

export default function SkillsPage() {
  const [data, setData] = useState<{ jobsAnalysed: number; skills: SkillGap[] } | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [finishing, setFinishing] = useState<Finishing>(null)
  const [removing, setRemoving] = useState<Credential | null>(null)
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
    <div className={PAGE}>
      <PageHeader title="Skills gap" description="Skills your best-matching jobs ask for that your profile does not show yet. Learn one, add the certificate link, and Plato checks it before adding it.">
        <CareerNav />
      </PageHeader>
      {error && <p className="rounded-xl border border-l-[3px] border-l-destructive bg-card p-3 text-sm text-destructive shadow-card">Could not load your skills gap.</p>}
      {!data && !error && (
        <div aria-busy="true" className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))}
          </div>
          <div className={cn(CARD, "flex flex-col gap-4 p-5")}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      )}
      {data && (
        <div data-tour="skills-stats" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile value={data.skills.length} label="Skills to learn" icon={Lightbulb} accent="cobalt" index={0} />
          <StatTile value={data.jobsAnalysed} label="Jobs analysed" icon={ScanSearch} accent="cobalt" index={1} />
          <StatTile value={credentials.filter((c) => c.status === "IN_PROGRESS").length} label="Courses in progress" icon={PlayCircle} accent="azure" index={2} />
          <StatTile value={credentials.filter((c) => c.verification === "VERIFIED").length} label="Verified on profile" icon={ShieldCheck} accent="green" index={3} />
        </div>
      )}
      {data && (
        <section data-tour="skills-gap" data-tour-state={data.skills.length ? "skills.list" : "skills.empty"} className="flex flex-col gap-3">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                Skills your matches ask for
                <InfoTip text="Plato reads up to 300 of your best current matches; Jobs analysed counts the ones that name skills it knows. A skill is listed when those jobs ask for it and your profile doesn't show it. Unlocks: jobs where it is the only skill you're missing." label="How the skills gap is found" />
              </span>
            }
            icon={Target}
            accent="cobalt"
          />
          <div className={cn(CARD, "px-3 py-1 sm:px-4")}>
          {!data.skills.length && (
            <EmptyState
              icon={Lightbulb}
              className="my-4 border-0"
              title={data.jobsAnalysed ? `No gaps found in ${data.jobsAnalysed} jobs` : "No jobs analysed yet"}
              hint={data.jobsAnalysed ? "Run a search to analyse more." : "Run a search in Jobs. Plato compares the jobs that match you with your profile and lists what is missing."}
              action={
                <Link href="/jobs" data-ai="skills.find-jobs" className={cn("group/cta inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold", SOFT)}>
                  Find jobs
                  <ArrowRight className="size-3.5 transition-transform group-hover/cta:translate-x-0.5" />
                </Link>
              }
            />
          )}
          <ul>
            {data.skills.map((s, i) => (
              <li key={s.skill} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }} className="border-b border-divider py-1.5 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 last:border-b-0">
                <button type="button" data-ai={`skills.row:${slug(s.skill)}`} onClick={() => setOpen(open === s.skill ? null : s.skill)} aria-expanded={open === s.skill} className="group flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-muted/60">
                  <span className="font-semibold text-foreground">{s.skill}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                    <span>
                      missing in {s.missingIn} of {data.jobsAnalysed} jobs
                      {s.unlocks > 0 && <b className="ml-2 text-success-ink">unlocks {s.unlocks}</b>}
                    </span>
                    {s.courses.length > 0 && (
                      <span className="flex items-center gap-1 text-primary transition-colors duration-200 group-hover:text-primary-hover">
                        <GraduationCap className="size-4" />
                        {s.courses.length} way{s.courses.length === 1 ? "" : "s"} to learn
                        <ChevronDown className={cn("size-4 transition-transform duration-200", open === s.skill && "rotate-180")} />
                      </span>
                    )}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open === s.skill && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div data-tour="skills-courses" className="grid gap-2.5 px-2 pt-1.5 pb-2">
                        {s.courses.length === 0 && <p className="text-sm text-text-secondary">No curated course for this one yet. Ask Plato in Career chat for a way to learn it.</p>}
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
                          Already know it?
                          {bankFor(s.skill) && (
                            <Link href={`/career/assessments/${slug(bankFor(s.skill)!.skill)}`} data-ai={`skills.assess:${slug(s.skill)}`} className="font-semibold text-primary transition-colors duration-200 hover:text-primary-hover hover:underline">
                              Take the assessment
                            </Link>
                          )}
                          <Link href={proofHref(s.skill)} data-ai={`skills.prove:${slug(s.skill)}`} className="font-semibold text-primary transition-colors duration-200 hover:text-primary-hover hover:underline">
                            Prove it with a challenge
                          </Link>
                        </p>
                        {s.courses.map((c) => {
                          const mine = credentialFor(c.id)
                          return (
                            <div key={c.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3.5 transition-colors duration-200 hover:border-primary-line">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{c.title}</p>
                                  <p className="text-xs text-text-secondary">
                                    {c.provider} · {KIND[c.kind]} · {c.cost} · {c.duration}
                                  </p>
                                </div>
                                <a href={c.url} target="_blank" rel="noreferrer" className="group/link flex shrink-0 items-center gap-1 text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-hover">
                                  Open <ExternalLink className="size-3 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                                </a>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!mine && (
                                  <Button size="sm" variant="outline" data-ai={`skills.taking:${c.id}`} className="gap-1.5" onClick={() => void start(s.skill, c)}>
                                    <PlayCircle className="size-3.5" />
                                    I&apos;m taking it
                                  </Button>
                                )}
                                {mine?.status === "IN_PROGRESS" && <StatusPill tone="warning">In progress</StatusPill>}
                                {mine?.status === "COMPLETED" && <StatusPill tone="success">Completed</StatusPill>}
                                {mine?.status !== "COMPLETED" && (
                                  <Button size="sm" data-ai={`skills.finished:${c.id}`} className={cn("gap-1.5", SOFT)} onClick={() => begin(mine ? { skill: s.skill, credential: mine } : { skill: s.skill, course: c })}>
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
        </section>
      )}

      <section data-tour="skills-credentials" className="flex flex-col gap-3">
        <SectionHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Your courses and certificates
              <InfoTip text="Verified: Plato opened your public certificate link from a known issuer and found your name and the course on it, so the skill is added to your profile and matching. Self-reported: an uploaded file or a link it couldn't check; it stays listed but isn't added." label="Verified vs self-reported" />
            </span>
          }
          icon={GraduationCap}
          accent="cobalt"
        />
        {credentials.length === 0 && <EmptyState icon={GraduationCap} title="Nothing yet" hint="Start a course above, or finish one and add its link." />}
        {credentials.map((c, i) => (
          <div key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }} className={cn(CARD, "flex flex-col gap-1.5 p-4 transition-colors duration-200 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both hover:border-primary-line")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {c.title} <span className="font-normal text-text-secondary">· {c.skill}</span>
              </p>
              <div className="flex items-center gap-2">
                {c.status === "IN_PROGRESS" ? (
                  <>
                    <StatusPill tone="warning">In progress</StatusPill>
                    <Button size="sm" data-ai={`skills.cert.finish:${c.id}`} className={SOFT} onClick={() => begin({ skill: c.skill, credential: c })}>
                      Mark finished
                    </Button>
                  </>
                ) : c.verification === "VERIFIED" ? (
                  <StatusPill tone="success">
                    <ShieldCheck className="size-3.5" />
                    Verified{c.verified_issuer ? ` · ${c.verified_issuer}` : ""}
                  </StatusPill>
                ) : (
                  <StatusPill tone="neutral">Self-reported</StatusPill>
                )}
                <button type="button" aria-label="Remove" data-ai={`skills.cert.remove:${c.id}`} onClick={() => setRemoving(c)} className="rounded-md p-2.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            {c.status === "COMPLETED" && c.verification_note && <p className="text-xs text-text-secondary">{c.verification_note}</p>}
            {c.verification === "VERIFIED" && <p className="text-xs text-success-ink">Added to your profile and your matching.</p>}
          </div>
        ))}
      </section>

      <ConfirmDialog open={!!removing} title={`Remove ${removing?.title ?? "this course"}?`} confirmLabel="Remove" onCancel={() => setRemoving(null)} onConfirm={() => void (removing && deleteCredential(removing.id).then(reload).finally(() => setRemoving(null)))}>
        <p>It comes off your courses and certificates.</p>
      </ConfirmDialog>

      <ConfirmDialog open={!!finishing} title={`Finished: ${finishing?.course?.title ?? finishing?.credential?.title ?? ""}`} confirmLabel={saving ? "Checking…" : "Save"} onCancel={() => !saving && setFinishing(null)} onConfirm={() => void finish()}>
        <div className="flex flex-col gap-3">
          <p>Add the public link to your certificate (Coursera, Credly, Microsoft and a few other issuers) and Plato checks it. Only a checked link is added to your profile.</p>
          <Input type="url" aria-label="Certificate link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.credly.com/badges/…" />
          <input ref={picker} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
          <button type="button" onClick={() => picker.current?.click()} className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary-hover hover:underline">
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
