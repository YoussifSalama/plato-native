"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Bell, Briefcase, FileText, GraduationCap, Home, MessageCircle, MessagesSquare, Mic, Plus, Sparkles, User, Coins } from "lucide-react"
import { createThread } from "@/lib/jobs/api"
import { PAGE_PATH, threadHref } from "@/lib/jobs/links"
import { hasOwnAssistant } from "@/components/global-assistant"

type Item = { id: string; label: string; hint: string; icon: typeof Home; run: () => void }

// Ctrl/Cmd+K: jump anywhere, start something, or type a question for Plato AI.
// Native <dialog> (focus trap, Esc, backdrop); arrows move, Enter runs.
function CommandPalette() {
  const router = useRouter()
  const path = usePathname()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      // Warm the routes the palette can open.
      Object.values(PAGE_PATH).forEach((p) => router.prefetch(p))
    }
    if (!open && el.open) el.close()
  }, [open, router])

  const close = () => {
    setOpen(false)
    setText("")
    setCursor(0)
  }
  const go = (to: string) => () => router.push(to)
  // The global assistant picks this up (only offered on pages that have it).
  const ask = (question: string) => () => {
    window.dispatchEvent(new CustomEvent("plato:ask", { cancelable: true, detail: { text: question } }))
  }

  const items: Item[] = useMemo(
    () => [
      { id: "home", label: "Home", hint: "Go to", icon: Home, run: go(PAGE_PATH.home) },
      { id: "jobs", label: "Jobs", hint: "Go to", icon: Briefcase, run: go(PAGE_PATH.jobs) },
      { id: "applications", label: "Applications", hint: "Go to", icon: FileText, run: go(PAGE_PATH.applications) },
      { id: "career", label: "Career", hint: "Go to", icon: GraduationCap, run: go(PAGE_PATH.career) },
      { id: "messages", label: "Messages", hint: "Go to", icon: MessageCircle, run: go(PAGE_PATH.messages) },
      { id: "notifications", label: "Notifications", hint: "Go to", icon: Bell, run: go(PAGE_PATH.notifications) },
      { id: "profile", label: "Profile", hint: "Go to", icon: User, run: go(PAGE_PATH.profile) },
      { id: "tokens", label: "Plato tokens", hint: "Go to", icon: Coins, run: go("/tokens") },
      { id: "new-search", label: "New job search", hint: "Action", icon: Plus, run: () => void createThread().then((t) => router.push(threadHref(t.id))) },
      { id: "practice", label: "Practice an interview", hint: "Action", icon: MessagesSquare, run: go("/career?prompt=" + encodeURIComponent("Practice an interview with me")) },
      { id: "mock", label: "Mock interview", hint: "Action", icon: Mic, run: go("/career?prompt=" + encodeURIComponent("Give me a mock interview")) },
      { id: "resume", label: "Build my resume", hint: "Action", icon: FileText, run: go("/career?prompt=" + encodeURIComponent("Build my resume")) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  )

  const q = text.trim().toLowerCase()
  const shown = items.filter((i) => !q || i.label.toLowerCase().includes(q))
  // Anything typed can also go to Plato AI, where there is an assistant on this page.
  const canAsk = !hasOwnAssistant(path)
  const rows: Item[] = [...shown, ...(q && canAsk ? [{ id: "ask", label: `Ask Plato: ${text.trim()}`, hint: "AI", icon: Sparkles, run: ask(text.trim()) }] : [])]

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, rows.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault()
      close()
      rows[cursor].run()
    }
  }

  return (
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), close())} onClick={(e) => e.target === ref.current && close()} className="m-auto mt-[12vh] w-[min(560px,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40">
      {open && (
        <div onKeyDown={onKeyDown}>
          <input
            autoFocus
            value={text}
            onChange={(e) => (setText(e.target.value), setCursor(0))}
            placeholder={canAsk ? "Go to a page, start something, or ask Plato…" : "Go to a page or start something…"}
            aria-label="Command palette"
            className="w-full border-b bg-transparent px-5 py-4 text-base outline-none placeholder:text-lavender"
          />
          <ul role="listbox" className="scroll-thin max-h-80 overflow-y-auto p-2">
            {rows.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => (close(), r.run())} className={"flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm " + (i === cursor ? "bg-primary-tint text-foreground" : "text-text-secondary")}>
                  <r.icon className="size-4 text-primary" />
                  <span className="flex-1 truncate">{r.label}</span>
                  <span className="text-xs text-text-tertiary">{r.hint}</span>
                </button>
              </li>
            ))}
            {!rows.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>}
          </ul>
        </div>
      )}
    </dialog>
  )
}

export { CommandPalette }
