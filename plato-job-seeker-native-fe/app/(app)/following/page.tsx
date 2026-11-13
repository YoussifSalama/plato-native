"use client"

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Bell, BellOff, Briefcase, Building2, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { CARD, EmptyState, MatchPill, monogram } from "@/components/plato-ui"
import { CADENCES, createAlert, deleteAlert, getDigests, getInsights, getSuggestedCompanies, saveAlertSettings, searchCompanies, updateAlert, type AlertSettings, type CompanySuggestion, type Digest, type InsightsOverview, type JobAlert } from "@/lib/insights/api"
import { timeAgo } from "@/lib/jobs/links"
import { DigestSettings } from "../insights/digest-settings"
import { Digests } from "../insights/digests"

// Following (owner screen, 2026-11-13): companies you follow, then their new roles, on the left; the roles you follow
// and companies to follow next on the right. Everything here is a job alert.
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again in a moment.")

// A company's logo tile: white, bordered, its monogram in ink (the design's tiles carry no colour).
function Tile({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-xl border bg-card font-bold tracking-tight text-foreground", size === "sm" ? "size-10 text-[13px]" : "size-12 text-[17px]")}>{monogram(name)}</span>
}

// Section title with a right-aligned aside, as in the design (no icon chips).
function Head({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[19px] font-bold tracking-tight text-foreground">{title}</h2>
      {aside}
    </div>
  )
}

function FollowingContent() {
  const focus = useSearchParams().get("digest")
  const [data, setData] = useState<InsightsOverview | null>(null)
  const [digests, setDigests] = useState<Digest[] | null>(null)
  const [suggested, setSuggested] = useState<CompanySuggestion[] | null>(null)
  const [results, setResults] = useState<CompanySuggestion[]>([])
  const [q, setQ] = useState("")
  const [roleDraft, setRoleDraft] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apply, setApply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getInsights()
      .then(setData)
      .catch((e) => setError(messageOf(e)))
    getSuggestedCompanies()
      .then(setSuggested)
      .catch(() => setSuggested([]))
  }, [])
  useEffect(() => {
    refresh()
    getDigests(10)
      .then(setDigests)
      .catch(() => setDigests([]))
  }, [refresh])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const t = setTimeout(() => {
      searchCompanies(term)
        .then(setResults)
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const companies = data?.alerts.filter((a) => a.kind === "COMPANY") ?? []
  const roles = data?.alerts.filter((a) => a.kind === "FIELD") ?? []
  const followed = new Set(companies.map((c) => c.company?.toLowerCase()))
  const latest = digests?.[0]
  const newRoles = latest?.jobs.filter((j) => !j.closed && followed.has(j.company.toLowerCase())) ?? []
  const newAt = (company: string | null) => newRoles.filter((j) => j.company.toLowerCase() === company?.toLowerCase()).length
  const searching = q.trim().length >= 2
  const toFollow = (searching ? results : (suggested ?? [])).filter((s) => !followed.has(s.name.toLowerCase())).slice(0, 5)

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
  const channels = data ? [data.settings.in_app && "in Plato", data.settings.email && data.settings.emailAvailable && "by email"].filter(Boolean).join(" and ") : ""
  const plan = data ? data.plan[0].toUpperCase() + data.plan.slice(1).toLowerCase() : ""

  return (
    <div data-tour-state={!data ? undefined : settingsOpen ? "following.settings" : data.alerts.length ? "following.list" : "following.empty"} className={PAGE}>
      <header data-tour="page-header" className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-page-title">Following</h1>
          <p className="mt-1.5 max-w-[60ch] text-[15px] text-text-secondary">New openings at companies you follow and in roles you care about.</p>
        </div>
        <Button variant="outline" size="lg" data-ai="following.settings" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} className="gap-2 rounded-xl bg-card px-5">
          <SlidersHorizontal className="size-4" />
          Alert settings
        </Button>
      </header>
      {error && (
        <p role="alert" className="flex items-center gap-3 rounded-xl border border-l-4 border-l-warning bg-card px-4 py-3 text-sm shadow-card">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="rounded-md p-1 text-text-secondary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </p>
      )}
      {settingsOpen && <DigestSettings data={data} onChange={changeSettings} />}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_446px]">
        <section className="flex min-w-0 flex-col gap-6">
          {/* Companies you follow: a card each, 4 to a row. */}
          <div data-tour="following-companies" className="flex flex-col gap-3">
            <Head title="Companies you follow" aside={data && <span className="shrink-0 text-[13px] text-text-secondary">{data.used.company} of {data.limits.company} on {plan}</span>} />
            {!data && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-[212px] rounded-2xl" />
                ))}
              </div>
            )}
            {data && companies.length === 0 && <EmptyState icon={Building2} title="You don't follow any company yet" hint="Search on the right and Plato tells you when they post a role that fits." className={cn(CARD, "border-solid")} />}
            {companies.length > 0 && (
              <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
                {companies.map((c) => {
                  const n = newAt(c.company)
                  return (
                    <li key={c.id} className={cn(CARD, "group relative flex min-w-0 flex-col p-4", c.paused && "opacity-70")}>
                      <div className="flex items-start justify-between gap-2">
                        <Tile name={c.company ?? "?"} />
                        {c.paused ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold text-text-secondary">Paused</span>
                        ) : n > 0 ? (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-semibold text-primary">{n} new</span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-text-secondary">No new roles</span>
                        )}
                      </div>
                      <b className="mt-3 truncate text-[17px] font-bold text-foreground">{c.company}</b>
                      <span className="truncate text-[13px] text-text-secondary">{c.where ?? "Watching for new roles"}</span>
                      <span className="mt-2 text-[14px] text-text-secondary">
                        <b className="font-semibold text-foreground">{c.for_you ?? 0}</b> for you · {c.open ?? 0} open
                      </span>
                      <div className="mt-3 flex items-center gap-2">
                        <Link href={`/jobs?company=${encodeURIComponent(c.company ?? "")}`} data-ai="following.see-roles" className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border bg-card px-3 text-[14px] font-semibold text-foreground transition-colors duration-200 hover:border-primary-line hover:text-primary">
                          See roles
                        </Link>
                        <button type="button" title={c.paused ? "Resume alerts" : "Pause alerts"} aria-label={c.paused ? `Resume alerts for ${c.company}` : `Pause alerts for ${c.company}`} aria-pressed={!c.paused} onClick={() => togglePause(c)} className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-text-secondary transition-colors duration-200 hover:border-primary-line hover:text-primary">
                          {c.paused ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                        </button>
                      </div>
                      {/* Unfollow: out of the way until the card is hovered or focused. */}
                      <button type="button" title="Unfollow" aria-label={`Unfollow ${c.company}`} onClick={() => void run(() => deleteAlert(c.id))} className="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full border bg-card text-text-tertiary opacity-0 shadow-card transition-opacity duration-200 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* New roles from the companies you follow, from the latest digest. */}
          {digests === null ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <div data-tour="following-new" className="flex flex-col gap-3 rounded-2xl border border-primary-line/60 bg-primary-tint p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2.5 text-[19px] font-bold tracking-tight text-foreground">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
                    P
                  </span>
                  {newRoles.length ? `${newRoles.length} new role${newRoles.length === 1 ? "" : "s"} from companies you follow` : "No new roles from companies you follow yet"}
                </h2>
                {latest ? <span className="text-[13px] text-text-secondary">From your digest {timeAgo(latest.at)}</span> : cadence && <span className="text-[13px] text-text-secondary">Plato checks them {cadence}</span>}
              </div>
              {newRoles.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-nowrap">
                  <Tile name={j.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[16px] font-bold text-foreground">{j.title}</b>
                    <span className="block truncate text-[14px] text-text-secondary">{[j.company, j.location, j.posted_at && `posted ${timeAgo(j.posted_at)}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.match_percent != null && <MatchPill value={j.match_percent} className="px-2.5 py-1 text-[13px]" />}
                  <a href={j.url} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-xl border bg-card px-4 text-[14px] font-semibold text-foreground transition-colors duration-200 hover:border-primary-line hover:text-primary">
                    View
                  </a>
                  <Button onClick={() => setApply(j.id)} className="h-10 rounded-xl px-5 text-[14px]">
                    Apply
                  </Button>
                </div>
              ))}
              {!newRoles.length && <p className="text-[14px] text-text-secondary">New openings that fit you appear here as soon as one of your companies posts them.</p>}
            </div>
          )}

          {!!digests?.length && <Digests digests={digests} focus={focus} />}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          {/* Roles you follow: each with its on/off switch. */}
          <div data-tour="following-roles" className="flex flex-col gap-3">
            <Head
              title="Roles you follow"
              aside={
                <button type="button" data-ai="following.follow-role" onClick={() => setRoleDraft("")} className="shrink-0 text-[14px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                  + Follow a role
                </button>
              }
            />
            <div className={cn(CARD, "flex flex-col divide-y divide-divider overflow-hidden")}>
              {!data &&
                Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </span>
                    <Skeleton className="h-7 w-12 rounded-full" />
                  </div>
                ))}
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors duration-200 hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[16px] font-bold text-foreground">{r.title}</b>
                    <span className="block truncate text-[14px] text-text-secondary">{[r.location, r.remote_only ? "Remote only" : null, `${r.new_week ?? 0} new this week`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Switch checked={!r.paused} onCheckedChange={() => togglePause(r)} aria-label={`Alerts for ${r.title}`} />
                  <button type="button" title="Stop following" aria-label={`Stop following ${r.title}`} onClick={(e) => (e.preventDefault(), void run(() => deleteAlert(r.id)))} className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-200 hover:bg-danger-soft hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </label>
              ))}
              {roleDraft !== null && (
                <form
                  className="flex items-center gap-2 px-4 py-3"
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
                  <Input id="new-role" autoFocus value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="A role, like SCM consultant" className="flex-1" />
                  <Button type="submit" size="sm" className="rounded-lg">
                    Follow
                  </Button>
                </form>
              )}
              {data && roles.length === 0 && roleDraft === null && <EmptyState icon={Briefcase} title="No roles yet" hint="Follow one to hear about new openings." className="m-3 border-0" />}
            </div>
            {data && (
              <p className="text-[13px] text-text-secondary">
                Digest {cadence || "on your schedule"}
                {channels ? ` · ${channels}` : " · alerts paused"}
              </p>
            )}
          </div>

          {/* More companies: picked from the seeker's own matches; the search finds any company. */}
          <div data-tour="following-search" className="flex flex-col gap-3">
            <div>
              <h2 className="text-[19px] font-bold tracking-tight text-foreground">More companies to follow</h2>
              <p className="mt-0.5 text-[13px] text-text-secondary">Picked by Plato from your titles, level and locations</p>
            </div>
            <InputGroup className="h-12 rounded-xl bg-card">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput data-ai="following.company-search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search any company to follow" placeholder="Search any company to follow" className="text-[15px]" />
            </InputGroup>
            <div className={cn(CARD, "flex flex-col divide-y divide-divider overflow-hidden")}>
              {suggested === null && !searching && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              )}
              {toFollow.map((s) => (
                <div key={s.key} className="flex items-center gap-3 px-4 py-3">
                  <Tile name={s.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[16px] font-bold text-foreground">{s.name}</b>
                    <span className="block truncate text-[14px] text-text-secondary">{s.example ? `${s.jobs} role${s.jobs === 1 ? "" : "s"} that match you, like ${s.example}` : `${s.jobs} open job${s.jobs === 1 ? "" : "s"}`}</span>
                  </span>
                  <button type="button" onClick={() => void run(() => createAlert({ kind: "COMPANY", company: s.name }))} className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-primary-line px-3.5 text-[14px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                    <Plus className="size-3.5" />
                    Follow
                  </button>
                </div>
              ))}
              {searching && !results.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => (void run(() => createAlert({ kind: "COMPANY", company: q.trim() })), setQ(""))} className="flex items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-primary transition-colors duration-200 hover:bg-primary-tint">
                  <Plus className="size-4" />
                  Follow “{q.trim()}”
                </button>
              )}
              {!searching && suggested !== null && !toFollow.length && <p className="px-4 py-3 text-[13px] text-text-tertiary">Run a search and Plato suggests the companies behind your best matches. Or type any company above.</p>}
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
