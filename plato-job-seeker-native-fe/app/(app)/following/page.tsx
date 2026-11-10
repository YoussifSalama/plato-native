"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "motion/react"
import { ArrowUpRight, Bell, BellOff, Briefcase, Building2, Clock, Compass, Mail, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ExtensionApplyModal } from "@/components/extension-apply-modal"
import { InfoTip } from "@/components/info-tip"
import { CARD, EmptyState, MatchPill, MonoTile, SectionHeader, StatIcon, StatusPill } from "@/components/plato-ui"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
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
    <div data-tour-state={!data ? undefined : settingsOpen ? "following.settings" : data.alerts.length ? "following.list" : "following.empty"} className={PAGE}>
      {/* Header: what this page is and one line of status. No wall of zero counters. */}
      <header data-tour="page-header" className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Job alerts</p>
          <h1 className="type-page-title mt-1.5">Following</h1>
          <p className="mt-1.5 max-w-[60ch] text-[15px] text-text-secondary">Plato watches the companies and roles you pick and tells you when something new fits you.</p>
        </div>
        <Button variant="outline" data-ai="following.settings" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} className="gap-2 bg-card">
          <SlidersHorizontal className="size-4" />
          Alert settings
        </Button>
      </header>
      {data && (
        <p data-tour="following-status" className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            Watching <b className="text-foreground">{companies.length}</b> compan{companies.length === 1 ? "y" : "ies"} and <b className="text-foreground">{roles.length}</b> role{roles.length === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-text-tertiary" />
            Checked {cadence || "on your schedule"}
            <InfoTip text="How often new jobs from your alerts reach you, gathered into one digest. Only jobs still open are sent, never the same one twice, and nothing is sent when nothing is new." label="What the digest schedule means" />
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="size-3.5 text-text-tertiary" />
            {[data.settings.in_app && "In Plato", data.settings.email && data.settings.emailAvailable && "by email"].filter(Boolean).join(" and ") || "Alerts paused"}
          </span>
          {latest && <span>Last digest {timeAgo(latest.at)}</span>}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-3 rounded-xl border border-l-4 border-l-warning bg-card px-4 py-3 text-sm shadow-card">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="rounded-md p-1 text-text-secondary transition-colors duration-200 hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </p>
      )}
      {settingsOpen && <DigestSettings data={data} onChange={changeSettings} />}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-6">
          {/* 1. What's new comes first; when nothing is new it is one calm line, not an empty box. */}
          {digests === null ? (
            <Skeleton className="h-16 rounded-2xl" />
          ) : newRoles.length === 0 ? (
            <div data-tour="following-new" className={cn(CARD, "flex items-center gap-3 px-4 py-3.5")}>
              <StatIcon icon={Bell} accent="cobalt" className="size-9" />
              <span className="min-w-0 flex-1 text-sm">
                <b className="text-foreground">No new roles yet.</b> <span className="text-text-secondary">Plato checks the companies you follow {cadence || "on your schedule"} and lists what fits you here.</span>
              </span>
            </div>
          ) : (
            <div data-tour="following-new" className={cn(CARD, "flex flex-col gap-3 p-5")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionHeader title={`${newRoles.length} new role${newRoles.length === 1 ? "" : "s"} for you`} icon={Sparkles} accent="cobalt" />
                {latest && <span className="type-meta text-text-secondary">From your digest {timeAgo(latest.at)}</span>}
              </div>
              {newRoles.map((j) => (
                <div key={j.id} className="group flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200 hover:bg-muted/60">
                  <MonoTile name={j.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className="type-card-title block truncate">{j.title}</b>
                    <span className="type-meta block truncate text-text-secondary">{[j.company, j.location, j.posted_at && `posted ${timeAgo(j.posted_at)}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.match_percent != null && <MatchPill value={j.match_percent} />}
                  <a href={j.url} target="_blank" rel="noreferrer" className="group/view inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold transition-colors duration-200 hover:border-primary-line hover:text-primary">
                    View
                    <ArrowUpRight className="size-3.5 text-text-tertiary transition-transform group-hover/view:translate-x-0.5 group-hover/view:-translate-y-0.5 group-hover/view:text-primary" />
                  </a>
                  <Button size="sm" onClick={() => setApply(j.id)} className="rounded-lg bg-primary-soft px-4 text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                    Apply
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* 2. Companies you follow: one tidy list, actions on the right, no zero counters. */}
          <div data-tour="following-companies" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader
                title={
                  <span className="flex items-center gap-1.5">
                    Companies you follow
                    <InfoTip text="“Open” is every live job Plato knows of at that company; “for you” is how many of those are in your own matches. The bell pauses alerts without unfollowing." label="What open and for you mean" />
                  </span>
                }
                icon={Building2}
                accent="cobalt"
              />
              {data && (
                <span className="flex shrink-0 items-center gap-1.5 type-meta text-text-secondary">
                  {data.used.company} of {data.limits.company} on {data.plan[0].toUpperCase() + data.plan.slice(1).toLowerCase()}
                  <InfoTip text={`Your plan lets you follow up to ${data.limits.company} companies and ${data.limits.field} roles. Paused ones still count, so remove one to make room.`} label="What the follow limit means" side="left" />
                </span>
              )}
            </div>
            <div className={cn(CARD, "flex flex-col divide-y divide-divider overflow-hidden")}>
              {!data &&
                Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </span>
                  </div>
                ))}
              {data && companies.length === 0 && <EmptyState icon={Building2} title="You don't follow any company yet" hint="Search on the right and Plato tells you when they post a role that fits." className="m-3 border-0" />}
              <motion.ul key={data ? "ready" : "loading"} variants={staggerContainer} initial="hidden" animate="show" className="contents">
                {companies.map((c) => {
                  const n = newAt(c.company)
                  const counts = [c.open ? `${c.open} open` : null, c.for_you ? `${c.for_you} for you` : null].filter(Boolean).join(" · ")
                  return (
                    <motion.li key={c.id} variants={fadeUpItem} className={cn("group flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-muted/50", c.paused && "opacity-60")}>
                      <MonoTile name={c.company ?? "?"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <b className="type-card-title truncate">{c.company}</b>
                          {n > 0 && <StatusPill tone="primary">{n} new</StatusPill>}
                          {c.paused && <StatusPill tone="neutral">Paused</StatusPill>}
                        </span>
                        <span className="type-meta block truncate text-text-secondary">{c.paused ? "Alerts paused" : counts || (c.sent ? `${c.sent} sent to you so far` : "Watching · nothing new yet")}</span>
                      </span>
                      <Link href={`/jobs?company=${encodeURIComponent(c.company ?? "")}`} data-ai="following.see-roles" className="group/see inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                        See roles
                        <ArrowUpRight className="size-3.5 transition-transform group-hover/see:translate-x-0.5" />
                      </Link>
                      <button type="button" title={c.paused ? "Resume alerts" : "Pause alerts"} aria-label={c.paused ? `Resume alerts for ${c.company}` : `Pause alerts for ${c.company}`} aria-pressed={!c.paused} onClick={() => togglePause(c)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-200 hover:bg-muted hover:text-primary">
                        {c.paused ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                      </button>
                      <button type="button" title="Unfollow" aria-label={`Unfollow ${c.company}`} onClick={() => void run(() => deleteAlert(c.id))} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-200 hover:bg-danger-soft hover:text-destructive">
                        <X className="size-4" />
                      </button>
                    </motion.li>
                  )
                })}
              </motion.ul>
              {data && (
                <button type="button" onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="Search any company to follow"]')?.focus()} className="flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-tint">
                  <Plus className="size-4" />
                  Follow a company
                </button>
              )}
            </div>
          </div>

          {!!digests?.length && <Digests digests={digests} focus={focus} />}
        </section>

        <aside className="flex flex-col gap-6">
          <div data-tour="following-roles" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader
                title={
                  <span className="flex items-center gap-1.5">
                    Roles you follow
                    <InfoTip text="A role alert picks up new jobs at any company whose title matches it, and the location or remote-only rule if you set one. The switch pauses it without deleting it." label="How a role alert works" />
                  </span>
                }
                icon={Briefcase}
                accent="cobalt"
              />
              <button type="button" data-ai="following.follow-role" onClick={() => setRoleDraft("")} className="flex shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                <Plus className="size-4" />
                Follow a role
              </button>
            </div>
            <div className={cn(CARD, "flex flex-col divide-y divide-divider overflow-hidden")}>
              {!data &&
                Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </span>
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))}
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-muted/60">
                  <span className="min-w-0 flex-1">
                    <b className="type-card-title block truncate">{r.title}</b>
                    <span className="type-meta text-text-secondary">{[r.location, r.remote_only ? "Remote only" : null, r.sent ? `${r.sent} sent so far` : "Nothing sent yet"].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Switch size="sm" checked={!r.paused} onCheckedChange={() => togglePause(r)} aria-label={`Alerts for ${r.title}`} />
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
                  <Input id="new-role" autoFocus value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} placeholder="A role, like SCM consultant" className="flex-1" />
                  <Button type="submit" size="sm" className="rounded-lg">
                    Follow
                  </Button>
                </form>
              )}
              {data && roles.length === 0 && roleDraft === null && <EmptyState icon={Briefcase} title="No roles yet" hint="Follow one to hear about new openings." className="m-3 border-0" />}
            </div>
          </div>

          {/* Follow more: search lives inside its card; the hint is plain text, not a fake field. */}
          <div data-tour="following-search" className={cn(CARD, "flex flex-col gap-3 p-4")}>
            <SectionHeader title="Follow more companies" icon={Compass} accent="cobalt" as="h3" className="[&_h3]:type-card-title" />
            <InputGroup className="bg-card">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput data-ai="following.company-search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search any company to follow" placeholder="Search any company" />
            </InputGroup>
            <div className="-mx-1 flex flex-col">
              {suggestions
                .filter((s) => !followed.has(s.name.toLowerCase()))
                .slice(0, 6)
                .map((s) => (
                  <div key={s.key} className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors duration-200 hover:bg-muted/60">
                    <MonoTile name={s.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px]">{s.name}</b>
                      <span className="type-meta text-text-secondary">
                        {s.jobs} open job{s.jobs === 1 ? "" : "s"}
                      </span>
                    </span>
                    <button type="button" onClick={() => void run(() => createAlert({ kind: "COMPANY", company: s.name }))} className="flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                      <Plus className="size-3.5" />
                      Follow
                    </button>
                  </div>
                ))}
              {!q.trim() && !suggestions.some((s) => !followed.has(s.name.toLowerCase())) && <p className="px-1 text-[13px] text-text-tertiary">Type a company name to see it here.</p>}
              {q.trim() && !suggestions.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => (void run(() => createAlert({ kind: "COMPANY", company: q.trim() })), setQ(""))} className="flex items-center gap-2 rounded-lg px-1 py-2 text-left text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-tint">
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
