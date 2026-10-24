import type { AppPage, DiscoveryRun } from "@/lib/jobs/api"

// One place that knows how a run/thread deep-links into the Jobs pages.
export const JOBS_HOME = "/jobs"

// Where the assistant's `navigate` events go.
export const PAGE_PATH: Record<AppPage, string> = { home: "/", jobs: JOBS_HOME, applications: "/applications", career: "/career", messages: "/messages", notifications: "/notifications", profile: "/profile" }

export function threadHref(threadId: string) {
  return `/jobs/${threadId}`
}

export function runHref(run: Pick<DiscoveryRun, "id" | "thread_id">) {
  return run.thread_id ? `${threadHref(run.thread_id)}?run=${run.id}` : JOBS_HOME
}

export function runTitle(run: Pick<DiscoveryRun, "query">) {
  // Name a search by what was asked; the planned expansion can be 8 titles long.
  const asked = run.query?.requestedTitles?.length ? run.query.requestedTitles : run.query?.titles
  return asked?.join(", ") || "Job search"
}

export function runSummary(run: DiscoveryRun) {
  if (run.status === "RUNNING") return "Still searching…"
  if (run.status === "DONE") return `${run.progress?.ranked ?? run.matched} jobs ready`
  return run.error ?? "Failed"
}

export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
