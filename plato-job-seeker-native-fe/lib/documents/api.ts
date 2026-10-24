import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"
import type { DocumentType, EvaluationStatuses, JobSeekerDocument, JobSeekerProfile, SectionKey } from "./schema"

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

function replaceDocument(id: string, file: File): Promise<JobSeekerDocument & { remaining_replacements: number }> {
  const formData = new FormData()
  formData.append("file", file)
  return request(apiClient.put(`/job-seeker/documents/${id}/replace`, formData))
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

export { uploadDocument, listDocuments, deleteDocument, replaceDocument, analyzeProfile, getProfile, saveProfile }
