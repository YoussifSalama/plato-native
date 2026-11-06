import { useEffect, useRef, useState } from "react"
import { BriefcaseBusiness, ChevronDown, Coins, FlaskConical, GraduationCap, Maximize2, Menu, Plus, RotateCcw, Sparkles, UserPlus, UserRound, X } from "lucide-react"
import { ago, useStore, type View } from "./store"
import { MODES, P } from "./engine"
import { cx, IconBtn, Logo } from "./ui"
import { NOTES } from "./notes"
import { Chat } from "./screens/Chat"
import { MODE_ICON } from "./screens/Cards"
import { Jobs } from "./screens/Jobs"
import { Career, Me, TodayPanel } from "./screens/Pages"
import { ApplyModal, JobDrawer, ResumeViewer } from "./screens/Overlays"
import type { Mode, Thread } from "./types"

const NAV: { view: View; label: string; icon: typeof Sparkles }[] = [
  { view: "plato", label: "Plato", icon: Sparkles },
  { view: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { view: "career", label: "Career", icon: GraduationCap },
  { view: "me", label: "Me", icon: UserRound },
]
const PAGE_NAME: Record<View, string> = { plato: "Plato", jobs: "Jobs board", career: "Career", me: "Me" }

function threadMode(t: Thread): Mode | null {
  const m = t.flow.mode
  if (m && m !== "onboard") return m
  const cmd = t.msgs.find((x) => x.from === "me" && x.text?.startsWith("/"))?.text
  return (MODES.find((x) => x.cmd === cmd)?.mode as Mode) ?? null
}

export default function App() {
  const { ui, patchUi } = useStore()
  const page = ui.view !== "plato"
  return (
    <div className="flex h-full">
      <div className="backdrop" />
      <div className={cx("fixed inset-0 z-40 bg-ink/25 lg:static lg:z-auto lg:block lg:bg-transparent", ui.nav ? "block" : "hidden")} onMouseDown={(e) => e.target === e.currentTarget && patchUi({ nav: false })}>
        <Rail />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {ui.designNotes && <DesignNote id={ui.view} onClose={() => patchUi({ designNotes: false })} />}
        <div className="flex min-h-0 flex-1">
          {page ? (
            <main className="scroll-thin min-w-0 flex-1 overflow-y-auto px-4 pt-2 pb-28 sm:px-6 lg:pb-10">
              {ui.view === "jobs" && <Jobs />}
              {ui.view === "career" && <Career />}
              {ui.view === "me" && <Me />}
            </main>
          ) : (
            <>
              <main className="min-w-0 flex-1">
                <Chat />
              </main>
              <TodayPanel />
            </>
          )}
          {page && ui.copilot && <Copilot />}
        </div>
      </div>
      {page && !ui.copilot && (
        <button type="button" onClick={() => patchUi({ copilot: true })} className="glass fixed z-30 flex items-center gap-2.5 rounded-full py-2 pr-4 pl-2 hover:-translate-y-0.5" style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
          <Logo size={34} />
          <span className="text-left">
            <span className="block text-[13.5px] font-bold">Ask Plato</span>
            <span className="block text-[11px] text-ink-3">Sees this page</span>
          </span>
        </button>
      )}
      <JobDrawer />
      <ApplyModal />
      <ResumeViewer />
      <Toasts />
    </div>
  )
}

// Plato docked beside a page: the same conversation as the home page.
function Copilot() {
  const { ui, patchUi, go } = useStore()
  return (
    <aside aria-label="Plato" className="anim-slide fixed inset-0 z-40 flex flex-col bg-card lg:static lg:z-auto lg:m-3 lg:ml-0 lg:w-[400px] lg:shrink-0 lg:rounded-[24px] lg:border lg:border-line lg:bg-white/80 lg:shadow-card xl:w-[420px]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center gap-2.5 border-b border-divider px-3.5 py-2.5">
        <Logo size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">Plato</p>
          <p className="truncate text-[11px] text-ink-3">Same conversation · sees your {PAGE_NAME[ui.view]}</p>
        </div>
        <IconBtn label="Open the full chat" title="Open the full chat" onClick={() => go("plato")}>
          <Maximize2 className="size-4" />
        </IconBtn>
        <IconBtn label="Close Plato" onClick={() => patchUi({ copilot: false })}>
          <X className="size-5" />
        </IconBtn>
      </div>
      <div className="min-h-0 flex-1">
        <Chat compact />
      </div>
    </aside>
  )
}

function Rail() {
  const { s, ui, go, newChat, openThread, patchUi } = useStore()
  const p = P(s)
  const needs = s.apps.filter((a) => a.status === "needs" || a.status === "manual").length
  const threads = [...s.threads].filter((t) => t.msgs.length).sort((a, b) => b.at - a.at).slice(0, 6)
  return (
    <aside className="glass flex h-full w-[260px] flex-col px-3 py-4 lg:m-3 lg:mr-0 lg:h-[calc(100%-24px)] lg:rounded-[26px]" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-2.5 px-2">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-extrabold">Plato</p>
          <p className="text-[11px] text-ink-3">Your AI job hunter</p>
        </div>
        <IconBtn label="Close" className="lg:hidden" onClick={() => patchUi({ nav: false })}>
          <X className="size-4" />
        </IconBtn>
      </div>
      <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
        {NAV.map((n) => {
          const on = ui.view === n.view
          return (
            <button key={n.view} type="button" onClick={() => go(n.view)} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-all", on ? "bg-white font-bold text-cobalt shadow-[0_8px_22px_-12px_rgb(0_58_110/0.35)]" : "font-medium text-ink-2 hover:bg-white/60 hover:text-ink")}>
              <n.icon className="size-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.view === "jobs" && needs > 0 && <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-soft px-1.5 text-[11px] font-bold text-warning">{needs}</span>}
            </button>
          )
        })}
      </nav>
      <div className="mt-6 flex items-center justify-between px-2">
        <p className="eyebrow">Recent chats</p>
        <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-white hover:text-cobalt">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="scroll-thin mt-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {threads.map((t) => {
          const m = threadMode(t)
          const I = m ? MODE_ICON[m] : Sparkles
          const on = t.id === s.active
          return (
            <button key={t.id} type="button" onClick={() => (openThread(t.id), ui.view !== "plato" && !ui.copilot && go("plato"))} className={cx("flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left", on ? "bg-white/90" : "hover:bg-white/60")}>
              <I className={cx("size-3.5 shrink-0", on ? "text-cobalt" : "text-ink-3")} />
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-[12.5px]", on ? "font-bold" : "text-ink-2")}>{t.title}</span>
                <span className="block text-[10.5px] text-ink-3">{ago(t.at)}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-col gap-1 border-t border-white/80 pt-3">
        <span className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12.5px] text-ink-3">
          <Coins className="size-4 text-warning" /> <b className="tabular text-ink">{s.tokens.toLocaleString()}</b> tokens left
        </span>
        <button type="button" onClick={() => go("me")} className="flex items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-white/60">
          <span className="bg-brand flex size-8 items-center justify-center rounded-full text-[11px] font-bold text-white">{p.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold">{p.name}</span>
            <span className="block truncate text-[11px] text-ink-3">{p.headline}</span>
          </span>
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const { ui, patchUi } = useStore()
  return (
    <header className="flex items-center gap-2 px-4 py-2.5 sm:px-6" style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}>
      <IconBtn label="Menu" className="lg:hidden" onClick={() => patchUi({ nav: true })}>
        <Menu className="size-5" />
      </IconBtn>
      <span className="flex items-center gap-2 lg:hidden">
        <Logo size={26} />
        <b>Plato</b>
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <ProtoMenu />
        {ui.view !== "plato" && (
          <button type="button" onClick={() => patchUi({ copilot: !ui.copilot })} aria-pressed={ui.copilot} className={cx("hidden h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold lg:flex", ui.copilot ? "border-cobalt bg-soft text-cobalt" : "border-white bg-white/75 text-ink-2")}>
            <Sparkles className="size-3.5" /> {ui.copilot ? "Hide Plato" : "Show Plato"}
          </button>
        )}
      </span>
    </header>
  )
}

function DesignNote({ id, onClose }: { id: string; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const n = NOTES[id]
  if (!n) return null
  return (
    <div className="mx-4 mb-2 rounded-2xl border border-dashed border-violet/35 bg-violet-soft/70 px-4 py-2.5 text-[13px] text-ink-2 sm:mx-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0 text-violet" />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-violet">
          <span className="truncate">Design note · {n.title}</span>
          <ChevronDown className={cx("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <IconBtn label="Hide design notes" className="size-7" onClick={onClose}>
          <X className="size-3.5" />
        </IconBtn>
      </div>
      {open && (
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-9 leading-relaxed">
          {n.points.map((x) => (
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
    <button type="button" onClick={() => (act(), setOpen(false))} className={cx("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left", on ? "bg-violet-soft" : "hover:bg-tint")}>
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
          <Item title="Start as a new user" sub="Send a CV in the chat; no forms" on={s.fresh} icon={<UserPlus className="size-4" />} act={() => switchPersona(s.persona, true)} />
          <Item title="Reset this person" sub="Back to the starting example data" icon={<RotateCcw className="size-4" />} act={() => switchPersona(s.persona)} />
          <Item title={ui.designNotes ? "Hide design notes" : "Show design notes"} sub="Why each page works this way" icon={<FlaskConical className="size-4" />} act={() => patchUi({ designNotes: !ui.designNotes })} />
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
