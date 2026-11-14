"use client"

import { Mail } from "lucide-react"
import { cn } from "cn"
import type { Media, Scenario } from "@/lib/quizzes/contract"

// What a scenario shows: a colleague's message, a data table, a chart. Plain, readable, like a work inbox.

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")

function Message({ m }: { m: Extract<Media, { kind: "message" }> }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      <figcaption className="flex items-center gap-3 border-b border-divider bg-primary-tint px-4 py-2.5">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
          {initials(m.from) || <Mail className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{m.from}</span>
          {m.role && <span className="block truncate text-xs text-text-tertiary">{m.role}</span>}
        </span>
      </figcaption>
      <blockquote className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line text-foreground">{m.body}</blockquote>
    </figure>
  )
}

// Low / Moderate / High read at a glance, the way a dashboard would mark them (colour carries meaning here).
const LEVEL = /^(low|moderate|medium|high)\b/i
function Cell({ v }: { v: string }) {
  const m = LEVEL.exec(v.trim())
  if (!m) return <>{v}</>
  const k = m[1]!.toLowerCase()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", k === "high" ? "bg-primary" : k === "low" ? "bg-text-tertiary/50" : "bg-primary/50")} />
      {v}
    </span>
  )
}

function Table({ t }: { t: Extract<Media, { kind: "table" }> }) {
  return (
    <figure className="flex flex-col gap-1.5">
      {t.caption && <figcaption className="text-sm font-semibold text-foreground">{t.caption}</figcaption>}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              {t.columns.map((c, i) => (
                <th key={i} scope="col" className={cn("px-3.5 py-2.5 text-left text-xs font-semibold tracking-wide text-text-secondary uppercase", i > 0 && "whitespace-nowrap")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="border-t border-divider">
                {r.map((v, j) => (
                  <td key={j} className={cn("px-3.5 py-2.5 text-foreground tabular-nums", j === 0 && "font-medium")}>
                    {j === 0 ? v : <Cell v={v} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.legend && <p className="text-xs text-text-tertiary">{t.legend}</p>}
    </figure>
  )
}

const SERIES = ["var(--primary)", "var(--azure)", "var(--teal)", "var(--text-tertiary)"]
function Chart({ c }: { c: Extract<Media, { kind: "chart" }> }) {
  const W = 520
  const H = 220
  const pad = { l: 40, r: 12, t: 12, b: 34 }
  const all = c.series.flatMap((s) => s.values)
  const max = Math.max(1, ...all)
  const min = Math.min(0, ...all)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1))
  const band = (W - pad.l - pad.r) / Math.max(1, c.labels.length)
  const ticks = [min, (min + max) / 2, max]
  return (
    <figure className="flex flex-col gap-1.5">
      {c.title && <figcaption className="text-sm font-semibold text-foreground">{c.title}</figcaption>}
      <div className="rounded-xl border bg-card p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={c.title ?? "Chart"}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--divider)" />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">
                {Math.round(t * 10) / 10}
                {c.unit ?? ""}
              </text>
            </g>
          ))}
          {c.labels.map((l, i) => (
            <text key={i} x={pad.l + band * (i + 0.5)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
              {l}
            </text>
          ))}
          {c.chart === "bar"
            ? c.series.map((s, si) => {
                const bw = (band * 0.7) / c.series.length
                return s.values.map((v, i) => {
                  const x = pad.l + band * i + band * 0.15 + bw * si
                  return <rect key={`${si}-${i}`} x={x} y={Math.min(y(v), y(0))} width={bw - 2} height={Math.abs(y(0) - y(v))} rx={2} fill={SERIES[si % SERIES.length]} />
                })
              })
            : c.series.map((s, si) => (
                <polyline
                  key={si}
                  fill="none"
                  stroke={SERIES[si % SERIES.length]}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  points={s.values.map((v, i) => `${pad.l + band * (i + 0.5)},${y(v)}`).join(" ")}
                />
              ))}
        </svg>
        {c.series.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-3 px-1 text-xs text-text-secondary">
            {c.series.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

export function MediaBlock({ m }: { m: Media }) {
  if (m.kind === "message") return <Message m={m} />
  if (m.kind === "table") return <Table t={m} />
  return <Chart c={m} />
}

/** The situation a set of questions refers to: title, the messages/tables, then the task. */
export function ScenarioPanel({ s, className }: { s: Scenario; className?: string }) {
  return (
    <section aria-label={`Scenario: ${s.title}`} className={cn("flex flex-col gap-4", className)}>
      <h3 className="text-lg font-bold tracking-tight text-foreground">{s.title}</h3>
      {s.context.map((m, i) => (
        <MediaBlock key={i} m={m} />
      ))}
      <div className="rounded-xl border border-primary-line bg-primary-tint px-4 py-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">Task</p>
        <p className="mt-1 text-[15px] leading-relaxed text-foreground">{s.task}</p>
      </div>
    </section>
  )
}
