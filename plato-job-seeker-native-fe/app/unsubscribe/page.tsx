import type { Metadata } from "next"
import { Suspense } from "react"
import { UnsubscribeCard } from "./unsubscribe-card"

export const metadata: Metadata = {
  title: "Stop alert emails | Plato",
  description: "Stop Plato job alert emails.",
}

// The link at the bottom of every job alert email. No login: the token in the link is the proof.
export default function UnsubscribePage() {
  return (
    <main className="theme-app flex min-h-dvh items-center justify-center bg-background bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[size:22px_22px] px-4 py-10 text-foreground">
      <Suspense>
        <UnsubscribeCard />
      </Suspense>
    </main>
  )
}
