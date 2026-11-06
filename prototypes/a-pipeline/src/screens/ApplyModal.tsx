import { useState } from "react"
import { Coins, Hand, Puzzle, Sparkles } from "lucide-react"
import { COST, useStore } from "../store"
import { Button, CompanyTile, MatchPill, Modal, Toggle } from "../ui"
import type { Job } from "../types"

// Apply is a confirmation, not a side effect: it says what will happen to each job
// before anything is queued, and what it costs.
export function ApplyModal() {
  const { s, ui, setUi, confirmApply } = useStore()
  const [tailor, setTailor] = useState(true)
  const jobs = (ui.applyIds ?? []).map((id) => s.jobs.find((j) => j.id === id)).filter(Boolean) as Job[]
  const chrome = s.profile.connections.chrome
  const groups = [
    { key: "plato", title: "Plato applies for you", sub: "Fills the form, attaches your resume, submits, keeps proof", icon: <Sparkles className="size-4 text-cobalt" />, jobs: jobs.filter((j) => j.route === "plato" || (j.route === "chrome" && chrome)) },
    { key: "chrome", title: "Needs Plato for Chrome", sub: "These sites block bots. Link Chrome once and Plato applies inside your browser", icon: <Puzzle className="size-4 text-violet" />, jobs: jobs.filter((j) => j.route === "chrome" && !chrome) },
    { key: "manual", title: "You submit these yourself", sub: "The site only accepts people. Plato prepares every answer for you to paste", icon: <Hand className="size-4 text-warning" />, jobs: jobs.filter((j) => j.route === "manual") },
  ].filter((g) => g.jobs.length)
  const cost = jobs.length * (tailor ? COST.tailored : COST.base)
  const missingNotice = !s.profile.facts.notice
  const close = () => setUi({ applyIds: undefined })

  return (
    <Modal
      open={jobs.length > 0}
      onClose={close}
      title={jobs.length === 1 ? `Apply to ${jobs[0].company}?` : `Apply to ${jobs.length} jobs?`}
      sub="Here's what happens to each one. Nothing is sent until you confirm."
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-[13px] text-ink-2">
            <Coins className="size-4 text-warning" /> <b className="tabular text-ink">{cost}</b> tokens · you have {s.tokens.toLocaleString()}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => confirmApply(jobs.map((j) => j.id), tailor)} disabled={cost > s.tokens}>
            {jobs.length === 1 ? "Apply" : `Apply to ${jobs.length}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5">{g.icon}</span>
              <div>
                <p className="text-sm font-bold">
                  {g.title} · {g.jobs.length}
                </p>
                <p className="text-xs text-ink-3">{g.sub}</p>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-divider rounded-2xl border border-line">
              {g.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-3 py-2.5">
                  <CompanyTile job={j} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{j.title}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {j.company} · {j.source}
                    </span>
                  </span>
                  <MatchPill m={j.match} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <label className="flex items-start gap-3 rounded-2xl bg-tint p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold">Write a resume for each job</span>
            <span className="block text-xs text-ink-3">Plato reorders your experience around each posting's keywords. Your facts stay the same. {COST.tailored} tokens instead of {COST.base}.</span>
          </span>
          <Toggle on={tailor} onChange={setTailor} label="Tailor resume per job" />
        </label>
        {missingNotice && <p className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-[12.5px] text-ink-2">Your notice period isn't in Me yet. If a form asks for it, Plato stops and asks you once, then remembers it.</p>}
      </div>
    </Modal>
  )
}
