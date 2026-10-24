import type { Metadata } from "next"
import { AuthShell } from "@/components/auth/auth-shell"
import { AuthForm } from "@/components/auth-form"

export const metadata: Metadata = {
  title: "Log in | Plato",
  description: "Log in to Plato, your AI job hunter.",
}

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  )
}
