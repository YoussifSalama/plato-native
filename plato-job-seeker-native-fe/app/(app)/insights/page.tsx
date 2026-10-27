"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, X } from "lucide-react"
import { AxiosError } from "axios"
import { getPreferences } from "@/lib/preferences/api"
import { createAlert, deleteAlert, getDigests, getInsights, saveAlertSettings, updateAlert, type AlertSettings, type Digest, type InsightsOverview, type JobAlert, type NewAlert } from "@/lib/insights/api"
import { lineReveal, reducedVariants, spring } from "@/lib/motion-system"
import { CompanyFollows, FieldAlerts } from "./alert-lists"
import { DigestSettings } from "./digest-settings"
import { Digests, EmailNote } from "./digests"

const messageOf = (e: unknown) => (e instanceof AxiosError ? (e.response?.data?.message as string | undefined) : undefined) ?? "Something went wrong. Try again in a moment."

function InsightsPage() {
  const reduced = !!useReducedMotion()
  const focus = useSearchParams().get("digest")
  const [data, setData] = useState<InsightsOverview | null>(null)
  const [digests, setDigests] = useState<Digest[] | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getInsights()
      .then(setData)
      .catch((e) => setError(messageOf(e)))
  }, [])
  useEffect(() => {
    refresh()
    getDigests(20)
      .then(setDigests)
      .catch(() => setDigests([]))
    getPreferences()
      .then((p) => setRoles(p.roles ?? []))
      .catch(() => setRoles([]))
  }, [refresh])

  const add = async (a: NewAlert) => {
    try {
      await createAlert(a)
      setError(null)
      refresh()
      return true
    } catch (e) {
      setError(messageOf(e))
      return false
    }
  }
  // Optimistic: the switch moves now, and moves back if the server says no.
  const patchLocal = (id: string, patch: Partial<JobAlert> | null) => setData((d) => d && { ...d, alerts: patch ? d.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) : d.alerts.filter((a) => a.id !== id) })
  const toggle = (a: JobAlert) => {
    patchLocal(a.id, { paused: !a.paused })
    updateAlert(a.id, { paused: !a.paused })
      .then(refresh)
      .catch((e) => (setError(messageOf(e)), refresh()))
  }
  const remove = (a: JobAlert) => {
    patchLocal(a.id, null)
    deleteAlert(a.id)
      .then(refresh)
      .catch((e) => (setError(messageOf(e)), refresh()))
  }
  const changeSettings = (patch: Partial<Omit<AlertSettings, "emailAvailable">>) => {
    setData((d) => d && { ...d, settings: { ...d.settings, ...patch } })
    saveAlertSettings(patch).catch((e) => (setError(messageOf(e)), refresh()))
  }
  const actions = { add, toggle, remove }

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-6 lg:pr-6 lg:pl-7">
      <motion.header variants={reduced ? reducedVariants(lineReveal) : lineReveal} initial="hidden" animate="show" className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-foreground">Job alerts</h1>
        <p className="max-w-2xl text-sm text-text-secondary">New jobs in the roles you want and at the companies you follow, gathered into one digest on your schedule. Alerts are free; your plan sets how many you can keep.</p>
      </motion.header>

      <AnimatePresence>
        {error && (
          <motion.div role="alert" initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.settle} className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground">
            <AlertCircle className="size-4 shrink-0 text-warning" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-card hover:text-foreground">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <DigestSettings data={data} onChange={changeSettings} />
      <div className="grid gap-6 xl:grid-cols-2">
        <FieldAlerts data={data} roles={roles} actions={actions} />
        <CompanyFollows data={data} actions={actions} />
      </div>
      <Digests digests={digests} focus={focus} />
      <EmailNote />
    </div>
  )
}

// useSearchParams needs a Suspense boundary to prerender.
export default function Page() {
  return (
    <Suspense>
      <InsightsPage />
    </Suspense>
  )
}
