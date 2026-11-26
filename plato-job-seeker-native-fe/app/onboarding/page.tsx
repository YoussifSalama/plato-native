"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { OnboardingLayout, type Step } from "@/app/onboarding/components/onboarding-layout"
import { BuildProfileStep } from "@/app/onboarding/steps/build-profile"
import { PreferencesStep } from "@/app/onboarding/steps/preferences"
import { ConnectStep } from "@/app/onboarding/steps/connect"
import { getMe, safeNext } from "@/lib/auth/api"

// Documents → Preferences → Connect (SPEC §4). Older links used ?step=3 for preferences
// and ?step=4 for the end, so those land on the matching new step.
function parseStep(raw: string | null): Step {
  if (raw === "connect" || raw === "4") return 3
  return raw === "2" || raw === "3" ? 2 : 1
}

const FAQS_BY_STEP: Record<Step, string[]> = {
  1: ["What documents should I upload?", "How is my data used?", "Can I update my resume later?"],
  2: ["What happens next?", "Can I change this later?", "How do you find jobs for me?"],
  3: ["Why do I need the extension?", "Is it safe?", "Can I skip this?"],
}

function OnboardingPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const step = parseStep(params.get("step"))
  // Step 3 is reached as ?step=connect so old ?step=3 links still mean preferences.
  const goTo = (next: Step) => router.push(next === 3 ? "/onboarding?step=connect" : `/onboarding?step=${next}`)
  // Editing from Profile (?return=/profile…) once onboarding is done: Save and Cancel
  // go back there instead of walking the rest of the wizard. Only paths in this app.
  const raw = params.get("return")
  const back = safeNext(raw)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (back) getMe().then((me) => setDone(me.onboarding_completed !== false)).catch(() => undefined)
  }, [back])
  const editing = !!back && done

  return (
    <OnboardingLayout step={step} faqs={FAQS_BY_STEP[step]}>
      {step === 1 && <BuildProfileStep onContinue={() => goTo(2)} />}
      {step === 2 && (editing ? <PreferencesStep editing onBack={() => router.push(back)} onContinue={() => router.push(back)} /> : <PreferencesStep onBack={() => goTo(1)} onContinue={() => goTo(3)} />)}
      {step === 3 && <ConnectStep onBack={() => goTo(2)} onDone={() => router.push("/")} />}
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
