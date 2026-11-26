"use client"

import { Suspense, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Compass, FileText, Loader2, MessageSquareText, RefreshCw, Upload, UserPen } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CARD, EmptyState, MatchRing, PlatoNote, StatIcon, StatusPill } from "@/components/plato-ui"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { useProfileStrength } from "@/components/app-shell"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getCareerResume, getResumeScore, listCareerResumes, type ResumeScore } from "@/lib/career/api"
import { getSkillGap, type SkillGap } from "@/lib/skills/api"
import { analyzeProfile, getDocumentsStatus, getProfile, listDocuments } from "@/lib/documents/api"
import type { JobSeekerDocument, JobSeekerProfile } from "@/lib/documents/schema"
import { getExtensionProgress } from "@/lib/extension/api"
import { getApplyReadiness, getIntake, type ApplyReadiness, type IntakeItem } from "@/lib/jobs/api"
import { getPreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { formatPreferenceSummary } from "@/lib/preference-format"
import { ResumeFactsPanel } from "./resume-facts"
import { Card, ProfileSections, ROW } from "./profile-editor"
import { DocumentsTab, openFile } from "./documents-tab"
import { PillTabs } from "@/components/pill-tabs"
import { InfoTip } from "@/components/info-tip"

// Profile (screen 12): everything Plato knows and uses on every application, in one place.
// Edited here, card by card; the job preferences open the onboarding form in edit mode and
// come back. Name and contact live in Settings. The command bar changes anything in plain words.
const TABS = [
  { key: "resumes", label: "Resumes" },
  { key: "experience", label: "Experience & skills" },
  { key: "looking", label: "What I'm looking for" },
  { key: "answers", label: "Application answers" },
  { key: "documents", label: "Documents & browser" },
] as const
type Tab = (typeof TABS)[number]["key"]
type Resume = Awaited<ReturnType<typeof listCareerResumes>>[number]

const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
// Repeated row actions: the soft primary. The one main action per view stays solid.
const SOFT = "inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
// Where each fix lives: the card on this page, Settings, or the preferences form (back here after).
const EDIT_LOCATION = "/profile?tab=experience&edit=location"
const EDIT_LINKS = "/profile?tab=experience&edit=links"
const editPrefs = (tab: Tab) => `/onboarding?step=2&return=${encodeURIComponent(`/profile?tab=${tab}`)}`
const FIX: Record<string, string> = { resume: "/profile?tab=documents", phone: "/settings", location: EDIT_LOCATION }

function ProfileContent() {
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "resumes"
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<JobSeekerProfile | null | undefined>(undefined)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [readiness, setReadiness] = useState<ApplyReadiness | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const strength = useProfileStrength()
  const [score, setScore] = useState<ResumeScore | null>(null)
  const [gaps, setGaps] = useState<SkillGap[] | null>(null)
  const [hasPortfolio, setHasPortfolio] = useState(false)
  const [checked, setChecked] = useState(false)
  // Documents added or replaced since Plato last read the profile (the server decides).
  const [stale, setStale] = useState(false)
  const [asking, setAsking] = useState(false)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const refreshStatus = () =>
    void getDocumentsStatus()
      .then((r) => setStale(r.needs_analysis))
      .catch(() => undefined)
  async function readAgain() {
    setAsking(false)
    setReading(true)
    setReadError(null)
    try {
      setProfile((await analyzeProfile()).profile)
      setStale(false)
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Plato could not read your documents")
    } finally {
      setReading(false)
    }
  }

  useEffect(() => {
    getMe().then(setUser).catch(() => undefined)
    getResumeScore().then(setScore).catch(() => undefined)
    getSkillGap()
      .then((g) => setGaps(g.skills))
      .catch(() => setGaps([]))
    listDocuments()
      .then((d) => setHasPortfolio(d.some((x) => x.type === "PORTFOLIO" || /portfolio/i.test(x.name ?? ""))))
      .catch(() => undefined)
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
    void Promise.allSettled([getPreferences().then(setPrefs), getApplyReadiness().then(setReadiness)]).then(() => setChecked(true))
    getExtensionProgress()
      .then((p) => setLinked(p.linked))
      .catch(() => setLinked(null))
    refreshStatus()
  }, [])

  const current = profile?.experiences?.[0]
  const location = [profile?.location?.city, profile?.location?.country].filter(Boolean).join(", ")
  // The same score as the sidebar's "Profile strength", so the two never disagree.
  const pct = strength ? Math.round((strength.done / strength.total) * 100) : 0
  const years = prefs ? (formatPreferenceSummary(prefs).experience.split(" · ").at(-1) ?? "") : ""
  const links = [
    ["LinkedIn", prefs?.linkedin_url],
    ["GitHub", prefs?.github_url],
    ["Portfolio", prefs?.portfolio_url],
  ].filter(([, u]) => u) as [string, string][]

  // What would get more interviews, from the server's own readiness check.
  // Plato suggests (screen 12): specific, from the seeker's own data. Bullets without a
  // number (quoted), a skill their matches keep asking for, the portfolio link, then
  // anything the apply check still misses.
  const career = (prompt: string) => `/career?prompt=${encodeURIComponent(prompt)}`
  const weak = score?.bulletsWithoutNumbers
  const quote = (t: string) => {
    const w = t.replace(/[.;]$/, "").split(/\s+/)
    return w.length > 6 ? `${w.slice(0, 6).join(" ")}…` : w.join(" ")
  }
  const gap = gaps?.[0]
  const suggestions: { title: string; body: ReactNode; action: ReactNode }[] = [
    ...(weak?.count
      ? [{ title: `Add numbers to ${weak.count} bullet${weak.count === 1 ? "" : "s"}`, body: weak.examples[0] ? <>&ldquo;{quote(weak.examples[0])}&rdquo; becomes stronger with how many sites, users or how much time saved.</> : "A number (sites, users, time saved) makes a bullet stronger.", action: <Link href={career("Help me add numbers to my resume bullets that have none, one at a time")}>Fix with Plato</Link> }]
      : []),
    ...(gap
      ? [{ title: `Add “${gap.skill}” to your resume`, body: `It appears in ${gap.missingIn} of your matches. Only if you have done it.`, action: <Link href={career(`I have experience with ${gap.skill}. Help me show it on my resume`)}>Preview change</Link> }]
      : []),
    ...(prefs && !prefs.portfolio_url ? [{ title: "Add your portfolio link", body: hasPortfolio ? "You uploaded a portfolio file. A link lets Plato paste it into forms that only accept URLs." : "A link lets Plato paste it into forms that only accept URLs.", action: <Link href={EDIT_LINKS}>Add link</Link> }] : []),
    ...(readiness?.missing ?? []).map((m) => ({ title: `Add ${m.label.toLowerCase()}`, body: m.why, action: <Link href={FIX[m.key] ?? editPrefs("answers")}>Add it</Link> })),
    ...(readiness?.recommended ?? []).slice(0, 2).map((r) => ({ title: r.question, body: "Answer once, never again: Plato puts it on every form that asks.", action: <Link href={editPrefs("answers")}>Answer</Link> })),
  ].slice(0, 3)
  // Wait for the checks that feed the suggestions before counting them.
  const suggesting = checked && gaps !== null

  return (
    <div className={PAGE}>
      <PageHeader
        title="Profile"
        description="Everything Plato knows about you and puts on every application. Change anything here."
        actions={
          <>
            {stale && (
              <button type="button" data-ai="profile.read-again" disabled={reading} onClick={() => setAsking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover disabled:opacity-60">
                {reading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Update my profile from new documents
              </button>
            )}
            <Link href="/settings" data-ai="profile.edit-contact" className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-semibold transition-colors duration-200 hover:border-primary-line hover:text-primary">
              <UserPen className="size-4" />
              Name and contact
            </Link>
          </>
        }
      />
      {readError && (
        <p role="alert" className="text-sm text-destructive">
          {readError}
        </p>
      )}
      <ConfirmDialog open={asking} title="Update your profile from your documents?" confirmLabel="Update my profile" onCancel={() => setAsking(false)} onConfirm={() => void readAgain()}>
        Plato reads your CV and the documents you added since, then rewrites your experience, education, certifications, languages and skills from them. Edits you made to those sections here are replaced. Verified certificates stay.
      </ConfirmDialog>
      {/* Who you are to Plato, and how ready it is to apply for you. */}
      <section className={cn(CARD, "relative isolate flex flex-wrap items-center gap-4 overflow-hidden px-5 py-4 sm:px-6 sm:py-5")}>
        {/* The soft brand glow every page hero shares (cobalt top-left, azure bottom-right). */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground ring-4 ring-primary-soft">{user ? initials(user.full_name).slice(0, 1) : ""}</span>
        <div className="min-w-[220px] flex-1">
          <h2 className="type-section-title text-foreground">{user ? user.full_name : <Skeleton className="h-7 w-48" />}</h2>
          <div className="text-text-secondary">{profile === undefined ? <Skeleton className="mt-1 h-4 w-40" /> : current ? [current.title, years && !/not set/i.test(years) ? years : current.company].filter(Boolean).join(" · ") : profile === null ? "Plato could not load your CV details." : "Your CV details appear here once Plato reads it."}</div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {location && <span>{location}</span>}
            {user && <span className="text-text-secondary">{user.email}</span>}
            {links.map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer" className="font-semibold text-primary transition-colors duration-200 hover:text-primary-hover hover:underline">
                {label}
              </a>
            ))}
            {prefs && !prefs.portfolio_url && (
              <Link href={EDIT_LINKS} className="font-semibold text-primary hover:underline">
                + Add portfolio
              </Link>
            )}
          </p>
        </div>
        <div data-tour="profile-strength" className="flex w-full items-center gap-3 rounded-xl border border-primary-line bg-card/80 px-4 py-2.5 backdrop-blur-sm sm:w-auto">
          <MatchRing value={pct} size={48} label={strength ? `${pct}%` : ""} />
          {!strength ? (
            <span className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3.5 w-32" />
            </span>
          ) : (
            <span>
              <b className="flex items-center gap-1.5">
                {!strength.next ? "Ready to apply" : pct >= 60 ? "Almost there" : "Getting started"}
                <InfoTip text="Profile strength: how many of five checks are done so Plato can apply without stopping to ask. Your application details, a portfolio link, a second document, a linked browser and a followed company." label="What profile strength means" />
              </b>
              {strength.next ? (
                <Link href={strength.next.href} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                  {strength.next.short}
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <span className="text-sm text-text-secondary">Nothing missing</span>
              )}
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section data-tour-state={`profile.${tab}`} className="flex min-w-0 flex-col gap-4">
          {/* On a phone the strip scrolls sideways; the fading edge says there is more. */}
          <PillTabs id="profile-tabs" tabs={TABS} value={tab} onChange={(k) => router.replace(k === "resumes" ? "/profile" : `/profile?tab=${k}`, { scroll: false })} label="Profile" dataAi="profile.tab" className="[mask-image:linear-gradient(to_right,black_80%,transparent)] md:[mask-image:none]" />

          {tab === "resumes" && <ResumesTab role={prefs?.roles?.[0] ?? null} />}
          {tab === "experience" && (
            <div className="flex flex-col gap-4">
              {profile === undefined ? <Skeleton className="h-48 rounded-2xl" /> : profile ? <ProfileSections key={params.get("edit") ?? ""} profile={profile} onProfile={setProfile} prefs={prefs} onPrefs={setPrefs} initialEdit={params.get("edit")} /> : <PlatoNote variant="inline">Plato could not load your profile. Refresh to try again.</PlatoNote>}
              <ResumeFactsPanel />
            </div>
          )}
          {tab === "looking" && (
            <Card title="What I'm looking for" icon={Compass} tour="profile-looking" action={<Link href={editPrefs("looking")} data-tour="profile-looking-edit">Edit</Link>}>
              {prefs ? (
                <dl className="flex flex-col divide-y divide-divider">
                  {Object.entries({ Roles: "roles", Locations: "locations", "Work setup": "work_setup", "Job type": "employment_type", Experience: "experience", "Expected salary": "salary", Industries: "industries", "Left out of searches": "things_to_avoid" } as const).map(([label, k]) => (
                    <div key={k} className={cn("-mx-2 grid grid-cols-1 gap-1 rounded-lg px-2 py-2.5 sm:grid-cols-[200px_1fr]", ROW)}>
                      <dt className="text-text-secondary">{label}</dt>
                      <dd className="font-semibold">{formatPreferenceSummary(prefs)[k]}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Skeleton className="h-48 rounded-xl" />
              )}
            </Card>
          )}
          {tab === "answers" && <AnswersTab prefs={prefs} />}
          {tab === "documents" && <DocumentsTab linked={linked} onChanged={refreshStatus} />}
        </section>

        <aside data-tour="profile-suggests" className="flex flex-col gap-3 rounded-2xl border border-primary-line bg-primary-tint/80 p-4">
          <PlatoNote variant="headline">
            <span className="block text-xs font-bold tracking-[0.04em] text-primary uppercase">Plato suggests</span>
            <b className="flex items-center gap-1.5 text-base text-foreground">
              {!suggesting ? "Looking for changes…" : suggestions.length ? `${suggestions.length} change${suggestions.length === 1 ? "" : "s"} for more interviews` : "Nothing to change right now"}
              <InfoTip text="Up to three changes picked from your own data: resume bullets with no number, a skill your matches keep asking for, a missing portfolio link and answers application forms need." label="How Plato picks suggestions" />
            </b>
          </PlatoNote>
          {suggestions.map((s, i) => (
            <div key={`${i}-${s.title}`} className="flex flex-col items-start gap-1.5 rounded-xl border bg-card p-3.5 shadow-card transition-[border-color,box-shadow] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both hover:border-primary-line" style={{ animationDelay: `${i * 70}ms` }}>
              <b className="type-card-title">{s.title}</b>
              <p className="text-[13.5px] leading-snug text-text-secondary">{s.body}</p>
              <span className="mt-0.5 flex [&>*]:inline-flex [&>*]:rounded-lg [&>*]:bg-primary-soft [&>*]:px-3 [&>*]:py-1.5 [&>*]:text-[13px] [&>*]:font-semibold [&>*]:text-primary [&>*]:transition-colors [&>*]:duration-200 [&>*:hover]:bg-primary [&>*:hover]:text-primary-foreground">{s.action}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

// Screen 12: the master resume (the CV they uploaded, the base for everything) and the
// versions Plato tailored from it, newest first.
function ResumesTab({ role }: { role: string | null }) {
  const [resumes, setResumes] = useState<Resume[] | null>(null)
  const [cv, setCv] = useState<JobSeekerDocument | null | undefined>(undefined)
  const [all, setAll] = useState(false)
  const [score, setScore] = useState<ResumeScore | null>(null)
  useEffect(() => {
    getResumeScore()
      .then(setScore)
      .catch(() => setScore(null))
    listCareerResumes()
      .then(setResumes)
      .catch(() => setResumes([]))
    listDocuments()
      .then((d) => setCv(d.find((x) => x.type === "CV_RESUME") ?? null))
      .catch(() => setCv(null))
  }, [])
  const [fileError, setFileError] = useState<string | null>(null)
  async function open(get: () => Promise<Blob>, download?: string) {
    setFileError(null)
    let blob: Blob
    try {
      blob = await get()
    } catch {
      return setFileError("Could not open that file. Try again.")
    }
    const url = URL.createObjectURL(blob)
    if (!download) return void window.open(url, "_blank", "noopener")
    const a = Object.assign(document.createElement("a"), { href: url, download })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const shown = all ? resumes : resumes?.slice(0, 4)
  return (
    <Card title="Resumes" icon={FileText} tour="profile-resumes" action={<Link href="/profile?tab=documents" data-tour="profile-upload" className="flex items-center gap-1.5"><Upload className="size-4" />{cv ? "Replace CV" : "Upload CV"}</Link>}>
      {fileError && (
        <p role="alert" className="text-sm text-destructive">
          {fileError}
        </p>
      )}
      {cv === undefined && <Skeleton className="h-16 rounded-xl" />}
      {cv && (
        <div data-tour="profile-master" className="flex flex-wrap items-center gap-3 rounded-xl border border-l-[3px] border-primary-line border-l-primary bg-primary-tint/60 px-4 py-3">
          <StatIcon icon={FileText} accent="cobalt" />
          <span className="min-w-[200px] flex-1">
            <b className="block truncate" title={cv.name ?? undefined}>Master resume{role ? ` · ${role}` : cv.name ? ` · ${cv.name}` : ""}</b>
            <span className="type-meta text-text-secondary">{[cv.updated_at && `Updated ${shortDate(cv.updated_at)}`, "used as the base for every tailored version"].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
            {score && (
              <Link href={`/career?prompt=${encodeURIComponent("Score my resume and help me fix the top issues")}`} title={score.topFixes.join(" ")} className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-bold tabular-nums", score.score >= 75 ? "bg-success-soft text-success-ink" : score.score >= 60 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-destructive")}>
                {score.score}/100
              </Link>
            )}
            {score && <InfoTip text="Your master resume scored out of 100 by fixed rules, not AI: contact and sections, numbers in your bullets, action verbs, length, headline and summary, and skills backed by experience. 75 or more is good; under 60 needs work." label="How the resume score works" className="-ml-2" />}
            <StatusPill tone="primary">Master</StatusPill>
            <button type="button" onClick={() => void openFile(cv.id).catch(() => setFileError("Could not open your CV. Try again."))} className={SOFT}>
              Preview
            </button>
            <button type="button" onClick={() => void openFile(cv.id, cv.name ?? "CV").catch(() => setFileError("Could not download your CV. Try again."))} className={SOFT}>
              Download
            </button>
          </span>
        </div>
      )}
      {cv === null && <PlatoNote variant="inline">Upload your CV and Plato tailors a version of it for every job.</PlatoNote>}
      {resumes === null && <Skeleton className="h-32 rounded-xl" />}
      {resumes?.length === 0 && cv && (
        <EmptyState
          icon={FileText}
          title="No tailored versions yet"
          hint="Plato writes one when you use Tailor & apply on Jobs."
          action={
            <Link href="/jobs" className={SOFT}>
              Find jobs
            </Link>
          }
        />
      )}
      {!!resumes?.length && (
        <>
          <p className="eyebrow flex items-center gap-1.5 pt-1">
            Tailored by Plato · {resumes.length}
            <InfoTip text="Your master resume is the CV you uploaded. A tailored version is a copy rewritten for one job, using only what is in your CV or saved on this profile; “changes from master” counts the edits." label="Master vs tailored resumes" />
          </p>
          <motion.ul data-tour="profile-tailored" variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2">
            {shown?.map((r) => (
              <motion.li key={r.id} variants={fadeUpItem} className="group flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint/50">
                <FileText className="size-[18px] shrink-0 text-text-tertiary transition-colors duration-200 group-hover:text-primary" />
                <span className="min-w-[180px] flex-1">
                  <b className="block truncate" title={r.title}>{r.title}</b>
                  <span className="type-meta text-text-secondary">{[r.created_at && (new Date(r.created_at).toDateString() === new Date().toDateString() ? "Today" : shortDate(r.created_at)), r.changes != null ? `${r.changes} change${r.changes === 1 ? "" : "s"} from master` : (r.target_role ?? "General")].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => void open(() => getCareerResume(r.id))} className={SOFT}>
                    Preview
                  </button>
                  <button type="button" onClick={() => void open(() => getCareerResume(r.id), `${r.title}.pdf`)} className={SOFT}>
                    PDF
                  </button>
                </span>
              </motion.li>
            ))}
          </motion.ul>
          {resumes.length > 4 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="group inline-flex items-center gap-1 self-start text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
              {all ? "Show fewer" : `See all ${resumes.length} tailored resumes`}
              <ArrowRight className={cn("size-3.5 transition-transform duration-200", all ? "-rotate-90" : "group-hover:translate-x-0.5")} />
            </button>
          )}
        </>
      )}
    </Card>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })

function AnswersTab({ prefs }: { prefs: Preferences | null }) {
  const [intake, setIntake] = useState<IntakeItem[] | null>(null)
  useEffect(() => {
    getIntake()
      .then(setIntake)
      .catch(() => setIntake([]))
  }, [])
  const summary = prefs ? formatPreferenceSummary(prefs) : null
  return (
    <Card title="Application answers" icon={MessageSquareText} tour="profile-answers" action={<Link href={editPrefs("answers")} data-tour="profile-answers-edit">Edit</Link>}>
      <p className="-mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
        Plato puts these on every form that asks. You answered once.
        <InfoTip text="Answers left empty are asked the first time a form needs them, then saved here. Optional personal ones, like gender, are never guessed and show only as “Saved (private)”." label="How application answers are used" />
      </p>
      <dl className="flex flex-col divide-y divide-divider">
        {summary &&
          (
            [
              ["Notice period", summary.availability],
              ["Visa sponsorship", summary.visa_sponsorship],
              ["Relocation", summary.relocation],
              ["Work authorization", summary.work_authorization],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className={cn("-mx-2 grid grid-cols-1 gap-1 rounded-lg px-2 py-2.5 sm:grid-cols-[260px_1fr]", ROW)}>
              <dt className="text-text-secondary">{label}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        {intake?.map((q) => (
          <div key={q.key} className={cn("-mx-2 grid grid-cols-1 gap-1 rounded-lg px-2 py-2.5 sm:grid-cols-[260px_1fr]", ROW)}>
            <dt className="text-text-secondary">{q.question}</dt>
            <dd className={cn("font-semibold", !q.value && "font-normal text-text-tertiary")}>{q.sensitive && q.value ? "Saved (private)" : (q.value ?? "Not yet: Plato asks when a form needs it")}</dd>
          </div>
        ))}
      </dl>
      {intake === null && <Skeleton className="h-24 rounded-xl" />}
    </Card>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  )
}
