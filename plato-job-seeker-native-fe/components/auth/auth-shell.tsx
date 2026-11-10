"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { PlatoMark } from "@/components/plato-orb";
import { AuthShowcase } from "./auth-showcase";

const GLOW = "pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_55%_at_0%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_65%),radial-gradient(60%_50%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_70%)]"

// Auth wears the product's spatial look so the first screen feels like the app
// behind it: the same drifting brand light, the showcase floating on it, and
// the form on a flat white card. The page is locked
// to the viewport; only the form card scrolls if it has to.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-app grid h-dvh grid-cols-1 overflow-hidden text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative isolate hidden min-h-0 overflow-hidden px-10 py-8 lg:flex lg:flex-col xl:px-14"
      >
        <span aria-hidden className="pointer-events-none absolute -top-40 -left-40 -z-10 size-[520px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)]" />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AuthShowcase />
        </div>
      </motion.aside>

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="flex min-h-0 flex-col p-3 sm:p-4"
      >
        <div className="surface-panel scroll-thin relative isolate flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[28px] px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
          {/* The brand glow the Home hero wears: cobalt from the top left, azure from the bottom right. */}
          <span aria-hidden className={GLOW} />
          <div className="mx-auto my-auto flex w-full max-w-[460px] flex-col">
            <Link
              href="/"
              className="mb-8 flex w-fit items-center gap-2.5 rounded-lg transition-opacity duration-200 hover:opacity-80 lg:hidden"
            >
              <PlatoMark size={36} />
              <span className="text-lg font-semibold">Plato</span>
            </Link>
            {children}
            <p className="mt-6 text-xs text-text-tertiary lg:hidden">
              Plato searches LinkedIn, Indeed, Google Jobs, Workable, Lever and
              more, ranks every posting against your profile and applies to the
              ones you pick.
            </p>
          </div>
        </div>
      </motion.main>
    </div>
  );
}

export { AuthShell };
