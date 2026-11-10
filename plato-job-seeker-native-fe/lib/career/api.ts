import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import { isOutOfTokens, reportOutOfTokens, reportTokensChanged } from "@/lib/credits/api"

// A resume Plato built in the chat; shown under the message as a PDF link.
// What Plato looked up on the web for a message, with the pages it used.
export type Searched = { query: string; sources: string[] }
// Keyword coverage of a tailored resume against the job posting.
export type AtsSummary = { score: number; matched: string[]; missing: string[]; headline: string; headlineNote: string }
export type ResumeCard = { type: "resume"; resumeId: string; title: string; why?: string[]; size?: number; template?: string; searched?: Searched[]; ats?: AtsSummary; version?: number; approved?: boolean; edited?: boolean; choices?: string[] }
export type ResearchCard = { type: "research"; searched: Searched[]; choices?: string[] }
// Tappable next steps the assistant offers under a reply.
export type ChoicesCard = { type: "choices"; choices: string[] }
// `streamed`: client-only, set on a reply that was written live so it is not typed out a second time.
// A job pinned to a message (job card -> mock interview): shown as a chip, read by Plato as context.
export type JobRef = { jobId: string; searchId?: string | null; title: string; company: string; location?: string | null }
export type AttachmentCard = { type: "attachment"; documents: { id: string; name: string | null }[]; reference?: JobRef }
export type ReferenceCard = { type: "reference"; reference: JobRef }
// Plato set up a mock interview for the pinned job: chat (written) or a live voice call.
export type InterviewCard = { type: "interview"; mode: "chat" | "voice"; job: { id: string; title: string; company: string }; description: string; choices?: string[] }
export type CareerMessage = { id: string; role: "USER" | "ASSISTANT"; content: string; ui?: ResumeCard | ResearchCard | AttachmentCard | ChoicesCard | ReferenceCard | InterviewCard | null; created_at: string; streamed?: boolean }
export type CareerThread = { id: string; title: string | null; messages: CareerMessage[] }
export type CareerThreadSummary = { id: string; title: string | null; updated_at: string }

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) throw new Error(error.response?.data?.message ?? "Request failed")
    throw error
  }
}

const createCareerThread = () => request<CareerThread>(apiClient.post("/job-seeker/career/threads"))
const listCareerThreads = () => request<CareerThreadSummary[]>(apiClient.get("/job-seeker/career/threads"))
const getCareerThread = (id: string) => request<CareerThread>(apiClient.get(`/job-seeker/career/threads/${id}`))
const sendCareerMessage = (id: string, content: string) => request<{ message: CareerMessage }>(apiClient.post(`/job-seeker/career/threads/${id}/messages`, { content }))
// Private PDF: fetched with credentials, then shown or saved from the blob.
const getCareerResume = (id: string) => request<Blob>(apiClient.get(`/job-seeker/career/resumes/${id}/pdf`, { responseType: "blob" }))

