import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { PageMap } from "@/lib/page-map"

// Interactive question card the assistant attached to a message. Mirrors
// the backend intake card; answers go back as the next user message.
export type Choice = { value: string; label: string }
export type SalaryAnswer = { amount: number | null; currency: string; period: "MONTHLY" | "YEARLY" }
export type CardQuestion = {
  id: string
  label: string
  kind: "country" | "countries" | "choice" | "multi" | "salary"
  options?: Choice[]
  default?: string | string[] | SalaryAnswer | null
}
export type QuestionCard = { title: string; questions: CardQuestion[] }

export type ThreadMessage = {
  id: string
  role: "USER" | "ASSISTANT"
  content: string
  ui?: QuestionCard | null
  created_at: string
}

// Mirrors the backend JobSource enum; add a board here and in SOURCE_LABEL.
export const SOURCE_LABEL = {
  LINKEDIN: "LinkedIn",
  WORKABLE: "Workable",
  LEVER: "Lever",
  GREENHOUSE: "Greenhouse",
  ASHBY: "Ashby",
  INDEED: "Indeed",
  GOOGLE_JOBS: "Google Jobs",
  ZIPRECRUITER: "ZipRecruiter",
  GLASSDOOR: "Glassdoor",
  TALENT: "Talent.com",
  JOBBANK: "Job Bank",
  JOBILLICO: "Jobillico",
  DICE: "Dice",
  HANDSHAKE: "Handshake",
  BUILTIN: "Built In",
  WUZZUF: "Wuzzuf",
  REMOTIVE: "Remotive",
  JOBICY: "Jobicy",
  REMOTEOK: "Remote OK",
  HIMALAYAS: "Himalayas",
  JOOBLE: "Jooble",
  ADZUNA: "Adzuna",
  BAYT: "Bayt",
  NAUKRIGULF: "Naukrigulf",
  GULFTALENT: "GulfTalent",
  WEWORKREMOTELY: "We Work Remotely",
  WORKINGNOMADS: "Working Nomads",
  WELLFOUND: "Wellfound",
  ARC: "Arc",
  DYNAMITEJOBS: "Dynamite Jobs",
  JOBGETHER: "Jobgether",
  NODESK: "NoDesk",
} as const
export type JobSourceName = keyof typeof SOURCE_LABEL

// Where the posting was found stays on the row (apply routing, debugging), but the card leads with
// the employer. A board gets a small "via" credit only when we cannot be sure its terms allow
// showing a posting without one; company career systems (ATS) are the employer's own page.
// ponytail: conservative default; set a board to false once its terms are checked (see TODO section 2).
const OWN_PAGE: JobSourceName[] = ["GREENHOUSE", "LEVER", "WORKABLE", "ASHBY"]
export const attributionLabel = (s: JobSourceName) => (OWN_PAGE.includes(s) ? null : SOURCE_LABEL[s])

// Whether this seeker can take the job, worked out by the server from the posting's stated regions.
export type JobEligibility = { status: "open" | "restricted" | "relocation" | "unknown"; note: string }

export type SourceKey = "index" | Lowercase<JobSourceName>
export type SourceProgress = { status: "RUNNING" | "DONE" | "FAILED"; fetched: number; error?: string }
export type RunStage = "crawling" | "merging" | "filtering" | "ranking" | "done" | "failed"
export type RunProgress = {
  stage: RunStage
  // Older runs predate the local index and have no `index` entry.
  sources: Partial<Record<SourceKey, SourceProgress>>

  merged: number | null
  filtered: number | null
  ranked: number | null
  error?: string
}

export type DiscoveryRun = {
  id: string
  thread_id: string | null
  status: "RUNNING" | "DONE" | "FAILED"
  // titles: everything searched (planned from the seeker's background).
  // requestedTitles: what they asked for. titlePlan: why each title is there.
  query: { titles: string[]; locations: string[]; countries?: string[]; remoteTypes: string[]; requestedTitles?: string[]; titlePlan?: { title: string; reason: string }[] }
  progress: RunProgress | null
  fetched: number
  matched: number
  error: string | null
  // Starred for the browser extension (shows first there). Null on older rows.
  featured?: boolean | null
  started_at: string
  finished_at: string | null
}

export type ThreadSummary = {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  discovery_runs: DiscoveryRun[]
}

export type ChatThread = ThreadSummary & { messages: ThreadMessage[] }

