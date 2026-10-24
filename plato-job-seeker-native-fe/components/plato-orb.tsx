"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"

// Plato's mark: the "P" tile from the logo. `live` adds a soft ring pulse.
function PlatoMark({ size = 40, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  const reduced = !!useReducedMotion()
  const radius = Math.max(6, Math.round(size * 0.28))
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      {live && !reduced && (
        <motion.span
          className="absolute inset-0 bg-primary/30"
          style={{ borderRadius: radius }}
          animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className="relative flex size-full items-center justify-center bg-primary font-bold text-primary-foreground shadow-sm"
        style={{ borderRadius: radius, fontSize: Math.round(size * 0.5) }}
      >
        P
      </span>
    </span>
  )
}

export { PlatoMark }
