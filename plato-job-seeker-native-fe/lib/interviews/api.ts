import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import { isOutOfTokens, reportOutOfTokens, reportTokensChanged } from "@/lib/credits/api"

// Every written (chat) interview is run by Plato's interviewer on the server.
// What the seeker chose in the interview flow (/career/interviews/new):
export type InterviewTarget = "job" | "paste" | "general"
export type InterviewFormat = "standard" | "negotiation" | "case" | "pitch" | "english"
export type InterviewFocus = "mixed" | "behavioral" | "technical" | "situational"
export type InterviewRound = "screen" | "manager" | "loop"
// real: feedback only at the end; coach: feedback after every answer.
export type InterviewStyle = "real" | "coach"

// Coach style: the feedback on one answer, right after it.
export type AnswerFeedback = { score: number; note: string; better?: string }
export type Turn = { kind: "technical" | "behavioural" | "situational"; question: string; answer?: string; followUp?: string; followUpAnswer?: string; feedback?: AnswerFeedback }
export type Scorecard = {
  questions: { index: number; score: number; feedback: string }[]
  communication: { score: number; note: string }
  strengths: string[]
  gaps: string[]
  nextSteps: string[]
  overall: number
}
// The shape of the interview's choices (older interviews have none of them: a job, real style).
type Choices = { style?: InterviewStyle; format?: InterviewFormat; round?: InterviewRound | null; focus?: InterviewFocus | null; target?: InterviewTarget; role?: string | null }
export type Interview = Choices & {
  id: string
  jobTitle: string
  company: string
  retryOfId: string | null
  createdAt: string
  completedAt: string | null
  score: number | null
  scorecard: Scorecard | null
  total: number
  // What to answer now; null once finished.
  next: { index: number; text: string; followUp: boolean } | null
  turns: Turn[]
}
export type InterviewSummary = Choices & Pick<Interview, "id" | "jobTitle" | "company" | "score" | "retryOfId" | "createdAt" | "completedAt">

// Exactly one of jobId | paste | general | retryOf says what the interview is about.
export type StartOptions = { format?: InterviewFormat; focus?: InterviewFocus; round?: InterviewRound; style?: InterviewStyle; length?: 3 | 5 | 6 }
export type StartRequest = StartOptions & ({ jobId: string } | { paste: { title: string; company?: string; description: string } } | { general: { role: string; skill?: string; notes?: string } } | { retryOf: string })

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) {
      // Out of tokens: the app-wide dialog explains the ways forward.
      if (isOutOfTokens(error.response?.status, error.response?.data)) reportOutOfTokens(error.response!.data)
      throw new Error(error.response?.data?.message ?? "Request failed")
    }
    throw error
  }
}

const base = "/job-seeker/interviews"
// Reading the posting and writing the questions takes a few seconds.
export const startInterview = async (req: StartRequest) => {
  const iv = await request<Interview>(apiClient.post(base, req, { timeout: 90_000 }))
  reportTokensChanged()
  return iv
}
export const listInterviews = () => request<InterviewSummary[]>(apiClient.get(base))
export const getInterview = (id: string) => request<Interview>(apiClient.get(`${base}/${id}`))
// The last answer returns the scorecard (and a coach answer its feedback), which takes a few seconds.
export const answerInterview = async (id: string, answer: string) => {
  const iv = await request<Interview>(apiClient.post(`${base}/${id}/answer`, { answer }, { timeout: 90_000 }))
  reportTokensChanged()
  return iv
}