// What the agent asked the app to do this turn. `navigate` moves pages; the
// rest drive the results list and are applied by ResultsView as UiCommand.
export type AppPage = "home" | "jobs" | "applications" | "career" | "messages" | "notifications" | "profile"
export type FilterKey = "remoteType" | "jobType" | "level" | "location" | "salaryMin" | "hasSalary" | "postedWithinDays" | "acceptsCountry" | "salaryCurrency"
export type OrchestratorEvent =
  | { type: "search_started"; runId: string }
  | { type: "navigate"; page: AppPage; tab?: MatchTab }
  | { type: "open_job"; position: number }
  | { type: "apply_filter"; filters: Partial<MatchFilters>; sort?: MatchSort; q?: string }
  | { type: "remove_filter"; keys: FilterKey[] | "all" }
  | { type: "propose_apply"; positions?: number[]; top?: number }
  | { type: "click"; elementId: string; more?: boolean }
  | { type: "type_text"; elementId: string; text: string; more?: boolean }
  | { type: "goto"; path: string; more?: boolean }
  | { type: "open_extension_progress" }
export type UiCommand = { id: number; event: Extract<OrchestratorEvent, { type: "open_job" | "apply_filter" | "remove_filter" | "propose_apply" }> }

export type ApplicationStatus = "QUEUED" | "IN_PROGRESS" | "NEEDS_INPUT" | "NEEDS_USER_VERIFICATION" | "SUBMITTED" | "FAILED" | "EXPIRED" | "SKIPPED" | "EXTENSION_ACTIVE"
// Why an application didn't go through, as a stable key.
export type FailureKind = "human_check" | "unknown_fact" | "invalid_answer" | "ineligible" | "duplicate" | "closed" | "site_error" | "unsupported" | "dry_run" | "no_resume" | "blocked_by_site" | "not_submitted"

export type JobMatch = {
  id: string
  match_percent: number
  match_label: "Excellent match" | "Strong match" | "Match"
  saved: boolean
  hidden: boolean
  application_status: ApplicationStatus | null
  application_id: string | null
  application_error: string | null
  job: {
    id: string
    source: JobSourceName
    // The ATS actually handling this job's application (may differ from
    // `source`, e.g. a Dice-discovered job whose form is on Greenhouse).
    // Only present on /applications rows; null when Plato can't apply here.
    effective_ats_source?: JobSourceName | null
    title: string
    company: string
    location: string | null
    remote_type: "ONSITE" | "HYBRID" | "REMOTE" | "UNKNOWN"
    job_type: string | null
    easy_apply: boolean
    url: string
    apply_url: string | null
    salary_min: number | null
    salary_max: number | null
    salary_currency: string | null
    posted_at: string | null
    // One company, one spelling (the server normalises it) and, when the posting gave its own
    // website, the domain for its logo.
    company_domain?: string | null
    eligibility?: JobEligibility
  }
}

export type MatchTab = "discover" | "saved" | "applied" | "recommended"
export type MatchSort = "best" | "newest" | "salary" | "company"
export type MatchLevel = "junior" | "mid" | "senior"

export type MatchFilters = {
  runId?: string
  threadId?: string
  tab?: MatchTab
  sort?: MatchSort
  q?: string
  remoteType?: "REMOTE" | "HYBRID" | "ONSITE"
  jobType?: JobTypeKey
  source?: JobMatch["job"]["source"]
  location?: string
  level?: MatchLevel
  salaryMin?: number
  hasSalary?: boolean
  postedWithinDays?: number
  // Country code the seeker lives in: hides jobs that only take applicants from elsewhere.
  acceptsCountry?: string
  // Pay currency codes, comma separated ("USD,EUR").
  salaryCurrency?: string
}

export type AnswerValue = string | boolean | string[]
export type PendingQuestion = {
  id: string
  label: string
  type: "text" | "number" | "date" | "url" | "paragraph" | "email" | "phone" | "boolean" | "choice" | "multi"
  required: boolean
  options?: string[]
  maxLength?: number
  // Plato's suggestion from your profile; nothing is sent until you confirm.
  draft?: AnswerValue
  // Personal / demographic: yours to answer or not.
  sensitive?: boolean
}
export type NeedsInput = { reason: "questions" | "captcha" | "unsupported" | "profile" | "ready" | "resume" | "verify_submission"; message: string; questions: PendingQuestion[] }
export type ApplyEvent = { applicationId: string; jobId: string; status: ApplicationStatus; step: string; message: string; attempt: number; at: string }

export type JobApplication = {
  id: string
  status: ApplicationStatus
  error: string | null
  failure_kind: FailureKind | null
  attempts: number
  next_attempt_at: string | null
  needs_input: NeedsInput | null
  // Set once Plato wrote a resume for this job (PDF, see getApplicationResume).
  resume_key?: string | null
  // How that resume was decided (market, pages, template) and the quality checks it passed.
  resume_strategy?: { reasons: string[]; checks: { name: string; ok: boolean; detail?: string }[] } | null
  // Worker steps of the latest attempt (persisted, survives restarts).
  events?: ApplyEvent[] | null
  // What Plato sent (or would send, in a dry run), in the employer's own wording.
  evidence: { dryRun?: boolean; manual?: boolean; failed?: boolean; diagnosis?: string; repairs?: number; indicators?: string[]; confirmation?: string; screenshotKey?: string | null; sent?: { label: string; value: AnswerValue }[]; at?: string } | null
  thread_id: string | null
  created_at: string
  updated_at: string
  submitted_at: string | null
  job: JobMatch["job"]
}

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new Error(error.response?.data?.message ?? "Request failed")
    }
    throw error
  }
}

