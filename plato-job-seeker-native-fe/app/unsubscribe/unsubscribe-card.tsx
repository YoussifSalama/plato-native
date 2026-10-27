"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { BellOff, CheckCircle2, Loader2 } from "lucide-react"
import { PlatoMark } from "@/components/plato-orb"
import { unsubscribe } from "@/lib/insights/api"
import { spring } from "@/lib/motion-system"

type State = "ask" | "busy" | "done" | "bad"

// A button, not an automatic unsubscribe on load: mail scanners open links, people press buttons.
export function UnsubscribeCard() {
  const reduced = !!useReducedMotion()
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<State>(token ? "ask" : "bad")

  const stop = () => {
    setState("busy")
    unsubscribe(token)
      .then((r) => setState(r.ok ? "done" : "bad"))
      .catch(() => setState("bad"))
  }

  return (
    <motion.section initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.enter} className="relative flex w-full max-w-md flex-col items-center gap-5 overflow-hidden rounded-xl border bg-card p-8 text-center shadow-[0_30px_60px_-40px_rgba(79,63,247,0.6)]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(78,8,252,0.14),transparent_65%)]" />
      <PlatoMark size={44} />
      {state === "done" ? (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-bold">You won&apos;t get alert emails any more</h1>
            <p className="text-sm text-text-secondary">Your alerts still collect new jobs in Plato. You can turn emails back on from your job alerts page whenever you like.</p>
          </div>
          <Link href="/insights" className="flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Open job alerts
          </Link>
        </>
      ) : state === "bad" ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold">This link doesn&apos;t work</h1>
          <p className="text-sm text-text-secondary">It may be incomplete. Sign in and turn off alert emails from your job alerts page instead.</p>
          <Link href="/insights" className="mt-3 text-sm font-semibold text-primary hover:underline">
            Go to job alerts
          </Link>
        </div>
      ) : (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <BellOff className="size-6" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-bold">Stop job alert emails?</h1>
            <p className="text-sm text-text-secondary">You&apos;ll stop getting digest emails. New jobs keep showing in your Plato notifications.</p>
          </div>
          <button type="button" onClick={stop} disabled={state === "busy"} className="flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {state === "busy" && <Loader2 className="size-4 animate-spin" />}
            Stop the emails
          </button>
        </>
      )}
    </motion.section>
  )
}
