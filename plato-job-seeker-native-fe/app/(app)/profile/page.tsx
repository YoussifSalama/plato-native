"use client"

import { Suspense, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowUp, Check, FileText, Puzzle } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MatchRing, PlatoNote, StatusPill } from "@/components/plato-ui"
import { openPlato } from "@/components/app-shell"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getCareerResume, listCareerResumes } from "@/lib/career/api"
import { getProfile, listDocuments } from "@/lib/documents/api"
import type { JobSeekerDocument, JobSeekerProfile } from "@/lib/documents/schema"
import { getExtensionProgress } from "@/lib/extension/api"
import { getApplyReadiness, getIntake, type ApplyReadiness, type IntakeItem } from "@/lib/jobs/api"
import { getPreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { formatPreferenceSummary } from "@/lib/preference-format"
import { ResumeFactsPanel } from "./resume-facts"

// Profile (screen 12): everything Plato knows and uses on every application, in one place.
// The onboarding answers are edited here; "tell Plato" changes anything in plain words.
const TABS = [
  { key: "resumes", label: "Resumes" },
  { key: "experience", label: "Experience & skills" },
  { key: "looking", label: "What I'm looking for" },
  { key: "answers", label: "Application answers" },
  { key: "documents", label: "Documents & browser" },
] as const
type Tab = (typeof TABS)[number]["key"]
type Resume = Awaited<ReturnType<typeof listCareerResumes>>[number]

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
const DOC_LABEL: Record<JobSeekerDocument["type"], string> = { CV_RESUME: "Resume / CV", CERTIFICATE: "Certificate", LICENSE: "License", DEGREE: "Degree", OTHER: "Other document" }

function ProfileContent() {
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "resumes"
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<JobSeekerProfile | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [readiness, setReadiness] = useState<ApplyReadiness | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [tell, setTell] = useState("")

  useEffect(() => {
    getMe().then(setUser).catch(() => undefined)
    getProfile().then(setProfile).catch(() => undefined)
    getPreferences().then(setPrefs).catch(() => undefined)
    getApplyReadiness().then(setReadiness).catch(() => undefined)
    getExtensionProgress()
      .then((p) => setLinked(p.linked))
      .catch(() => setLinked(null))
  }, [])

  const current = profile?.experiences?.[0]
  const location = [profile?.location?.city, profile?.location?.country].filter(Boolean).join(", ")
  const setup = [readiness?.ready, prefs?.source === "USER_CONFIRMED", linked]
  const done = setup.filter(Boolean).length
  const links = [
    ["LinkedIn", prefs?.linkedin_url],
    ["GitHub", prefs?.github_url],
    ["Portfolio", prefs?.portfolio_url],
  ].filter(([, u]) => u) as [string, string][]

  // What would get more interviews, from the server's own readiness check.
  const suggestions: { title: string; body: string; action: ReactNode }[] = [
    ...(readiness?.missing ?? []).map((m) => ({ title: `Add ${m.label.toLowerCase()}`, body: m.why, action: <Link href="/onboarding?step=2">Add it</Link> })),
    ...(prefs && !prefs.portfolio_url ? [{ title: "Add your portfolio link", body: "A link lets Plato paste it into forms that only accept URLs.", action: <Link href="/onboarding?step=2">Add link</Link> }] : []),
    ...(readiness?.recommended ?? []).slice(0, 2).map((r) => ({ title: "Answer once, never again", body: r.question, action: <Link href="/profile?tab=answers">Answer</Link> })),
    { title: "Make your bullets stronger", body: "A bullet with a number (sites, users, time saved) gets more replies.", action: <button type="button" onClick={() => openPlato("Add numbers to my weakest resume bullets")}>Fix with Plato</button> },
  ].slice(0, 3)

  function sendTell(e: React.FormEvent) {
    e.preventDefault()
    if (!tell.trim()) return
    openPlato(tell.trim())
    setTell("")
  }

  return (
    <div className={PAGE}>
      {/* Who you are to Plato, and how ready it is to apply for you. */}
      <section data-tour="page-header" className="flex flex-wrap items-center gap-5 rounded-[22px] border bg-card p-6 shadow-card">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-foreground text-2xl font-bold text-white">{user ? initials(user.full_name) : ""}</span>
        <div className="min-w-[220px] flex-1">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{user ? titleCase(user.full_name) : <Skeleton className="h-7 w-48" />}</h1>
          <p className="text-text-secondary">{current ? `${current.title} · ${current.company}` : "Your CV details appear here once Plato reads it."}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {location && <span>{location}</span>}
            {user && <span className="text-text-secondary">{user.email}</span>}
            {links.map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                {label}
              </a>
            ))}
            {prefs && !prefs.portfolio_url && (
              <Link href="/onboarding?step=2" className="font-semibold text-primary hover:underline">
                + Add portfolio
              </Link>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <MatchRing value={(done / 3) * 100} size={56} label={`${done}/3`} />
          <span>
            <b className="block">{done === 3 ? "Ready to apply" : "Almost there"}</b>
            <span className="text-sm text-text-secondary">{readiness?.missing[0] ? `Add ${readiness.missing[0].label.toLowerCase()}` : linked === false ? <Link href="/profile?tab=documents" className="text-primary hover:underline">Link your browser</Link> : "Nothing missing"}</span>
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <nav role="tablist" aria-label="Profile" className="scroll-thin flex gap-6 overflow-x-auto border-b border-foreground/10">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-ai={`profile.tab.${t.key}`} onClick={() => router.replace(t.key === "resumes" ? "/profile" : `/profile?tab=${t.key}`, { scroll: false })} className={cn("-mb-px border-b-2 py-3 text-[15px] whitespace-nowrap transition-colors", tab === t.key ? "border-primary font-semibold text-primary" : "border-transparent font-medium text-text-secondary hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Change anything in plain words; the Plato chat does the edit. */}
          <form onSubmit={sendTell} className="surface-panel flex items-center gap-2 rounded-2xl py-1.5 pr-1.5 pl-3">
            <label htmlFor="profile-tell" className="sr-only">
              Tell Plato what to change
            </label>
            <input id="profile-tell" data-ai="profile.tell" value={tell} onChange={(e) => setTell(e.target.value)} placeholder="Change anything by telling Plato, e.g. “my notice period is 2 months”" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-text-tertiary" />
            <Button type="submit" size="icon" aria-label="Send to Plato" className="rounded-xl">
              <ArrowUp className="size-4" />
            </Button>
          </form>

          {tab === "resumes" && <ResumesTab />}
          {tab === "experience" && (
            <div className="flex flex-col gap-4">
              {!!profile?.experiences?.length && (
                <Card title="From your CV" action={<Link href="/onboarding?step=1">Replace CV</Link>}>
                  <ul className="flex flex-col divide-y divide-divider">
                    {profile.experiences.map((x) => (
                      <li key={x.id} className="py-2.5">
                        <b>{x.title}</b> <span className="text-text-secondary">· {x.company}</span>
                        <p className="text-xs text-text-tertiary">{[x.start_date?.slice(0, 4), x.end_date?.slice(0, 4) ?? "now"].filter(Boolean).join(" – ")}</p>
                        {x.description && <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{x.description}</p>}
                      </li>
                    ))}
                  </ul>
                  {!!profile.skills?.length && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {profile.skills.map((s) => (
                        <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-[12.5px] font-medium text-text-secondary">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              <ResumeFactsPanel />
            </div>
          )}
          {tab === "looking" && (
            <Card title="What I'm looking for" action={<Link href="/onboarding?step=2">Edit</Link>}>
              {prefs ? (
                <dl className="flex flex-col divide-y divide-divider">
                  {Object.entries({ Roles: "roles", Locations: "locations", "Work setup": "work_setup", "Job type": "employment_type", Experience: "experience", "Expected salary": "salary", Industries: "industries", "Things to avoid": "things_to_avoid" } as const).map(([label, k]) => (
                    <div key={k} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[200px_1fr]">
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
          {tab === "documents" && <DocumentsTab linked={linked} />}
        </section>

        <aside className="flex flex-col gap-3 rounded-[22px] border border-primary-line bg-primary-tint/80 p-4">
          <PlatoNote variant="headline">
            <span className="block text-xs font-bold tracking-[0.04em] text-primary uppercase">Plato suggests</span>
            <b className="text-base text-foreground">
              {suggestions.length} change{suggestions.length === 1 ? "" : "s"} for more interviews
            </b>
          </PlatoNote>
          {suggestions.map((s) => (
            <div key={s.title} className="flex flex-col items-start gap-2 rounded-2xl border bg-card p-4">
              <b>{s.title}</b>
              <p className="text-sm text-text-secondary">{s.body}</p>
              <span className="rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary-line [&>*]:outline-none">{s.action}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[22px] border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {action && <span className="rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary-line">{action}</span>}
      </div>
      {children}
    </section>
  )
}

function ResumesTab() {
  const [resumes, setResumes] = useState<Resume[] | null>(null)
  useEffect(() => {
    listCareerResumes()
      .then(setResumes)
      .catch(() => setResumes([]))
  }, [])
  async function pdf(id: string) {
    const blob = await getCareerResume(id)
    window.open(URL.createObjectURL(blob), "_blank", "noopener")
  }
  return (
    <Card title="Resumes" action={<Link href="/career">Build one with Plato</Link>}>
      {resumes === null && <Skeleton className="h-32 rounded-xl" />}
      {resumes?.length === 0 && <PlatoNote variant="inline">No resumes yet. Plato writes one for each job it applies to, and you can build one in Career.</PlatoNote>}
      {!!resumes?.length && (
        <>
          <p className="eyebrow">Written by Plato · {resumes.length}</p>
          <ul className="flex flex-col gap-2">
            {resumes.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <FileText className="size-[18px] shrink-0 text-text-secondary" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{r.title}</b>
                  <span className="text-xs text-text-secondary">
                    {r.target_role ?? "General"} · version {r.version}
                  </span>
                </span>
                {r.approved && <StatusPill tone="success">Approved</StatusPill>}
                <button type="button" onClick={() => void pdf(r.id)} className="text-sm font-semibold text-primary hover:underline">
                  PDF
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function AnswersTab({ prefs }: { prefs: Preferences | null }) {
  const [intake, setIntake] = useState<IntakeItem[] | null>(null)
  useEffect(() => {
    getIntake()
      .then(setIntake)
      .catch(() => setIntake([]))
  }, [])
  const summary = prefs ? formatPreferenceSummary(prefs) : null
  return (
    <Card title="Application answers" action={<Link href="/onboarding?step=2">Edit</Link>}>
      <p className="-mt-1 text-sm text-text-secondary">Plato puts these on every form that asks. You answered once.</p>
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
            <div key={label} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[260px_1fr]">
              <dt className="text-text-secondary">{label}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        {intake?.map((q) => (
          <div key={q.key} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[260px_1fr]">
            <dt className="text-text-secondary">{q.question}</dt>
            <dd className={cn("font-semibold", !q.value && "font-normal text-text-tertiary")}>{q.sensitive && q.value ? "Saved (private)" : (q.value ?? "Not yet: Plato asks when a form needs it")}</dd>
          </div>
        ))}
      </dl>
      {intake === null && <Skeleton className="h-24 rounded-xl" />}
    </Card>
  )
}

function DocumentsTab({ linked }: { linked: boolean | null }) {
  const [docs, setDocs] = useState<JobSeekerDocument[] | null>(null)
  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch(() => setDocs([]))
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <Card title="Documents" action={<Link href="/onboarding?step=1">Add documents</Link>}>
        {docs === null && <Skeleton className="h-24 rounded-xl" />}
        {docs?.length === 0 && <PlatoNote variant="inline">No documents yet. Add your CV and Plato fills in the rest.</PlatoNote>}
        <ul className="flex flex-col divide-y divide-divider">
          {docs?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <span className={cn("flex size-9 items-center justify-center rounded-[10px]", d.status === "READY" ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>{d.status === "READY" ? <Check className="size-4" /> : <FileText className="size-4" />}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{d.name ?? DOC_LABEL[d.type]}</b>
                <span className="text-xs text-text-secondary">{DOC_LABEL[d.type]}</span>
              </span>
              {d.status === "FAILED" && <StatusPill tone="danger">Could not read</StatusPill>}
            </li>
          ))}
        </ul>
      </Card>
      <section className="flex flex-wrap items-center gap-3 rounded-[22px] border bg-card p-5 shadow-card">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
          <Puzzle className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block">Plato Apply in Chrome</b>
          <span className="text-sm text-text-secondary">{linked === null ? "Checking…" : linked ? "Linked to your account" : "Not linked yet"}</span>
        </span>
        <Link href="/extension" className="rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary-line">
          {linked ? "Manage browsers" : "Link a browser"}
        </Link>
      </section>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  )
}
