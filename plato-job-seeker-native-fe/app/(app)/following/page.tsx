"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Bell, BellOff, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "cn"
import { PAGE, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { MatchPill, MonoTile, PlatoNote, StatusPill } from "@/components/plato-ui"
import { CADENCES, createAlert, deleteAlert, getDigests, getInsights, saveAlertSettings, searchCompanies, updateAlert, type AlertSettings, type CompanySuggestion, type Digest, type InsightsOverview, type JobAlert } from "@/lib/insights/api"
import { timeAgo } from "@/lib/jobs/links"
import { DigestSettings } from "../insights/digest-settings"
import { Digests } from "../insights/digests"

// Following (screen 10): companies you follow and their new roles on the left, the roles you
// follow and companies to follow next on the right. Everything here is a job alert.
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again in a moment.")

function FollowingContent() {
  const focus = useSearchParams().get("digest")
  const [data, setData] = useState<InsightsOverview | null>(null)
  const [digests, setDigests] = useState<Digest[] | null>(null)
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([])
  const [q, setQ] = useState("")
  const [roleDraft, setRoleDraft] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apply, setApply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getInsights()
      .then(setData)
      .catch((e) => setError(messageOf(e)))
  }, [])
  useEffect(() => {
    refresh()
    getDigests(10)
      .then(setDigests)
      .catch(() => setDigests([]))
  }, [refresh])
  useEffect(() => {
    const t = setTimeout(() => {
      searchCompanies(q.trim())
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const companies = data?.alerts.filter((a) => a.kind === "COMPANY") ?? []
  const roles = data?.alerts.filter((a) => a.kind === "FIELD") ?? []
  const followed = new Set(companies.map((c) => c.company?.toLowerCase()))
  const latest = digests?.[0]
  const newRoles = latest?.jobs.filter((j) => !j.closed && followed.has(j.company.toLowerCase())) ?? []
  const newAt = (company: string | null) => newRoles.filter((j) => j.company.toLowerCase() === company?.toLowerCase()).length

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      refresh()
    }
  }
  const togglePause = (a: JobAlert) => {
    setData((d) => d && { ...d, alerts: d.alerts.map((x) => (x.id === a.id ? { ...x, paused: !a.paused } : x)) })
    void run(() => updateAlert(a.id, { paused: !a.paused }))
  }
  const changeSettings = (patch: Partial<Omit<AlertSettings, "emailAvailable">>) => {
    setData((d) => d && { ...d, settings: { ...d.settings, ...patch } })
    saveAlertSettings(patch).catch((e) => (setError(messageOf(e)), refresh()))
  }
  const cadence = data ? (CADENCES.find((c) => c.value === data.settings.cadence)?.label ?? "").toLowerCase() : ""

  return (
    <div className={PAGE}>
      <PageHeader
        title="Following"
        description="New openings at companies you follow and in roles you care about."
        actions={
          <Button variant="outline" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} className="h-11 gap-2 rounded-xl bg-card px-4">
            <SlidersHorizontal className="size-4" />
            Alert settings
          </Button>
        }
      />
      {error && (
        <p role="alert" className="flex items-center gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
            <X className="size-4" />
          </button>
        </p>
      )}
      {settingsOpen && <DigestSettings data={data} onChange={changeSettings} />}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Companies you follow</h2>
            {data && (
              <span className="text-sm text-text-secondary">
                {data.used.company} of {data.limits.company} on {data.plan[0] + data.plan.slice(1).toLowerCase()}
              </span>
            )}
          </div>
          {!data && <Skeleton className="h-40 rounded-2xl" />}
          {data && companies.length === 0 && <PlatoNote variant="inline">You don&apos;t follow any company yet. Pick one on the right and Plato tells you when they post a role that fits.</PlatoNote>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {companies.map((c) => {
              const n = newAt(c.company)
              return (
                <div key={c.id} className={cn("group relative flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-card p-3", c.paused && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <MonoTile name={c.company ?? "?"} />
                    {n ? <StatusPill tone="primary">{n} new</StatusPill> : <span className="text-[11px] whitespace-nowrap text-text-tertiary">No new roles</span>}
                  </div>
                  <b className="mt-1 truncate text-[15.5px]">{c.company}</b>
                  <span className="text-[12.5px] leading-snug text-text-secondary">{c.open != null ? `${c.for_you ?? 0} for you · ${c.open} open` : c.sent ? `${c.sent} sent to you so far` : "Nothing sent yet"}</span>
                  <div className="mt-1.5 flex gap-2">
                    <Link href={`/jobs?company=${encodeURIComponent(c.company ?? "")}`} data-ai="following.see-roles" className="flex-1 rounded-lg border bg-card py-1.5 text-center text-sm font-semibold whitespace-nowrap hover:border-primary-line">
                      See roles
                    </Link>
                    <button type="button" aria-label={c.paused ? `Resume alerts for ${c.company}` : `Pause alerts for ${c.company}`} aria-pressed={!c.paused} onClick={() => togglePause(c)} className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-text-secondary hover:border-primary-line">
                      {c.paused ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => void run(() => deleteAlert(c.id))} className="self-start text-xs text-text-tertiary hover:text-destructive hover:underline">
                    Unfollow
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-primary-line bg-primary-tint p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PlatoNote variant="headline">
                <b className="text-[17px] text-foreground">
                  {newRoles.length} new role{newRoles.length === 1 ? "" : "s"} from companies you follow
                </b>
              </PlatoNote>
              {latest && <span className="text-[13px] text-text-secondary">In your digest from {timeAgo(latest.at)}</span>}
            </div>
            {digests === null && <Skeleton className="h-24 rounded-xl" />}
            {digests !== null && newRoles.length === 0 && <p className="text-sm text-text-secondary">Nothing new yet. Plato checks every company you follow and sends what fits {cadence || "on your schedule"}.</p>}
            {newRoles.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                <MonoTile name={j.company} size="sm" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px]">{j.title}</b>
                  <span className="block truncate text-xs text-text-secondary">{[j.company, j.location, j.posted_at && `posted ${timeAgo(j.posted_at)}`].filter(Boolean).join(" · ")}</span>
                </span>
                {j.match_percent != null && <MatchPill value={j.match_percent} />}
                <a href={j.url} target="_blank" rel="noreferrer" className="rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:border-primary-line">
                  View
                </a>
                <Button size="sm" onClick={() => setApply(j.id)} className="rounded-lg px-4">
                  Apply
                </Button>
              </div>
            ))}
          </div>

          {!!digests?.length && <Digests digests={digests} focus={focus} />}
        </section>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Roles you follow</h2>
              <button type="button" onClick={() => setRoleDraft("")} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                <Plus className="size-4" />
                Follow a role
              </button>
            </div>
            <div className="flex flex-col divide-y divide-divider rounded-2xl border bg-card">
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{r.title}</b>
                    <span className="text-xs text-text-secondary">{[r.location, r.remote_only ? "Remote only" : null, `${r.sent} sent so far`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <input type="checkbox" role="switch" checked={!r.paused} onChange={() => togglePause(r)} aria-label={`Alerts for ${r.title}`} className="peer sr-only" />
                  <span aria-hidden className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring", r.paused ? "bg-foreground/15" : "bg-primary")}>
                    <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", r.paused ? "left-0.5" : "left-[22px]")} />
                  </span>
                </label>
              ))}
              {roleDraft !== null && (
                <form
                  className="flex items-center gap-2 px-3 py-2.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const title = roleDraft.trim()
                    if (!title) return
                    setRoleDraft(null)
                    void run(() => createAlert({ kind: "FIELD", title }))
                  }}
                >
                  <label htmlFor="new-role" className="sr-only">
                    Role to follow
                  </label>
                  <input id="new-role" autoFocus value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="A role, like SCM consultant" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none focus:border-primary" />
                  <Button type="submit" size="sm" className="rounded-lg">
                    Follow
                  </Button>
                </form>
              )}
              {data && roles.length === 0 && roleDraft === null && <p className="px-4 py-3 text-sm text-text-secondary">No roles yet. Follow one to hear about new openings.</p>}
            </div>
            {data && (
              <span className="text-xs text-text-secondary">
                Digest {cadence} · {[data.settings.in_app && "in Plato", data.settings.email && "by email"].filter(Boolean).join(" and ") || "paused"}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <h2 className="text-xl font-bold tracking-tight">More companies to follow</h2>
            <label className="surface-panel flex h-11 items-center gap-2 rounded-xl px-3">
              <Search className="size-4 text-text-tertiary" />
              <span className="sr-only">Search any company to follow</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any company to follow" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary" />
            </label>
            <div className="flex flex-col divide-y divide-divider rounded-2xl border bg-card">
              {suggestions
                .filter((s) => !followed.has(s.name.toLowerCase()))
                .slice(0, 6)
                .map((s) => (
                  <div key={s.key} className="flex items-center gap-3 px-3.5 py-2.5">
                    <MonoTile name={s.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px]">{s.name}</b>
                      <span className="text-xs text-text-secondary">
                        {s.jobs} open job{s.jobs === 1 ? "" : "s"} Plato knows of
                      </span>
                    </span>
                    <button type="button" onClick={() => void run(() => createAlert({ kind: "COMPANY", company: s.name }))} className="flex items-center gap-1 rounded-full border border-primary-line px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft">
                      <Plus className="size-3.5" />
                      Follow
                    </button>
                  </div>
                ))}
              {q.trim() && !suggestions.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => (void run(() => createAlert({ kind: "COMPANY", company: q.trim() })), setQ(""))} className="flex items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary-tint">
                  <Plus className="size-4" />
                  Follow “{q.trim()}”
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
      <ExtensionApplyModal open={!!apply} count={1} req={{ jobIds: apply ? [apply] : [] }} onClose={() => setApply(null)} />
    </div>
  )
}

export default function FollowingPage() {
  return (
    <Suspense fallback={null}>
      <FollowingContent />
    </Suspense>
  )
}
