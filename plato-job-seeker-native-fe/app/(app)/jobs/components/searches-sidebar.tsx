"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Briefcase, Building2, Loader2, Plus } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoTip } from "@/components/info-tip"
import { getDigests, getInsights } from "@/lib/insights/api"
import { createThread, getDiscoveryStats, listThreads, type ThreadSummary } from "@/lib/jobs/api"
import { runTitle, threadHref, timeAgo } from "@/lib/jobs/links"

// The Jobs sidebar: New search, All jobs, Following, and every search. Shared by
// All jobs (/jobs) and a search's results (/jobs/<id>); a search always opens its own page.
const ALL = "all" // the mobile picker's "All jobs" value
const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const
const groupOf = (iso: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 864e5
  return diff <= 0 ? "Today" : diff <= 1 ? "Yesterday" : diff <= 7 ? "Previous 7 days" : "Older"
}
const SIDE_ITEM = "flex h-9 w-full items-center gap-2.5 rounded-lg border px-2.5 text-[13.5px] font-medium transition-colors"
const SIDE_ON = "border-primary-line bg-primary-tint font-semibold text-foreground"
const SIDE_OFF = "border-transparent text-text-secondary hover:bg-muted/60 hover:text-foreground"
// What tells two searches with the same title apart: where they looked.
const searchWhere = (run: ThreadSummary["discovery_runs"][number]) => {
  const q = run.query
  const places = (q?.locations?.length ? q.locations : (q?.countries ?? [])).filter(Boolean)
  const remote = q?.remoteTypes?.includes("REMOTE") ? "Remote" : null
  return [remote, places.slice(0, 2).join(", ") + (places.length > 2 ? ` +${places.length - 2}` : "")].filter(Boolean).join(" · ")
}
const jobsIn = (t: ThreadSummary) => {
  const run = t.discovery_runs[0]
  return run ? (run.progress?.ranked ?? run.matched) : 0
}
const titleOf = (t: ThreadSummary) => (t.title ?? (t.discovery_runs[0] ? runTitle(t.discovery_runs[0]) : "New search")).replace(/ search$/i, "")

