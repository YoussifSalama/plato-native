"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import type { ThreadMessage } from "@/lib/jobs/api"
import { PlatoMark } from "@/components/plato-orb"
import { spring } from "@/lib/motion-system"
import { MessageList, type InlineSteps } from "./chat-panel"

const PANEL_W = 520

// The one place Plato lives once a search exists: a launcher pinned bottom-
// right that morphs into a panel. No page dimming, no slide-over.
function PlatoDock({
  messages,
  onSend,
  busy,
  error,
  quickPrompts,
  steps,
  status,
  defaultOpen = false,
}: {
  messages: ThreadMessage[]
  onSend: (text: string) => void
  busy: boolean
  error: string | null
  quickPrompts: string[]
  steps?: InlineSteps
  status: "idle" | "searching" | "done"
  defaultOpen?: boolean
}) {
  const reduced = !!useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const [input, setInput] = useState("")
  const [seenCount, setSeenCount] = useState(messages.length)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const unread = open ? 0 : Math.max(0, messages.length - seenCount)

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    textareaRef.current?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

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
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
  }

  const statusLine = status === "searching" ? "Searching — ask me anything meanwhile" : status === "done" ? "Your results are in. What next?" : "What would you like me to do?"
  const transition = reduced ? { duration: 0.15 } : spring.enter

  return (
    <div data-ai-skip className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end">
      <AnimatePresence mode="popLayout" initial={false}>
        {open ? (
          <motion.section
            key="panel"
            layoutId="plato-dock"
            role="dialog"
            aria-label="Plato AI"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }}
            transition={transition}
            style={{ width: `min(${PANEL_W}px, calc(100vw - 3rem))`, transformOrigin: "bottom right" }}
            className="pointer-events-auto flex h-[min(680px,calc(100dvh-3rem))] flex-col overflow-hidden rounded-lg border bg-card shadow-[0_28px_70px_-28px_rgba(0,91,167,0.35),0_2px_8px_-2px_rgba(14,27,44,0.08)]"
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <PlatoMark size={32} live={busy || status === "searching"} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  Plato AI
                  <Sparkles className="size-3 fill-primary text-primary" />
                </p>
                <p className="truncate text-xs text-text-tertiary">{statusLine}</p>
              </div>
              <button type="button" onClick={toggle} aria-label="Close" title="Close (Esc)" className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </header>

            <MessageList messages={messages} busy={busy} error={error} steps={steps} onAnswer={submit} className="bg-background/60" />

            <div className="flex flex-col gap-2.5 border-t p-3">
              {quickPrompts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={busy}
                      onClick={() => submit(q)}
                      className="rounded-sm bg-secondary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-accent disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submit(input)
                }}
                className="flex items-end gap-2 rounded-md border bg-background px-3 py-2 transition-colors focus-within:border-primary/50"
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={busy}
                  placeholder="Ask Plato anything… (Enter to send, Shift+Enter for a new line)"
                  className="scroll-thin min-h-6 flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-foreground outline-none placeholder:text-lavender disabled:opacity-60"
                />
                <motion.button
                  type="submit"
                  disabled={busy || !input.trim()}
                  whileTap={{ scale: 0.94 }}
                  transition={spring.micro}
                  aria-label="Send"
                  className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </motion.button>
              </form>
            </div>
          </motion.section>
        ) : (
          <motion.button
            key="launcher"
            layoutId="plato-dock"
            type="button"
            onClick={toggle}
            aria-label="Open Plato AI"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={transition}
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="pointer-events-auto flex h-14 items-center gap-3 rounded-lg border bg-card pr-5 pl-2 shadow-[0_16px_40px_-16px_rgba(0,91,167,0.45),0_2px_6px_-2px_rgba(14,27,44,0.1)]"
          >
            <PlatoMark size={40} live={status === "searching"} />
            <span className="text-left">
              <span className="block text-sm font-bold text-foreground">Plato AI</span>
              <span className="block text-xs text-text-tertiary">{status === "searching" ? "Searching…" : "Ask anything"}</span>
            </span>
            {unread > 0 && (
              <span className={cn("ml-1 flex size-5 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground")}>{unread}</span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export { PlatoDock }
