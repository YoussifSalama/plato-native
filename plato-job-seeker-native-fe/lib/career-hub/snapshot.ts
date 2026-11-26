"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getMe } from "@/lib/auth/api"
import { getResumeScore, listCareerThreads, type CareerThreadSummary, type ResumeScore } from "@/lib/career/api"
import { getProfile } from "@/lib/documents/api"
import { listInterviews, type InterviewSummary } from "@/lib/interviews/api"
import { summaryName } from "@/lib/interviews/flow"
import { getMatches, type JobMatch } from "@/lib/jobs/api"
import { getPreferences } from "@/lib/preferences/api"
import { getSkillGap, listCredentials, type Credential, type SkillGap } from "@/lib/skills/api"
import { bankFor, challengeById, challengeFor } from "./content"
import { useHubState, type Draft, type HubKind, type HubResult } from "./store"

// Everything Plato knows about the seeker's career development, read from the existing
// endpoints (profile, resume score, skill gap, mock interviews, credentials, matches) plus the
// hub's own results. Cached for a minute so moving between Career pages doesn't refetch.

export type CareerData = {
  name: string
  role: string | null
  skills: string[]
  gaps: SkillGap[]
  resume: ResumeScore | null
  interviews: InterviewSummary[]
  credentials: Credential[]
  matches: JobMatch[]
  threads: CareerThreadSummary[]
  // Sources that failed or timed out on this load (shown as a quiet "some data is missing").
  failed: string[]
}

// The load as a page sees it: the data, whether nothing could be reached, whether some
// sources are missing, and a way to try again.
export type CareerLoad = { data: CareerData | null; error: boolean; partial: boolean; reload: () => void }

let cache: { at: number; promise: Promise<CareerData> } | null = null
// No request may hold the page: a browser allows 6 open connections per host, and every open
// app tab keeps one for live notifications, so with several tabs a request can wait forever.
const TIMEOUT = 12_000
const timed = <T,>(p: Promise<T>) => Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT))])
function load(): Promise<CareerData> {
  if (cache && Date.now() - cache.at < 60_000) return cache.promise
  const failed: string[] = []
  const settle = <T,>(key: string, p: () => Promise<T>, fallback: T) =>
    timed(Promise.resolve().then(p)).catch(() => {
      failed.push(key)
      return fallback
    })
  const promise = Promise.all([
    settle("account", () => getMe().then((u) => u.full_name), ""),
    settle("preferences", () => getPreferences().then((p) => p.roles[0] ?? null), null),
    settle("profile", () => getProfile().then((p) => p.skills ?? []), [] as string[]),
    settle("skill gap", () => getSkillGap().then((g) => g.skills ?? []), [] as SkillGap[]),
    settle("resume score", () => getResumeScore() as Promise<ResumeScore>, null),
    settle("interviews", () => listInterviews(), [] as InterviewSummary[]),
    settle("certificates", () => listCredentials(), [] as Credential[]),
    settle("matches", () => getMatches({ tab: "discover", sort: "best", take: 5 }).then((r) => r.items ?? []), [] as JobMatch[]),
    settle("coach chats", () => listCareerThreads(), [] as CareerThreadSummary[]),
  ]).then(([name, role, skills, gaps, resume, interviews, credentials, matches, threads]) => {
    // A load with gaps is not kept, so the next page view tries again.
    if (failed.length && cache?.promise === promise) cache = null
    return { name, role, skills, gaps, resume: resume && typeof resume.score === "number" ? { ...resume, topFixes: resume.topFixes ?? [] } : null, interviews, credentials, matches, threads, failed: [...failed] }
  })
  cache = { at: Date.now(), promise }
  return promise
}
// After a new interview on the server, the hub should show it straight away.
export const invalidateCareerData = () => {
  cache = null
}

// Every source failing means Plato's server is unreachable (or the connection is starved): an error.
const SOURCES = 9
export function useCareerLoad(): CareerLoad {
  const [data, setData] = useState<CareerData | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    load().then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [attempt])
  const reload = useCallback(() => {
    cache = null
    setData(null)
    setAttempt((n) => n + 1)
  }, [])
  const error = !!data && data.failed.length >= SOURCES
  return { data: error ? null : data, error, partial: !!data && !error && data.failed.length > 0, reload }
}

export function useCareerData() {
  return useCareerLoad().data
}

// ---------- The snapshot ----------

