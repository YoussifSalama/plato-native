import { apiClient } from "@/lib/api-client"

// Job alerts: new jobs in a field, or at companies the seeker follows, sent
// together in one digest on their cadence. Free; how many depends on the plan.
export type Cadence = "DAILY" | "EVERY_3_DAYS" | "WEEKLY"
export type JobAlert = { id: string; kind: "FIELD" | "COMPANY"; title: string | null; location: string | null; remote_only: boolean; company: string | null; paused: boolean; sent: number; created_at: string }
export type AlertSettings = { cadence: Cadence; email: boolean; in_app: boolean; emailAvailable: boolean }
export type InsightsOverview = {
  plan: string
  limits: { field: number; company: number }
  used: { field: number; company: number }
  alerts: JobAlert[]
  settings: AlertSettings
  pending: number
  lastDigestAt: string | null
  nextDigestAt: string | null
}
export type DigestJob = { id: string; title: string; company: string; location: string | null; remote: boolean; posted_at: string | null; url: string; closed: boolean }
export type Digest = { id: string; headline: string; at: string; emailed: boolean; jobs: DigestJob[] }
export type CompanySuggestion = { name: string; key: string; jobs: number }
export type NewAlert = { kind: "FIELD"; title: string; location?: string | null; remote_only?: boolean } | { kind: "COMPANY"; company: string }

export const CADENCES: { value: Cadence; label: string; hint: string }[] = [
  { value: "DAILY", label: "Daily", hint: "One digest a day" },
  { value: "EVERY_3_DAYS", label: "Every 3 days", hint: "Recommended" },
  { value: "WEEKLY", label: "Weekly", hint: "One digest a week" },
]

export const getInsights = async () => (await apiClient.get<InsightsOverview>("/job-seeker/insights")).data
export const createAlert = async (a: NewAlert) => (await apiClient.post<JobAlert>("/job-seeker/insights/alerts", a)).data
export const updateAlert = async (id: string, patch: Partial<Pick<JobAlert, "paused" | "title" | "location" | "remote_only">>) => (await apiClient.patch<JobAlert>(`/job-seeker/insights/alerts/${id}`, patch)).data
export const deleteAlert = async (id: string) => (await apiClient.delete(`/job-seeker/insights/alerts/${id}`)).data
export const saveAlertSettings = async (patch: Partial<Omit<AlertSettings, "emailAvailable">>) => (await apiClient.patch<AlertSettings>("/job-seeker/insights/settings", patch)).data
export const getDigests = async (limit = 10) => (await apiClient.get<Digest[]>("/job-seeker/insights/digests", { params: { limit } })).data
export const searchCompanies = async (q: string) => (await apiClient.get<CompanySuggestion[]>("/job-seeker/insights/companies", { params: { q } })).data
// The email's unsubscribe link: no login, the token is the proof.
export const unsubscribe = async (token: string) => (await apiClient.post<{ ok: boolean }>("/insights/unsubscribe", { token })).data
