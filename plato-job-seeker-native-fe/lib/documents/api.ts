import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { DocumentType, EvaluationStatuses, JobSeekerDocument, JobSeekerProfile, SectionKey } from "./schema"

// The server's message: a string, or a list of validation issues (show the first,
// naming the entry it is about: "Experience 2: Add the company").
const ENTRY: Record<string, string> = { experiences: "Experience", educations: "Education", certifications: "Certification", languages: "Language" }
function messageOf(m: unknown): string {
  if (typeof m === "string") return m
  const first = Array.isArray(m) ? (m[0] as { message?: string; path?: unknown[] } | undefined) : undefined
  if (!first?.message) return "Request failed"
  const [section, index] = first.path ?? []
  return typeof section === "string" && ENTRY[section] && typeof index === "number" ? `${ENTRY[section]} ${index + 1}: ${first.message}` : first.message
}

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) throw new Error(messageOf(error.response?.data?.message))
    throw error
  }
}

function uploadDocument(file: File, type: DocumentType): Promise<JobSeekerDocument> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("type", type)
  return request(apiClient.post("/job-seeker/documents", formData))
}

function listDocuments(): Promise<JobSeekerDocument[]> {
  return request(apiClient.get("/job-seeker/documents"))
}

function deleteDocument(id: string): Promise<{ removed: string }> {
  return request(apiClient.delete(`/job-seeker/documents/${id}`))
}

function replaceDocument(id: string, file: File): Promise<JobSeekerDocument> {
  const formData = new FormData()
  formData.append("file", file)
  return request(apiClient.put(`/job-seeker/documents/${id}/replace`, formData))
}

// Whether documents were added or replaced since Plato last read the profile.
function getDocumentsStatus(): Promise<{ needs_analysis: boolean }> {
  return request(apiClient.get("/job-seeker/documents/status"))
}

function analyzeProfile(): Promise<{ profile: JobSeekerProfile; evaluation: EvaluationStatuses }> {
  return request(apiClient.post("/job-seeker/profile/analyze"))
}

function getProfile(): Promise<JobSeekerProfile> {
  return request(apiClient.get("/job-seeker/profile"))
}

type ProfileEditPayload = {
  experiences: JobSeekerProfile["experiences"]
  educations: JobSeekerProfile["educations"]
  certifications: JobSeekerProfile["certifications"]
  languages: JobSeekerProfile["languages"]
  skills: string[]
  location: JobSeekerProfile["location"]
  editedSections: SectionKey[]
}

function saveProfile(
  profile: ProfileEditPayload,
): Promise<{ profile: JobSeekerProfile; evaluation: EvaluationStatuses }> {
  return request(apiClient.patch("/job-seeker/profile", profile))
}

// Where the person lives, on its own (onboarding); the full edit is the Profile page's saveProfile.
function saveLocation(location: { city: string; country: string }) {
  return request(apiClient.patch("/job-seeker/profile/location", location))
}

// The file as uploaded, for a preview in a new tab.
function getDocumentFile(id: string): Promise<Blob> {
  return request(apiClient.get(`/job-seeker/documents/${id}/file`, { responseType: "blob" }))
}

export { messageOf, getDocumentsStatus, getDocumentFile, uploadDocument, listDocuments, deleteDocument, replaceDocument, analyzeProfile, getProfile, saveProfile, saveLocation }
