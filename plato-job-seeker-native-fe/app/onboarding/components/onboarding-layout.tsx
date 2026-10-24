"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Check, HelpCircle } from "lucide-react"
import { cn } from "cn"
import { getMe, type AuthUser } from "@/lib/auth/api"
import { PlatoMark } from "@/components/plato-orb"
import { OnboardingAssistant } from "@/app/onboarding/components/onboarding-assistant"

const STEPS = [
  { id: 1, label: "Build profile", hint: "Upload your CV and evidence" },
  { id: 2, label: "Confirm information", hint: "Review what Plato found" },
  { id: 3, label: "Preferences", hint: "What you're looking for" },
  { id: 4, label: "Ready", hint: "Start your first search" },
] as const

function initials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

// Onboarding wears the product palette (.theme-app) and the same
// header / rail / content rhythm as the app shell, so the hand-off to /jobs
// is seamless.
function OnboardingLayout({ step, faqs, children }: { step: 1 | 2 | 3 | 4; faqs: string[]; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  return (
    <div className="theme-app flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/90 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-2.5">
          <PlatoMark size={32} />
          <span className="text-lg font-semibold">Plato</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-medium text-text-tertiary sm:inline">
            Step {step} of {STEPS.length}
          </span>
          {user && (
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" title={user.full_name}>
              {initials(user.full_name)}
            </span>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[264px_1fr]">
        <nav className="hidden border-r bg-card px-5 py-7 lg:flex lg:flex-col">
          <p className="mb-4 px-2 text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">Set up Plato</p>
          <ol className="flex flex-col">
            {STEPS.map((s, i) => {
              const isCompleted = s.id < step
              const isCurrent = s.id === step
              const isDisabled = s.id > step
              const canJump = isCompleted
              const row = (
                <>
                  <span className="flex flex-col items-center">
                    <span className="relative flex size-7 shrink-0 items-center justify-center">
                      {isCurrent && <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />}
                      <span
                        className={cn(
                          "relative flex size-7 items-center justify-center rounded-full border text-[11px] font-semibold",
                          isCompleted && "border-primary bg-primary text-primary-foreground",
                          isCurrent && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                          isDisabled && "border-border bg-background text-text-tertiary",
                        )}
                      >
                        {isCompleted ? <Check className="size-3.5" /> : s.id}
                      </span>
                    </span>
                    {i < STEPS.length - 1 && <span className={cn("my-1 h-7 w-px", isCompleted ? "bg-primary/40" : "bg-border")} />}
                  </span>
                  <span className="flex min-w-0 flex-col pt-1">
                    <span className={cn("text-sm font-semibold", isCurrent ? "text-foreground" : isCompleted ? "text-text-secondary" : "text-text-tertiary")}>{s.label}</span>
                    <span className={cn("text-xs", isCurrent ? "text-text-secondary" : "text-text-tertiary")}>{s.hint}</span>
                  </span>
                </>
              )
              return (
                <li key={s.id}>
                  {canJump ? (
                    <Link href={`/onboarding?step=${s.id}`} className="flex items-start gap-3 rounded-md px-2 py-1 hover:bg-muted/60">
                      {row}
                    </Link>
                  ) : (
                    <div className={cn("flex items-start gap-3 rounded-md px-2 py-1", isCurrent && "bg-primary-soft/60")}>{row}</div>
                  )}
                </li>
              )
            })}
          </ol>

          <a href="#" className="mt-auto flex items-center gap-2 px-2 pt-8 text-sm text-text-tertiary hover:text-foreground">
            <HelpCircle className="size-4" />
            Help &amp; Support
          </a>
        </nav>

        {/* Mobile stepper */}
        <ol className="flex items-center gap-2 overflow-x-auto border-b bg-card px-4 py-3 lg:hidden">
          {STEPS.map((s) => (
            <li key={s.id} className={cn("flex shrink-0 items-center gap-1.5 text-xs font-medium", s.id === step ? "text-primary" : s.id < step ? "text-text-secondary" : "text-text-tertiary")}>
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", s.id <= step ? "bg-primary text-primary-foreground" : "bg-muted")}>{s.id < step ? <Check className="size-3" /> : s.id}</span>
              {s.label}
            </li>
          ))}
        </ol>

        <main className="flex min-w-0 flex-col px-4 py-6 pb-28 sm:px-6 lg:px-10 lg:py-8">
          <div className="w-full flex-1">{children}</div>

        </main>
      </div>

      {/* Keyed per step so the transcript and quick prompts reset with the page. */}
      <OnboardingAssistant key={step} stage={step} faqs={faqs} />
    </div>
  )
}

export { OnboardingLayout }
