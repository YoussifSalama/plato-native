"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, ArrowUp, BellRing, Briefcase, ClipboardCheck, Compass, FileText, Inbox, Mic, Search, Slash, Sparkles, Wand2, X, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import type { ThreadMessage } from "@/lib/jobs/api"
import { PlatoMark } from "@/components/plato-orb"
import { spring } from "@/lib/motion-system"
import { fadeUpItem, staggerContainer } from "@/lib/motion-variants"
import { MessageList, type InlineSteps } from "./chat-panel"

// Width of the floating panel.
const PANEL_W = 400

// What "/" offers. A prompt goes to Plato; an href just opens the page.
type Command = { key: string; label: string; hint: string; icon: LucideIcon; prompt?: string; href?: string }
const COMMANDS: Command[] = [
  { key: "find", label: "Find jobs", hint: "A new search from what you want", icon: Search, prompt: "Find new jobs that fit my CV" },
  { key: "saved", label: "Saved jobs", hint: "The jobs you bookmarked", icon: Briefcase, prompt: "Show my saved jobs" },
  { key: "needs", label: "What needs me", hint: "Applications Plato paused on", icon: Inbox, href: "/applications?tab=needs" },
  { key: "tailor", label: "Tailor & apply", hint: "Pick jobs, Plato writes a resume for each", icon: Wand2, href: "/jobs" },
  { key: "score", label: "Resume score", hint: "Out of 100, with the quick fixes", icon: ClipboardCheck, href: `/career?prompt=${encodeURIComponent("Score my resume and help me fix the top issues")}` },
  { key: "resume", label: "Build my resume", hint: "From your profile, as a PDF", icon: FileText, href: `/career?prompt=${encodeURIComponent("Build my resume")}` },
  { key: "interview", label: "Practice an interview", hint: "For a job, a role or a tough situation", icon: Mic, href: "/career/interviews/new" },
  { key: "follow", label: "Follow a company", hint: "Hear when they post a role that fits", icon: BellRing, href: "/following" },
]

