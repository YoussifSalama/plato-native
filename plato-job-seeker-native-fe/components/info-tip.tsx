"use client"

import type { ReactNode } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import { Info } from "lucide-react"
import { cn } from "cn"

// The one way to explain something in place: a small (i) next to the label it explains.
// Hover or keyboard focus shows the text; touch opens it on tap. Keep `text` to one or two
// plain sentences that answer "what is this / why does it matter" — not instructions for the page.
//   <span className="flex items-center gap-1.5">Readiness <InfoTip text="How close you are to …" /></span>
export function InfoTip({ text, label = "More info", side = "top", className }: { text: ReactNode; label?: string; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={150}
        aria-label={label}
        className={cn("inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-text-tertiary transition-colors duration-200 outline-none hover:text-primary focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring/30", className)}
        render={<button type="button" />}
      >
        <Info className="size-3.5" strokeWidth={2} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="z-[60]">
          <Tooltip.Popup className="max-w-[260px] origin-(--transform-origin) rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed font-normal text-background shadow-float transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">{text}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
