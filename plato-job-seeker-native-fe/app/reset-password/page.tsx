import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/account-forms"

export const metadata: Metadata = { title: "Choose a new password | Plato", description: "Set a new password for your Plato account." }

// The link from the reset email. useSearchParams needs a Suspense boundary to prerender.
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
