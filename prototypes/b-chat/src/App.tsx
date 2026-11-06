import { useEffect, useRef, useState } from "react"
import { Briefcase, ChevronDown, Coins, FlaskConical, Menu, PanelRight, Plus, RotateCcw, UserPlus, UserRound, X } from "lucide-react"
import { ago, useStore } from "./store"
import { MODES, P } from "./engine"
import { cx, IconBtn, Logo } from "./ui"
import { NOTE } from "./notes"
import { Chat } from "./screens/Chat"
import { Canvas } from "./screens/Canvas"
import { MODE_ICON } from "./screens/Cards"
import type { Mode, Thread } from "./types"

function threadMode(t: Thread): Mode | null {
  const m = t.flow.mode
  if (m && m !== "onboard") return m
  const cmd = t.msgs.find((x) => x.from === "me" && x.text?.startsWith("/"))?.text
  return (MODES.find((x) => x.cmd === cmd)?.mode as Mode) ?? null
}

export default function App() {
  const { s, ui, patchUi } = useStore()
  const p = P(s)
  const needs = s.apps.filter((a) => a.status === "needs" || a.status === "manual").length
  return (
    <div className="flex h-full">
      <div className="backdrop" />
      {/* Conversations */}
      <div className={cx("fixed inset-0 z-40 bg-ink/25 lg:static lg:z-auto lg:block lg:bg-transparent", ui.threads ? "block" : "hidden")} onMouseDown={(e) => e.target === e.currentTarget && patchUi({ threads: false })}>
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-2.5 sm:px-6" style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}>
          <IconBtn label="Conversations" className="lg:hidden" onClick={() => patchUi({ threads: true })}>
            <Menu className="size-5" />
          </IconBtn>
          <span className="flex items-center gap-2 lg:hidden">
            <Logo size={26} />
            <b>Plato</b>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <ProtoMenu />
            <button type="button" onClick={() => patchUi({ canvas: ui.canvas ? null : { tab: "applications" } })} className="relative flex h-9 items-center gap-1.5 rounded-full border border-white bg-white/75 px-3 text-xs font-semibold text-ink-2 hover:bg-white" aria-label="Show details panel">
              <PanelRight className="size-4" />
              <span className="hidden sm:inline">{ui.canvas ? "Hide panel" : "Applications"}</span>
              {needs > 0 && !ui.canvas && <span className="tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">{needs}</span>}
            </button>
          </span>
        </header>
        {ui.designNotes && <DesignNote onClose={() => patchUi({ designNotes: false })} />}
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">
            <Chat />
          </main>
          <Canvas />
        </div>
      </div>
      <Toasts />
      <span className="sr-only" aria-live="polite">
        {p.first}
      </span>
    </div>
  )
}

