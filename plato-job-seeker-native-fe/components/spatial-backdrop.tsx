"use client"

import { useEffect, useRef } from "react"

// The light behind the app's glass panels: three soft brand-colour orbs that
// drift slowly and lean a few pixels toward the pointer. Fixed to the viewport,
// behind everything, never takes clicks. Styles: .glass-orbs in globals.css.
export function SpatialBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--mx", String(e.clientX / window.innerWidth - 0.5))
        el.style.setProperty("--my", String(e.clientY / window.innerHeight - 0.5))
      })
    }
    window.addEventListener("pointermove", move, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
    }
  }, [])
  return (
    <div ref={ref} className="glass-orbs" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  )
}
