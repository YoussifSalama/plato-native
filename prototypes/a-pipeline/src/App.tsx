import { useEffect, useRef, useState, type ReactNode } from "react"
import { Bell, BriefcaseBusiness, ChevronDown, Coins, FlaskConical, GraduationCap, Info, RotateCcw, Sparkles, Sun, UserRound, UserPlus, X } from "lucide-react"
import { ago, useDerived, useStore } from "./store"
import { cx, IconBtn, Logo } from "./ui"
import { NOTES } from "./notes"
import type { View } from "./types"
import { Today } from "./screens/Today"
import { Jobs } from "./screens/Jobs"
import { Career } from "./screens/Career"
import { Me } from "./screens/Me"
import { Onboarding } from "./screens/Onboarding"
import { JobDrawer } from "./screens/JobDrawer"
import { ApplyModal } from "./screens/ApplyModal"
import { FeedModal } from "./screens/FeedModal"
import { Plato, PlatoLauncher } from "./screens/Plato"

const NAV: { view: View; label: string; icon: typeof Sun; hint: string }[] = [
  { view: "today", label: "Today", icon: Sun, hint: "What needs you and what Plato did" },
  { view: "jobs", label: "Jobs", icon: BriefcaseBusiness, hint: "Your searches and every job, from match to applied" },
  { view: "career", label: "Career", icon: GraduationCap, hint: "Resumes, interview practice, skills" },
  { view: "me", label: "Me", icon: UserRound, hint: "Profile, preferences, plan" },
]

export default function App() {
  const st = useStore()
  if (st.welcome) return <Onboarding />
  return <Shell />
}

