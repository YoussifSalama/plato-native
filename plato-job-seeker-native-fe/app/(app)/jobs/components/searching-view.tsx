"use client"

import { motion } from "motion/react"
import type { DiscoveryRun, RunProgress } from "@/lib/jobs/api"
import { lineReveal } from "@/lib/motion-system"
import { StageStepper } from "./stage-stepper"
import { JourneyCanvas } from "./journey/journey-canvas"
import type { Journey } from "./journey/use-journey-log"

function SearchingView({
  run,
  progress,
  journey,
  onFinished,
}: {
  run: DiscoveryRun
  progress: RunProgress
  journey: Journey
  onFinished: () => void
}) {
  const failed = progress.stage === "failed"
  const done = progress.stage === "done"
  return (
    <div className="flex flex-col gap-6">
      <motion.div data-tour="search-progress" variants={lineReveal} initial="hidden" animate="show" className="flex flex-col gap-1">
        <h2 className="type-section-title text-foreground">
          {failed ? "Search stopped" : done ? "Search complete" : "Watch Plato work"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {failed
            ? "Something went wrong along the way — details below."
            : "Every step below is a real event from the search. Plato is in the corner if you need anything meanwhile."}
        </p>
      </motion.div>
      <div data-tour="search-stages">
        <StageStepper current={0} />
      </div>
      <JourneyCanvas run={run} progress={progress} journey={journey} onFinished={onFinished} />
    </div>
  )
}

export { SearchingView }