// Reply that arrives as it is written (Server-Sent Events over fetch, so the
// auth cookie rides along). `onDelta` gets each text piece; resolves with the saved message.
async function streamCareerMessage(id: string, content: string, onDelta: (text: string) => void, signal?: AbortSignal, attachmentIds?: string[], onStatus?: (text: string) => void, reference?: { jobId: string; searchId?: string }): Promise<CareerMessage> {
  const res = await fetch(`${apiClient.defaults.baseURL}/job-seeker/career/threads/${id}/messages/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, attachmentIds, reference }),
    signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    if (isOutOfTokens(res.status, body)) reportOutOfTokens(body)
    throw new Error(body?.message ?? "Request failed")
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let message: CareerMessage | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""
    for (const frame of frames) {
      const event = /^event: (.*)$/m.exec(frame)?.[1]
      const data = JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? "null")
      if (event === "delta") onDelta(data.text)
      else if (event === "status") onStatus?.(data.text)
      else if (event === "done") message = data.message
      else if (event === "error") throw new Error(data.message)
    }
  }
  reportTokensChanged() // the reply was charged when it finished
  if (!message) throw new Error("The reply was cut off. Please try again.")
  return message
}

// The editable document behind a resume (wording only: employers and dates come from the profile).
export type ResumeDocData = {
  name: string
  headline: string
  summary: string
  skills: string[]
  experiences: { title: string; company: string; bullets: string[] }[]
  projects: { name: string; bullets: string[] }[]
}
export type ResumeEdits = { headline?: string; summary?: string; skills?: string[]; experiences?: { bullets: string[] }[]; projects?: { bullets: string[] }[] }
const getResumeDoc = (id: string) => request<{ id: string; title: string; version: number; approved: boolean; edited: boolean; doc: ResumeDocData }>(apiClient.get(`/job-seeker/career/resumes/${id}`))
const saveResumeEdits = (id: string, edits: ResumeEdits) => request<{ card: ResumeCard }>(apiClient.put(`/job-seeker/career/resumes/${id}`, edits))
// A fresh wording for one part; nothing is saved until the seeker keeps it.
const suggestResumeText = (id: string, req: { section: "summary" | "experience" | "project"; index?: number; note?: string }) => request<{ summary?: string; bullets?: string[] }>(apiClient.post(`/job-seeker/career/resumes/${id}/suggest`, req))
// Jobs → Tailor & apply: the resume for one job (built once, then returned as is).
export type ResumeChange = { section: "summary" | "experience" | "keywords"; before: string | null; after: string }
// Resume scores by fixed rules on the server (resume/resume-score.ts): 85+ strong, 75+ good, 60+ fair.
export type ScoreBand = "strong" | "good" | "fair" | "needs_work"
export type ResumeScore = { score: number; band: ScoreBand; categories: { key: string; label: string; score: number; max: number; tips: string[] }[]; topFixes: string[]; bulletsWithoutNumbers?: { count: number; examples: string[] } }
export type MatchScore = ResumeScore & { decision: "send" | "confirm" | "hold" }
export const getResumeScore = () => request<ResumeScore & { warn: boolean; thresholds: { autoApply: number; confirm: number; masterWarn: number } }>(apiClient.get("/job-seeker/career/resume-score"))
export const BAND_LABEL: Record<ScoreBand, string> = { strong: "Strong", good: "Good", fair: "Fair", needs_work: "Needs work" }
export type JobResume =
  | { status: "built"; id: string; job_id: string; job: { title: string; company: string }; title: string; approved: boolean; version: number; changes: ResumeChange[]; score?: MatchScore | null }
  | { status: "gaps"; job_id: string; job: { title: string; company: string }; gaps: string[] }
export const resumeForJob = (jobId: string, opts: { confirmedSkills?: string[]; ignoreGaps?: boolean } = {}) => request<JobResume>(apiClient.post(`/job-seeker/career/resumes/for-job/${jobId}`, opts))
const approveResume = (id: string) => request<{ id: string; approved: boolean }>(apiClient.post(`/job-seeker/career/resumes/${id}/approve`))

// Voice interview: a short-lived key + fixed prompt from our server, then the browser
// talks to OpenAI over WebRTC (audio never passes through our server).
export type VoiceMode = "practice" | "mock" | "skill"
// Summed from the call's response.done events; the audio/text split is what is billed.
export type VoiceUsage = { responses: number; audioInputTokens: number; audioOutputTokens: number; textInputTokens: number; textOutputTokens: number; cachedInputTokens: number }
const startVoiceSession = (threadId: string, req: { mode: VoiceMode; skill?: string; role?: string; jobDescription?: string; focus?: string }) =>
  request<{ clientSecret: string; model: string; instructions: string; maxSeconds: number }>(apiClient.post(`/job-seeker/career/threads/${threadId}/voice/session`, req))
// The written scorecard of a call (same scoring as a written interview), or why there is none:
// empty = nothing said, short = too little to judge, tokens = none left for the scorer, failed.
export type VoiceScorecard = {
  questions: { index: number; question: string; answer: string; score: number; feedback: string }[]
  communication: { score: number; note: string }
  strengths: string[]
  gaps: string[]
  nextSteps: string[]
  overall: number
}
export type VoiceUnscored = "empty" | "short" | "tokens" | "failed"
// context: what the call was for, so the scorecard judges it against the right role or job.
const saveVoiceTranscript = (threadId: string, body: { mode: VoiceMode; seconds: number; turns: { role: "user" | "assistant"; text: string }[]; usage?: VoiceUsage; context?: { title: string; focus?: string; jobDescription?: string } }) =>
  request<{ saved: number; scorecard: VoiceScorecard | null; unscored: VoiceUnscored | null }>(apiClient.post(`/job-seeker/career/threads/${threadId}/voice/transcript`, body, { timeout: 90_000 }))

const listCareerResumes = () => request<{ id: string; title: string; target_role: string | null; version: number; approved: boolean; job_id?: string | null; created_at?: string; changes?: number | null }[]>(apiClient.get("/job-seeker/career/resumes"))
export { listCareerResumes, startVoiceSession, saveVoiceTranscript, getResumeDoc, saveResumeEdits, suggestResumeText, approveResume, streamCareerMessage, createCareerThread, listCareerThreads, getCareerThread, sendCareerMessage, getCareerResume }
