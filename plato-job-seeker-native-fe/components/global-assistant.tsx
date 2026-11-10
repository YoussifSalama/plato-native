"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ArrowRight, ClipboardCheck, FileText, History, Inbox, MessagesSquare, Mic, Plus, Search, Sparkles, Target, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { getMe } from "@/lib/auth/api"
import { getPreferences } from "@/lib/preferences/api"
import { uploadDocument } from "@/lib/documents/api"
import { createCareerThread, streamCareerMessage, type CareerMessage, type JobRef, type ResumeCard } from "@/lib/career/api"
import type { OrchestratorEvent, QuestionCard } from "@/lib/jobs/api"
import { PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { buildPageMap, CONTINUE_TEXT, MAX_STEPS, needsMore, runPageEvent, settle } from "@/lib/page-map"
import { getConversation, listConversations, newConversation as createConversation, streamThreadMessage, type AssistantMessage, type Conversation, type ConversationSummary, type ConvKind } from "@/lib/assistant/api"
import { getSearchHost, isListEvent, useSearchHost } from "@/lib/assistant/search-host"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { cursorTo } from "@/components/agent-cursor"
import { TokenCost } from "@/components/plato-tokens"
import { InfoTip } from "@/components/info-tip"
import { PlatoDock } from "@/app/(app)/jobs/components/plato-dock"
import { Composer } from "@/app/(app)/jobs/components/chat-hero"
import { QuestionCardView } from "@/app/(app)/jobs/components/question-card"
import { Transcript } from "@/app/(app)/career/career-hero"
import { ResumePreviewPanel } from "@/app/(app)/career/resume-file"
import { ResumeEditPanel } from "@/app/(app)/career/resume-edit"
import { VoiceInterviewPanel } from "@/app/(app)/career/voice-interview"

// ---- Plato AI: ONE assistant, the same panel and abilities on every page. ----
// Job search, applications, acting on the page AND career coaching (resumes, interviews,
// skills) all run in one conversation (the backend orchestrator has the career tools).
// On a search page (/jobs/<id>) it works in that search's thread and drives its results.

// What a caller can hand the assistant. All optional; with none it just opens.
//  prompt: sent as the seeker's message (into the current conversation unless newConversation).
//  jobRef: pinned as a chip above the box and sent with the next message (tailoring, mock interview).
//  threadId: continue that conversation (threadKind defaults to "career": the ids old coach links carry).
//  newConversation: start a fresh one first.
export type CoachRequest = { prompt?: string; jobRef?: JobRef; threadId?: string; threadKind?: ConvKind; newConversation?: boolean }
// Opens the voice call panel, pre-filled. Kept for old callers only: every interview in the
// app (Career, Jobs, this panel's Voice button, Plato AI's cards) goes to /career/interviews/new.
export type VoiceRequest = { mode?: "practice" | "mock" | "skill"; focus?: string; focusTitle?: string; role?: string; skill?: string; job?: { title: string; description: string } }

// openCoach is kept for old callers: it is the same assistant now.
export function openCoach(req: CoachRequest = {}) {
  window.dispatchEvent(new CustomEvent<CoachRequest>("plato:coach", { detail: req }))
}
export function openVoice(req: VoiceRequest = {}) {
  window.dispatchEvent(new CustomEvent<VoiceRequest>("plato:voice", { detail: req }))
}

// A search page in its first-contact view shows its own full-screen chat; the panel steps aside
// there and the command palette handles asks instead.
export const hasOwnAssistant = (path: string) => {
  const h = getSearchHost()
  return !!h && h.view === "chat" && path.startsWith("/jobs/")
}

// Where the seeker is (panel subtitle) and two suggestions that fit that page.
const PAGE_HELP: { match: (p: string) => boolean; name: string; prompts: string[] }[] = [
  { match: (p) => p === "/", name: "Home", prompts: ["What should I do today?", "Apply to my top 3 matches"] },
  { match: (p) => p.startsWith("/jobs/review"), name: "Tailor & apply", prompts: ["Which resume needs my attention?", "Why is this one a weak fit?"] },
  { match: (p) => p.startsWith("/jobs/"), name: "Search", prompts: ["Which of these fit me best?", "Only remote jobs"] },
  { match: (p) => p.startsWith("/jobs"), name: "Jobs", prompts: ["Find new jobs that fit my CV", "Show my saved jobs"] },
  { match: (p) => p.startsWith("/applications"), name: "Applications", prompts: ["What needs me right now?", "Why didn't some go through?"] },
  { match: (p) => p.startsWith("/following") || p.startsWith("/insights"), name: "Following", prompts: ["Follow companies hiring for my role", "What's new from companies I follow?"] },
  { match: (p) => p.startsWith("/career"), name: "Career", prompts: ["Which skill should I learn next?", "How ready am I for interviews?"] },
  { match: (p) => p.startsWith("/profile"), name: "Profile", prompts: ["What is missing from my profile?", "Open my application answers"] },
  { match: (p) => p.startsWith("/tokens"), name: "Plan & credits", prompts: ["How many tokens does applying cost?", "When do my tokens refill?"] },
  { match: (p) => p.startsWith("/extension"), name: "Extension", prompts: ["How do I link Chrome?", "Is my browser linked?"] },
]
const helpFor = (p: string) => PAGE_HELP.find((h) => h.match(p)) ?? { name: "", prompts: ["Find jobs that fit my CV", "What needs me right now?"] }
// The panel's name for the page in what it sends ("applications"), as before.
const pageKey = (p: string) => (p === "/" ? "home" : p.slice(1).split("/")[0])

// Career starters, after the page's own two.
const CAREER_STARTERS: { icon: LucideIcon; label: string }[] = [
  { icon: Target, label: "Tailor my resume to a job" },
  { icon: ClipboardCheck, label: "Score my resume" },
  { icon: MessagesSquare, label: "Give me a mock interview" },
]
const PAGE_ICONS: LucideIcon[] = [Search, Inbox]

const WIDE_W = 1000 // with a resume preview or editor beside the chat
const NARROW_W = 540

let seq = 0 // ids for the optimistic bubbles
const titleCase = (s: string) => s.toLowerCase().replace(/^\S/, (c) => c.toUpperCase())
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
const questionsOf = (m: AssistantMessage | undefined): QuestionCard | null => (m?.role === "ASSISTANT" && m.ui && "questions" in m.ui && Array.isArray(m.ui.questions) ? (m.ui as QuestionCard) : null)

function GlobalAssistant() {
  const path = usePathname()
  const router = useRouter()
  const host = useSearchHost()
  const [conv, setConvState] = useState<Conversation | null>(null)
  const convRef = useRef<Conversation | null>(null)
  const setConv = (c: Conversation | null) => {
    convRef.current = c
    setConvState(c)
  }
  const [list, setList] = useState<ConversationSummary[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pinned, setPinned] = useState<JobRef | null>(null)
  const [preview, setPreview] = useState<ResumeCard | null>(null)
  const [editing, setEditing] = useState<ResumeCard | null>(null)
  const [voice, setVoice] = useState<{ threadId: string; req: VoiceRequest } | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  // Bumped to remount the dock open (a request from elsewhere in the app).
  const [openKey, setOpenKey] = useState(0)

  // The latest conversation of either store, if there is one. A new one is made on the first message.
  const initial = useRef<Promise<Conversation | null> | null>(null)
  useEffect(() => {
    let cancelled = false
    initial.current ??= listConversations()
      .then((all) => {
        setList(all)
        return all[0] ? getConversation(all[0].kind, all[0].id) : null
      })
      .catch(() => null)
    initial.current.then((c) => !cancelled && !convRef.current && c && setConv(c))
    getMe().then((u) => !cancelled && setFirstName(titleCase(u.full_name.split(" ")[0]))).catch(() => undefined)
    getPreferences().then((p) => !cancelled && setRoles(p.roles ?? [])).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const refreshList = () => listConversations().then(setList).catch(() => undefined)

  function show(c: Conversation) {
    setConv(c)
    setPreview(null)
    setEditing(null)
    setSteps([])
    setError(null)
  }

  // On a search page the panel works in that search's thread (re-read when its view changes:
  // the run posts its own messages into the thread).
  const hostThread = host?.threadId
  const hostView = host?.view
  useEffect(() => {
    if (!hostThread || hostView === "chat" || busyRef.current) return
    let cancelled = false
    getConversation("chat", hostThread)
      .then((c) => !cancelled && !busyRef.current && show(c))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show only sets state
  }, [hostThread, hostView])

  // Page actions the agent asked for. List commands go to the search page when it is this thread's.
  async function act(events: OrchestratorEvent[], threadId: string) {
    const h = getSearchHost()
    const mine = h && h.threadId === threadId ? h : null
    if (mine) await mine.act(events.filter(isListEvent))
    for (const e of events) {
      if (mine && isListEvent(e)) continue
      if (e.type === "search_started") router.push(threadHref(threadId))
      else if (e.type === "navigate") {
        const target = e.page === "jobs" && e.tab ? `${threadHref(threadId)}?tab=${e.tab}` : PAGE_PATH[e.page]
        if (target.includes("?")) {
          await cursorTo(`nav a[href="${PAGE_PATH.jobs}"]`, "Opening jobs")
          router.push(target)
        } else await runPageEvent({ type: "goto", path: target }, router.push)
      } else if (e.type === "open_extension_progress") window.dispatchEvent(new Event("plato:open-extension-progress"))
      // A results command away from that search's page: the agent was told to navigate first.
      else if (e.type === "open_job" || e.type === "apply_filter" || e.type === "remove_filter" || e.type === "propose_apply") continue
      else {
        const problem = await runPageEvent(e, router.push)
        if (problem) setError(problem)
      }
    }
  }

  // `step` > 0: the app is continuing a multi-step task by itself after a page change.
  async function send(content: string, opts: { file?: File; base?: Conversation | null; jobRef?: JobRef; step?: number } = {}) {
    const text = content.trim()
    const step = opts.step ?? 0
    const auto = step > 0
    if (!text || (busyRef.current && !auto)) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setSteps([])
    const ref = auto ? null : (opts.jobRef ?? pinned)
    if (!auto) setPinned(null) // a reference goes with one message
    const now = ++seq
    const file = opts.file
    const tmp: AssistantMessage = { id: `tmp-${now}`, role: "USER", content: text, created_at: new Date().toISOString(), ...(file ? { ui: { type: "attachment" as const, documents: [{ id: "pending", name: file.name }], ...(ref && { reference: ref }) } } : ref ? { ui: { type: "reference" as const, reference: ref } } : {}) }
    const live: AssistantMessage = { id: `live-${now}`, role: "ASSISTANT", content: "", created_at: new Date().toISOString(), streamed: true }
    let id = ""
    const update = (fn: (c: Conversation) => Conversation) => {
      const cur = convRef.current
      if (cur && cur.id === id) setConv(fn(cur))
    }
    const patch = (fn: (m: AssistantMessage) => AssistantMessage) => update((c) => ({ ...c, messages: c.messages.map((m) => (m.id === live.id ? fn(m) : m)) }))
    let next: { step: number; threadId: string } | null = null
    try {
      const c = opts.base ?? convRef.current ?? (await createConversation())
      id = c.id
      if (convRef.current?.id !== c.id) show(c)
      update((cur) => ({ ...cur, messages: [...cur.messages, ...(auto ? [] : [tmp]), live] }))
      // A CV is uploaded and read first (same pipeline as onboarding), then sent with the message.
      let attachmentIds: string[] | undefined
      if (file) {
        const doc = await uploadDocument(file, "OTHER")
        if (doc.status !== "READY") throw new Error("Could not read that file. Try a PDF or Word document.")
        attachmentIds = [doc.id]
      }
      const reference = ref ? { jobId: ref.jobId, ...(ref.searchId && { searchId: ref.searchId }) } : undefined
      const onDelta = (piece: string) => patch((m) => ({ ...m, content: m.content + piece }))
      const onStatus = (s: string) => setSteps((all) => (all.at(-1) === s ? all : [...all, s]))
      let message: AssistantMessage
      if (c.kind === "career") {
        // An older career-coach conversation continues with the career agent, as before.
        message = await streamCareerMessage(c.id, text, onDelta, undefined, attachmentIds, onStatus, reference)
      } else {
        const h = getSearchHost()
        const context = { ...(h && h.threadId === c.id ? h.context() : { page: pageKey(location.pathname) }), pageMap: buildPageMap(), ...(auto && { auto: true }) }
        const out = await streamThreadMessage(c.id, text, { context, onDelta, onStatus, attachmentIds, reference })
        message = out.message
        await act(out.events, c.id)
        if (h && h.threadId === c.id) h.refresh()
        if (needsMore(out.events) && step < MAX_STEPS) next = { step: step + 1, threadId: c.id }
      }
      patch(() => ({ ...message, id: live.id, streamed: true }))
      // A resume that arrives opens beside the chat.
      if (message.ui && "type" in message.ui && message.ui.type === "resume") {
        setEditing(null)
        setPreview(message.ui)
      }
      void refreshList()
    } catch (e) {
      update((cur) => ({ ...cur, messages: cur.messages.filter((m) => m.id !== live.id || m.content) }))
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      busyRef.current = false
      setBusy(false)
    }
    if (next) {
      await settle()
      const base = convRef.current?.id === next.threadId ? convRef.current : await getConversation("chat", next.threadId).catch(() => null)
      if (base) await send(CONTINUE_TEXT, { step: next.step, base })
    }
  }

  async function startNew() {
    setListOpen(false)
    try {
      show(await createConversation())
      void refreshList()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  async function switchTo(s: ConversationSummary) {
    setListOpen(false)
    if (s.id === convRef.current?.id) return
    try {
      show(await getConversation(s.kind, s.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that conversation")
    }
  }

  // The live call is saved into a career conversation (the voice service's store): the current one
  // when it is a career chat, otherwise a fresh (or reused blank) one, shown when the call ends.
  async function startVoice(req: VoiceRequest = {}) {
    try {
      const c = convRef.current
      const threadId = c?.kind === "career" ? c.id : (await createCareerThread()).id
      setVoice({ threadId, req })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  // Requests from the rest of the app. The refs keep the handlers current without re-subscribing.
  const latest = useRef({ send, show, startVoice })
  useEffect(() => {
    latest.current = { send, show, startVoice }
  })
  useEffect(() => {
    // openPlato(text) and the command palette (Ctrl/Cmd+K). Cancelling tells them the panel took it.
    const onAsk = (e: Event) => {
      if (hasOwnAssistant(location.pathname)) return
      e.preventDefault()
      setOpenKey((k) => k + 1)
      const text = (e as CustomEvent<{ text: string }>).detail?.text
      if (text) void latest.current.send(text)
    }
    // openCoach(...): a prompt, a pinned job, a conversation to continue, or a fresh one.
    const onCoach = (e: Event) => {
      const req = (e as CustomEvent<CoachRequest>).detail ?? {}
      setOpenKey((k) => k + 1)
      if (req.jobRef && !req.prompt) setPinned(req.jobRef) // a prompt takes the job with it
      void (async () => {
        try {
          const base = req.threadId ? await getConversation(req.threadKind ?? "career", req.threadId) : req.newConversation ? await createConversation() : (convRef.current ?? (await initial.current))
          if (base && base.id !== convRef.current?.id) latest.current.show(base)
          if (req.newConversation) void refreshList()
          if (req.prompt) await latest.current.send(req.prompt, { base, jobRef: req.jobRef })
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not open Plato AI")
        }
      })()
    }
    // Voice opens only its own full-screen window; the side panel stays as it was (the call is
    // still attached to a conversation, which the panel shows the next time it is opened).
    const onVoice = (e: Event) => {
      void latest.current.startVoice((e as CustomEvent<VoiceRequest>).detail ?? {})
    }
    // A search page hands over multi-step tasks here: this panel lives in the layout, so it survives page changes.
    const onContinue = (e: Event) => {
      const d = (e as CustomEvent<{ threadId: string; step: number }>).detail
      void getConversation("chat", d.threadId).then((base) => latest.current.send(CONTINUE_TEXT, { step: d.step, base }), () => undefined)
    }
    window.addEventListener("plato:ask", onAsk)
    window.addEventListener("plato:coach", onCoach)
    window.addEventListener("plato:voice", onVoice)
    window.addEventListener("plato:continue", onContinue)
    return () => {
      window.removeEventListener("plato:ask", onAsk)
      window.removeEventListener("plato:coach", onCoach)
      window.removeEventListener("plato:voice", onVoice)
      window.removeEventListener("plato:continue", onContinue)
    }
  }, [])

  const messages = conv?.messages ?? []
  const started = messages.some((m) => m.role === "USER")
  const openCard = busy ? null : questionsOf(messages.at(-1))
  const side = editing ?? preview
  const help = helpFor(path)
  const iconBtn = "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-primary"
  const voiceModal =
    voice &&
    createPortal(
      // The live call sits over the whole page, outside the dock, so closing the dock never ends it.
      <div role="dialog" aria-modal="true" aria-label="Voice interview" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-3 backdrop-blur-sm sm:p-6">
        <div className="relative flex max-h-full w-full max-w-[560px] [&>aside]:static [&>aside]:max-h-[calc(100dvh-3rem)] [&>aside]:w-full [&>aside]:max-w-none">
          <VoiceInterviewPanel
            key={`${voice.threadId}:${voice.req.job?.title ?? voice.req.mode ?? "voice"}`}
            initialJob={voice.req.job}
            preset={{ mode: voice.req.mode, focus: voice.req.focus, focusTitle: voice.req.focusTitle, role: voice.req.role, skill: voice.req.skill }}
            threadId={voice.threadId}
            firstName={firstName}
            roles={roles}
            onClose={() => setVoice(null)}
            onFinished={() => {
              // The transcript is in that career conversation: show it.
              void getConversation("career", voice.threadId).then(show, () => undefined)
              void refreshList()
            }}
            onAsk={(t) => void getConversation("career", voice.threadId).then((base) => send(t, { base }), () => undefined)}
          />
        </div>
      </div>,
      document.body,
    )

  // The search page's full-screen first chat is the assistant there.
  if (host && host.view === "chat" && path.startsWith("/jobs/")) return voiceModal || null

  return (
    <>
      <PlatoDock
        key={openKey}
        defaultOpen={openKey > 0}
        messages={[]}
        onSend={() => undefined}
        busy={busy}
        error={null}
        quickPrompts={[]}
        status={host?.view === "searching" && host.threadId === conv?.id ? "searching" : "idle"}
        context={help.name}
        width={side ? WIDE_W : NARROW_W}
        headerActions={
          <>
            <button type="button" data-ai="assistant.recent" onClick={() => (setListOpen((o) => !o), void refreshList())} aria-expanded={listOpen} aria-label="Recent conversations" title="Recent conversations" className={cn(iconBtn, listOpen && "bg-primary-soft text-primary")}>
              <History className="size-4" />
            </button>
            <button type="button" data-ai="assistant.new-conversation" onClick={() => void startNew()} disabled={busy} aria-label="New conversation" title="New conversation" className={cn(iconBtn, "disabled:opacity-40")}>
              <Plus className="size-4" />
            </button>
          </>
        }
      >
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {started ? (
              <div className="flex min-h-0 flex-1 flex-col bg-background/60 px-3 pt-3">
                <Transcript
                  key={conv?.id}
                  messages={messages as CareerMessage[]}
                  busy={busy}
                  error={error}
                  steps={steps}
                  previewId={side?.resumeId ?? null}
                  onPreview={(card) => (setEditing(null), setPreview(card))}
                  onEdit={setEditing}
                  onChoose={(t) => void send(t)}
                  onVoice={(job) => void startVoice({ job })}
                />
                {/* A search question card waits for its answers right above the box. */}
                {openCard && (
                  <div className="scroll-thin max-h-[45%] shrink-0 overflow-y-auto pb-2">
                    <QuestionCardView key={messages.at(-1)?.id} card={openCard} busy={busy} onSubmit={(t) => void send(t)} />
                  </div>
                )}
              </div>
            ) : (
              <div className="scroll-thin flex flex-1 flex-col justify-end gap-4 overflow-y-auto bg-background/60 p-5">
                <div>
                  <p className="type-section-title text-foreground">{firstName ? `Hi ${firstName}, I'm Plato AI.` : "I'm Plato AI."}</p>
                  <p className="text-sm text-text-secondary">Ask in your own words, Arabic or English. I can search and apply for jobs, open pages and act on them, build or tailor your resume, and run mock interviews. Attach your CV or paste a job description.</p>
                </div>
                <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1.5">
                  {[...help.prompts.slice(0, 2).map((label, i) => ({ icon: PAGE_ICONS[i] ?? Sparkles, label })), ...CAREER_STARTERS].map((s) => (
                    <motion.li key={s.label} variants={fadeUpItem}>
                      <button type="button" disabled={busy} onClick={() => void send(s.label)} className="group flex w-full items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm font-medium shadow-card transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint">
                        <s.icon className="size-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">{s.label}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    </motion.li>
                  ))}
                </motion.ul>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            )}
            <div className="shrink-0 border-t p-3">
              <Composer onSend={(t, f) => void send(t, { file: f })} busy={busy} autoFocus allowFile=".pdf,.docx" chip={pinned ? { title: pinned.title, sub: pinned.company } : null} onRemoveChip={() => setPinned(null)} placeholder="Ask Plato anything, paste a job or attach your CV" />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" data-ai="assistant.voice" onClick={() => router.push("/career/interviews/new?how=voice")} className="group flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint hover:text-primary">
                  <Mic className="size-3.5 text-primary" />
                  Voice interview
                </button>
                <span className="ml-auto flex items-center gap-1">
                  <TokenCost action={conv?.kind === "career" ? "career_message" : "search_message"} suffix=" tokens a message" className="text-[11px] text-text-tertiary" />
                  <InfoTip text="Plato tokens are your monthly allowance for AI work. A usual message costs about this; writing a tailored resume, looking something up on the web or running a search costs more." label="What a message costs" side="left" />
                </span>
              </div>
            </div>
          </div>

          {editing ? (
            <ResumeEditPanel key={editing.resumeId} card={editing} onClose={() => setEditing(null)} onSaved={(saved) => (setEditing(null), setPreview(saved))} />
          ) : preview ? (
            <ResumePreviewPanel key={preview.resumeId} card={preview} onClose={() => setPreview(null)} />
          ) : null}

          {listOpen && (
            <motion.div role="listbox" aria-label="Recent conversations" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="scroll-thin absolute top-2 right-3 left-3 z-30 max-h-[60%] overflow-y-auto rounded-xl border bg-card p-1.5 shadow-[0_18px_40px_-20px_rgba(0,58,110,0.4)]">
              <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Recent conversations</p>
              {list.length === 0 && <p className="px-2.5 py-2 text-sm text-text-secondary">No conversations yet.</p>}
              {list.map((t) => {
                const Icon = t.search ? Search : t.kind === "career" ? FileText : MessagesSquare
                return (
                  <button key={`${t.kind}:${t.id}`} type="button" role="option" aria-selected={t.id === conv?.id} onClick={() => void switchTo(t)} className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-primary-tint", t.id === conv?.id && "bg-primary-soft text-primary")}>
                    <Icon className="size-4 shrink-0 text-primary" aria-label={t.search ? "Job search" : t.kind === "career" ? "Career chat" : "Conversation"} />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title || "New conversation"}</span>
                    <span className="type-meta shrink-0 text-xs text-text-tertiary">{when(t.updated_at)}</span>
                  </button>
                )
              })}
            </motion.div>
          )}
        </div>
      </PlatoDock>
      {voiceModal}
    </>
  )
}

export { GlobalAssistant }