// Plato AI: a floating panel fixed on the right, opened from the launcher, the top bar or
// Ctrl K. The page stays as it is underneath. Layer z-45: above the page, its top bar (30),
// the tour bubble and progress drawer (40); below modals (50), the tour (60) and the agent
// cursor (200), so anything the assistant opens shows over it. Commands stay out of the way until "/" or the commands button.
function PlatoDock({
  messages,
  onSend,
  busy,
  error,
  quickPrompts,
  steps,
  status,
  context,
  defaultOpen = false,
  title = "Plato AI",
  launcherHint = "Ask anything",
  width = PANEL_W,
  headerActions,
  children,
}: {
  messages: ThreadMessage[]
  onSend: (text: string) => void
  busy: boolean
  error: string | null
  // Up to three suggestions for an empty conversation, fitting the page.
  quickPrompts: string[]
  steps?: InlineSteps
  status: "idle" | "searching" | "done"
  // Where the seeker is, shown under the title ("On Applications").
  context?: string
  defaultOpen?: boolean
  // Coach mode (components/coach-assistant.tsx) renames the panel, may widen it for a resume
  // preview, adds header buttons and brings its own conversation + composer as `children`.
  title?: string
  launcherHint?: string
  width?: number
  headerActions?: ReactNode
  children?: ReactNode
}) {
  const reduced = !!useReducedMotion()
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [input, setInput] = useState("")
  const [menu, setMenu] = useState(false)
  const [active, setActive] = useState(0)
  const [seenCount, setSeenCount] = useState(messages.length)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const unread = open ? 0 : Math.max(0, messages.length - seenCount)
  // "/sco" filters the commands; the menu button shows them all.
  const query = input.startsWith("/") ? input.slice(1).toLowerCase() : null
  const shown = useMemo(() => (query === null ? COMMANDS : COMMANDS.filter((c) => c.key.startsWith(query) || c.label.toLowerCase().includes(query))), [query])
  const menuOpen = (menu || query !== null) && shown.length > 0

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (menuOpen) {
        setMenu(false)
        setInput((v) => (v.startsWith("/") ? "" : v))
      } else setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    textareaRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [open, menuOpen])

  // Auto-grow the textarea between 1 and 5 lines.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [input, open])

  function toggle() {
    setSeenCount(messages.length)
    setOpen((o) => !o)
  }
  function submit(text: string) {
    const t = text.trim()
    if (!t || busy) return
    setInput("")
    onSend(t)
  }
  function run(c: Command) {
    setMenu(false)
    setInput("")
    setActive(0)
    if (c.href) router.push(c.href)
    else if (c.prompt) onSend(c.prompt)
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (menuOpen) run(shown[Math.min(active, shown.length - 1)])
      else submit(input)
    }
  }

  const statusLine = status === "searching" ? "Searching. Ask me anything meanwhile." : context ? `On ${context}` : "Ask, or tell me what to do"
  const transition = reduced ? { duration: 0.15 } : spring.enter
  const empty = messages.length === 0

  return (
    <>
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            key="panel"
            data-ai-skip
            role="complementary"
            aria-label={title}
            initial={{ x: "calc(100% + 24px)", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "calc(100% + 24px)", opacity: 0.6, transition: { duration: 0.2 } }}
            transition={transition}
            style={{ width: `min(${width}px, calc(100vw - 24px))` }}
            className="transition-[width] duration-300 fixed top-3 right-3 bottom-3 z-[45] flex flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_30px_80px_-24px_rgba(0,58,110,0.45),0_4px_14px_-4px_rgba(14,27,44,0.12)]"
          >
            <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
              <PlatoMark size={32} live={busy || status === "searching"} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
                  {title}
                  <Sparkles className="size-3 fill-primary text-primary" />
                </p>
                <p className="truncate text-xs text-text-tertiary">{statusLine}</p>
              </div>
              {headerActions}
              <button
                type="button"
                onClick={() => {
                  toggle()
                  window.dispatchEvent(new Event("plato:start-tour"))
                }}
                aria-label="Tour this page"
                title="Tour this page"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <Compass className="size-4" />
              </button>
              <button type="button" onClick={toggle} aria-label="Close" title="Close (Esc)" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </header>

            {children ?? (<>
            {empty && !busy ? (
              <div className="flex flex-1 flex-col justify-end gap-4 overflow-y-auto bg-background/60 p-5">
                <div>
                  <p className="type-section-title text-foreground">What should we do?</p>
                  <p className="text-sm text-text-secondary">Ask in your own words, Arabic or English. I can search, open pages, and work through your applications.</p>
                </div>
                {quickPrompts.length > 0 && (
                  <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-1.5">
                    {quickPrompts.slice(0, 3).map((q) => (
                      <motion.li key={q} variants={fadeUpItem}>
                        <button type="button" onClick={() => submit(q)} className="group flex w-full items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm font-medium shadow-card transition-colors duration-200 hover:border-primary-line hover:bg-primary-tint">
                          <Sparkles className="size-3.5 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">{q}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </div>
            ) : (
              <MessageList messages={messages} busy={busy} error={error} steps={steps} onAnswer={submit} className="bg-background/60" />
            )}

            <div className="relative shrink-0 border-t p-3">
              {/* Commands: only when asked for, as one short list above the box. */}
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="listbox"
                    aria-label="Commands"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
                    className="absolute right-3 bottom-[calc(100%-4px)] left-3 z-10 max-h-[320px] overflow-y-auto rounded-xl border bg-card p-1.5 shadow-[0_18px_40px_-20px_rgba(0,58,110,0.4)]"
                  >
                    <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Commands</p>
                    {shown.map((c, i) => (
                      <button
                        key={c.key}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        data-ai={`dock.command.${c.key}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => run(c)}
                        className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150", i === active ? "bg-primary-tint" : "")}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <c.icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm">{c.label}</b>
                          <span className="block truncate text-xs text-text-secondary">{c.hint}</span>
                        </span>
                        <code className="font-mono text-[11px] text-text-tertiary">/{c.key}</code>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (menuOpen) run(shown[Math.min(active, shown.length - 1)])
                  else submit(input)
                }}
              >
                <InputGroup className="flex-col items-stretch gap-2 rounded-xl bg-background px-3 pt-2.5 pb-2">
                  <InputGroupTextarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    setActive(0)
                  }}
                  onKeyDown={onKeyDown}
                  disabled={busy}
                  aria-label="Message Plato"
                  placeholder="Ask Plato, or type / for commands"
                  className="scroll-thin min-h-6 p-0 leading-6 placeholder:text-text-tertiary disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenu((m) => !m)
                      setActive(0)
                      textareaRef.current?.focus()
                    }}
                    aria-expanded={menuOpen}
                    data-ai="dock.commands"
                    className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors", menuOpen ? "border-primary-line bg-primary-soft text-primary" : "bg-card text-text-secondary hover:border-primary-line hover:text-primary")}
                  >
                    <Slash className="size-3.5" />
                    Commands
                  </button>
                  <span className="hidden text-[11px] text-text-tertiary sm:inline">Enter to send · Shift+Enter new line</span>
                  <motion.button
                    type="submit"
                    disabled={busy || (!input.trim() && !menuOpen)}
                    whileTap={{ scale: 0.94 }}
                    transition={spring.micro}
                    aria-label="Send"
                    className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary-hover disabled:opacity-40"
                  >
                    <ArrowUp className="size-4" />
                  </motion.button>
                </div>
                </InputGroup>
              </form>
            </div>
            </>)}
          </motion.aside>
        )}
      </AnimatePresence>

      {!open && (
        <motion.button
          data-ai-skip
          data-tour="plato-ai"
          type="button"
          onClick={toggle}
          aria-label="Open Plato AI"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={{ scale: 0.98 }}
          // Compact pill on desktop, just the mark on phones. The page tour button sits right above it.
          className="fixed right-4 bottom-4 z-50 flex h-12 items-center gap-2.5 rounded-full border bg-card p-1.5 shadow-float transition-colors duration-200 hover:border-primary-line sm:right-6 sm:bottom-5 sm:pr-4"
        >
          <PlatoMark size={36} live={status === "searching"} />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-semibold text-foreground">Plato AI</span>
            <span className="block text-[11.5px] text-text-tertiary">{status === "searching" ? "Searching…" : launcherHint}</span>
          </span>
          {unread > 0 && <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{unread > 9 ? "9+" : unread}</span>}
        </motion.button>
      )}
    </>
  )
}

export { PlatoDock }
