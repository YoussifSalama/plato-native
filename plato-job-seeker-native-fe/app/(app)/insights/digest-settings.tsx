"use client"

import { motion, useReducedMotion } from "motion/react"
import { BellRing, CalendarClock, Inbox, Mail, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { CADENCES, type AlertSettings, type Cadence, type InsightsOverview } from "@/lib/insights/api"
import { lineReveal, nodeContent, reducedVariants, spring } from "@/lib/motion-system"

const when = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return "within the hour"
  if (days === 1) return "tomorrow"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

// Where the alerts stand and how often they arrive: the one place to set the rhythm.
export function DigestSettings({ data, onChange }: { data: InsightsOverview | null; onChange: (patch: Partial<Omit<AlertSettings, "emailAvailable">>) => void }) {
  const reduced = !!useReducedMotion()
  const v = (x: typeof lineReveal) => (reduced ? reducedVariants(x) : x)
  if (!data) return <SettingsSkeleton />
  const { settings, pending } = data
  const active = data.alerts.filter((a) => !a.paused).length
  const next = active && pending ? when(data.nextDigestAt) ?? "within the hour" : null

  return (
    <section className="relative overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[size:22px_22px]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(78,8,252,0.14),transparent_65%)]" />
      <motion.div variants={reduced ? reducedVariants(nodeContent) : nodeContent} initial="hidden" animate="show" className="relative grid gap-7 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          <motion.div variants={v(lineReveal)} className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
              <BellRing className="size-3.5" />
              {active} alert{active === 1 ? "" : "s"} on
            </span>
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs text-text-secondary backdrop-blur">
              <ShieldCheck className="size-3.5 text-success" />
              Only jobs still open, never one twice
            </span>
          </motion.div>
          <motion.div variants={v(lineReveal)} className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {!active ? "Tell Plato what to watch for" : pending ? `${pending} new job${pending === 1 ? "" : "s"} waiting for you` : "Watching for new jobs"}
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
              {!active
                ? "Add a role or follow a company below. Plato collects new openings from every search on the platform and sends them to you together, never one message per job."
                : next
                  ? `They arrive together in your next digest, ${next}. Each one is checked right before it goes out.`
                  : "Nothing new yet. When jobs that fit turn up, they arrive together in one digest on the rhythm you pick."}
            </p>
          </motion.div>
          <motion.div variants={v(lineReveal)} className="flex flex-wrap gap-2.5">
            <Channel icon={Inbox} label="In Plato" hint="In your notifications" checked={settings.in_app} onChange={(in_app) => onChange({ in_app })} />
            <Channel icon={Mail} label="By email" hint={settings.emailAvailable ? "One email per digest" : "Coming soon: you'll get them in Plato for now"} checked={settings.email && settings.emailAvailable} disabled={!settings.emailAvailable} onChange={(email) => onChange({ email })} />
          </motion.div>
        </div>

        <motion.div variants={v(lineReveal)} className="flex flex-col gap-2.5 rounded-xl border bg-card/90 p-4 shadow-[0_18px_40px_-28px_rgba(79,63,247,0.55)] backdrop-blur lg:w-80">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            <CalendarClock className="size-3.5 text-primary" />
            How often
          </span>
          <div role="radiogroup" aria-label="How often digests arrive" className="flex flex-col gap-1">
            {CADENCES.map((c) => (
              <CadenceOption key={c.value} {...c} checked={settings.cadence === c.value} onPick={(cadence) => onChange({ cadence })} />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-text-tertiary">No new jobs, no digest. Plato never sends an empty one.</p>
        </motion.div>
      </motion.div>
    </section>
  )
}

function CadenceOption({ value, label, hint, checked, onPick }: { value: Cadence; label: string; hint: string; checked: boolean; onPick: (c: Cadence) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-ai={`insights.cadence.${value.toLowerCase()}`}
      onClick={() => onPick(value)}
      className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", checked ? "text-primary" : "text-text-secondary hover:bg-primary-tint hover:text-foreground")}
    >
      {checked && <motion.span layoutId="cadence-pill" transition={spring.micro} className="absolute inset-0 rounded-lg bg-primary-soft" />}
      <span className={cn("relative flex size-4 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-primary" : "border-border")}>{checked && <span className="size-1.5 rounded-full bg-primary" />}</span>
      <span className="relative flex-1 text-sm font-semibold">{label}</span>
      <span className="relative text-xs text-text-tertiary">{hint}</span>
    </button>
  )
}

function Channel({ icon: Icon, label, hint, checked, disabled, onChange }: { icon: typeof Mail; label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex items-center gap-3 rounded-lg border bg-card/90 py-2.5 pr-3 pl-2.5 backdrop-blur transition-colors", disabled ? "opacity-70" : "cursor-pointer hover:border-primary/30")}>
      <span className="flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-text-tertiary">{hint}</span>
      </span>
      <Switch size="sm" className="ml-2" checked={checked} disabled={disabled} onCheckedChange={(on) => onChange(on)} aria-label={label} />
    </label>
  )
}

function SettingsSkeleton() {
  return (
    <section className="grid gap-7 rounded-xl border bg-card p-8 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56 rounded-full" />
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <div className="flex gap-2.5">
          <Skeleton className="h-14 w-56 rounded-lg" />
          <Skeleton className="h-14 w-56 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-48 w-80 rounded-xl" />
    </section>
  )
}
