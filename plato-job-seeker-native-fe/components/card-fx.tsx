"use client"

import { useEffect } from "react"

// The card feel (taken from Confirmo1's sign-in): one pointer listener for the whole app writes the pointer's
// position onto the card under it. CSS (globals.css, "Card feel") draws a light that follows it (.fx), tilts
// interactive cards toward it (.card-lift), and moves a header's layers at their own rates (.fx-depth).
// Mouse and pen only; nothing moves with reduced motion.
export function CardFx() {
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches) return
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame = 0
    let last: { x: number; y: number; target: Element | null } | null = null
    const touched = new Set<HTMLElement>()
    const paint = () => {
      frame = 0
      if (!last) return
      const { x, y, target } = last
      const now = new Set<HTMLElement>()
      for (const el of [target?.closest<HTMLElement>(".fx, .card-lift"), target?.closest<HTMLElement>(".fx-depth")]) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        el.style.setProperty("--mx", `${x - r.left}px`)
        el.style.setProperty("--my", `${y - r.top}px`)
        if (!still) {
          // -1..1 from the centre: the tilt and the depth layers read these.
          el.style.setProperty("--px", (((x - r.left) / r.width) * 2 - 1).toFixed(3))
          el.style.setProperty("--py", (((y - r.top) / r.height) * 2 - 1).toFixed(3))
        }
        now.add(el)
      }
      // Cards the pointer left settle back (their transition eases it).
      for (const el of touched) {
        if (now.has(el)) continue
        el.style.removeProperty("--px")
        el.style.removeProperty("--py")
      }
      touched.clear()
      now.forEach((el) => touched.add(el))
    }
    const move = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY, target: e.target instanceof Element ? e.target : null }
      if (!frame) frame = requestAnimationFrame(paint)
    }
    document.addEventListener("pointermove", move, { passive: true })
    return () => {
      document.removeEventListener("pointermove", move)
      cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
