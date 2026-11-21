"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { useCallback, useEffect, useState } from "react"
import { AxiosError } from "axios"
import Link from "next/link"
import { ArrowRight, Check, Copy, KeyRound, Monitor, Puzzle, Search } from "lucide-react"
import { cn } from "cn"
import { CARD, EmptyState, SectionHeader, StatIcon } from "@/components/plato-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { timeAgo } from "@/lib/jobs/links"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { InfoTip } from "@/components/info-tip"
import { listRuns, type DiscoveryRun } from "@/lib/jobs/api"
import { getExtensionSettings, listSiteAccounts, setCreateAccounts, type SiteAccount, listDevices, setSearchFeatured, removeAllDevices, removeDevice, startPairing, type ExtensionDevice, type PairingCode } from "@/lib/extension/api"

// Each card fades up after the one before it.
const enter = (i: number) => ({ className: "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500", style: { animationDelay: `${i * 70}ms` } })
const ROW = "-mx-2 rounded-lg px-2 transition-colors duration-200 hover:bg-muted/60"

const reason = (e: unknown) =>
  e instanceof AxiosError && e.response?.status === 429 ? "Too many codes in a minute. Wait a bit and try again." : "Something went wrong. Try again."

// Pair the Plato browser extension: generate a short-lived code, type it into
// the extension, and manage the browsers that are linked.
export default function ExtensionPage() {
  const [devices, setDevices] = useState<ExtensionDevice[] | null>(null)
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [left, setLeft] = useState(0)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<DiscoveryRun[] | null>(null)
  const [justLinked, setJustLinked] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDevices(await listDevices())
    } catch {
      setError("Could not load your linked browsers.")
      setDevices([])
    }
  }, [])
  useEffect(() => {
    listDevices()
      .then(setDevices)
      .catch(() => {
        setError("Could not load your linked browsers.")
        setDevices([])
      })
  }, [])

  // The extension's "Get my code from Plato" opens /extension?pair=1: the code is made on arrival.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("pair") !== "1") return
    window.history.replaceState(null, "", "/extension")
    startPairing()
      .then((p) => {
        setLeft(Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 1000)))
        setPairing(p)
      })
      .catch((e) => setError(reason(e)))
  }, [])

  useEffect(() => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }, [])

  // Optimistic: flip the box now, undo if the server refuses.
  const feature = (id: string, featured: boolean) => {
    const set = (v: boolean) => setRuns((rs) => rs?.map((r) => (r.id === id ? { ...r, featured: v } : r)) ?? rs)
    set(featured)
    setSearchFeatured(id, featured).catch(() => {
      set(!featured)
      setError("Could not update that search. Try again.")
    })
  }

  // Countdown; when the code runs out it is gone, not "still valid".
  useEffect(() => {
    if (!pairing) return
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(pairing.expires_at).getTime() - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) setPairing(null)
    }
    const id = setInterval(tick, 1000)
    // While the code is on screen, watch for the browser that uses it, so the page moves on by itself.
    const made = Date.now() - 5_000
    const watch = setInterval(() => {
      listDevices()
        .then((ds) => {
          setDevices(ds)
          const linked = ds.find((d) => new Date(d.created_at).getTime() >= made)
          if (linked) {
            setPairing(null)
            setJustLinked(linked.label)
          }
        })
        .catch(() => undefined)
    }, 3000)
    return () => {
      clearInterval(id)
      clearInterval(watch)
    }
  }, [pairing])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(reason(e))
    } finally {
      setBusy(false)
    }
  }

  const generate = () =>
    run(async () => {
      setCopied(false)
      setJustLinked(null)
      const p = await startPairing()
      setLeft(Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 1000)))
      setPairing(p)
    })
  const copy = async () => {
    if (!pairing) return
    try {
      await navigator.clipboard.writeText(pairing.code)
      setCopied(true)
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  }
  const unlink = (id: string) =>
    run(async () => {
      await removeDevice(id)
      await load()
    })
  const unlinkAll = () =>
    run(async () => {
      await removeAllDevices()
      await load()
    })

  return (
    <div data-tour-state={pairing ? "extension.code" : devices === null ? undefined : devices.length ? "extension.linked" : "extension.unlinked"} className={PAGE}>
      <PageHeader section="Account" title="Browser extension" description="Link the Plato extension to your account. It fills applications in your own browser, and you always press Submit yourself." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section data-tour="extension-link" className={cn(CARD, "relative isolate flex flex-col gap-4 overflow-hidden p-5 sm:p-6", enter(0).className)} style={enter(0).style}>
        {/* The soft brand glow every page hero shares (cobalt top-left, azure bottom-right). */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_65%)]" />
        <div className="flex items-center gap-3">
          <StatIcon icon={Puzzle} accent="cobalt" className="size-10" />
          <div>
            <h2 className="type-section-title flex items-center gap-1.5 text-foreground">
              Link a browser
              <InfoTip text="Linking signs the extension in this browser into your Plato account, so it can see your jobs and fill applications here. The pairing code is only for that one sign-in." label="What linking a browser does" />
            </h2>
            <p className="text-sm text-text-secondary">Generate a code, then type it into the extension’s side panel.</p>
          </div>
        </div>

        {pairing ? (
          <div className="flex flex-wrap items-center gap-4">
            <p data-ai="extension.code" className="rounded-lg border border-primary-line bg-card px-4 py-2 font-mono text-2xl font-bold tracking-widest text-foreground select-all">
              {pairing.code}
            </p>
            <Button variant="outline" size="sm" data-ai="extension.copy" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <span data-tour="extension-countdown" className="text-sm text-text-secondary tabular-nums" aria-live="polite">
              Valid for {left}s · one use · waiting for the extension…
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" data-ai="extension.generate" disabled={busy} onClick={generate}>
              {justLinked || devices?.length ? "Link another browser" : "Generate code"}
            </Button>
            {justLinked && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-success animate-in fade-in-0 zoom-in-95 duration-300" aria-live="polite">
                <Check className="size-4" />
                {justLinked} is linked
              </span>
            )}
          </div>
        )}

        <ol data-tour="extension-steps" className="flex flex-col gap-2 text-sm text-text-secondary">
          {["Open the Plato extension in Chrome.", "Type the code and press “Link this browser”.", "The code works once and expires in two minutes. Generating a new one replaces the old one."].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary tabular-nums">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="type-meta text-text-tertiary">The extension is not on the Chrome Web Store yet. Linking is safe to do ahead of time.</p>
      </section>

      <section data-tour="extension-searches" className={cn(CARD, "flex flex-col gap-3 p-5", enter(1).className)} style={enter(1).style}>
        <div className="flex flex-col gap-1.5">
          <SectionHeader title="Your searches" icon={Search} accent="cobalt" />
          <p className="text-sm text-text-secondary">Tick a search to feature it. Featured searches show first in the extension, so it is easy to pick the one you want to apply on.</p>
        </div>
        {runs === null ? (
          <Skeleton className="h-12 w-full" />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No searches yet"
            hint="Search for jobs first, then feature the one you want to apply on."
            action={
              <Link href="/jobs" className="group inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                Find jobs
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-divider">
            {runs.map((r, i) => (
              <li key={r.id} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <label title="Show this search first in the extension" className={cn("flex cursor-pointer items-center gap-3 py-3", ROW)}>
                  <Checkbox checked={!!r.featured} onCheckedChange={(v) => feature(r.id, v === true)} aria-label={`Feature ${r.query.requestedTitles?.[0] ?? r.query.titles[0] ?? "search"} in the extension`} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{r.query.requestedTitles?.[0] ?? r.query.titles[0] ?? "Search"}</span>
                    <span className="type-meta truncate text-text-secondary">
                      {r.query.locations.slice(0, 3).join(", ") || "Anywhere"} · {r.matched} jobs · {timeAgo(r.started_at)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-tour="extension-devices" className={cn(CARD, "flex flex-col gap-3 p-5", enter(2).className)} style={enter(2).style}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <SectionHeader title="Linked browsers" icon={Monitor} accent="cobalt" />
            <InfoTip text="A link lasts up to 30 days and ends sooner if that browser goes 14 days without using it. Unlinking signs that browser's extension out right away." label="How long a link lasts" />
          </span>
          {!!devices?.length && (
            <Button variant="outline" size="sm" disabled={busy} onClick={unlinkAll} className="text-destructive hover:text-destructive">
              Unlink all
            </Button>
          )}
        </div>
        {devices === null ? (
          <Skeleton className="h-12 w-full" />
        ) : devices.length === 0 ? (
          <EmptyState icon={Monitor} title="No browser is linked" hint="Generate a code above and type it into the extension." />
        ) : (
          <ul className="divide-y divide-divider">
            {devices.map((d, i) => (
              <li key={d.id} data-tour="extension-device" className={cn("flex flex-wrap items-center justify-between gap-3 py-3 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300", ROW)} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-text-secondary">
                    <Monitor className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{d.label}</span>
                    <span className="type-meta text-text-secondary">
                      Linked {timeAgo(d.created_at)} · {d.last_used_at ? `last used ${timeAgo(d.last_used_at)}` : "not used yet"}
                      {d.ext_version ? ` · v${d.ext_version}` : ""}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => unlink(d.id)}>
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SiteAccounts />
    </div>
  )
}

// Job-site accounts: off until the seeker turns it on here (the extension cannot turn it on). Off again = the references
// go now and every linked browser wipes its saved passwords the next time the extension starts.
function SiteAccounts() {
  const [on, setOn] = useState<boolean | null>(null)
  const [accounts, setAccounts] = useState<SiteAccount[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getExtensionSettings().then((s) => setOn(!!s.createAccounts)).catch(() => setOn(false))
    listSiteAccounts().then(setAccounts).catch(() => setAccounts([]))
  }, [])
  const toggle = async (v: boolean) => {
    setBusy(true)
    setError(null)
    try {
      setOn(!!(await setCreateAccounts(v)).createAccounts)
      if (!v) setAccounts([])
    } catch {
      setError("Could not change this setting. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-tour="extension-site-accounts" className={cn(CARD, "flex flex-col gap-3 p-5", enter(3).className)} style={enter(3).style}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <SectionHeader title="Job-site accounts" icon={KeyRound} accent="cobalt" />
          <InfoTip text="The password is made in your browser, encrypted there with a key that never leaves it, and typed into the site by the extension. Plato's servers and its AI never see it. Uninstalling the extension or clearing its data removes the passwords: use the site's Forgot password then." label="How job-site passwords are kept" />
        </span>
        <label className="flex items-center gap-2.5 text-sm font-medium">
          {on === null ? <Skeleton className="h-7 w-12 rounded-full" /> : <Switch checked={on} disabled={busy} onCheckedChange={(v) => void toggle(v)} aria-label="Let Plato create job-site accounts" />}
          Let Plato create accounts
        </label>
      </div>
      <p className="text-sm text-text-secondary">
        Some career sites (Workday, iCIMS, Taleo…) need an account before you can apply. With this on, the extension creates it with your email and a strong password it makes and keeps in that browser only. Turning it off deletes those passwords from your browsers.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {accounts === null ? (
        <Skeleton className="h-12 w-full" />
      ) : accounts.length === 0 ? (
        <EmptyState icon={KeyRound} title="No job-site accounts yet" hint={on ? "Accounts the extension creates show up here, with the browser that keeps the password." : "Turn this on to let the extension create the accounts career sites ask for."} />
      ) : (
        <ul className="divide-y divide-divider">
          {accounts.map((a) => (
            <li key={a.id} className={cn("flex flex-wrap items-center justify-between gap-3 py-3", ROW)}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{a.host}</span>
                <span className="type-meta text-text-secondary">
                  Password kept in {a.device ?? a.browser}{a.device_linked ? "" : " (no longer linked)"} · created {timeAgo(a.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
