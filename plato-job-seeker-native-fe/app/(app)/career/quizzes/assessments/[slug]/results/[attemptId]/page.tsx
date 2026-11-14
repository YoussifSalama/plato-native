"use client"

import { type ReactNode, use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, CircleUserRound, Clock, Info, RotateCcw, Target, X } from "lucide-react"
import { cn } from "cn"
import { PAGE } from "@/components/page-header"
import { MatchRing } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { getAssessment, getAssessmentResult } from "@/lib/quizzes/api"
import type { AssessmentDetail, AssessmentResult, ScaleScore } from "@/lib/quizzes/contract"
import { Cell, MatrixGrid } from "../../../../_ui/matrix"
import { ActionBar, ago, AttemptsCard, BTN_PRIMARY, BTN_SECONDARY, CATEGORY, MainCard, mmss, SideCard, TestHeader, TestLayout } from "../../../../_ui/shell"

// One attempt's results: reasoning (percentile, rules, every grid with the right answer) or a trait profile.

const RULE: Record<string, string> = {
  addition: "Adding parts",
  subtraction: "Removing parts",
  disjunctive_union: "Keeping what differs",
  intersection: "Keeping what's shared",
  rotation: "Rotation",
  completeness: "Completing a set",
}
const RULE_HELP: Record<string, string> = {
  addition: "the third cell in a row has every part of the first two.",
  subtraction: "the third cell is the first with the second cell's parts taken away.",
  disjunctive_union: "the third cell keeps the parts that appear in only one of the first two.",
  intersection: "the third cell keeps only the parts the first two share.",
  rotation: "a part moves one step around the cell from column to column.",
  completeness: "every row holds the same set of parts, each once, in a different order.",
}
const BAND = { low: "Low", mid: "Middle", high: "High" } as const

export default function AssessmentResultPage({ params }: { params: Promise<{ slug: string; attemptId: string }> }) {
  const { slug, attemptId } = use(params)
  const [r, setR] = useState<AssessmentResult | null>(null)
  const [a, setA] = useState<AssessmentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getAssessmentResult(slug, attemptId)
      .then(setR)
      .catch((e: Error) => setError(e.message))
    getAssessment(slug)
      .then(setA)
      .catch(() => undefined)
  }, [slug, attemptId])

  if (error)
    return (
      <div className={PAGE}>
        <TestHeader title="Results" />
        <p role="alert" className="rounded-2xl border bg-card p-6 text-sm text-destructive">
          {error}
        </p>
      </div>
    )
  if (!r)
    return (
      <div className={PAGE}>
        <Skeleton className="h-16 w-80 rounded-xl" />
        <TestLayout main={<Skeleton className="h-[560px] rounded-2xl" />} side={<Skeleton className="h-64 rounded-2xl" />} />
      </div>
    )

  const cat = CATEGORY[r.category]
  const nextSet = r.category === "reasoning" ? `matrix-${(Number(slug.split("-")[1]) % 11) + 1}` : null
  return (
    <div className={PAGE}>
      <TestHeader eyebrow={`${cat.label} · ${ago(r.createdAt)}`} title={`${r.title}: your results`} />
      <TestLayout
        main={
          <MainCard
            bar={
              <ActionBar
                left={
                  <Link href="/career/quizzes" className={BTN_SECONDARY}>
                    <ArrowLeft className="size-4" /> All assessments
                  </Link>
                }
                right={
                  <Link href={`/career/quizzes/assessments/${slug}`} className={BTN_PRIMARY}>
                    <RotateCcw className="size-4" /> Retake
                  </Link>
                }
              />
            }
          >
            {r.reasoning ? <Reasoning r={r} /> : <Traits r={r} />}
          </MainCard>
        }
        side={
          <>
            <AttemptsCard items={a?.history ?? []} hrefOf={(id) => `/career/quizzes/assessments/${slug}/results/${id}`} current={attemptId} />
            <SideCard title="Your candidate profile" icon={CircleUserRound}>
              <p className="text-sm text-text-secondary">Every assessment you finish adds to one profile, and Plato can write a recruiter-style report from it.</p>
              <Link href="/career/quizzes/profile" className={cn(BTN_SECONDARY, "mt-3 w-full")}>
                Open my profile <ArrowRight className="size-4" />
              </Link>
            </SideCard>
            {nextSet && (
              <SideCard title="Keep practising" icon={Target}>
                <p className="text-sm text-text-secondary">A new set has different grids at the same mix of difficulty. Each set sharpens your pooled reasoning score.</p>
                <Link href={`/career/quizzes/assessments/${nextSet}`} className={cn(BTN_SECONDARY, "mt-3 w-full")}>
                  Matrix reasoning · Set {nextSet.split("-")[1]} <ArrowRight className="size-4" />
                </Link>
              </SideCard>
            )}
          </>
        }
      />
    </div>
  )
}

