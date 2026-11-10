"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"
import { OnboardingAssistant } from "@/app/onboarding/components/onboarding-assistant"
import { PageTour } from "@/components/page-tour"

// Three steps, as in the business owner's screens 01-03.
export const STEPS = [
  { id: 1, name: "Documents" },
  { id: 2, name: "Preferences" },
  { id: 3, name: "Connect" },
] as const
export type Step = (typeof STEPS)[number]["id"]

// The onboarding chat's backend stages predate the 3-step flow: documents=1, preferences=3, ready=4.
const ASSISTANT_STAGE: Record<Step, 1 | 3 | 4> = { 1: 1, 2: 3, 3: 4 }

// Flat paper page: the PLATO logo on the left, "STEP n OF 3 · NAME" and three bars on the right.
function OnboardingLayout({ step, faqs, children }: { step: Step; faqs: string[]; children: ReactNode }) {
  const name = STEPS.find((s) => s.id === step)?.name
  const reduced = !!useReducedMotion()
  return (
    <div className="theme-app relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      {/* The soft brand glow behind the page head, as on Home. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(45%_70%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_65%),radial-gradient(40%_60%_at_100%_0%,color-mix(in_oklch,var(--azure)_8%,transparent),transparent_70%)]" />
      <header className="flex w-full flex-wrap items-center justify-between gap-4 px-4 pt-7 sm:px-11">
        <Link href="/" className="flex items-center gap-3 rounded-lg transition-opacity duration-200 hover:opacity-80" aria-label="Plato">
          <PlatoMark size={40} />
          <span className="text-[19px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
        </Link>
        <div data-tour="onboarding-progress" className="flex items-center gap-3 sm:gap-4" aria-label={`Step ${step} of ${STEPS.length}: ${name}`}>
          <span className="font-mono text-[11px] tracking-[0.18em] whitespace-nowrap text-text-secondary uppercase sm:text-[13px]">
            Step {step} of {STEPS.length} · <span className="font-semibold text-primary">{name}</span>
          </span>
          {/* Each bar fills left to right as the step is reached; the current one is longer. */}
          <span className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((s) => (
              <span key={s.id} className={cn("relative h-[5px] overflow-hidden rounded-full bg-foreground/10 transition-[width] duration-500 ease-out", s.id === step ? "w-12" : "w-8")}>
                <motion.span initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: s.id <= step ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.6, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : 0.15 + (s.id - 1) * 0.12 }} className="absolute inset-0 origin-left rounded-full bg-brand-gradient" />
              </span>
            ))}
          </span>
        </div>
      </header>

      {/* Keyed by step so each step fades up on arrival. */}
      <main key={`main-${step}`} className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-4 pt-8 pb-32 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 sm:px-11">
        {children}
      </main>

      {/* The native Plato chat, keyed per step so the transcript and quick prompts reset with the page. */}
      <OnboardingAssistant key={step} stage={ASSISTANT_STAGE[step]} faqs={faqs} />
      {/* "Tour this page", just above the Plato launcher, as in the app. */}
      <PageTour />
    </div>
  )
}

export { OnboardingLayout }
