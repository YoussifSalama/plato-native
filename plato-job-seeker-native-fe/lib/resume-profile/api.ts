import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"

// The candidate facts every resume is built from (see the backend resume module).
export type Project = { id: string; name: string; role: string | null; description: string; technologies: string[]; url: string | null; result: string | null }
export type Achievement = { id: string; text: string; metric: string | null; company: string | null; project_name: string | null }
export type SkillProof = { id: string; skill: string; level: "LEARNING" | "WORKING" | "STRONG"; proof: string; url: string | null }
export type ResumeFacts = { projects: Project[]; achievements: Achievement[]; skills: SkillProof[] }

async function request<T>(promise: Promise<{ data: T }>): Promise<T> {
  try {
    return (await promise).data
  } catch (error) {
    if (error instanceof AxiosError) {
      const m = error.response?.data?.message
      throw new Error(typeof m === "string" ? m : "Request failed")
    }
    throw error
  }
}

const BASE = "/job-seeker/resume-profile"
const getResumeFacts = () => request<ResumeFacts>(apiClient.get(BASE))
const addProject = (d: { name: string; role: string; description: string; technologies: string[]; url: string; result: string }) => request<Project>(apiClient.post(`${BASE}/projects`, d))
const addAchievement = (d: { text: string; metric: string; company: string }) => request<Achievement>(apiClient.post(`${BASE}/achievements`, d))
const addSkillProof = (d: { skill: string; level: "LEARNING" | "WORKING" | "STRONG"; proof: string; url: string }) => request<SkillProof>(apiClient.post(`${BASE}/skills`, d))
const removeResumeFact = (kind: "projects" | "achievements" | "skills", id: string) => request<{ removed: boolean }>(apiClient.delete(`${BASE}/${kind}/${id}`))

export { getResumeFacts, addProject, addAchievement, addSkillProof, removeResumeFact }
