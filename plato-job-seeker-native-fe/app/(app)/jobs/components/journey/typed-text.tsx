"use client"

import { useEffect, useState } from "react"
import { useReducedMotion } from "motion/react"
import { duration } from "@/lib/motion-system"

// Character reveal for the AI's voice lines. Not a terminal effect: no
// cursor block, slightly variable cadence, instant under reduced motion.
function TypedText({
  text,
  onDone,
  className,
  msPerChar = duration.typeMs,
}: {
  text: string
  onDone?: () => void
  className?: string
  msPerChar?: number
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? text.length : 0)

  useEffect(() => {
    if (reduced) {
      onDone?.()
      return
    }
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      i += 1
      setShown(i)
      if (i >= text.length) {
        onDone?.()
        return
      }
      const ch = text[i - 1]
      const pause = ch === "." || ch === "," ? 90 : ch === " " ? msPerChar + 6 : msPerChar
      timer = setTimeout(tick, pause)
    }
    timer = setTimeout(tick, 80)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced, msPerChar])

  return (
    <span className={className} aria-label={text}>
      {text.slice(0, shown)}
      {shown < text.length && <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />}
    </span>
  )
}

export { TypedText }