export type SkillStatus = "proven" | "needs-work" | "unproven" | "gap"
export type SkillRow = { key: string; name: string; from: string[]; level: number | null; status: SkillStatus; evidence: string; trend: number | null; assessHref: string | null; proofHref: string; missingIn?: number }
export type Dimension = { key: string; label: string; value: number | null; hint: string; href: string }
// Interview recommendations open the interview flow with a preset (it asks what is left).
export type Recommendation = { id: string; kind: HubKind | "resume" | "learn"; title: string; why: string; href: string; cta: string; impact: "High" | "Medium"; minutes: number }
export type Activity = { id: string; kind: HubKind; title: string; subtitle: string; score: number; at: string; href: string; skill?: string }
export type Snapshot = {
  readiness: number
  stage: number
  activities: number
  recent30: number
  dimensions: Dimension[]
  skills: SkillRow[]
  strengths: string[]
  weaknesses: string[]
  recommendations: Recommendation[]
  history: Activity[]
  improvements: { skill: string; from: number; to: number }[]
  continueItems: { id: string; title: string; sub: string; href: string }[]
  modules: Record<HubKind, { done: number; best: number | null; last: Activity | null }>
}

export const STAGES = ["Get started", "Build evidence", "Practise interviews", "Stand out"] as const
export const STAGE_HINT = [
  "Take your first assessment or interview so Plato can see where you stand.",
  "Prove your main skills so employers see more than keywords.",
  "Your skills are showing. Interview practice turns them into offers.",
  "You're interview-ready. Keep your scores fresh and tackle harder challenges.",
]

