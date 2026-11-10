"use client"

import { motion, useReducedMotion } from "motion/react"
import { BellRing, CalendarClock, Inbox, Mail, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { PillTabs } from "@/components/pill-tabs"
import { CARD } from "@/components/plato-ui"
import { CountUp } from "@/components/count-up"
import { InfoTip } from "@/components/info-tip"
import { CADENCES, type AlertSettings, type Cadence, type InsightsOverview } from "@/lib/insights/api"
import { lineReveal, nodeContent, reducedVariants } from "@/lib/motion-system"

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
    <section data-tour="digest-settings" className={cn(CARD, "relative isolate overflow-hidden")}>
      {/* The soft brand glow of the Home hero, in brand cobalt. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
      <motion.div variants={reduced ? reducedVariants(nodeContent) : nodeContent} initial="hidden" animate="show" className="relative grid gap-7 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          <motion.div variants={v(lineReveal)} className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
              <BellRing className="size-3.5" />
              <CountUp value={active} /> alert{active === 1 ? "" : "s"} on
            </span>
            <span className="flex items-center gap-1.5 rounded-full border bg-card/80 px-3 py-1 text-xs text-text-secondary backdrop-blur">
              <ShieldCheck className="size-3.5 text-primary" />
              Only jobs still open, never one twice
            </span>
          </motion.div>
          <motion.div variants={v(lineReveal)} className="flex flex-col gap-1.5">
            <h2 className="type-page-title text-foreground">
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
          <motion.div variants={v(lineReveal)} data-tour="digest-channels" className="flex flex-wrap gap-2.5">
            <Channel icon={Inbox} label="In Plato" hint="In your notifications" checked={settings.in_app} onChange={(in_app) => onChange({ in_app })} />
            <Channel icon={Mail} label="By email" hint={settings.emailAvailable ? "One email per digest" : "Coming soon: you'll get them in Plato for now"} checked={settings.email && settings.emailAvailable} disabled={!settings.emailAvailable} onChange={(email) => onChange({ email })} />
          </motion.div>
        </div>

        <motion.div variants={v(lineReveal)} data-tour="digest-cadence" className="flex flex-col gap-2.5 rounded-xl border bg-card/90 p-4 shadow-[var(--shadow-lift)] backdrop-blur lg:w-80">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            <CalendarClock className="size-3.5 text-primary" />
            How often
            <InfoTip className="normal-case" text="How often Plato gathers what your alerts found into one digest. It goes to the places you switched on: your notifications in Plato, email, or both." label="What digest frequency means" />
          </span>
          <PillTabs id="cadence-pill" tabs={CADENCES.map((c) => ({ key: c.value.toLowerCase(), label: c.label }))} value={settings.cadence.toLowerCase()} onChange={(k) => onChange({ cadence: k.toUpperCase() as Cadence })} label="How often digests arrive" dataAi="insights.cadence" className="w-full" />
          <p className="px-1 text-xs text-text-secondary">{CADENCES.find((c) => c.value === settings.cadence)?.hint}</p>
          <p className="text-xs leading-relaxed text-text-tertiary">No new jobs, no digest. Plato never sends an empty one.</p>
        </motion.div>
      </motion.div>
    </section>
  )
}

function Channel({ icon: Icon, label, hint, checked, disabled, onChange }: { icon: typeof Mail; label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex items-center gap-3 rounded-lg border bg-card/90 py-2.5 pr-3 pl-2.5 backdrop-blur transition-colors", disabled ? "opacity-70" : "cursor-pointer duration-200 hover:border-primary-line")}>
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
    <section className={cn(CARD, "grid gap-7 p-8 lg:grid-cols-[1fr_auto]")}>
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
