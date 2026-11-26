"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BriefcaseBusiness, Check, ClipboardPaste, Search } from "lucide-react"
import { cn } from "cn"
import { EmptyState, MatchPill, MonoTile } from "@/components/plato-ui"
import { PillTabs } from "@/components/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { getMatches, type JobMatch } from "@/lib/jobs/api"

// Any of the seeker's jobs to rehearse for: matches, saved or applied, searchable, with
// "Show more", and a way to paste a job post instead.
type JobTab = "discover" | "saved" | "applied"
const PAGE_STEP = 8
export type PickedJob = { id: string; title: string; company: string }

const TABS: JobTab[] = ["discover", "saved", "applied"]

export function JobPicker({ pickedId, onPick, onPaste }: { pickedId: string | null; onPick: (j: PickedJob) => void; onPaste: () => void }) {
  // ?jobs=applied|saved opens that list first (the Career prep card's "See all" link).
  const asked = useSearchParams().get("jobs") as JobTab | null
  const [tab, setTab] = useState<JobTab>(asked && TABS.includes(asked) ? asked : "discover")
  const [q, setQ] = useState("")
  const [take, setTake] = useState(PAGE_STEP)
  const [list, setList] = useState<{ items: JobMatch[]; total: number } | null>(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(
      () =>
        getMatches({ tab, sort: "best", q: q.trim() || undefined, take })
          .then((r) => alive && setList({ items: r.items, total: r.total }))
          .catch(() => alive && setList({ items: [], total: 0 })),
      q ? 250 : 0,
    )
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [tab, q, take])
  const change = (fn: () => void) => (fn(), setTake(PAGE_STEP), setList(null))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <InputGroup className="h-11 bg-card sm:flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search your jobs" data-ai="interview.new.search" value={q} onChange={(e) => change(() => setQ(e.target.value))} placeholder="Search by title or company" />
        </InputGroup>
        <PillTabs id="interview-jobs" label="Which jobs" value={tab} onChange={(k) => change(() => setTab(k))} dataAi="interview.new.jobs" tabs={[{ key: "discover", label: "Matches" }, { key: "saved", label: "Saved" }, { key: "applied", label: "Applied" }]} />
      </div>
      {list === null ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[62px] rounded-xl" />
          ))}
        </div>
      ) : list.items.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          className="bg-card"
          title={q.trim() ? "No job matches that search" : tab === "saved" ? "No saved jobs" : tab === "applied" ? "No applications yet" : "No matches yet"}
          hint={q.trim() ? "Try another word, or paste the job post instead." : "Pick another list, or paste the job post instead."}
          action={
            <button type="button" onClick={onPaste} className="rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
              Paste a job post
            </button>
          }
        />
      ) : (
        <>
          <div data-tour="interview-job-list" role="radiogroup" aria-label="Your jobs" className="scroll-thin flex max-h-[min(440px,55dvh)] flex-col gap-2 overflow-y-auto pr-1">
            {list.items.map((m) => {
              const on = pickedId === m.job.id
              return (
                <button key={m.job.id} type="button" role="radio" aria-checked={on} data-ai={`interview.new.job:${m.job.id}`} onClick={() => onPick({ id: m.job.id, title: m.job.title, company: m.job.company })} className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-200", on ? "border-primary bg-primary-tint/70" : "bg-card hover:border-primary-line hover:bg-primary-tint/30")}>
                  <MonoTile name={m.job.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <b className={cn("block truncate text-[14.5px]", on && "text-primary")}>{m.job.title}</b>
                    <span className="block truncate text-xs text-text-secondary">
                      {m.job.company}
                      {m.job.location ? ` · ${m.job.location}` : ""}
                    </span>
                  </span>
                  <MatchPill value={m.match_percent} />
                  {on && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span className="tabular-nums">
              {list.items.length} of {list.total}
            </span>
            {list.items.length < list.total && (
              <button type="button" data-ai="interview.new.more" onClick={() => setTake((n) => n + PAGE_STEP)} className="font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
                Show more
              </button>
            )}
          </div>
        </>
      )}
      <button type="button" data-ai="interview.new.paste" onClick={onPaste} className="group flex items-center gap-3 rounded-xl border border-dashed bg-card/60 px-3.5 py-3 text-left transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint/30">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <ClipboardPaste className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] text-foreground">Paste a job post instead</b>
          <span className="block text-xs text-text-secondary">For a job that isn&apos;t in your list</span>
        </span>
      </button>
    </div>
  )
}