function Shell() {
  const { s, ui, go, setUi } = useStore()
  const d = useDerived()
  const badge: Partial<Record<View, number>> = { jobs: d.needs.length, today: d.needs.length }
  const first = s.profile.name.split(" ")[0]

  return (
    <div className="flex h-full">
      <div className="backdrop" />
      {/* Rail */}
      <div className="hidden shrink-0 p-4 pr-0 lg:block">
        <aside className="glass flex h-full w-[232px] flex-col rounded-[28px] px-3 py-5">
          <div className="flex items-center gap-3 px-2">
            <Logo />
            <div>
              <p className="text-[17px] leading-tight font-extrabold">Plato</p>
              <p className="text-[11.5px] text-ink-3">Your AI job hunter</p>
            </div>
          </div>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
            {NAV.map((n) => {
              const on = ui.view === n.view
              return (
                <button key={n.view} type="button" onClick={() => go(n.view)} title={n.hint} aria-current={on ? "page" : undefined} className={cx("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm transition-all", on ? "bg-white font-bold text-cobalt shadow-[0_8px_22px_-12px_rgb(0_58_110/0.35)]" : "font-medium text-ink-2 hover:bg-white/60 hover:text-ink")}>
                  <n.icon className="size-[18px]" />
                  <span className="flex-1">{n.label}</span>
                  {!!badge[n.view] && n.view === "jobs" && <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-soft px-1.5 text-[11px] font-bold text-warning">{badge[n.view]}</span>}
                </button>
              )
            })}
          </nav>
          <button type="button" onClick={() => setUi({ plato: true })} className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-line/70 bg-white/70 px-3.5 py-2.5 text-left text-sm font-semibold text-cobalt transition hover:bg-white">
            <Sparkles className="size-[18px]" />
            Ask Plato
            <kbd className="ml-auto rounded-md bg-soft px-1.5 font-mono text-[10.5px] text-blue">/</kbd>
          </button>
          <div className="mt-auto flex flex-col gap-3">
            <button type="button" onClick={() => go("me", { meSection: "plan" })} className="rounded-2xl border border-white bg-white/70 p-3 text-left transition hover:bg-white">
              <span className="flex items-center justify-between text-[12.5px] text-ink-2">
                <span className="flex items-center gap-1.5">
                  <Coins className="size-3.5 text-warning" /> Plato tokens
                </span>
                <span className="tabular font-bold text-ink">{s.tokens.toLocaleString()}</span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-divider">
                <span className="bg-brand block h-full rounded-full" style={{ width: `${Math.max(4, (s.tokens / 1000) * 100)}%` }} />
              </span>
              <span className="mt-1.5 block text-[11px] text-ink-3">{s.plan} plan · refills Dec 1</span>
            </button>
            <button type="button" onClick={() => go("me")} className="flex items-center gap-2.5 rounded-2xl p-1.5 text-left hover:bg-white/60">
              <span className="bg-brand flex size-9 items-center justify-center rounded-full text-xs font-bold text-white">AH</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{s.profile.name}</span>
                <span className="block truncate text-xs text-ink-3">{s.profile.email}</span>
              </span>
            </button>
          </div>
        </aside>
      </div>

      {/* Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky z-30 flex items-center gap-2 px-4 pt-3 pb-2 lg:px-8 lg:pt-5" style={{ top: "env(safe-area-inset-top, 0px)", paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={30} />
            <span className="font-extrabold">Plato</span>
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <PrototypeMenu />
            <Bells />
          </div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-10" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
          <div className="mx-auto w-full max-w-[1500px] lg:px-4">
            {ui.designNotes && <DesignNote id={ui.view} />}
            {ui.view === "today" && <Today first={first} />}
            {ui.view === "jobs" && <Jobs />}
            {ui.view === "career" && <Career />}
            {ui.view === "me" && <Me />}
          </div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white px-2 pt-1.5 lg:hidden" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))" }} aria-label="Main">
        {NAV.map((n) => {
          const on = ui.view === n.view
          return (
            <button key={n.view} type="button" onClick={() => go(n.view)} className={cx("relative flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold", on ? "text-cobalt" : "text-ink-3")}>
              <n.icon className="size-5" />
              {n.label}
              {!!badge[n.view] && n.view === "jobs" && <span className="absolute top-1 right-3 size-2 rounded-full bg-warning" />}
            </button>
          )
        })}
      </nav>

      <PlatoLauncher />
      <Plato />
      <JobDrawer />
      <ApplyModal />
      <FeedModal />
      <Toasts />
    </div>
  )
}

function DesignNote({ id }: { id: string }) {
  const { setUi } = useStore()
  const n = NOTES[id]
  const [open, setOpen] = useState(false)
  if (!n) return null
  return (
    <div className="anim-rise mb-4 rounded-2xl border border-dashed border-violet/35 bg-violet-soft/70 px-4 py-3 text-[13px] text-ink-2">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0 text-violet" />
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-violet" aria-expanded={open}>
          <span className="truncate">Design note · {n.title}</span>
          <ChevronDown className={cx("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <IconBtn label="Hide design notes" className="size-7" onClick={() => setUi({ designNotes: false })}>
          <X className="size-3.5" />
        </IconBtn>
      </div>
      {open && (
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-9 leading-relaxed">
          {n.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close()
    addEventListener("mousedown", h)
    return () => removeEventListener("mousedown", h)
  }, [open, close])
  return ref
}

function Bells() {
  const { s, go, openJob, readNote, markAllRead } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useOutside(open, () => setOpen(false))
  const unread = s.notes.filter((n) => !n.read).length
  return (
    <div ref={ref} className="relative">
      <IconBtn label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen(!open)} className="relative bg-white/70">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread}</span>}
      </IconBtn>
      {open && (
        <div className="anim-pop shadow-pop absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-card">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <p className="font-bold">Notifications</p>
            <button type="button" onClick={markAllRead} className="text-xs font-semibold text-cobalt hover:underline">
              Mark all read
            </button>
          </div>
          <ul className="scroll-thin max-h-[60dvh] overflow-y-auto">
            {s.notes.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">Nothing yet. Plato tells you here when something changes.</li>}
            {s.notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    readNote(n.id)
                    setOpen(false)
                    go(n.to.view)
                    if (n.to.job) setTimeout(() => openJob(n.to.job), 0)
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-tint"
                >
                  <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.tone === "warn" ? "bg-warning" : n.tone === "good" ? "bg-success" : "bg-cobalt")} />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[13.5px]", n.read ? "font-medium text-ink-2" : "font-bold")}>{n.text}</span>
                    <span className="block truncate text-xs text-ink-3">{n.sub}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">{ago(n.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PrototypeMenu() {
  const { ui, setUi, reset } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useOutside(open, () => setOpen(false))
  const Item = ({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={() => {
        onClick()
        setOpen(false)
      }}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-tint"
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
        <span className="hidden sm:inline">Prototype</span>
      </button>
      {open && (
        <div className="anim-pop shadow-pop absolute right-0 z-50 mt-2 w-[300px] rounded-2xl border border-line bg-card p-2">
          <p className="px-3 pt-1 pb-2 text-xs text-ink-3">Example data. Nothing is sent anywhere. Your clicks are remembered in this browser only.</p>
          <Item icon={<UserPlus className="size-4" />} title="Start as a new user" sub="Sign up, upload a CV, first search" onClick={() => reset(false)} />
          <Item icon={<RotateCcw className="size-4" />} title="Reset to returning user" sub="Ahmed, 3 searches, 17 jobs in flight" onClick={() => reset(true)} />
          <Item icon={<Info className="size-4" />} title={ui.designNotes ? "Hide design notes" : "Show design notes"} sub="Why each screen changed from today's app" onClick={() => setUi({ designNotes: !ui.designNotes })} />
        </div>
      )}
    </div>
  )
}

function Toasts() {
  const { ui, dropToast } = useStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {ui.toasts.map((t) => (
        <div key={t.id} role="status" className="anim-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-ink py-2.5 pr-2.5 pl-4 text-[13px] font-medium text-white shadow-lg">
          <span className="min-w-0">{t.text}</span>
          {t.undo && (
            <button
              type="button"
              onClick={() => {
                t.undo?.()
                dropToast(t.id)
              }}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25"
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
