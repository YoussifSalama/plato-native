"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { PlatoMark } from "@/components/plato-orb";
import { SpatialBackdrop } from "@/components/spatial-backdrop";
import { AuthShowcase } from "./auth-showcase";

// Auth wears the product's spatial look so the first screen feels like the app
// behind it: the same drifting brand light, the showcase floating on it, and
// the form on a frosted glass card (the sidebar's shape). The page is locked
// to the viewport; only the form card scrolls if it has to.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-app glass-scope grid h-dvh grid-cols-1 overflow-hidden text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <SpatialBackdrop />
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative hidden min-h-0 overflow-hidden px-10 py-8 lg:flex lg:flex-col xl:px-14"
      >
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
        <div className="glass-panel scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[28px] px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
          <div className="my-auto flex w-full flex-col">
            <Link
              href="/"
              className="mb-8 flex w-fit items-center gap-2.5 lg:hidden"
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
