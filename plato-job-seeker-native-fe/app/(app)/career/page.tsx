"use client"

import { PAGE_DOCK, PageHeader } from "@/components/page-header"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Lightbulb, Mic, Plus } from "lucide-react"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { getPreferences } from "@/lib/preferences/api"
import type { Preferences } from "@/lib/preferences/schema"
import { uploadDocument } from "@/lib/documents/api"
import { listCareerResumes, createCareerThread, getCareerThread, listCareerThreads, streamCareerMessage, type CareerMessage, type CareerThread, type JobRef } from "@/lib/career/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CareerHero } from "./career-hero"

// Names typed IN CAPITALS at signup shouldn't shout.
const titleCase = (s: string) => s.toLowerCase().replace(/^\S/, (c) => c.toUpperCase())

export default function CareerPage() {
  const [me, setMe] = useState<AuthUser | null>(null)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [thread, setThread] = useState<CareerThread | null>(null)
  const [busy, setBusy] = useState(false)
  // What Plato is doing while it works ("Reading your profile", "Building your resume").
  const [steps, setSteps] = useState<string[]>([])
  const [resumeCount, setResumeCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // A job pinned from its card (/career?job=…): shown as a chip, sent with the next message.
  const [pinned, setPinned] = useState<JobRef | null>(null)

  // Continue the latest conversation, or start the first one.
  useEffect(() => {
    let cancelled = false
    getMe().then((u) => !cancelled && setMe(u)).catch(() => undefined)
    getPreferences().then((p) => !cancelled && setPreferences(p)).catch(() => undefined)
    listCareerResumes().then((r) => !cancelled && setResumeCount(r.length)).catch(() => undefined)
    listCareerThreads()
      .then((all) => (all[0] ? getCareerThread(all[0].id) : createCareerThread()))
      .then((t) => !cancelled && setThread(t))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not open Career"))
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(
    async (content: string, file?: File) => {
      const text = content.trim()
      if (!thread || !text || busy) return
      setError(null)
      setSteps([])
      setBusy(true)
      const now = Date.now()
      const ref = pinned
      setPinned(null) // a reference goes with one message
      const tmp: CareerMessage = { id: `tmp-${now}`, role: "USER", content: text, created_at: new Date().toISOString(), ...(file ? { ui: { type: "attachment" as const, documents: [{ id: "pending", name: file.name }], ...(ref && { reference: ref }) } } : ref ? { ui: { type: "reference" as const, reference: ref } } : {}) }
      // The reply grows in place as pieces arrive, then is swapped for the saved one (same id, so no remount).
      const live: CareerMessage = { id: `live-${now}`, role: "ASSISTANT", content: "", created_at: new Date().toISOString(), streamed: true }
      const patch = (fn: (m: CareerMessage) => CareerMessage) => setThread((t) => t && { ...t, messages: t.messages.map((m) => (m.id === live.id ? fn(m) : m)) })
      setThread((t) => t && { ...t, messages: [...t.messages, tmp, live] })
      try {
        // A CV is uploaded and read first (same pipeline as onboarding), then sent with the message.
        let attachmentIds: string[] | undefined
        if (file) {
          const doc = await uploadDocument(file, "OTHER")
          if (doc.status !== "READY") throw new Error("Could not read that file. Try a PDF or Word document.")
          attachmentIds = [doc.id]
        }
        const message = await streamCareerMessage(thread.id, text, (piece) => patch((m) => ({ ...m, content: m.content + piece })), undefined, attachmentIds, (text) => setSteps((s) => (s.at(-1) === text ? s : [...s, text])), ref ? { jobId: ref.jobId, ...(ref.searchId && { searchId: ref.searchId }) } : undefined)
        patch(() => ({ ...message, id: live.id, streamed: true }))
        if (message.ui?.type === "resume") setResumeCount((n) => n + 1)
      } catch (e) {
        // Keep what was written; drop the bubble only if nothing arrived.
        setThread((t) => t && { ...t, messages: t.messages.filter((m) => m.id !== live.id || m.content) })
        setError(e instanceof Error ? e.message : "Something went wrong")
      } finally {
        setBusy(false)
      }
    },
    [thread, busy, pinned],
  )

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const jobId = q.get("job")
    if (!jobId || !/^[0-9a-f]{24}$/.test(jobId)) return
    const ref: JobRef = { jobId, searchId: q.get("search"), title: q.get("jt") ?? "This job", company: q.get("jc") ?? "" }
    window.history.replaceState(null, "", "/career")
    setTimeout(() => setPinned(ref), 0)
  }, [])

  // /career?prompt=... (from the command palette) sends that text once, in a fresh view.
  const promptSent = useRef(false)
  useEffect(() => {
    if (!thread || promptSent.current) return
    const prompt = new URLSearchParams(window.location.search).get("prompt")
    if (!prompt) return
    promptSent.current = true
    window.history.replaceState(null, "", "/career")
    if (!thread.messages.some((m) => m.role === "USER")) setTimeout(() => void send(prompt), 0)
  }, [thread, send])

  async function newConversation() {
    setError(null)
    try {
      setThread(await createCareerThread())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  return (
    <div className={PAGE_DOCK}>
      <PageHeader
        section="Grow"
        title="Career"
        description="Your career coach: build or tailor a resume, practise interviews and close skill gaps."
        actions={
          <>
            <Link href="/career/interviews" data-ai="career.interviews" data-tour="career-interviews" className="flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium hover:bg-muted">
              <Mic className="size-4" />
              Interviews
            </Link>
            <Link href="/career/skills" data-ai="career.skills" data-tour="career-skills" className="flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium hover:bg-muted">
              <Lightbulb className="size-4" />
              Skills gap
            </Link>
            <Button data-ai="career.new-conversation" variant="outline" size="sm" onClick={() => void newConversation()} className="gap-1.5 rounded-full">
              <Plus className="size-4" />
              New conversation
            </Button>
          </>
        }
      />
      {thread ? (
        // Keyed so a new conversation replays the intro.
        <CareerHero key={thread.id} hasResume={resumeCount > 0} steps={steps} threadId={thread.id} onVoiceFinished={() => void getCareerThread(thread.id).then(setThread).catch(() => undefined)} firstName={me ? titleCase(me.full_name.split(" ")[0]) : null} preferences={preferences} messages={thread.messages} onSend={send} busy={busy} error={error} pinned={pinned} onUnpin={() => setPinned(null)} />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Skeleton className="h-[calc(100dvh-150px)] min-h-[560px] w-full rounded-xl" />
      )}
    </div>
  )
}
