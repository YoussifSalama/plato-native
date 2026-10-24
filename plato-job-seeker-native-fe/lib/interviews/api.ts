import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"

export type Turn = { kind: "technical" | "behavioural" | "situational"; question: string; answer?: string; followUp?: string; followUpAnswer?: string }
export type Scorecard = {
  questions: { index: number; score: number; feedback: string }[]
  communication: { score: number; note: string }
  strengths: string[]
  gaps: string[]
  nextSteps: string[]
  overall: number
}
export type Interview = {
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
export type InterviewSummary = Pick<Interview, "id" | "jobTitle" | "company" | "score" | "retryOfId" | "createdAt" | "completedAt">

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) throw new Error(error.response?.data?.message ?? "Request failed")
    throw error
  }
}

const base = "/job-seeker/interviews"
// Reading the posting and writing the questions takes a few seconds.
export const startInterview = (req: { jobId: string } | { retryOf: string }) => request<Interview>(apiClient.post(base, req, { timeout: 90_000 }))
export const listInterviews = () => request<InterviewSummary[]>(apiClient.get(base))
export const getInterview = (id: string) => request<Interview>(apiClient.get(`${base}/${id}`))
// The last answer returns the scorecard, which takes a few seconds.
export const answerInterview = (id: string, answer: string) => request<Interview>(apiClient.post(`${base}/${id}/answer`, { answer }, { timeout: 90_000 }))
