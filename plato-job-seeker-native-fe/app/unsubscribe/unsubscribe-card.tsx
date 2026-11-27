"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, BellOff, CheckCircle2, Link2Off, Loader2 } from "lucide-react"
import { PlatoMark } from "@/components/plato-orb"
import { StatIcon } from "@/components/plato-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { unsubscribe } from "@/lib/insights/api"
import { spring } from "@/lib/motion-system"

type State = "ask" | "busy" | "done" | "bad"
const ICON = "size-12 rounded-full [&_svg]:size-6"
const CTA = "group/cta h-10 px-5 shadow-md shadow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-lg hover:shadow-primary/35"
const ARROW = "size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5"

// A button, not an automatic unsubscribe on load: mail scanners open links, people press buttons.
export function UnsubscribeCard() {
  const reduced = !!useReducedMotion()
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<State>(token ? "ask" : "bad")
  // Whether digests still show in Plato: said only when they do.
  const [inApp, setInApp] = useState(true)

  const stop = () => {
    setState("busy")
    unsubscribe(token)
      .then((r) => {
        setInApp(r.in_app !== false)
        setState(r.ok ? "done" : "bad")
      })
      .catch(() => setState("bad"))
  }

  return (
    <motion.section initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.enter} className="relative isolate flex w-full max-w-md flex-col items-center gap-5 overflow-hidden rounded-2xl border bg-card p-8 text-center shadow-[0_30px_60px_-40px_rgba(0,91,167,0.6)]">
      {/* The Home hero's glow: cobalt from the top left, azure from the bottom right. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_65%),radial-gradient(60%_55%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_70%)]" />
      <PlatoMark size={44} />
      {state === "done" ? (
        <>
          <motion.span initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.enter, delay: 0.1 }}>
            <StatIcon icon={CheckCircle2} accent="green" className={ICON} />
          </motion.span>
          <div className="flex flex-col gap-1.5">
            <h1 className="type-section-title text-[20px]">You won&apos;t get alert emails any more</h1>
            <p className="type-body text-text-secondary">
              {inApp ? "Your alerts still collect new jobs in your Plato notifications. " : ""}You can turn emails back on from Alert settings on Following whenever you like.
            </p>
          </div>
          <Link href="/following" className={buttonVariants({ className: CTA })}>
            Open Following
            <ArrowRight className={ARROW} />
          </Link>
        </>
      ) : state === "bad" ? (
        <>
          <StatIcon icon={Link2Off} accent="amber" className={ICON} />
          <div className="flex flex-col gap-1.5">
            <h1 className="type-section-title text-[20px]">This link doesn&apos;t work</h1>
            <p className="type-body text-text-secondary">It may be incomplete. Sign in and turn off alert emails from Alert settings on Following instead.</p>
          </div>
          <Link href="/following" className="group/cta inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-hover">
            Go to Following
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
          </Link>
        </>
      ) : (
        <>
          <StatIcon icon={BellOff} className={ICON} />
          <div className="flex flex-col gap-1.5">
            <h1 className="type-section-title text-[20px]">Stop job alert emails?</h1>
            <p className="type-body text-text-secondary">You&apos;ll stop getting digest emails. Your alerts keep collecting new jobs in Plato.</p>
          </div>
          <Button onClick={stop} disabled={state === "busy"} className={CTA}>
            {state === "busy" && <Loader2 className="size-4 animate-spin" />}
            Stop the emails
          </Button>
        </>
      )}
    </motion.section>
  )
}