const skillKey = (s: string) => bankFor(s)?.skill ?? s
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function computeSnapshot(d: CareerData, allResults: HubResult[], drafts: Record<string, Draft>, excludeId?: string): Snapshot {
  const results = allResults.filter((r) => r.id !== excludeId)
  const excluded = excludeId ? allResults.find((r) => r.id === excludeId) : undefined
  // Real mock interviews (job-specific, from the server) count as job simulations.
  const realScored = d.interviews.filter((i) => i.score !== null && i.completedAt && !(excluded && excluded.id === i.id))
  const history: Activity[] = [
    ...results.map((r) => ({ id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, score: r.score, at: r.createdAt, href: `/career/results/${r.id}`, skill: r.skill })),
    ...realScored.map((i) => ({ id: i.id, kind: (i.target === "general" ? "interview" : "simulation") as HubKind, title: summaryName(i), subtitle: i.target === "general" ? (i.role ?? "") : i.company, score: i.score as number, at: i.completedAt as string, href: `/career/interviews/${i.id}` })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  // Skills: the CV's skills grouped under the assessment they map to, then anything assessed or proven.
  const rows = new Map<string, SkillRow>()
  const add = (name: string, from?: string) => {
    const key = skillKey(name)
    const row = rows.get(key) ?? { key, name: key, from: [], level: null, status: "unproven" as SkillStatus, evidence: "On your CV, not yet proven", trend: null, assessHref: null, proofHref: proofHref(key) }
    if (from && !row.from.includes(from) && from !== key) row.from.push(from)
    rows.set(key, row)
    return row
  }
  d.skills.slice(0, 12).forEach((s) => add(s, s))
  for (const key of rows.keys()) if (!d.skills.some((s) => s.toLowerCase() === key.toLowerCase())) rows.get(key)!.evidence = `On your CV as ${rows.get(key)!.from.slice(0, 2).join(", ")}`
  const evidenceFor = new Map<string, Activity[]>()
  history.filter((h) => h.skill && (h.kind === "assessment" || h.kind === "proof")).forEach((h) => {
    const key = skillKey(h.skill!)
    evidenceFor.set(key, [...(evidenceFor.get(key) ?? []), h])
  })
  for (const [key, ev] of evidenceFor) {
    const row = add(key)
    const latest = ev[ev.length - 1]
    const proofs = ev.filter((e) => e.kind === "proof")
    row.level = latest.score
    row.trend = ev.length > 1 ? latest.score - ev[ev.length - 2].score : null
    row.evidence = [ev.some((e) => e.kind === "assessment") && `Assessed ${ev.filter((e) => e.kind === "assessment").at(-1)!.score}/100`, proofs.length && `Proof ${proofs.at(-1)!.score}/100`].filter(Boolean).join(" · ")
  }
  d.credentials.filter((c) => c.verification === "VERIFIED" && c.status === "COMPLETED").forEach((c) => {
    const row = add(c.skill)
    row.level = Math.max(row.level ?? 0, 75)
    row.evidence = row.evidence.startsWith("On your CV") ? "Verified certificate" : `${row.evidence} · verified certificate`
  })
  rows.forEach((r) => (r.status = r.level === null ? "unproven" : r.level >= 65 ? "proven" : "needs-work"))
  const gapRows: SkillRow[] = d.gaps.slice(0, 4).filter((g) => !rows.has(skillKey(g.skill))).map((g) => ({ key: g.skill, name: g.skill, from: [], level: null, status: "gap", evidence: `${g.missingIn} of your matches ask for it`, trend: null, assessHref: null, proofHref: proofHref(g.skill), missingIn: g.missingIn }))
  const order: Record<SkillStatus, number> = { proven: 0, "needs-work": 1, unproven: 2, gap: 3 }
  const skills = [...[...rows.values()].sort((a, b) => order[a.status] - order[b.status] || (b.level ?? 0) - (a.level ?? 0)), ...gapRows]

  // Readiness: four things employers look at.
  const interviewScores = history.filter((h) => h.kind === "interview" || h.kind === "simulation").map((h) => h.score)
  const interviewing = avg(interviewScores.slice(-3))
  const top = [...rows.values()].slice(0, 6)
  const provenShare = top.length ? Math.round((top.filter((r) => r.status === "proven").length / top.length) * 100) : 0
  const proofs = history.filter((h) => h.kind === "proof" && h.score >= 70).length
  const dimensions: Dimension[] = [
    { key: "resume", label: "Resume", value: d.resume?.score ?? null, hint: d.resume ? `${d.resume.topFixes.length} quick fix${d.resume.topFixes.length === 1 ? "" : "es"} left` : "Not scored yet", href: `/career?prompt=${encodeURIComponent("Score my resume out of 100 and list the quick fixes")}` },
    { key: "interview", label: "Interviewing", value: interviewing, hint: interviewScores.length ? `Average of your last ${Math.min(3, interviewScores.length)}` : "No interviews yet", href: "/career/interviews/new" },
    { key: "skills", label: "Skills proven", value: provenShare, hint: `${top.filter((r) => r.status === "proven").length} of ${top.length || 0} main skills`, href: "/career/proof" },
    { key: "proof", label: "Proof of work", value: Math.min(100, proofs * 34), hint: `${proofs} challenge${proofs === 1 ? "" : "s"} passed`, href: "/career/proof" },
  ]
  const weights: Record<string, number> = { resume: 0.3, interview: 0.3, skills: 0.25, proof: 0.15 }
  const known = dimensions.filter((x) => x.value !== null)
  const wsum = known.reduce((s, x) => s + weights[x.key], 0)
  const readiness = wsum ? Math.round(known.reduce((s, x) => s + (x.value as number) * weights[x.key], 0) / wsum) : 0
  const activities = history.length
  const stage = activities === 0 ? 0 : readiness < 55 ? 1 : readiness < 75 ? 2 : 3

  const strengths = [
    ...skills.filter((s) => s.status === "proven").slice(0, 3).map((s) => `${s.name}: ${s.level}/100`),
    d.resume && d.resume.score >= 75 ? `Resume scores ${d.resume.score}/100` : null,
    interviewing !== null && interviewing >= 70 ? `Interviews average ${interviewing}/100` : null,
  ].filter(Boolean) as string[]
  const weaknesses = [
    ...skills.filter((s) => s.status === "needs-work").slice(0, 2).map((s) => `${s.name}: ${s.level}/100`),
    ...d.gaps.slice(0, 2).map((g) => `${g.skill} isn't on your CV (${g.missingIn} matches ask)`),
    d.resume && d.resume.score < 75 ? `Resume ${d.resume.score}/100` : null,
    interviewing !== null && interviewing < 65 ? `Interview answers average ${interviewing}/100` : null,
  ].filter(Boolean) as string[]

  // What to do next, most valuable first, each with the reason.
  const recs: (Recommendation & { p: number })[] = []
  if (!interviewScores.length) recs.push({ id: "first-interview", kind: "interview", title: "Do your first practice interview", why: "You haven't practised an interview yet. It's the quickest way to raise your readiness.", href: "/career/interviews/new?target=general", cta: "Start", impact: "High", minutes: 15, p: 90 })
  // Per-skill assessments were retired (their links land on Quizzes, whose scores aren't per skill), so a
  // skill is proven by a challenge or a verified certificate: that is where these steps lead.
  const unproven = skills.find((s) => s.status === "unproven")
  if (unproven) recs.push({ id: `prove-cv-${unproven.key}`, kind: "proof", title: `Prove your ${unproven.name}`, why: "It's on your CV, but nothing shows your level yet. A scored challenge carries more weight than a keyword.", href: unproven.proofHref, cta: "Start", impact: "High", minutes: challengeFor(unproven.key).minutes, p: 80 })
  const gap = d.gaps[0]
  if (gap) recs.push({ id: `prove-${gap.skill}`, kind: "proof", title: `Prove ${gap.skill}`, why: `${gap.missingIn} of your matches ask for it and your CV doesn't show it. A finished challenge fills the gap.`, href: proofHref(gap.skill), cta: "Start", impact: "High", minutes: challengeFor(gap.skill).minutes, p: 76 })
  const best = d.matches[0]
  if (best) recs.push({ id: `sim-${best.job.id}`, kind: "simulation", title: `Rehearse your ${best.job.company} interview`, why: `Your best match (${Math.round(best.match_percent)}%). Practise with questions built from its job post before you apply.`, href: `/career/interviews/new?${new URLSearchParams({ target: "job", job: best.job.id, jt: best.job.title, jc: best.job.company })}`, cta: "Set up", impact: interviewScores.length ? "High" : "Medium", minutes: 20, p: interviewScores.length ? 85 : 70 })
  const weak = skills.find((s) => s.status === "needs-work")
  if (weak) recs.push({ id: `retake-${weak.key}`, kind: "assessment", title: `Raise your ${weak.name} score`, why: `You scored ${weak.level}/100. Read the feedback, then retake the challenge to update your snapshot.`, href: weak.proofHref, cta: "Retake", impact: "Medium", minutes: 8, p: 66 })
  if (d.resume && d.resume.score < 80 && d.resume.topFixes[0]) recs.push({ id: "resume", kind: "resume", title: `Lift your resume from ${d.resume.score}`, why: d.resume.topFixes[0], href: `/career?prompt=${encodeURIComponent(`Help me raise my resume score. Start with: ${d.resume.topFixes[0]}`)}`, cta: "Fix", impact: "Medium", minutes: 5, p: 62 })
  if (interviewing !== null && interviewing < 70) recs.push({ id: "interview-again", kind: "interview", title: "Rework your weakest answers", why: `Your interviews average ${interviewing}/100. A behavioral round targets structure and results.`, href: "/career/interviews/new?target=general&focus=behavioral", cta: "Practise", impact: "Medium", minutes: 15, p: 60 })
  if (!history.some((h) => h.kind === "proof")) recs.push({ id: "first-proof", kind: "proof", title: "Finish a proof-of-skill challenge", why: "Real work samples are what hiring managers trust most.", href: "/career/proof", cta: "Browse", impact: "Medium", minutes: 20, p: 50 })
  recs.push({ id: "pick-assessment", kind: "assessment", title: "Take a hiring quiz", why: "Practise the test a company gives candidates, with a score per section.", href: "/career/quizzes", cta: "Browse", impact: "Medium", minutes: 8, p: 45 })
  const recommendations = recs.sort((a, b) => b.p - a.p).map(({ p, ...r }) => (void p, r))

  // Improvement: the same skill measured more than once.
  const improvements = [...evidenceFor.entries()].filter(([, ev]) => ev.length > 1 && ev[ev.length - 1].score > ev[0].score).map(([skill, ev]) => ({ skill, from: ev[0].score, to: ev[ev.length - 1].score }))

  const continueItems = [
    ...Object.entries(drafts).map(([key, dr]) => ({ id: `draft-${key}`, title: challengeById(key).title, sub: `Proof draft saved · ${dr.text.trim().split(/\s+/).filter(Boolean).length} words`, href: `/career/proof/${key}` })),
    ...d.interviews.filter((i) => !i.completedAt).slice(0, 2).map((i) => ({ id: i.id, title: `Interview: ${summaryName(i)}`, sub: `${i.target === "general" ? (i.role ?? "Practice") : i.company} · not finished`, href: `/career/interviews/${i.id}` })),
  ]

  const mod = (k: HubKind) => {
    const xs = history.filter((h) => h.kind === k)
    return { done: xs.length, best: xs.length ? Math.max(...xs.map((x) => x.score)) : null, last: xs.at(-1) ?? null }
  }
  const recent30 = history.filter((h) => Date.now() - new Date(h.at).getTime() < 30 * 864e5).length
  return { readiness, stage, activities, recent30, dimensions, skills, strengths, weaknesses, recommendations, history, improvements, continueItems, modules: { assessment: mod("assessment"), interview: mod("interview"), simulation: mod("simulation"), proof: mod("proof") } }
}

// A gap skill gets the generic challenge; the route reads the skill name from ?skill.
export function proofHref(skill: string) {
  const c = challengeFor(skill)
  return c.id.startsWith("skill-") ? `/career/proof/${c.id}?skill=${encodeURIComponent(skill)}` : `/career/proof/${c.id}`
}

export function useSnapshot(excludeId?: string) {
  const { data, error, partial, reload } = useCareerLoad()
  const { results, drafts } = useHubState()
  const snap = useMemo(() => (data ? computeSnapshot(data, results, drafts, excludeId) : null), [data, results, drafts, excludeId])
  return { data, snap, results, error, partial, reload }
}
