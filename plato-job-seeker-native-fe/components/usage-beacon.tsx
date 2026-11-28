"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { apiClient } from "@/lib/api-client"

// Tells Plato which page is open and for how long, for the admin panel's engagement view
// (time in the app, pages used). Only the path is sent; the backend keeps its shape
// ("/applications/:id"), never ids, queries or what is on the page.
// Time counts only while the tab is visible and the person did something in the last 5 minutes.
// Fire-and-forget: a failed beat is dropped, never shown.
const BEAT_MS = 60_000
const IDLE_MS = 5 * 60_000
const MAX_SECONDS = 120

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"

function send(body: { page: string; view?: boolean; seconds?: number }, leaving = false) {
  if (leaving) {
    // the tab is closing or hiding: keepalive lets the request finish after the page is gone
    void fetch(`${api}/activity`, { method: "POST", credentials: "include", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined)
    return
  }
  void apiClient.post("/activity", body).catch(() => undefined)
}

export function UsageBeacon() {
  const pathname = usePathname()
  const page = useRef(pathname)
  // set on mount (render must stay pure)
  const since = useRef(0)
  const lastInput = useRef(0)

  // Seconds on the current page since the last report, if the person was around.
  const flush = (leaving = false) => {
    const now = Date.now()
    const seconds = Math.min(MAX_SECONDS, Math.round((now - since.current) / 1000))
    since.current = now
    if (seconds > 0 && document.visibilityState === "visible" && now - lastInput.current < IDLE_MS) send({ page: page.current, seconds }, leaving)
  }

  // A page view on every navigation; the time so far goes to the page being left.
  useEffect(() => {
    if (page.current !== pathname) flush()
    page.current = pathname
    since.current = Date.now()
    lastInput.current ||= Date.now()
    send({ page: pathname, view: true })
  }, [pathname])

  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true)
      else since.current = Date.now() // hidden time never counts
    }
    const timer = window.setInterval(() => flush(), BEAT_MS)
    const events = ["pointerdown", "keydown", "scroll", "pointermove"] as const
    for (const e of events) window.addEventListener(e, touch, { passive: true })
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearInterval(timer)
      for (const e of events) window.removeEventListener(e, touch)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return null
}
