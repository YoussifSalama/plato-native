import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type {
  AssessmentDetail,
  AssessmentResult,
  AssessmentSummary,
  AttemptResult,
  CandidateProfile,
  CandidateReport,
  CreateQuiz,
  QuizDetail,
  QuizSummary,
  SubmitAssessment,
  SubmitAttempt,
} from "./contract"

// Quiz Builder API (contract: lib/quizzes/contract.ts, a copy of the backend's quiz.contract.ts).

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) throw new Error(error.response?.data?.message ?? "Request failed")
    throw error
  }
}

const listQuizzes = () => request<QuizSummary[]>(apiClient.get("/job-seeker/quizzes"))
const listLibrary = (q?: string) => request<QuizSummary[]>(apiClient.get("/job-seeker/quizzes/library", { params: { q: q?.trim() || undefined } }))
const createQuiz = (body: CreateQuiz) => request<QuizSummary>(apiClient.post("/job-seeker/quizzes", body))
const takeLibraryQuiz = (id: string) => request<QuizSummary>(apiClient.post(`/job-seeker/quizzes/library/${id}/take`))
const getQuiz = (id: string) => request<QuizDetail>(apiClient.get(`/job-seeker/quizzes/${id}`))
const submitAttempt = (id: string, body: SubmitAttempt) => request<AttemptResult>(apiClient.post(`/job-seeker/quizzes/${id}/attempts`, body))
const getAttempt = (id: string, attemptId: string) => request<AttemptResult>(apiClient.get(`/job-seeker/quizzes/${id}/attempts/${attemptId}`))
const deleteQuiz = (id: string) => request<{ ok: true }>(apiClient.delete(`/job-seeker/quizzes/${id}`))

export { listQuizzes, listLibrary, createQuiz, takeLibraryQuiz, getQuiz, submitAttempt, getAttempt, deleteQuiz }

// Standard assessments (fixed item banks) and the candidate profile.
const listAssessments = () => request<AssessmentSummary[]>(apiClient.get("/job-seeker/assessments"))
const getAssessment = (slug: string) => request<AssessmentDetail>(apiClient.get(`/job-seeker/assessments/${slug}`))
const submitAssessment = (slug: string, body: SubmitAssessment) => request<AssessmentResult>(apiClient.post(`/job-seeker/assessments/${slug}/attempts`, body))
const getAssessmentResult = (slug: string, attemptId: string) => request<AssessmentResult>(apiClient.get(`/job-seeker/assessments/${slug}/attempts/${attemptId}`))
const getCandidateProfile = () => request<CandidateProfile>(apiClient.get("/job-seeker/assessments/profile"))
const writeCandidateReport = () => request<CandidateReport>(apiClient.post("/job-seeker/assessments/profile/report"))

export { listAssessments, getAssessment, submitAssessment, getAssessmentResult, getCandidateProfile, writeCandidateReport }
