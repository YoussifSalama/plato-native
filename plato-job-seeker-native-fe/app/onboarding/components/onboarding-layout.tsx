"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"
import { OnboardingAssistant } from "@/app/onboarding/components/onboarding-assistant"

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
  return (
    <div className="theme-app flex min-h-dvh flex-col bg-[#f3f6fa] text-foreground">
      <header className="flex w-full flex-wrap items-center justify-between gap-4 px-4 pt-7 sm:px-11">
        <Link href="/" className="flex items-center gap-3" aria-label="Plato">
          <PlatoMark size={40} />
          <span className="text-[19px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
        </Link>
        <div className="flex items-center gap-4" aria-label={`Step ${step} of ${STEPS.length}: ${name}`}>
          <span className="font-mono text-[13px] tracking-[0.18em] text-text-secondary uppercase">
            Step {step} of {STEPS.length} · {name}
          </span>
          <span className="flex gap-1.5" aria-hidden>
            {STEPS.map((s) => (
              <span key={s.id} className={cn("h-[5px] w-8 rounded-full", s.id <= step ? "bg-primary" : "bg-foreground/10")} />
            ))}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-4 pt-8 pb-28 sm:px-11">{children}</main>

      {/* The native Plato chat, keyed per step so the transcript and quick prompts reset with the page. */}
      <OnboardingAssistant key={step} stage={ASSISTANT_STAGE[step]} faqs={faqs} />
    </div>
  )
}

export { OnboardingLayout }
