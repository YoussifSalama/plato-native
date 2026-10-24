import { Check } from "lucide-react"
import { cn } from "cn"

const STAGES = ["Analyzing jobs", "Checking requirements", "Gathering info", "Review & confirm", "Applying", "Done"]

function StageStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {STAGES.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !done && !active && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
            </span>
            {i < STAGES.length - 1 && <span className="hidden h-px w-8 bg-border md:block" />}
          </li>
        )
      })}
    </ol>
  )
}

export { StageStepper }
