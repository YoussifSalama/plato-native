"use client"

import { motion, useReducedMotion } from "motion/react"
import Image from "next/image"
import { cn } from "cn"

// Plato's mark: the logo's "P" in white on the logo's own cobalt-to-azure
// gradient. `live` adds a soft ring pulse.
function PlatoMark({ size = 40, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  const reduced = !!useReducedMotion()
  const radius = Math.max(6, Math.round(size * 0.28))
  const glyph = Math.round(size * 0.6)
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      {live && !reduced && (
        <motion.span
          className="absolute inset-0 bg-azure/35"
          style={{ borderRadius: radius }}
          animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative flex size-full items-center justify-center bg-brand-gradient shadow-[0_6px_16px_-6px_rgba(0,91,167,0.55)]" style={{ borderRadius: radius }}>
        <Image src="/logo-white.png" alt="" width={glyph} height={glyph} className="pointer-events-none select-none" style={{ width: glyph, height: glyph }} />
      </span>
    </span>
  )
}

export { PlatoMark }
