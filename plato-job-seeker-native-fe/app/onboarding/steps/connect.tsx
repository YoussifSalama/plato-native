"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Copy, Loader2, Plus, Puzzle } from "lucide-react"
import { cn } from "cn"
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
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 pt-6">
      <ExtensionAutoLink />
      <div>
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[40px]">Connect Plato Apply</h1>
        <p className="mt-3 text-[16.5px] leading-relaxed text-text-secondary">Plato applies to jobs through its free Chrome extension. Connect it once and you’re done.</p>
      </div>

      <ol className="flex flex-col divide-y divide-divider rounded-2xl border bg-card px-6 shadow-card">
        <li className="flex flex-wrap items-center gap-4 py-5">
          <StepDot n={1} done={linked} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">Add Plato Apply to Chrome</p>
            <p className="text-sm text-text-secondary">{STORE_URL ? "Free. Takes about 10 seconds." : "Free. It isn’t on the Chrome Web Store yet; the Extension page shows how to install it."}</p>
          </div>
          {STORE_URL ? (
            <a href={STORE_URL} target="_blank" rel="noreferrer" data-ai="onboarding.add-to-chrome" className="flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary-line">
              <Plus className="size-4" />
              Add to Chrome
            </a>
          ) : (
            <Link href="/extension" className="flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary-line">
              <Puzzle className="size-4" />
              How to install
            </Link>
          )}
        </li>
        <li className="flex items-start gap-4 py-5">
          <StepDot n={2} done={linked} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="text-base font-bold">Open it and paste your code</p>
              <p className="text-sm text-text-secondary">Logged in here? Plato Apply links itself as soon as it’s installed. Otherwise click the Plato icon in Chrome’s toolbar and paste the code there.</p>
            </div>
            {linked ? (
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success-ink">
                <Check className="size-4" />
                Connected on this browser
              </span>
            ) : pairing ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[26px] font-medium tracking-[0.2em] select-all" data-ai="onboarding.code">
                  {pairing.code}
                </span>
                <Button variant="outline" size="sm" onClick={copy} className="gap-1.5 rounded-lg">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <span className="text-xs text-text-tertiary tabular-nums" aria-live="polite">
                  Works once · {left}s left
                </span>
              </div>
            ) : (
              <Button data-ai="onboarding.get-code" onClick={getCode} disabled={busy} className="h-11 w-fit gap-2 rounded-xl px-5">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Get my code
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </li>
      </ol>

      {/* Screen 03: Continue then Back on the left, Skip for now on the right. */}
      <div className="flex flex-wrap items-center gap-4">
        <Button data-ai="onboarding.finish" onClick={onDone} className="h-14 rounded-xl px-8 text-[17px]">
          Continue
        </Button>
        <Button variant="outline" onClick={onBack} className="h-14 rounded-xl bg-card px-6 text-[17px]">
          Back
        </Button>
        {!linked && (
          <button type="button" onClick={onDone} className="ml-auto text-[17px] font-semibold text-primary hover:underline">
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", done ? "bg-success-soft text-success-ink" : "bg-primary-soft text-primary")}>{done ? <Check className="size-4" /> : n}</span>
}

export { ConnectStep }
