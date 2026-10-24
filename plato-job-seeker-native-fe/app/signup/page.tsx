import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthForm } from "@/components/auth-form"

export const metadata: Metadata = {
  title: "Sign up | Plato",
  description: "Create your Plato account. It searches, ranks and applies to jobs for you.",
}

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  )
}
