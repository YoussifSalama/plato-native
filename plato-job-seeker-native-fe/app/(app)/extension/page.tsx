"use client"

import { PAGE, PageHeader } from "@/components/page-header"
import { useCallback, useEffect, useState } from "react"
import { AxiosError } from "axios"
import { Check, Copy, Puzzle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "@/lib/jobs/links"
import { Checkbox } from "@/components/ui/checkbox"
import { listRuns, type DiscoveryRun } from "@/lib/jobs/api"
import { listDevices, setSearchFeatured, removeAllDevices, removeDevice, startPairing, type ExtensionDevice, type PairingCode } from "@/lib/extension/api"

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
    return () => clearInterval(id)
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
    <div className={PAGE}>
      <PageHeader section="Account" title="Browser extension" description="Link the Plato extension to your account. It fills applications in your own browser, and you always press Submit yourself." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Puzzle className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Link a browser</h2>
            <p className="text-sm text-text-secondary">Generate a code, then type it into the extension’s side panel.</p>
          </div>
        </div>

        {pairing ? (
          <div className="flex flex-wrap items-center gap-4">
            <p data-ai="extension.code" className="rounded-md border bg-muted px-4 py-2 font-mono text-2xl font-bold tracking-widest text-foreground select-all">
              {pairing.code}
            </p>
            <button type="button" onClick={copy} className="flex h-9 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <span className="text-sm text-text-secondary tabular-nums" aria-live="polite">
              Valid for {left}s · one use
            </span>
          </div>
        ) : (
          <div>
            <button type="button" data-ai="extension.generate" disabled={busy} onClick={generate} className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              Generate code
            </button>
          </div>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
          <li>Open the Plato extension in Chrome.</li>
          <li>Type the code and press “Link this browser”.</li>
          <li>The code works once and expires in two minutes. Generating a new one replaces the old one.</li>
        </ol>
        <p className="text-xs text-text-tertiary">The extension is not on the Chrome Web Store yet, and no job sites are enabled in it yet. Linking is safe to do ahead of time.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Your searches</h2>
          <p className="text-sm text-text-secondary">Tick a search to feature it. Featured searches show first in the extension, so it is easy to pick the one you want to apply on.</p>
        </div>
        {runs === null ? (
          <Skeleton className="h-12 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-sm text-text-secondary">No searches yet. Search for jobs first.</p>
        ) : (
          <ul className="divide-y">
            {runs.map((r) => (
              <li key={r.id}>
                <label title="Show this search first in the extension" className="flex cursor-pointer items-center gap-3 py-3">
                  <Checkbox checked={!!r.featured} onCheckedChange={(v) => feature(r.id, v === true)} aria-label={`Feature ${r.query.requestedTitles?.[0] ?? r.query.titles[0] ?? "search"} in the extension`} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{r.query.requestedTitles?.[0] ?? r.query.titles[0] ?? "Search"}</span>
                    <span className="truncate text-xs text-text-secondary">
                      {r.query.locations.slice(0, 3).join(", ") || "Anywhere"} · {r.matched} jobs · {timeAgo(r.started_at)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Linked browsers</h2>
          {!!devices?.length && (
            <button type="button" disabled={busy} onClick={unlinkAll} className="h-8 rounded-md border px-3 text-sm font-medium text-destructive hover:bg-muted disabled:opacity-50">
              Unlink all
            </button>
          )}
        </div>
        {devices === null ? (
          <Skeleton className="h-12 w-full" />
        ) : devices.length === 0 ? (
          <p className="text-sm text-text-secondary">No browser is linked.</p>
        ) : (
          <ul className="divide-y">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{d.label}</span>
                  <span className="text-xs text-text-secondary">
                    Linked {timeAgo(d.created_at)} · {d.last_used_at ? `last used ${timeAgo(d.last_used_at)}` : "not used yet"}
                    {d.ext_version ? ` · v${d.ext_version}` : ""}
                  </span>
                </div>
                <button type="button" disabled={busy} onClick={() => unlink(d.id)} className="h-8 rounded-md border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
