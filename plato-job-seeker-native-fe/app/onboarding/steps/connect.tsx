"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, CircleAlert, Copy, KeyRound, Loader2, Plus, Puzzle } from "lucide-react"
import { cn } from "cn"
import { InfoTip } from "@/components/info-tip"
import { Button } from "@/components/ui/button"
import { getExtensionProgress, startPairing, type PairingCode } from "@/lib/extension/api"
import { ExtensionAutoLink } from "@/components/extension-auto-link"

// The Chrome Web Store page, once the extension is published. Until then: install help.
const STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_STORE_URL

// Step 3 (screen 03): link the Plato Apply extension with a one-time code.
// The extension does the applying, in the seeker's own browser.
function ConnectStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [left, setLeft] = useState(0)
  const [linked, setLinked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already linked (a returning seeker), or linked while the code is on screen.
  useEffect(() => {
    let alive = true
    const check = () =>
      getExtensionProgress()
        .then((p) => alive && setLinked(p.linked))
        .catch(() => undefined)
    check()
    const id = pairing && !linked ? setInterval(check, 3000) : undefined
    return () => {
      alive = false
      if (id) clearInterval(id)
    }
  }, [pairing, linked])

  // Linked by itself (logged in here with Plato Apply installed: components/extension-auto-link).
  useEffect(() => {
    const on = () => setLinked(true)
    window.addEventListener("plato:extension-linked", on)
    return () => window.removeEventListener("plato:extension-linked", on)
  }, [])

  useEffect(() => {
    if (!pairing) return
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(pairing.expires_at).getTime() - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) setPairing(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pairing])

  async function getCode() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setPairing(await startPairing())
    } catch {
      setError("Could not make a code. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    if (!pairing) return
    try {
      await navigator.clipboard.writeText(pairing.code)
      setCopied(true)
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  }

  return (
    <div data-tour-state={linked ? "onboarding.connect-linked" : "onboarding.connect"} className="mx-auto flex w-full max-w-[720px] flex-col gap-8 pt-6">
      <ExtensionAutoLink />
      <div>
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[40px]">Connect Plato Apply</h1>
        <p className="mt-3 text-[16.5px] leading-relaxed text-text-secondary">Plato applies to jobs through its free Chrome extension. Connect it once and you’re done.</p>
      </div>

      <ol className="relative isolate flex flex-col divide-y divide-divider overflow-hidden rounded-2xl border bg-card px-6 shadow-card">
        {/* The Home hero's glow: cobalt from the top left, azure from the bottom right. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_0%_0%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_60%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklch,var(--azure)_8%,transparent),transparent_65%)]" />
        <li data-tour="onboarding-install" className="flex flex-wrap items-center gap-4 py-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500">
          <StepDot n={1} done={linked} />
          <div className="min-w-0 flex-1">
            <p className="type-card-title text-base">Add Plato Apply to Chrome</p>
            <p className="text-sm text-text-secondary">{STORE_URL ? "Free. Takes about 10 seconds." : "Free. It isn’t on the Chrome Web Store yet; the Extension page shows how to install it."}</p>
          </div>
          {STORE_URL ? (
            <a href={STORE_URL} target="_blank" rel="noreferrer" data-ai="onboarding.add-to-chrome" className="group/ext flex h-11 items-center gap-2 rounded-xl bg-primary-soft px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
              <Plus className="size-4 transition-transform duration-200 group-hover/ext:rotate-90" />
              Add to Chrome
            </a>
          ) : (
            <Link href="/extension" className="group/ext flex h-11 items-center gap-2 rounded-xl bg-primary-soft px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
              <Puzzle className="size-4 transition-transform duration-200 group-hover/ext:scale-110" />
              How to install
            </Link>
          )}
        </li>
        <li data-tour="onboarding-pair" className="flex items-start gap-4 py-5 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both delay-100 duration-500">
          <StepDot n={2} done={linked} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="type-card-title text-base">Open it and paste your code</p>
              <p className="text-sm text-text-secondary">Logged in here? Plato Apply links itself as soon as it’s installed. Otherwise click the Plato icon in Chrome’s toolbar and paste the code there.</p>
            </div>
            {linked ? (
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success-ink animate-in fade-in-0 zoom-in-95 duration-300">
                <Check className="size-4" />
                Connected on this browser
              </span>
            ) : pairing ? (
              <div className="flex flex-wrap items-center gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                <span className="rounded-lg border border-primary-line bg-primary-tint px-3 py-1 font-mono text-[26px] font-medium tracking-[0.2em] text-primary select-all" data-ai="onboarding.code">
                  {pairing.code}
                </span>
                <Button variant="outline" size="sm" onClick={copy} className="gap-1.5 rounded-lg transition-colors duration-200 hover:border-primary-line hover:text-primary">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <span className="text-xs text-text-tertiary tabular-nums" aria-live="polite">
                  Works once · {left}s left
                </span>
                <InfoTip text="A one-time code that links Plato Apply in this browser to your account. It stops working after one use or when the timer runs out; get a new one if it does." label="What the pairing code is" />
              </div>
            ) : (
              <Button data-ai="onboarding.get-code" onClick={getCode} disabled={busy} className="h-11 w-fit gap-2 rounded-xl bg-primary-soft px-5 text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Get my code
              </Button>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}
          </div>
        </li>
      </ol>

      {/* Screen 03: Continue then Back on the left, Skip for now on the right. */}
      <div className="flex flex-wrap items-center gap-4">
        <Button data-ai="onboarding.finish" onClick={onDone} className="group/cta h-14 gap-2 rounded-xl px-8 text-[17px] shadow-md shadow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-primary/35">
          Continue
          <ArrowRight className="size-5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
        </Button>
        <Button variant="outline" onClick={onBack} className="h-14 rounded-xl bg-card px-6 text-[17px] transition-colors duration-200 hover:border-primary-line hover:text-primary">
          Back
        </Button>
        {!linked && (
          <button type="button" data-tour="onboarding-skip" onClick={onDone} className="ml-auto text-[17px] font-semibold text-primary underline-offset-4 transition-colors duration-200 hover:text-primary-hover hover:underline">
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset transition-colors duration-300", done ? "bg-success-soft text-success-ink ring-success/15" : "bg-primary-soft text-primary ring-primary/15")}>{done ? <Check className="size-4" /> : n}</span>
}

export { ConnectStep }
