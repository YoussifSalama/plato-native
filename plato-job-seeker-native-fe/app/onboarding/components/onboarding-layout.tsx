"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "cn"
import { PlatoMark } from "@/components/plato-orb"
import { SpatialBackdrop } from "@/components/spatial-backdrop"
import { OnboardingAssistant } from "@/app/onboarding/components/onboarding-assistant"

// Three steps, as in the redesign (screens 01-03). The CV review moved into Profile.
export const STEPS = [
  { id: 1, name: "Documents" },
  { id: 2, name: "Preferences" },
  { id: 3, name: "Connect" },
] as const
export type Step = (typeof STEPS)[number]["id"]

// The onboarding chat's backend stages predate the 3-step flow: documents=1, preferences=3, ready=4.
const ASSISTANT_STAGE: Record<Step, 1 | 3 | 4> = { 1: 1, 2: 3, 3: 4 }

// Same spatial glass as the signed-in app, so the hand-off to Home is seamless.
function OnboardingLayout({ step, faqs, children }: { step: Step; faqs: string[]; children: ReactNode }) {
  const name = STEPS.find((s) => s.id === step)?.name
  return (
    <div className="theme-app glass-scope flex min-h-dvh flex-col text-foreground">
      <SpatialBackdrop />
      <header className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 pt-6 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Plato">
          <PlatoMark size={36} />
          <span className="text-[17px] font-extrabold tracking-[0.22em] text-primary">PLATO</span>
        </Link>
        <div className="flex items-center gap-4" aria-label={`Step ${step} of ${STEPS.length}: ${name}`}>
          <span className="eyebrow">
            Step {step} of {STEPS.length} · {name}
          </span>
          <span className="flex gap-1.5" aria-hidden>
            {STEPS.map((s) => (
              <span key={s.id} className={cn("h-[5px] w-8 rounded-full transition-colors", s.id <= step ? "bg-primary" : "bg-foreground/10")} />
            ))}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-1 flex-col px-4 pt-8 pb-28 sm:px-8 lg:pt-12">{children}</main>

      {/* Keyed per step so the transcript and quick prompts reset with the page. */}
      <OnboardingAssistant key={step} stage={ASSISTANT_STAGE[step]} faqs={faqs} />
    </div>
  )
}

// One footer on every step (SPEC U2): Back on the left, the next step on the right.
function OnboardingFooter({ back, hint, skip, next }: { back?: () => void; hint?: ReactNode; skip?: () => void; next: ReactNode }) {
  // Right padding keeps the primary button clear of the floating Plato launcher.
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-6 sm:pr-[210px]">
      <div className="flex flex-wrap items-center gap-4">
        {back && (
          <button type="button" onClick={back} className="glass-panel h-12 rounded-xl px-6 font-semibold text-foreground transition-colors hover:border-primary-line">
            Back
          </button>
        )}
        {hint && <span className="text-sm text-text-secondary">{hint}</span>}
      </div>
      <div className="flex items-center gap-4">
        {skip && (
          <button type="button" onClick={skip} className="font-semibold text-primary hover:underline">
            Skip for now
          </button>
        )}
        {next}
      </div>
    </div>
  )
}

export { OnboardingLayout, OnboardingFooter }
