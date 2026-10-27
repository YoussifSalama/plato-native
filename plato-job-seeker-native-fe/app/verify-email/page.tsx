import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/auth/auth-shell"
import { VerifyEmailCard } from "@/components/auth/account-forms"

export const metadata: Metadata = { title: "Confirm your email | Plato", description: "Confirm the email on your Plato account." }

// The link from the welcome email. No login needed: the token is the proof.
export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense>
        <VerifyEmailCard />
      </Suspense>
    </AuthShell>
  )
}
