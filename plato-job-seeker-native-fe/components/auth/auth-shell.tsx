"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { PlatoMark } from "@/components/plato-orb"
import { AuthShowcase } from "./auth-showcase"

// Auth wears the product palette (.theme-app) so the first screen looks like
// the app behind it. Showcase on the left, plain form on the right. The page
// is locked to the viewport; only the form column scrolls if it has to.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-app grid h-dvh grid-cols-1 overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative hidden min-h-0 overflow-hidden border-r bg-linear-to-br from-primary-tint via-background to-primary-soft/60 px-10 py-8 lg:flex lg:flex-col xl:px-14"
      >
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-info/10 blur-3xl" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AuthShowcase />
        </div>
      </motion.aside>

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="scroll-thin flex min-h-0 flex-col overflow-y-auto bg-card px-6 py-8 sm:px-10 lg:px-14 xl:px-20"
      >
        <div className="my-auto flex w-full flex-col">
          <Link href="/" className="mb-8 flex w-fit items-center gap-2.5 lg:hidden">
            <PlatoMark size={36} />
            <span className="text-lg font-semibold">Plato</span>
          </Link>
          {children}
          <p className="mt-6 text-xs text-text-tertiary lg:hidden">
            Plato searches LinkedIn, Indeed, Google Jobs, Workable, Lever and more, ranks every posting against your profile and applies to the ones you pick.
          </p>
        </div>
      </motion.main>
    </div>
  )
}

export { AuthShell }
