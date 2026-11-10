"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { animate, useReducedMotion } from "motion/react"

// Counts a stat up from 0 when it appears or changes. Numbers ("14", "14%", "1,240") animate;
// anything else (a dash, JSX) renders as is. Reduced motion shows the final value at once.
export function CountUp({ value }: { value: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const m = typeof value === "number" ? [String(value), String(value), ""] : typeof value === "string" ? /^([\d,]+)(%?)$/.exec(value) : null
  const to = m ? Number(m[1].replace(/,/g, "")) : null
  const suffix = m?.[2] ?? ""
  const show = (n: number) => `${Math.round(n).toLocaleString()}${suffix}`

  useEffect(() => {
    const el = ref.current
    if (!el || to === null) return
    if (reduce) {
      el.textContent = show(to)
      return
    }
    const c = animate(0, to, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = show(v)) })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show() only depends on suffix
  }, [to, suffix, reduce])

  if (to === null) return <>{value}</>
  return <span ref={ref}>{show(reduce ? to : 0)}</span>
}
