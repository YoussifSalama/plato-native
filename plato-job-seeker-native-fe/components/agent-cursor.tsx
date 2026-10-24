"use client"

import { useEffect, useRef, useState } from "react"

// A visible pointer for what the assistant does in the app: it glides to the
// control, presses it, and only then does the action run, like a person would.
// It follows the control's live position every frame, so a page that scrolls or
// animates while the cursor travels cannot make it land in the wrong place.

type Detail = { target: string | Element; label?: string; waitMs: number; done: () => void }

// waitMs: how long to look for a control that is not there yet (0 = only if present now).
export function cursorTo(target: string | Element, label?: string, waitMs = 1500): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  return new Promise((resolve) => {
    const free = window.dispatchEvent(new CustomEvent<Detail>("plato:cursor", { cancelable: true, detail: { target, label, waitMs, done: resolve } }))
    if (free) resolve()
  })
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
const find = (target: string | Element) => (typeof target === "string" ? [...document.querySelectorAll(target)].find(visible) : target)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
// Where a person would put the pointer: inside the control, near its left, vertically centred.
const aim = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }
}

export function AgentCursor() {
  const box = useRef<HTMLDivElement>(null)
  const at = useRef({ x: -100, y: -100 })
  const [label, setLabel] = useState<string>()
  const [shown, setShown] = useState(false)
  const [press, setPress] = useState(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const place = (x: number, y: number) => {
      at.current = { x, y }
      if (box.current) box.current.style.transform = `translate(${x}px, ${y}px)`
    }
    // Travel to the element's CURRENT centre, re-read every frame.
    const travel = (el: Element, ms: number) =>
      new Promise<void>((resolve) => {
        const from = { ...at.current }
        const t0 = performance.now()
        const frame = (now: number) => {
          const to = aim(el)
          const k = ease(Math.min(1, (now - t0) / ms))
          place(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k)
          if (now - t0 < ms) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })

    const run = async ({ target, label, waitMs, done }: Detail) => {
      clearTimeout(hideTimer.current)
      try {
        // The page may still be changing: look for the control for up to waitMs.
        let el: Element | undefined | null
        for (let i = 0; i <= waitMs / 100 && !(el = find(target)); i++) await wait(100)
        if (!el || !visible(el)) return
        // Bring it into view first and let the layout settle, so we aim at where it really is.
        // Scroll like a person (smooth), then wait until the page has stopped moving.
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        for (let i = 0, last = NaN; i < 25; i++) {
          await wait(60)
          const top = el.getBoundingClientRect().top
          if (Math.abs(top - last) < 1) break
          last = top
        }
        if (at.current.x < 0) place(window.innerWidth - 60, window.innerHeight - 60)
        setLabel(label)
        setShown(true)
        // Reduced motion shortens the glide; it never removes the cursor.
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const dist = Math.hypot(aim(el).x - at.current.x, aim(el).y - at.current.y)
        await travel(el, reduced ? 250 : Math.min(1100, 450 + dist * 0.6))
        // Land exactly, then press.
        place(aim(el).x, aim(el).y)
        setPress((n) => n + 1)
        await wait(320)
      } finally {
        done()
        hideTimer.current = setTimeout(() => setShown(false), 1500)
      }
    }
    const onCursor = (e: Event) => {
      e.preventDefault()
      const d = (e as CustomEvent<Detail>).detail
      queue.current = queue.current.then(() => run(d)).catch(() => d.done())
    }
    window.addEventListener("plato:cursor", onCursor)
    return () => window.removeEventListener("plato:cursor", onCursor)
  }, [])

  return (
    <div ref={box} aria-hidden className="pointer-events-none fixed top-0 left-0 z-[200]" style={{ opacity: shown ? 1 : 0, transition: "opacity 250ms" }}>
      {press > 0 && <span key={press} className="absolute -top-3 -left-3 size-6 animate-ping rounded-full bg-primary/40" />}
      <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-md" style={{ transform: press ? "scale(.85)" : undefined, transition: "transform 120ms" }}>
        <path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="var(--color-primary, #6D4AFF)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {label && <span className="absolute top-5 left-4 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground shadow-md">{label}</span>}
    </div>
  )
}
