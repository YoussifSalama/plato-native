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
  // The employer's logo the source gave, and its website (the app's favicon fallback).
  company_logo?: string | null
  company_domain?: string | null
}
export type GuestSearchInput = {
  roles: string[]
  countries: string[]
  remoteTypes: ("onsite" | "hybrid" | "remote")[]
  level: "entry" | "mid" | "senior" | null
}
// Live progress while the search runs (each LinkedIn run as it finishes, then the filter and the ranking).
export type GuestSearchProgress = {
  phase: "searching" | "filtering" | "ranking"
  runs: { title: string; place: string | null; count: number | null }[]
  found?: number
  kept?: number
}
// A locked job: read-only, no id or link (applying needs an account).
export type GuestPreviewJob = Pick<GuestJob, "title" | "company" | "location" | "remote_type" | "posted_at" | "company_logo" | "company_domain">
export type GuestSearch = {
  id: string
  status: "RUNNING" | "DONE" | "FAILED"
  roles: string[]
  countries: string[]
  total: number
  open: GuestJob[]
  locked: number
  progress?: GuestSearchProgress | null
  preview?: GuestPreviewJob[]
}
export type GuestView = {
  cv: { name: string } | null
  profile: { title: string | null; company: string | null; skills: string[]; location: string } | null
  draft: GuestSearchInput | null
  search: GuestSearch | null
  picked: string[]
}

// What went wrong, in words the visitor can act on. Each message is "What happened. What to do.": the page shows the
// first sentence as the title. Never blame the file for our side or the network.
export const OFFLINE = "Can't reach Plato right now. Check your internet connection, then try again."
const SERVER = "Something went wrong on our side. Your file is fine: try again in a minute."
const TOO_BIG = "This file is too large. Upload a PDF or Word file under 10 MB."
const UNFINISHED = "The upload didn't finish. Try again."
/** Worth sending the same thing again: the network or our side failed, not the file. */
export const retryable = (message: string) => [OFFLINE, SERVER, UNFINISHED].includes(message)
async function call<T>(p: Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await p).data
  } catch (e) {
    if (!(e instanceof AxiosError)) throw new Error(fallback)
    const res = e.response
    if (!res) throw new Error(OFFLINE) // no answer at all: offline, or the server is down
    if (res.status === 413) throw new Error(TOO_BIG)
    if (res.status >= 500) throw new Error(SERVER)
    const m: unknown = res.data?.message
    throw new Error(typeof m === "string" ? m : Array.isArray(m) && typeof m[0]?.message === "string" ? m[0].message : fallback)
  }
}

// No guest yet: the server answers null, which arrives as an empty body (""), so anything falsy is "no guest".
export const getGuest = () => call<GuestView | "" | null>(apiClient.get("/public/guest"), "Could not load your search.").then((g) => g || null)

// onProgress: share of the file sent (0..1); after 1 the server is reading it.
export function uploadGuestCv(file: File, onProgress?: (sent: number) => void) {
  const body = new FormData()
  body.append("file", file)
  return call<GuestView>(
    apiClient.post("/public/guest/cv", body, { onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total) }),
    UNFINISHED,
  )
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
