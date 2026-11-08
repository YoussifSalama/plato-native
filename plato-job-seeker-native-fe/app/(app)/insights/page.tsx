"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircle, X } from "lucide-react"
import { AxiosError } from "axios"
import { getPreferences } from "@/lib/preferences/api"
import { createAlert, deleteAlert, getDigests, getInsights, saveAlertSettings, updateAlert, type AlertSettings, type Digest, type InsightsOverview, type JobAlert, type NewAlert } from "@/lib/insights/api"
import { spring } from "@/lib/motion-system"
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
    <div className={PAGE}>
      <PageHeader title="Following" description="New openings at companies you follow and in roles you care about, in one digest on your schedule." />

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
      {/* Screen 10: companies and their new roles on the left, the roles you follow on the right. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CompanyFollows data={data} actions={actions} />
          <Digests digests={digests} focus={focus} />
        </div>
        <div className="flex flex-col gap-6">
          <FieldAlerts data={data} roles={roles} actions={actions} />
          <EmailNote />
        </div>
      </div>
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
