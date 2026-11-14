"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Briefcase, Check, FileText, Library, ListChecks, Loader2, Search, Sparkles } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { PillTabs } from "@/components/pill-tabs"
import { CompanyAvatar } from "@/components/company-avatar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { getMatches, type JobMatch } from "@/lib/jobs/api"
import { formatTokens, getTokenEstimates } from "@/lib/credits/api"
import { createQuiz } from "@/lib/quizzes/api"
import type { QuizDetail, QuizSummary } from "@/lib/quizzes/contract"
import { GeneratingCard, useQuizPolling } from "../_ui/generating"
import { ActionBar, BTN_PRIMARY, BTN_SECONDARY, MainCard, SideCard, TestHeader, TestLayout } from "../_ui/shell"

// Build a company quiz: from a job Plato has, or from a pasted description. The same job (or text) twice opens the
// quiz the seeker already has, so nothing is built or charged twice.

type Tab = "job" | "text"
type JobList = "discover" | "saved"

export default function NewQuizPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("job")
  const [list, setList] = useState<JobList>("discover")
  const [q, setQ] = useState("")
  const [jobs, setJobs] = useState<JobMatch[] | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [cost, setCost] = useState<number | null>(null)
  const [building, setBuilding] = useState<QuizSummary | QuizDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTokenEstimates()
      .then((e) => setCost(e.estimates.find((x) => x.action === "quiz")?.about ?? null))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      getMatches({ tab: list, q: q.trim() || undefined, take: 30 })
        .then((r) => setJobs(r.items))
        .catch(() => setJobs([]))
    }, 250)
    return () => clearTimeout(t)
  }, [list, q])

  useQuizPolling(building?.status === "generating" ? building.id : null, (d) => {
    setBuilding(d)
    if (d.status === "ready") router.push(`/career/quizzes/${d.id}`)
  })

  const picked = useMemo(() => jobs?.find((m) => m.job.id === jobId) ?? null, [jobs, jobId])
  const canBuild = !busy && !building && (tab === "job" ? !!jobId : description.trim().length >= 80)

  async function build() {
    setBusy(true)
    setError(null)
    try {
      const made = await createQuiz(tab === "job" ? { jobId: jobId! } : { description: description.trim(), company: company.trim() || null, role: role.trim() || null })
      // already have one for this job: open it (no new card, nothing charged)
      if (made.status === "ready") return router.push(`/career/quizzes/${made.id}`)
      setBuilding(made)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={PAGE}>
      <TestHeader back={{ href: "/career/quizzes?tab=company", label: "Company quizzes" }} eyebrow="Company quiz" title="Build a quiz for a job" />
      <TestLayout
        main={
          building ? (
            <GeneratingCard quiz={building} onRetry={() => setBuilding(null)} />
          ) : (
            <MainCard
              top={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">What is the quiz for?</p>
                  <PillTabs
                    id="quiz-source"
                    label="Build from"
                    dataAi="quizzes.source"
                    tabs={[
                      { key: "job", label: "From a job", icon: Briefcase },
                      { key: "text", label: "Paste a description", icon: FileText },
                    ]}
                    value={tab}
                    onChange={setTab}
                  />
                </div>
              }
              bar={
                <ActionBar
                  left={
                    <Link href="/career/quizzes?tab=company" className={BTN_SECONDARY}>
                      <ArrowLeft className="size-4" /> Cancel
                    </Link>
                  }
                  note={
                    error ? (
                      <span role="alert" className="text-destructive">
                        {error}
                      </span>
                    ) : tab === "job" && picked ? (
                      <span className="truncate">
                        For <b className="text-foreground">{picked.job.title}</b> at <b className="text-foreground">{picked.job.company}</b>
                      </span>
                    ) : tab === "text" && description.trim().length < 80 ? (
                      "Paste at least a few lines of the description."
                    ) : null
                  }
                  right={
                    <button type="button" onClick={() => void build()} disabled={!canBuild} className={BTN_PRIMARY}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Build my quiz
                      {cost ? <span className="font-normal opacity-80">· ≈ {formatTokens(cost)} tokens</span> : null}
                    </button>
                  }
                />
              }
            >
              {tab === "job" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your jobs by title or company" aria-label="Search your jobs" className="h-11 rounded-xl pl-9" />
                    </div>
                    <PillTabs
                      id="quiz-jobs"
                      label="Which jobs"
                      dataAi="quizzes.jobs"
                      tabs={[
                        { key: "discover", label: "Your matches" },
                        { key: "saved", label: "Saved" },
                      ]}
                      value={list}
                      onChange={(k) => (setList(k), setJobs(null))}
                    />
                  </div>
                  <div role="radiogroup" aria-label="Choose a job" className="grid max-h-[460px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                    {jobs === null &&
                      Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                          <Skeleton className="size-10 rounded-xl" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    {jobs?.length === 0 && (
                      <p className="text-sm text-text-secondary md:col-span-2">
                        {q ? "No job matches that search." : list === "saved" ? "No saved jobs yet." : "No jobs yet. "}
                        {!q && list === "discover" && (
                          <Link href="/jobs/new" className="font-semibold text-primary hover:underline">
                            Start a search
                          </Link>
                        )}
                        {!q && " Or paste a description instead."}
                      </p>
                    )}
                    {jobs?.map((m) => {
                      const on = jobId === m.job.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setJobId(on ? null : m.job.id)}
                          className={cn(
                            "flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 hover:border-primary-line hover:bg-primary-tint",
                            on && "border-primary bg-primary-tint ring-1 ring-primary",
                          )}
                        >
                          <CompanyAvatar name={m.job.company} domain={m.job.company_domain} logo={m.job.company_logo} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-foreground">{m.job.title}</span>
                            <span className="block truncate text-sm text-text-tertiary">{[m.job.company, m.job.location].filter(Boolean).join(" · ")}</span>
                          </span>
                          {on && (
                            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={10}
                    maxLength={12000}
                    placeholder="Paste the job description: the role, what you'll do, and what they're looking for."
                    aria-label="Job description"
                    className="resize-y rounded-xl text-[15px]"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" aria-label="Company" className="h-11 rounded-xl" />
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" aria-label="Role" className="h-11 rounded-xl" />
                  </div>
                  <p className="text-xs text-text-tertiary">Naming the company lets Plato look up how it tests candidates.</p>
                </div>
              )}
            </MainCard>
          )
        }
        side={
          <>
            <SideCard title="How it's built" icon={Sparkles}>
              <ol className="flex flex-col gap-3">
                {[
                  "Plato reads the job: the role, its level and the skills it needs.",
                  "It looks up how the company screens candidates for that kind of role.",
                  "It writes 2-4 sections in that format, with a key and an explanation for every answer.",
                ].map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary tabular-nums">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </SideCard>
            <SideCard title="One quiz per job" icon={ListChecks}>
              <p className="text-sm leading-relaxed text-text-secondary">Building for a job you already have a quiz for opens that quiz. Retakes and their results stay inside it.</p>
            </SideCard>
            <SideCard title="Free alternatives" icon={Library}>
              <p className="text-sm leading-relaxed text-text-secondary">
                The{" "}
                <Link href="/career/quizzes?tab=library" className="font-medium text-primary hover:underline">
                  library
                </Link>{" "}
                has quizzes other seekers built, and the{" "}
                <Link href="/career/quizzes" className="font-medium text-primary hover:underline">
                  standard assessments
                </Link>{" "}
                cost nothing.
              </p>
            </SideCard>
          </>
        }
      />
    </div>
  )
}