function Sidebar() {
  const { s, newChat, openThread, patchUi } = useStore()
  const p = P(s)
  const threads = [...s.threads].sort((a, b) => (a.msgs.length === 0 ? -1 : b.msgs.length === 0 ? 1 : b.at - a.at))
  return (
    <aside className="glass flex h-full w-[272px] flex-col rounded-none px-3 py-4 lg:m-3 lg:mr-0 lg:h-[calc(100%-24px)] lg:rounded-[26px]" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-2.5 px-2">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-extrabold">Plato</p>
          <p className="text-[11px] text-ink-3">Your AI job hunter</p>
        </div>
        <IconBtn label="Close" className="lg:hidden" onClick={() => patchUi({ threads: false })}>
          <X className="size-4" />
        </IconBtn>
      </div>
      <button type="button" onClick={newChat} className="mt-5 flex items-center gap-2 rounded-2xl bg-cobalt px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgb(0_91_167/0.8)] hover:bg-cobalt-hover">
        <Plus className="size-4" /> New chat
      </button>
      <p className="eyebrow mt-6 mb-1.5 px-2">Conversations</p>
      <nav className="scroll-thin -mr-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1" aria-label="Conversations">
        {threads.map((t) => {
          const m = threadMode(t)
          const I = m ? MODE_ICON[m] : null
          const on = t.id === s.active
          return (
            <button key={t.id} type="button" onClick={() => openThread(t.id)} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left", on ? "bg-white shadow-sm" : "hover:bg-white/60")}>
              <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-lg", on ? "bg-soft text-cobalt" : "bg-white/70 text-ink-3")}>{I ? <I className="size-3.5" /> : <Logo size={16} />}</span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-[13px]", on ? "font-bold" : "font-medium text-ink-2")}>{t.msgs.length === 0 ? "New chat" : t.title}</span>
                <span className="block text-[11px] text-ink-3">{t.msgs.length === 0 ? "Now" : ago(t.at)}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="mt-3 flex flex-col gap-1 border-t border-white/80 pt-3">
        <button type="button" onClick={() => patchUi({ canvas: { tab: "applications" }, threads: false })} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-white/60">
          <Briefcase className="size-4" /> Applications
          <span className="tabular ml-auto text-xs text-ink-3">{s.apps.length}</span>
        </button>
        <button type="button" onClick={() => patchUi({ canvas: { tab: "profile" }, threads: false })} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-ink-2 hover:bg-white/60">
          <UserRound className="size-4" /> {p.name}
        </button>
        <span className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12.5px] text-ink-3">
          <Coins className="size-4 text-warning" /> <b className="tabular text-ink">{s.tokens.toLocaleString()}</b> tokens left
        </span>
      </div>
    </aside>
  )
}

function DesignNote({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mx-4 rounded-2xl border border-dashed border-violet/35 bg-violet-soft/70 px-4 py-2.5 text-[13px] text-ink-2 sm:mx-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0 text-violet" />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-violet">
          <span className="truncate">Design note · {NOTE.title}</span>
          <ChevronDown className={cx("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <IconBtn label="Hide design note" className="size-7" onClick={onClose}>
          <X className="size-3.5" />
        </IconBtn>
      </div>
      {open && (
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-9 leading-relaxed">
          {NOTE.points.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProtoMenu() {
  const { s, ui, patchUi, switchPersona } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    addEventListener("mousedown", h)
    return () => removeEventListener("mousedown", h)
  }, [open])
  const Item = ({ title, sub, on, icon, act }: { title: string; sub: string; on?: boolean; icon: React.ReactNode; act: () => void }) => (
    <button
      type="button"
      onClick={() => {
        act()
        setOpen(false)
      }}
      className={cx("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left", on ? "bg-violet-soft" : "hover:bg-tint")}
    >
      <span className="mt-0.5 text-violet">{icon}</span>
      <span>
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="block text-xs text-ink-3">{sub}</span>
      </span>
    </button>
  )
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-violet/40 bg-violet-soft/80 px-3 text-xs font-semibold text-violet">
        <FlaskConical className="size-3.5" />
        <span className="hidden sm:inline">Prototype · {P(s).first}</span>
      </button>
      {open && (
        <div className="anim-pop shadow-pop absolute right-0 z-50 mt-2 w-[310px] rounded-2xl border border-line bg-card p-2">
          <p className="px-3 pt-1 pb-2 text-xs text-ink-3">Example people and data. Nothing is sent anywhere.</p>
          <Item title="Ahmed · backend engineer" sub="Returning user with searches and applications" on={s.persona === "ahmed" && !s.fresh} icon={<UserRound className="size-4" />} act={() => switchPersona("ahmed")} />
          <Item title="Mona · senior accountant" sub="Same app for a non-technical job hunt" on={s.persona === "mona" && !s.fresh} icon={<UserRound className="size-4" />} act={() => switchPersona("mona")} />
          <Item title="Start as a new user" sub="Send a CV in the chat; no sign-up forms" on={s.fresh} icon={<UserPlus className="size-4" />} act={() => switchPersona(s.persona, true)} />
          <Item title="Reset this person" sub="Back to the starting example data" icon={<RotateCcw className="size-4" />} act={() => switchPersona(s.persona)} />
          <Item title={ui.designNotes ? "Hide design note" : "Show design note"} sub="Why this prototype works this way" icon={<FlaskConical className="size-4" />} act={() => patchUi({ designNotes: !ui.designNotes })} />
        </div>
      )}
    </div>
  )
}

function Toasts() {
  const { ui } = useStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-4">
      {ui.toasts.map((t) => (
        <p key={t.id} role="status" className="anim-rise rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
          {t.text}
        </p>
      ))}
    </div>
  )
}
