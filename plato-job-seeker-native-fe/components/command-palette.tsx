"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Award, Bell, BellRing, BookOpen, Briefcase, ClipboardCheck, Coins, Compass, FileCheck2, FileText, GraduationCap, Home, MessageCircle, MessagesSquare, Mic, Plus, Puzzle, Search, Sparkles, Target, User, UserRound } from "lucide-react"
import { listApplications, listThreads } from "@/lib/jobs/api"
import { PAGE_PATH, searchHref } from "@/lib/jobs/links"
import { hasOwnAssistant } from "@/components/global-assistant"
import { Input } from "@/components/ui/input"

type Item = { id: string; label: string; hint: string; icon: typeof Home; run: () => void; words?: string }
// The seeker's own searches and applications, loaded once per page load when the palette first opens.
type Found = { id: string; label: string; to: string; kind: "search" | "application" }

// Ctrl/Cmd+K: jump anywhere, start something, or type a question for Plato AI.
// Native <dialog> (focus trap, Esc, backdrop); arrows move, Enter runs.
function CommandPalette() {
  const router = useRouter()
  const path = usePathname()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [cursor, setCursor] = useState(0)
  const [found, setFound] = useState<Found[] | null>(null)

  const loaded = useRef(false)
  const load = () => {
    if (loaded.current) return
    loaded.current = true
    Promise.allSettled([listThreads(), listApplications()]).then(([t, a]) =>
      setFound([
        ...(t.status === "fulfilled" ? t.value.filter((x) => x.title).map((x) => ({ id: "s:" + x.id, label: x.title!, to: searchHref(x), kind: "search" as const })) : []),
        ...(a.status === "fulfilled" ? a.value.map((x) => ({ id: "a:" + x.id, label: [x.job?.title, x.job?.company].filter(Boolean).join(" · "), to: `/applications/${x.id}`, kind: "application" as const })) : []),
      ]),
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        load()
        setOpen((o) => !o)
      }
    }
    // The top bar's command bar on pages that have their own assistant.
    const onOpen = (e: Event) => {
      setText((e as CustomEvent<{ text?: string }>).detail?.text ?? "")
      load()
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("plato:palette", onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("plato:palette", onOpen)
    }
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
      { id: "home", label: "Home", hint: "Go to", icon: Home, run: go(PAGE_PATH.home), words: "dashboard start" },
      { id: "jobs", label: "Jobs", hint: "Go to", icon: Briefcase, run: go(PAGE_PATH.jobs), words: "matches searches list" },
      { id: "review", label: "Tailor & apply", hint: "Go to", icon: FileCheck2, run: go("/jobs/review"), words: "review resumes approve" },
      { id: "applications", label: "Applications", hint: "Go to", icon: FileText, run: go(PAGE_PATH.applications), words: "applied sent status needs you" },
      { id: "following", label: "Following", hint: "Go to", icon: BellRing, run: go("/following"), words: "alerts digest companies roles email" },
      { id: "career", label: "Career", hint: "Go to", icon: GraduationCap, run: go(PAGE_PATH.career), words: "readiness overview" },
      { id: "interviews", label: "Interviews", hint: "Career", icon: MessagesSquare, run: go("/career/interviews"), words: "mock practice history" },
      { id: "quizzes", label: "Quizzes", hint: "Career", icon: ClipboardCheck, run: go("/career/quizzes"), words: "quiz test assessment hiring online assessment company practice" },
      { id: "proof", label: "Proof of skills", hint: "Career", icon: Award, run: go("/career/proof"), words: "challenge work sample" },
      { id: "skills", label: "Skills gap", hint: "Career", icon: Target, run: go("/career/skills"), words: "learn certificate" },
      { id: "snapshot", label: "Profile snapshot", hint: "Career", icon: UserRound, run: go("/career/snapshot"), words: "history scores" },
      { id: "library", label: "Practice library", hint: "Career", icon: BookOpen, run: go("/career"), words: "exercises tests practice" },
      { id: "messages", label: "Messages", hint: "Go to", icon: MessageCircle, run: go(PAGE_PATH.messages), words: "inbox employers" },
      { id: "notifications", label: "Notifications", hint: "Go to", icon: Bell, run: go(PAGE_PATH.notifications), words: "updates" },
      { id: "profile", label: "Profile", hint: "Go to", icon: User, run: go(PAGE_PATH.profile), words: "resume cv experience documents answers preferences" },
      { id: "extension", label: "Extension", hint: "Go to", icon: Puzzle, run: go("/extension"), words: "chrome link code browser" },
      { id: "tokens", label: "Plan & credits", hint: "Go to", icon: Coins, run: go("/tokens"), words: "tokens billing balance top up upgrade" },
      { id: "new-search", label: "New job search", hint: "Action", icon: Plus, run: () => router.push("/jobs/new"), words: "find jobs" },
      { id: "practice", label: "Practise an interview", hint: "Action", icon: MessagesSquare, run: go("/career/interviews/new"), words: "mock chat" },
      { id: "mock", label: "Voice interview", hint: "Action", icon: Mic, run: go("/career/interviews/new?how=voice"), words: "call speak out loud" },
      { id: "resume", label: "Build my resume", hint: "Action", icon: FileText, run: ask("Build my resume"), words: "cv" },
      { id: "tour", label: "Tour this page", hint: "Action", icon: Compass, run: () => window.dispatchEvent(new Event("plato:start-tour")), words: "help guide how" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  )

  const q = text.trim().toLowerCase()
  const hit = (t: string) => q.split(/\s+/).every((w) => t.toLowerCase().includes(w))
  const shown = items.filter((i) => !q || hit(i.label + " " + (i.words ?? "")))
  // Your own searches and applications show once you type.
  const mine: Item[] = q ? (found ?? []).filter((f) => hit(f.label)).slice(0, 8).map((f) => ({ id: f.id, label: f.label, hint: f.kind === "search" ? "Search" : "Application", icon: f.kind === "search" ? Search : FileText, run: go(f.to) })) : []
  // Anything typed can also go to Plato AI, where there is an assistant on this page.
  const canAsk = !hasOwnAssistant(path)
  const rows: Item[] = [...shown, ...mine, ...(q && canAsk ? [{ id: "ask", label: `Ask Plato: ${text.trim()}`, hint: "AI", icon: Sparkles, run: ask(text.trim()) }] : [])]

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
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), close())} onClick={(e) => e.target === ref.current && close()} className="m-auto mt-[12vh] w-[min(560px,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-foreground shadow-float backdrop:bg-foreground/30 backdrop:backdrop-blur-[2px]">
      {open && (
        <div onKeyDown={onKeyDown}>
          <Input
            autoFocus
            value={text}
            onChange={(e) => (setText(e.target.value), setCursor(0))}
            placeholder={canAsk ? "Go to a page, find a search or application, or ask Plato…" : "Go to a page or find a search or application…"}
            aria-label="Command palette"
            className="h-auto rounded-none border-0 border-b bg-transparent px-5 py-4 text-base placeholder:text-lavender focus-visible:border-input focus-visible:ring-0 dark:bg-transparent"
          />
          <ul role="listbox" className="scroll-thin max-h-80 overflow-y-auto p-2">
            {rows.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => (close(), r.run())} className={"flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 " + (i === cursor ? "bg-primary-tint text-foreground" : "text-text-secondary")}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <r.icon className="size-4" />
                  </span>
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
