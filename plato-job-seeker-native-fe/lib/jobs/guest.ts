import { AxiosError } from "axios"
import { apiClient } from "@/lib/api-client"

// The public /search page, before an account: the CV, a LinkedIn search from it, two open jobs. The server knows this
// device by an httpOnly cookie; after signup or login the claim moves the CV, profile and search onto the account.

export type GuestJob = {
  id: string
  title: string
  company: string
  location: string | null
  remote_type: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN"
  job_type: string | null
  posted_at: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
}
export type GuestSearchInput = {
  roles: string[]
  countries: string[]
  remoteTypes: ("onsite" | "hybrid" | "remote")[]
  level: "entry" | "mid" | "senior" | null
}
export type GuestSearch = {
  id: string
  status: "RUNNING" | "DONE" | "FAILED"
  roles: string[]
  countries: string[]
  total: number
  open: GuestJob[]
  locked: number
}
export type GuestView = {
  cv: { name: string } | null
  profile: { title: string | null; company: string | null; skills: string[]; location: string } | null
  draft: GuestSearchInput | null
  search: GuestSearch | null
  picked: string[]
}

async function call<T>(p: Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await p).data
  } catch (e) {
    throw new Error(e instanceof AxiosError ? (e.response?.data?.message ?? fallback) : fallback)
  }
}

// No guest yet: the server answers null, which arrives as an empty body (""), so anything falsy is "no guest".
export const getGuest = () => call<GuestView | "" | null>(apiClient.get("/public/guest"), "Could not load your search.").then((g) => g || null)

export function uploadGuestCv(file: File) {
  const body = new FormData()
  body.append("file", file)
  return call<GuestView>(apiClient.post("/public/guest/cv", body), "Plato could not read that CV. Try again.")
}

export const startGuestSearch = (input: GuestSearchInput) => call<GuestSearch>(apiClient.post("/public/guest/search", input), "The search could not start. Try again.")

export const getGuestSearch = (id: string) => call<GuestSearch>(apiClient.get(`/public/guest/search/${id}`), "Could not load the search.")

export const pickGuestJobs = (jobIds: string[]) => call<{ picked: string[] }>(apiClient.post("/public/guest/picks", { jobIds }), "Could not save your picks.")

/**
 * Right after signup or login: move this device's guest (CV, profile, search) onto the account. Returns the search's
 * page, or null when there was nothing to move (no guest on this device, or no finished search).
 */
export async function claimGuest(): Promise<string | null> {
  try {
    const { threadId } = (await apiClient.post("/job-seeker/guest/claim")).data as { threadId: string | null }
    return threadId ? `/jobs/${threadId}` : null
  } catch {
    return null // never blocks signing in
  }
}