const createThread = () => request<ChatThread>(apiClient.post("/chat/threads"))
const listThreads = () => request<ThreadSummary[]>(apiClient.get("/chat/threads"))
const getThread = (id: string) => request<ChatThread>(apiClient.get(`/chat/threads/${id}`))
export type ChatUiContext = { view?: "chat" | "searching" | "results"; tab?: MatchTab; q?: string; selectedCount?: number; page?: string; visible?: { title: string; company: string; location: string | null; remote: string }[]; filters?: Record<string, string | number | boolean>; sort?: string; pageMap?: PageMap; auto?: boolean }
const sendThreadMessage = (id: string, content: string, context?: ChatUiContext) =>
  request<{ message: ThreadMessage; events: OrchestratorEvent[] }>(
    apiClient.post(`/chat/threads/${id}/messages`, { content, context }),
  )

const getRun = (id: string) => request<DiscoveryRun>(apiClient.get(`/job-seeker/discovery-runs/${id}`))
const listRuns = () => request<DiscoveryRun[]>(apiClient.get("/job-seeker/discovery-runs"))
const runEventsUrl = (id: string) => `${apiClient.defaults.baseURL}/job-seeker/discovery-runs/${id}/events`

const getMatches = (params: MatchFilters & { skip?: number; take?: number }) =>
  request<{ total: number; items: JobMatch[] }>(apiClient.get("/job-seeker/discovered-jobs", { params }))

export type DiscoveryStats = {
  threads: number
  runs: { running: number; done: number; failed: number }
  applications: { queued: number; inProgress: number; submitted: number; failed: number; needsInput: number; expired: number; skipped: number }
  shortlisted: number
  saved: number
  hidden: number
  analyzed: number
  quality: { excellent: number; strong: number; other: number }
  bySource: Partial<Record<JobMatch["job"]["source"], number>>
  byRemoteType: Partial<Record<JobMatch["job"]["remote_type"], number>>
  levels: Partial<Record<MatchLevel, number>>
  topLocations: { label: string; count: number }[]
  topCompanies: { company: string; count: number }[]
  topTitles: { title: string; runs: number }[]
  salary: { withSalary: number; medianUsdMax: number | null }
  activity: { date: string; runs: number; jobs: number }[]
  recentRuns: {
    id: string
    thread_id: string | null
    status: DiscoveryRun["status"]
    titles: string[]
    fetched: number
    shortlisted: number
    started_at: string
    seconds: number | null
  }[]
}
const getDiscoveryStats = () => request<DiscoveryStats>(apiClient.get("/job-seeker/discovery-stats"))

