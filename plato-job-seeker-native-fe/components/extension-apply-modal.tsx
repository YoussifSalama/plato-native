"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Lock, MoreVertical, MousePointer2, Pin, Puzzle, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getExtensionProgress, startPairing, type PairingCode } from "@/lib/extension/api"
import { queueForExtension } from "@/lib/jobs/api"
import { createApplyBatch } from "@/lib/extension/api"

// "Apply with Plato": the jobs are only TAGGED here (nothing is applied from the web); the person
// connects the browser extension with a one-time code and the extension does the applying.
// Step 1 open the extension, step 2 enter the code, step 3 (connected) start applying there.
type Req = { top?: number; jobIds?: string[]; threadId?: string }

const STEPS = ["Open extension", "Enter code", "Start applying"]

export function ExtensionApplyModal({ open, count, req, onClose }: { open: boolean; count: number; req: Req; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()} className="m-auto w-[min(860px,calc(100vw-2rem))] rounded-2xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40">
      {open && <Content count={count} req={req} onClose={onClose} />}
    </dialog>
  )
}

// Mounted only while open, so every opening starts from fresh state.
function Content({ count, req, onClose }: { count: number; req: Req; onClose: () => void }) {
  const router = useRouter()
  const [queued, setQueued] = useState<number | null>(null)
  const [unsupported, setUnsupported] = useState(0) // jobs on sites the extension cannot apply on
  const [code, setCode] = useState<PairingCode | null>(null)
  const [left, setLeft] = useState(0)
  const [connected, setConnected] = useState(false)
  const [opened, setOpened] = useState(false)
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  // "I opened it": check right now whether the extension is running, and say what to do if not.
  const checkOpened = async () => {
    setOpened(true)
    setChecking(true)
    setHint(null)
    try {
      if ((await getExtensionProgress()).online) return setConnected(true)
      setHint(code ? "Plato can't see the extension yet. In the extension, type the code on the right and press “Link this browser”. If it is already linked, just keep it open: this updates within a few seconds." : "Plato can't see the extension yet. Keep it open: this updates within a few seconds.")
    } catch {
      setHint("Could not check right now. Try again in a moment.")
    } finally {
      setChecking(false)
    }
  }
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On open: tag the jobs, see whether a browser is already linked, otherwise get a code.
  const newCode = useCallback(async () => {
    try {
      const p = await startPairing()
      setCode(p)
      setCopied(false)
      setLeft(Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 1000)))
    } catch {
      setError("Could not create a code. Try again in a minute.")
    }
  }, [])
  const reqKey = JSON.stringify(req)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await queueForExtension(JSON.parse(reqKey) as Req)
        if (!alive) return
        // straight into the extension's queue: they show up in the panel as waiting jobs
        const b = r.jobIds?.length ? await createApplyBatch(r.jobIds).catch(() => null) : null
        if (!alive) return
        const already = b?.rejected.filter((x) => x.reason === "duplicate").length ?? 0
        setQueued((b?.items.length ?? 0) + already)
        setUnsupported(b ? b.rejected.filter((x) => x.reason === "no_provider" || x.reason === "provider_blocked").length : 0)
        // a device row can outlive a removed extension: "connected" = it is running and talking to Plato now
        const linked = (await getExtensionProgress()).online
        if (!alive) return
        setConnected(linked)
        if (!linked) await newCode()
      } catch {
        if (alive) setError("Could not add the jobs to your extension queue. Try again.")
      }
    })()
    return () => {
      alive = false
    }
  }, [reqKey, newCode])

  // Countdown; an expired code is replaced. Poll for the browser linking itself.
  useEffect(() => {
    if (connected || !code) return
    const id = setInterval(async () => {
      const s = Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) return void newCode()
      if (s % 3 === 0) {
        try {
          if ((await getExtensionProgress()).online) setConnected(true)
        } catch {
          /* keep waiting */
        }
      }
    }, 1000)
    return () => clearInterval(id)
  }, [connected, code, newCode])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      setCopied(true)
    } catch {
      /* the code is on screen */
    }
  }
  const step = connected ? 3 : opened ? 2 : 1

  return (
        <div className="flex flex-col gap-6 p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-bold">Apply to {count} job{count === 1 ? "" : "s"} with Plato</h2>
              <p className="text-sm text-text-secondary">To apply, you need to open the Plato extension and connect it to your account.</p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1.5 text-text-secondary hover:bg-muted">
              <X className="size-5" />
            </button>
          </div>

          <ol className="flex items-center gap-3 px-2" aria-label="Steps">
            {STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
                <div className="flex w-full items-center gap-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${i + 1 < step ? "border-transparent bg-primary-soft text-primary" : i + 1 === step ? "border-primary bg-primary text-primary-foreground" : "bg-card text-text-tertiary"}`}>{i + 1 < step ? <Check className="size-4" /> : i + 1}</span>
                  {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${i + 1 < step ? "bg-primary" : "bg-border"}`} />}
                </div>
                <span className={`self-start text-sm ${i + 1 === step ? "font-semibold text-primary" : "text-text-secondary"}`}>{label}</span>
              </li>
            ))}
          </ol>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="flex flex-col gap-3 rounded-xl border p-5">
              <h3 className="flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-sm text-primary">1</span>Open the Plato extension</h3>
              <p className="text-sm text-text-secondary">Click the Plato icon in your browser toolbar. If you can’t see it, click the puzzle icon and pin Plato.</p>
              <Button type="button" size="lg" className="h-11 gap-2" disabled={checking} onClick={() => void checkOpened()}>
                {checking ? <Loader2 className="size-4 animate-spin" /> : <Puzzle className="size-4" />}
                {checking ? "Checking…" : "I opened the Plato extension"}
              </Button>
              {hint && <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">{hint}</p>}
              <p className="text-center text-xs text-text-secondary">Can’t find it? Click the puzzle icon <Puzzle className="inline size-3.5 align-[-2px]" /> in your browser toolbar and pin Plato.</p>
              {/* How it looks in Chrome: toolbar, the puzzle (Extensions) button, and Plato pinned in the list */}
              <div aria-hidden className="relative mt-1 overflow-hidden rounded-xl border bg-muted/60 select-none">
                <div className="flex items-center justify-end gap-3 bg-[#2b2b33] px-4 py-3 text-white/80">
                  <Star className="size-4" />
                  <span className="relative flex size-8 items-center justify-center rounded-full bg-white/15 ring-2 ring-primary/70">
                    <Puzzle className="size-4 text-white" />
                    <MousePointer2 className="absolute -right-2 -bottom-3 size-5 fill-primary text-primary" />
                  </span>
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">P</span>
                </div>
                <div className="relative -mt-1 ml-auto mr-4 mb-4 w-[min(260px,85%)] rounded-lg border bg-card p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold">Extensions<X className="size-3.5 text-text-tertiary" /></div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">P</span>
                    <span className="flex-1 font-medium">Plato</span>
                    <Pin className="size-4 fill-primary text-primary" />
                    <MoreVertical className="size-4 text-text-tertiary" />
                  </div>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-xl border p-5">
              <h3 className="flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-sm text-primary">2</span>{connected ? "Connected" : "Enter the code in the extension"}</h3>
              {connected ? (
                <div className="flex flex-col gap-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-success"><Check className="size-4" />Your browser is linked to Plato.</p>
                  {queued ? (
                    <p className="text-text-secondary">{queued} job{queued === 1 ? " is" : "s are"} in your extension&apos;s queue. Open the extension and press <b>Start applying</b>.</p>
                  ) : (
                    <p className="text-text-secondary">None of these jobs can be applied by the extension.</p>
                  )}
                  {unsupported > 0 && <p className="text-sm text-warning">{unsupported} job{unsupported === 1 ? " is" : "s are"} on a site the extension can&apos;t apply on yet (for example listings from Himalayas or Remotive without a company apply form). Apply on the posting itself.</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => (setConnected(false), void newCode())}>Link another browser</Button>
                    <Button type="button" variant="ghost" onClick={() => router.push("/extension")}>Manage linked browsers</Button>
                  </div>
                </div>
              ) : code ? (
                <>
                  <p className="text-sm text-text-secondary">After opening the extension, enter this code to connect it to your account.</p>
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted px-4 py-3">
                    <span className="font-mono text-2xl font-bold tracking-widest select-all">{code.code}</span>
                    <button type="button" onClick={copy} aria-label="Copy code" className="rounded-md p-2 text-primary hover:bg-card">{copied ? <Check className="size-5" /> : <Copy className="size-5" />}</button>
                  </div>
                  <p className="text-xs text-text-tertiary tabular-nums" aria-live="polite">Valid for {left}s · one use · waiting for your browser…</p>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="size-4 animate-spin" />Getting your code…</p>
              )}
              {!connected && (
                <p className="text-xs text-text-tertiary">Already linked this browser? Just open the extension: this turns green by itself.</p>
              )}
            </section>
          </div>

          <p className="flex items-center gap-3 rounded-lg bg-primary-tint px-4 py-3 text-sm text-text-secondary">
            <Lock className="size-4 shrink-0 text-primary" />
            This only connects your browser. Nothing is applied from this page, and you stay in control.
          </p>
        </div>
  )
}
