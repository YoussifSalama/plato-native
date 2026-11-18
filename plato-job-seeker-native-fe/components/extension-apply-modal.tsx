"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Lock, MoreVertical, MousePointer2, Pin, Puzzle, Star, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InfoTip } from "@/components/info-tip"
import { getExtensionProgress, startPairing, type PairingCode } from "@/lib/extension/api"
import { queueForExtension } from "@/lib/jobs/api"
import { createApplyBatch } from "@/lib/extension/api"
import { askExtension } from "@/components/extension-auto-link"

// "Apply with Plato": first the seeker picks how (owner, 2026-11-18):
//  - Apply now: the jobs are queued and the extension is told to start them as a batch at once (it opens its panel
//    when Chrome lets it; otherwise the seeker clicks the Plato icon and it starts by itself);
//  - Mark to apply via extension: the jobs are only queued, ticked in the panel for the seeker to start there.
// Nothing is applied from the web; the extension does the applying. Not linked yet: the same 3 connect steps.
// `resumes`: per job, chosen on the review screen (their own CV, or the approved tailored one).
// `reapply`: how many of these Plato already marked as sent; picking them again is the seeker's call.
type Req = { top?: number; jobIds?: string[]; threadId?: string; resumes?: Record<string, "profile" | "tailored">; reapply?: number }
type Mode = "now" | "mark"

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
  const [mode, setMode] = useState<Mode | null>(null)
  if (!mode) return <Choose count={count} reapply={req.reapply ?? 0} onPick={setMode} onClose={onClose} />
  return <Connect count={count} req={req} mode={mode} onClose={onClose} />
}

function Choose({ count, reapply, onPick, onClose }: { count: number; reapply: number; onPick: (m: Mode) => void; onClose: () => void }) {
  const jobs = `${count} job${count === 1 ? "" : "s"}`
  return (
    <div className="flex flex-col gap-5 p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold">Apply to {jobs}?</h2>
          <p className="text-sm text-text-secondary">Plato applies in your browser with the Plato extension. Start now, or keep them ticked in the extension for later.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1.5 text-text-secondary hover:bg-muted">
          <X className="size-5" />
        </button>
      </div>
      {reapply > 0 && (
        <p role="note" className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {reapply === 1 ? "1 of these jobs is" : `${reapply} of these jobs are`} already marked as applied. Plato sends a new application if you go on: check the site or your email first if you are not sure.
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={() => onPick("mark")}>Mark to apply via extension</Button>
        <Button type="button" size="lg" onClick={() => onPick("now")}>Apply now</Button>
      </div>
    </div>
  )
}

function Connect({ count, req, mode, onClose }: { count: number; req: Req; mode: Mode; onClose: () => void }) {
  const router = useRouter()
  const [jobIds, setJobIds] = useState<string[]>([]) // queued for the extension: what "Apply now" hands it
  const [started, setStarted] = useState(false) // the extension took the "Apply now"
  const [sentBefore, setSentBefore] = useState<string[]>([]) // refused as already sent: the seeker decides
  const [againBusy, setAgainBusy] = useState(false)
  // "Apply again anyway": queue the ones Plato marked as sent, with the seeker's explicit go-ahead.
  const applyAgain = async () => {
    setAgainBusy(true)
    try {
      const b = await createApplyBatch(sentBefore, req.resumes, true)
      setQueued((q) => (q ?? 0) + b.items.length)
      setJobIds((ids) => [...ids, ...b.items.map((i) => i.job_id)])
      setSentBefore([])
    } catch {
      setError("Could not add those jobs. Try again.")
    } finally {
      setAgainBusy(false)
    }
  }
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
        const { resumes, reapply, ...queueReq } = JSON.parse(reqKey) as Req
        const r = await queueForExtension(queueReq)
        if (!alive) return
        // straight into the extension's queue: they show up in the panel as waiting jobs
        const b = r.jobIds?.length ? await createApplyBatch(r.jobIds, resumes, !!reapply).catch(() => null) : null
        if (!alive) return
        const sent = b?.rejected.filter((x) => x.reason === "applied").map((x) => x.job_id) ?? []
        setSentBefore(sent)
        setJobIds((r.jobIds ?? []).filter((id) => !sent.includes(id)))
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

  // "Apply now": tell the extension to start these jobs. Not installed or not linked yet: ask again every 3 s while
  // this is open, so installing / linking it now still starts the batch. Held while the seeker decides on the
  // ones already sent, so they join the same batch.
  useEffect(() => {
    if (mode !== "now" || !jobIds.length || started || sentBefore.length) return
    let alive = true
    const send = async () => {
      const r = await askExtension({ type: "plato:apply-now", jobIds })
      if (!alive || !r?.linked) return
      setStarted(true)
      setConnected(true) // the extension answered: it is linked here
    }
    void send()
    const id = setInterval(() => void send(), 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [mode, jobIds, started, sentBefore.length])

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
          {sentBefore.length > 0 && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning sm:flex-row sm:items-center">
              <p className="flex flex-1 items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {sentBefore.length === 1 ? "1 job is" : `${sentBefore.length} jobs are`} already marked as applied, so Plato didn&apos;t add {sentBefore.length === 1 ? "it" : "them"}. Apply again only if you are sure it didn&apos;t go through: check the site or your email first.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={againBusy} onClick={() => setSentBefore([])}>Skip</Button>
                <Button type="button" variant="outline" size="sm" disabled={againBusy} onClick={() => void applyAgain()}>{againBusy && <Loader2 className="size-4 animate-spin" />}Apply again anyway</Button>
              </div>
            </div>
          )}

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
                  <Image src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-md bg-white p-0.5" />
                </div>
                <div className="relative -mt-1 ml-auto mr-4 mb-4 w-[min(260px,85%)] rounded-lg border bg-card p-3 shadow-lg">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold">Extensions<X className="size-3.5 text-text-tertiary" /></div>
                  <div className="flex items-center gap-2 text-sm">
                    <Image src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-md bg-white p-0.5" />
                    <span className="flex-1 font-medium">Plato</span>
                    <Pin className="size-4 fill-primary text-primary" />
                    <MoreVertical className="size-4 text-text-tertiary" />
                  </div>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-xl border p-5">
              <h3 className="flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-md bg-primary-soft text-sm text-primary">2</span>{connected ? "Connected" : "Enter the code in the extension"}
                {!connected && <InfoTip text="A one-time code that links the Plato extension in this browser to your account. It works once, and a fresh one replaces it when the timer runs out." label="What the pairing code is" />}
              </h3>
              {connected ? (
                <div className="flex flex-col gap-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-success"><Check className="size-4" />Your browser is linked to Plato.</p>
                  {queued && started ? (
                    <p className="text-text-secondary">
                      Plato is starting {queued} job{queued === 1 ? "" : "s"} in the extension now. If its panel didn&apos;t open by itself, click the Plato icon in your toolbar: the batch starts on its own.
                    </p>
                  ) : queued ? (
                    <p className="text-text-secondary">
                      {queued} job{queued === 1 ? " is" : "s are"} in your extension&apos;s queue. Open the extension and press <b>Start applying</b>.{" "}
                      <InfoTip className="align-[-3px]" text="Queued jobs wait in the extension. Nothing is sent until you press Start applying there; it then fills each form in this browser." label="What the extension queue is" />
                    </p>
                  ) : sentBefore.length ? null : (
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