export type JobTypeKey = "full" | "part" | "contract" | "intern" | "temporary"
export type Facets = {
  total: number
  locations: { value: string; label: string; count: number }[]
  jobTypes: { value: JobTypeKey; label: string; count: number }[]
  levels: { value: MatchLevel; label: string; count: number }[]
  remote: number
  salary: { hasSalary: number; atLeast: { value: number; count: number }[] }
  posted: { value: number; count: number }[]
  sources: { value: JobSourceName; count: number }[]
}
// Whole filtered list as .xlsx; the browser saves it via a blob URL.
async function exportMatches(params: MatchFilters, filename = "plato-jobs.xlsx") {
  const blob = await request<Blob>(apiClient.get("/job-seeker/discovered-jobs/export", { params, responseType: "blob" }))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
const getFacets = (threadId: string, tab: MatchTab) =>
  request<Facets>(apiClient.get("/job-seeker/discovered-jobs/facets", { params: { threadId, tab } }))
const setSaved = (jobId: string, value: boolean) =>
  request<{ job_id: string; saved: boolean }>(apiClient.post(`/job-seeker/matches/${jobId}/saved`, { value }))
const setHidden = (jobId: string, value: boolean) =>
  request<{ job_id: string; hidden: boolean }>(apiClient.post(`/job-seeker/matches/${jobId}/hidden`, { value }))
// Server-side filters: one search (thread) and/or a set of statuses.
const listApplications = (filters: { threadId?: string; status?: ApplicationStatus[] } = {}) =>
  request<JobApplication[]>(apiClient.get("/job-seeker/applications", { params: { threadId: filters.threadId, status: filters.status?.join(",") || undefined } }))

export type ApplicationDetail = JobApplication & {
  thread: { id: string; title: string | null } | null
  events: ApplyEvent[]
  place: { position: number; etaSeconds: number } | null
  isCurrent: boolean
  // The application window is open right now, waiting for you to complete a human check.
  verificationLive: boolean
  worker: ApplyQueue["worker"]
}
const getApplication = (id: string) => request<ApplicationDetail>(apiClient.get(`/job-seeker/applications/${id}`))
// After completing a human-verification step: Plato carries on in the same window, or reopens it if it was closed.
const continueApplication = (id: string) => request<{ live: boolean; status: ApplicationStatus; message: string }>(apiClient.post(`/job-seeker/applications/${id}/continue`))
const retryApplication = (id: string) => request<ApplicationDetail>(apiClient.post(`/job-seeker/applications/${id}/retry`))
const withdrawApplication = (id: string) => request<{ id: string; withdrawn: boolean }>(apiClient.delete(`/job-seeker/applications/${id}`))
// "Apply" on the web only tags jobs for the browser extension: nothing is applied until the extension runs.
const queueForExtension = (body: { jobIds?: string[]; top?: number; threadId?: string }) =>
  request<{ queued: number; jobIds: string[] }>(apiClient.post("/job-seeker/extension-queue", body))
const queueApplications = (body: { jobIds?: string[]; top?: number; threadId?: string }) =>
  request<JobApplication[]>(apiClient.post("/job-seeker/applications", body))
export type ApplyQueue = {
  worker: { enabled: boolean; dryRun: boolean; busy: boolean; sources: JobMatch["job"]["source"][]; paused?: { source: JobMatch["job"]["source"]; until: string }[] }
  currentApplicationId: string | null
  avgSeconds: number
  // This seeker's waiting applications: place in line and when each should finish.
  positions: Record<string, { position: number; etaSeconds: number }>
  totalEtaSeconds: number
  // Recent worker steps per application, so a refresh keeps the story.
  timelines: Record<string, ApplyEvent[]>
}
export type ApplyReadiness = { ready: boolean; missing: { key: string; label: string; why: string }[]; recommended?: { key: string; question: string; sensitive: boolean }[] }
// The intake bank: facts employers keep asking for, answered once.
export type IntakeItem = { key: string; question: string; type: "number" | "text" | "choice" | "date"; options: string[] | null; sensitive: boolean; value: string | null }
const getIntake = () => request<IntakeItem[]>(apiClient.get("/job-seeker/applications/intake"))
const saveIntake = (facts: Record<string, string | null>) => request<IntakeItem[]>(apiClient.post("/job-seeker/applications/intake", { facts }))
const getApplyReadiness = () => request<ApplyReadiness>(apiClient.get("/job-seeker/applications/readiness"))
const getApplyQueue = () => request<ApplyQueue>(apiClient.get("/job-seeker/applications/queue"))
// Proof of application. Private endpoint, so fetched with credentials and shown via a blob URL.
const getApplicationScreenshot = async (id: string) => URL.createObjectURL(await request<Blob>(apiClient.get(`/job-seeker/applications/${id}/screenshot`, { responseType: "blob" })))
const getApplicationResume = async (id: string) => URL.createObjectURL(await request<Blob>(apiClient.get(`/job-seeker/applications/${id}/resume`, { responseType: "blob" })))
// Raises the application's real browser window on the machine running the backend.
const focusApplicationBrowser = (id: string) => request<{ ok: boolean }>(apiClient.post(`/job-seeker/applications/${id}/live/focus`))
const applicationEventsUrl = () => `${apiClient.defaults.baseURL}/job-seeker/applications/events`
const submitApplicationAnswers = (id: string, answers: Record<string, AnswerValue>) =>
  request<JobApplication>(apiClient.post(`/job-seeker/applications/${id}/answers`, { answers }))
const markApplicationSubmitted = (id: string) => request<JobApplication>(apiClient.post(`/job-seeker/applications/${id}/mark-submitted`))

export {
  createThread,
  listThreads,
  getThread,
  sendThreadMessage,
  getRun,
  listRuns,
  runEventsUrl,
  getMatches,
  getDiscoveryStats,
  getFacets,
  exportMatches,
  setSaved,
  setHidden,
  listApplications,
  getApplication,
  retryApplication,
  continueApplication,
  withdrawApplication,
  queueApplications,
  queueForExtension,
  applicationEventsUrl,
  focusApplicationBrowser,
  getApplyQueue,
  getApplyReadiness,
  getIntake,
  saveIntake,
  getApplicationScreenshot,
  getApplicationResume,
  submitApplicationAnswers,
  markApplicationSubmitted,
}