export function SearchesSidebar({ activeId, onThreads }: { activeId: string | null; onThreads?: (t: ThreadSummary[]) => void }) {
  const router = useRouter()
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [newThisWeek, setNewThisWeek] = useState(0)
  const [following, setFollowing] = useState<string[]>([])
  const [followedRoles, setFollowedRoles] = useState(0)
  const [followingNew, setFollowingNew] = useState(0)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listThreads()
      .then((t) => {
        setThreads(t)
        onThreads?.(t)
      })
      .catch(() => setThreads([]))
    getDiscoveryStats()
      .then((s) => setNewThisWeek(s.newThisWeek ?? 0))
      .catch(() => undefined)
    // Same count as the Following page: open roles in the latest digest at companies you follow.
    Promise.all([getInsights(), getDigests(1)])
      .then(([i, d]) => {
        const companies = i.alerts.filter((a) => a.kind === "COMPANY" && a.company).map((a) => a.company as string)
        const followed = new Set(companies.map((c) => c.toLowerCase()))
        setFollowing(companies)
        setFollowedRoles(i.alerts.filter((a) => a.kind === "FIELD").length)
        setFollowingNew((d[0]?.jobs ?? []).filter((j) => !j.closed && followed.has(j.company.toLowerCase())).length)
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; onThreads is a setter
  }, [])

  async function newSearch() {
    setCreating(true)
    try {
      router.push(threadHref((await createThread()).id))
    } finally {
      setCreating(false)
    }
  }
  const grouped = GROUPS.map((g) => ({ g, ts: (threads ?? []).filter((t) => groupOf(t.updated_at) === g) })).filter((x) => x.ts.length)

  return (
    <aside data-tour="jobs-toolbar" className="no-scrollbar flex flex-col gap-4 rounded-2xl border bg-card p-3 shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
      {/* Pinned while the searches list scrolls under it. */}
      <div className="z-10 -mx-3 -mt-3 flex flex-col gap-4 rounded-t-2xl border-b border-divider bg-card px-3 pt-3 pb-3 lg:sticky lg:-top-3 lg:shadow-[0_10px_12px_-12px_rgb(14_27_44/0.18)]">
        <Button data-ai="jobs.new-search" onClick={newSearch} disabled={creating} className="w-full gap-2">
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          New search
        </Button>
        <nav aria-label="Job lists" className="flex flex-col gap-0.5">
          <Link href="/jobs" aria-current={!activeId || undefined} className={cn(SIDE_ITEM, !activeId ? SIDE_ON : SIDE_OFF)}>
            <Briefcase className={cn("size-4 shrink-0", !activeId ? "text-primary" : "text-text-tertiary")} strokeWidth={1.8} />
            <span className="flex-1 truncate text-left">All jobs</span>
            {newThisWeek ? <span className="rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary tabular-nums">+{newThisWeek}</span> : null}
          </Link>
          <Link href="/following" data-ai="jobs.following" className={cn(SIDE_ITEM, SIDE_OFF)}>
            <Building2 className="size-4 shrink-0 text-text-tertiary" strokeWidth={1.8} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">Following</span>
              <span className="block truncate text-[11.5px] font-normal text-text-tertiary">{following.length ? `${following.length} compan${following.length === 1 ? "y" : "ies"}${followedRoles ? ` · ${followedRoles} role${followedRoles === 1 ? "" : "s"}` : ""}` : "Hear when companies hire"}</span>
            </span>
            {followingNew > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white tabular-nums">{followingNew} new</span>}
          </Link>
        </nav>
      </div>
      {/* Below lg the list would push the jobs down a screen; a picker opens a search instead. */}
      {!!threads?.length && (
        <Select
          items={[{ value: ALL, label: `All jobs · your searches (${threads.length})` }, ...threads.map((t) => ({ value: t.id, label: titleOf(t) + (jobsIn(t) ? ` · ${jobsIn(t)}` : "") }))]}
          value={activeId ?? ALL}
          onValueChange={(v) => v != null && router.push(v === ALL ? "/jobs" : threadHref(v))}
        >
          <SelectTrigger aria-label="Open one of your searches" className="h-11 w-full rounded-xl bg-card text-[15px] lg:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectItem value={ALL}>All jobs · your searches ({threads.length})</SelectItem>
            {threads.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {titleOf(t) + (jobsIn(t) ? ` · ${jobsIn(t)}` : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <nav data-tour="jobs-searches" aria-label="Your searches" className="hidden flex-col gap-3 border-t border-divider pt-4 lg:flex">
        <p className="flex items-center justify-between px-2.5">
          <span className="flex items-center gap-1.5">
            <span className="eyebrow">Your searches</span>
            <InfoTip text="Each search is a conversation with Plato. The number is how many jobs it ranked; open one to see its jobs, or refine it with Plato." label="What your searches are" side="right" />
          </span>
          {!!threads?.length && <span className="text-[11px] font-semibold text-text-tertiary tabular-nums">{threads.length}</span>}
        </p>
        {threads === null && (
          <div className="flex flex-col gap-1.5 px-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        )}
        {grouped.map(({ g, ts }) => (
          <div key={g} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-medium text-text-tertiary">{g}</p>
            {ts.map((t) => {
              const run = t.discovery_runs[0]
              const n = jobsIn(t)
              const on = t.id === activeId
              return (
                <Link key={t.id} href={threadHref(t.id)} aria-current={on || undefined} data-ai={`jobs.search:${t.id}`} className={cn(SIDE_ITEM, "h-auto items-start py-2", on ? SIDE_ON : SIDE_OFF)}>
                  <span className="min-w-0 flex-1 text-left">
                    <span className={cn("block truncate", on && "text-primary")}>{titleOf(t)}</span>
                    <span className="block truncate text-[11.5px] font-normal text-text-tertiary">{[run && searchWhere(run), timeAgo(t.updated_at)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {run?.status === "RUNNING" ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" /> : n > 0 && <span className={cn("mt-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", on ? "bg-primary-soft text-primary" : "bg-muted text-text-secondary")}>{n}</span>}
                </Link>
              )
            })}
          </div>
        ))}
        {threads?.length === 0 && <p className="px-2.5 text-sm text-text-secondary">No searches yet. Start one and Plato ranks every posting for you.</p>}
      </nav>
    </aside>
  )
}
