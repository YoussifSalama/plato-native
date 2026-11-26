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
        className="relative isolate m-3 mr-0 hidden min-h-0 overflow-hidden rounded-[28px] bg-[radial-gradient(60%_60%_at_50%_45%,#0b4f96_0%,#08264c_50%,#050b16_100%)] px-10 py-8 text-white sm:m-4 sm:mr-0 lg:flex lg:flex-col xl:px-14"
      >
        {/* The identity: the landing's and the search's night-blue hero, with its light beams. */}
        <span aria-hidden className="pointer-events-none absolute -z-10 rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(169,220,247,.45)_35%,rgba(0,161,226,.3)_70%,transparent)] top-[-180px] left-[66%] h-[900px] w-10 rotate-[34deg] opacity-50 shadow-[0_0_60px_rgba(63,180,238,.5)]" />
        <span aria-hidden className="pointer-events-none absolute -z-10 rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(169,220,247,.45)_35%,rgba(0,161,226,.3)_70%,transparent)] top-[55%] left-[-6%] h-[620px] w-8 -rotate-[56deg] opacity-30" />
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
        <div
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return
            const r = e.currentTarget.getBoundingClientRect()
            e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`)
            e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`)
          }}
          className="group/panel surface-panel scroll-thin relative isolate flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-[28px] px-6 py-8 sm:px-10 lg:px-12 xl:px-16"
        >
          {/* The brand glow the Home hero wears: cobalt from the top left, azure from the bottom right. */}
          <span aria-hidden className={GLOW} />
          {/* A soft light that follows the mouse across the panel (mouse only; none with reduced motion). */}
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(420px_circle_at_var(--sx,50%)_var(--sy,50%),color-mix(in_oklch,var(--primary)_7%,transparent),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover/panel:opacity-100 motion-reduce:hidden" />
          {/* Phones and tablets: the night-blue identity as a short band (the hero side is hidden there). */}
          <div className="relative isolate -mx-6 -mt-8 mb-8 shrink-0 overflow-hidden bg-[radial-gradient(70%_90%_at_50%_30%,#0b4f96_0%,#08264c_55%,#050b16_100%)] px-6 pt-6 pb-7 text-white sm:-mx-10 sm:px-10 lg:hidden">
            <span aria-hidden className="pointer-events-none absolute top-[-120px] left-[70%] -z-10 h-[360px] w-7 rotate-[34deg] rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(169,220,247,.45)_35%,rgba(0,161,226,.3)_70%,transparent)] opacity-40" />
            <Link href="/" className="flex w-fit items-center gap-2.5 rounded-lg transition-opacity duration-200 hover:opacity-80">
              <PlatoMark size={32} />
              <span className="text-[17px] font-semibold">Plato Job Seeker</span>
            </Link>
            <p className="mt-5 text-[22px] leading-tight font-medium tracking-[-0.03em]">
              Upload your CV. <span className="bg-[linear-gradient(90deg,#7cc8ff,#3fb4ee_45%,#9fe1ff)] bg-clip-text text-transparent">See the jobs that fit you.</span>
            </p>
          </div>
          <div className="mx-auto my-auto flex w-full max-w-[460px] flex-col [&_input:hover:not(:focus)]:border-primary-line [&_input]:transition-[border-color,box-shadow]">
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