// ---- reasoning -----------------------------------------------------------------------------------------------------

function Reasoning({ r }: { r: AssessmentResult }) {
  const x = r.reasoning!
  const [open, setOpen] = useState<string | null>(null)
  const byRule = useMemo(() => {
    const m = new Map<string, { n: number; ok: number }>()
    for (const it of x.items)
      for (const rule of it.rules) {
        const c = m.get(rule) ?? { n: 0, ok: 0 }
        m.set(rule, { n: c.n + 1, ok: c.ok + (it.correct ? 1 : 0) })
      }
    return [...m].sort((p, q) => q[1].n - p[1].n)
  }, [x.items])
  const byLevel = (["easy", "medium", "hard"] as const).map((l) => {
    const xs = x.items.filter((i) => i.level === l)
    return { l, n: xs.length, ok: xs.filter((i) => i.correct).length }
  })
  const shown = x.items.find((i) => i.id === open)
  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <MatchRing
          value={x.percentile}
          size={120}
          stroke={10}
          label={
            <span className="flex flex-col items-center leading-none">
              {x.percentile}
              <span className="mt-1.5 text-[11px] font-medium tracking-normal text-text-tertiary">percentile</span>
            </span>
          }
        />
        <div>
          <p className="text-3xl font-bold tracking-tight">{r.headline}</p>
          <p className="mt-1 text-[15px] text-text-secondary">
            You solved <b className="text-foreground tabular-nums">{x.correct}</b> of <b className="text-foreground tabular-nums">{x.total}</b> grids in{" "}
            <span className="tabular-nums">{mmss(r.seconds)}</span>. That places you above {x.percentile}% of the test&apos;s calibration group.
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-text-tertiary">
            <Info className="mt-0.5 size-4 shrink-0" /> The group was medical-school applicants, a strong sample, so for the general population your standing is likely higher.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="By difficulty">
          {byLevel.map((b) => (
            <Bar key={b.l} label={b.l[0].toUpperCase() + b.l.slice(1)} value={b.n ? (b.ok / b.n) * 100 : 0} right={`${b.ok}/${b.n}`} />
          ))}
        </Panel>
        <Panel title="By rule">
          {byRule.map(([k, c]) => (
            <Bar key={k} label={RULE[k] ?? k} value={(c.ok / c.n) * 100} right={`${c.ok}/${c.n}`} />
          ))}
        </Panel>
      </div>

      <div>
        <h2 className="mb-1 text-base font-semibold">Every grid</h2>
        <p className="mb-4 text-sm text-text-secondary">Open a grid to compare your piece with the right one.</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          {x.items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setOpen(open === it.id ? null : it.id)}
              aria-expanded={open === it.id}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl border p-1.5 transition-colors hover:bg-muted",
                open === it.id && "border-primary ring-1 ring-primary",
                it.correct ? "bg-success-soft/40" : "bg-danger-soft/40",
              )}
            >
              <span className="flex w-full items-center justify-between px-0.5 text-[11px] font-semibold tabular-nums">
                <span className="text-text-secondary">{i + 1}</span>
                {it.correct ? <Check className="size-3.5 text-success-ink" strokeWidth={3} /> : <X className="size-3.5 text-destructive" strokeWidth={3} />}
              </span>
              <span className="aspect-square w-full rounded-md bg-card p-1 text-foreground">
                <Cell mask={it.cells[8]} />
              </span>
            </button>
          ))}
        </div>
        {shown && (
          <div className="mt-4 grid items-start gap-6 rounded-2xl border bg-muted/30 p-5 md:grid-cols-[260px_minmax(0,1fr)]">
            <MatrixGrid cells={shown.cells.slice(0, 8)} answer={shown.cells[8]} answerTone="right" />
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <Piece title="Right answer" mask={shown.cells[8]} tone="right" />
                <Piece title="Your piece" mask={shown.given} tone={shown.correct ? "right" : "wrong"} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Grid {x.items.indexOf(shown) + 1} · {shown.level}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {shown.rules.map((k) => (
                    <li key={k} className="text-sm leading-relaxed text-text-secondary">
                      <b className="font-semibold text-foreground">{RULE[k] ?? k}:</b> {RULE_HELP[k] ?? ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Piece({ title, mask, tone }: { title: string; mask: string | null; tone: "right" | "wrong" }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className={cn("grid size-24 place-items-center rounded-xl border p-2.5", tone === "right" ? "bg-success-soft text-success-ink" : "bg-danger-soft text-destructive")}>
        {mask && mask.includes("1") ? <Cell mask={mask} /> : <span className="text-xs font-medium">No answer</span>}
      </span>
      <span className="text-xs font-medium text-text-secondary">{title}</span>
    </div>
  )
}

// ---- traits --------------------------------------------------------------------------------------------------------

function Traits({ r }: { r: AssessmentResult }) {
  const scales = r.scales ?? []
  const groups = r.domains && r.slug === "big-five" ? r.domains.map((d) => ({ d, facets: scales.filter((s) => s.group === d.name) })) : null
  const top = [...(r.domains ?? scales)].sort((p, q) => q.score - p.score)
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Strongest" value={top[0]?.name ?? "—"} />
        <Stat label="Lowest" value={top[top.length - 1]?.name ?? "—"} />
        <Stat label="Time" value={mmss(r.seconds)} icon />
      </div>
      <p className="-mt-3 flex items-start gap-1.5 text-sm text-text-tertiary">
        <Info className="mt-0.5 size-4 shrink-0" /> Scores run from 0 to 100 on each scale&apos;s own range. There is no good or bad end: a low score is a different style, not a weakness.
      </p>

      {r.domains && (
        <Panel title={r.slug === "big-five" ? "The five traits" : "Your traits"}>
          {r.domains.map((d) => (
            <ScaleRow key={d.key} s={d} big />
          ))}
        </Panel>
      )}

      {groups ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map(({ d, facets }) => (
            <Panel key={d.key} title={`${d.name} · facets`}>
              {facets.map((f) => (
                <ScaleRow key={f.key} s={f} />
              ))}
            </Panel>
          ))}
        </div>
      ) : (
        !r.domains && (
          <Panel title="Your scales">
            {scales.map((s) => (
              <ScaleRow key={s.key} s={s} big />
            ))}
          </Panel>
        )
      )}
    </div>
  )
}

function ScaleRow({ s, big }: { s: ScaleScore; big?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("font-semibold text-foreground", big ? "text-[15px]" : "text-sm")}>{s.name}</span>
        <span className="flex items-baseline gap-2 text-sm tabular-nums">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              s.band === "high" ? "bg-primary-soft text-primary" : s.band === "low" ? "bg-muted text-text-secondary" : "bg-info-soft text-info",
            )}
          >
            {BAND[s.band]}
          </span>
          <b className="w-8 text-right text-foreground">{s.score}</b>
        </span>
      </div>
      <Track value={s.score} />
      {s.about && <p className="text-xs leading-relaxed text-text-tertiary">High: {s.about}</p>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Track({ value }: { value: number }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
      <div className="relative h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  )
}

function Bar({ label, value, right }: { label: string; value: number; right: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-text-secondary tabular-nums">{right}</span>
      </div>
      <Track value={value} />
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-2xl border bg-muted/30 px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-text-tertiary uppercase">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-lg font-bold tracking-tight">
        {icon && <Clock className="size-4 text-text-tertiary" />}
        {value}
      </p>
    </div>
  )
}
