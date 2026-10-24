"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { OnboardingLayout } from "@/app/onboarding/components/onboarding-layout"
import { BuildProfileStep } from "@/app/onboarding/steps/build-profile"
import { ConfirmInformationStep } from "@/app/onboarding/steps/confirm-information"
import { PreferencesStep } from "@/app/onboarding/steps/preferences"
import { ReadyStep } from "@/app/onboarding/steps/ready"

function parseStep(raw: string | null): 1 | 2 | 3 | 4 {
  const n = Number(raw)
  return n === 2 || n === 3 || n === 4 ? n : 1
}

const FAQS_BY_STEP: Record<1 | 2 | 3 | 4, string[]> = {
  1: ["What documents should I upload?", "How is my data used?", "Can I update my resume later?"],
  2: ["What if something is wrong?", "Why do date ranges differ?", "I'll review this later"],
  3: ["What happens next?", "Can I change this later?", "How do you find jobs for me?"],
  4: ["What did you find for me?", "Can I change my preferences?", "How does matching work?"],
}

function OnboardingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = parseStep(searchParams.get("step"))

  function goToStep(next: 1 | 2 | 3 | 4) {
    router.push(`/onboarding?step=${next}`)
  }

  return (
    <OnboardingLayout step={step} faqs={FAQS_BY_STEP[step]}>
      {step === 1 && <BuildProfileStep onContinue={() => goToStep(2)} />}
      {step === 2 && <ConfirmInformationStep onContinue={() => goToStep(3)} />}
      {step === 3 && <PreferencesStep onContinue={() => goToStep(4)} />}
      {step === 4 && <ReadyStep />}
    </OnboardingLayout>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageContent />
    </Suspense>
  )
}
