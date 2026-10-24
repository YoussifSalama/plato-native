import { apiClient } from "@/lib/api-client"

// Where to learn a skill: curated by Plato from known providers (not scraped). Cost and
// duration are approximate; the link goes to the provider for the real figures.
export type Course = { id: string; provider: string; title: string; kind: "professional-certificate" | "course" | "certification-exam"; url: string; cost: string; duration: string; skills: string[] }
export type SkillGap = { skill: string; missingIn: number; unlocks: number; courses: Course[] }
export const getSkillGap = async () => (await apiClient.get<{ jobsAnalysed: number; skills: SkillGap[] }>("/job-seeker/skills/gap")).data

// A course or certification you are taking or finished. Only a completed one whose public link we
// could check is VERIFIED and added to your profile; the rest stay self-reported.
export type Credential = {
  id: string
  skill: string
  course_id: string | null
  title: string
  provider: string | null
  status: "IN_PROGRESS" | "COMPLETED"
  credential_url: string | null
  document_id: string | null
  verification: "SELF_REPORTED" | "VERIFIED"
  verification_note: string | null
  verified_issuer: string | null
  completed_at: string | null
}
export type CredentialInput = { skill: string; courseId?: string; title?: string; status: "IN_PROGRESS" | "COMPLETED"; credentialUrl?: string; documentId?: string }

export const listCredentials = async () => (await apiClient.get<Credential[]>("/job-seeker/skills/credentials")).data
export const addCredential = async (body: CredentialInput) => (await apiClient.post<Credential>("/job-seeker/skills/credentials", body)).data
export const updateCredential = async (id: string, body: Partial<CredentialInput>) => (await apiClient.patch<Credential>(`/job-seeker/skills/credentials/${id}`, body)).data
export const deleteCredential = async (id: string) => (await apiClient.delete(`/job-seeker/skills/credentials/${id}`)).data
