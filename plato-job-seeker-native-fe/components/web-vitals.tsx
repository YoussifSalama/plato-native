"use client"

import { useReportWebVitals } from "next/web-vitals"

// Load-time measurement: every metric lands in window.__platoVitals (read it
// in the console), and a poor one is also logged. Send to analytics later if needed.
const BUDGET: Record<string, number> = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 }
const report = (m: { name: string; value: number; rating: string }) => {
  const w = window as unknown as { __platoVitals?: Record<string, number> }
  ;(w.__platoVitals ??= {})[m.name] = Math.round(m.value * 1000) / 1000
  if (m.value > (BUDGET[m.name] ?? Infinity)) console.warn(`[vitals] ${m.name} ${Math.round(m.value)} is ${m.rating}`)
}

export function WebVitals() {
  useReportWebVitals(report)
  return null
}
