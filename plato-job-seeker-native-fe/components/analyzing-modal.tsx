"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { BrainCircuit, Check, FileSearch, Sparkles, Upload, UserCheck } from "lucide-react"
import { cn } from "cn"

const STEPS = [
  {
    title: "Uploading your documents",
    description: "Securely storing your CV and supporting files.",
    icon: Upload,
    color: "sky",
  },
  {
    title: "Extracting text",
    description: "Pulling readable text out of your PDF or DOCX files.",
    icon: FileSearch,
    color: "brand",
  },
  {
    title: "Analyzing with AI",
    description: "Reading through your experience, education, and skills.",
    icon: BrainCircuit,
    color: "amber",
  },
  {
    title: "Building your profile",
    description: "Turning everything into a structured career profile.",
    icon: UserCheck,
    color: "emerald",
  },
] as const

const COLOR_CLASSES = {
  sky: { solid: "bg-sky-500", ring: "bg-sky-500/30" },
  brand: { solid: "bg-primary", ring: "bg-primary/30" },
  amber: { solid: "bg-amber-500", ring: "bg-amber-500/30" },
  emerald: { solid: "bg-emerald-500", ring: "bg-emerald-500/30" },
} as const

const STEP_INTERVAL_MS = 1400

// Mounted only while the modal is open, so activeIndex resets to 0 for
// free on unmount instead of needing an effect-driven reset.
function AnalyzingModalContent() {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }, STEP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const progress = ((activeIndex + 1) / STEPS.length) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
    >
      <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9, rotate: -1 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            className="relative flex w-full max-w-xl flex-col gap-7 overflow-hidden rounded-2xl border bg-card p-9 shadow-2xl"
          >
            {/* animated gradient sheen */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-azure/10 to-sky/20"
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="relative flex size-16 items-center justify-center">
                <motion.span
                  className="absolute inset-0 rounded-full bg-linear-to-br from-primary/40 via-azure/40 to-sky/40"
                  animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.span
                  className="relative flex size-14 items-center justify-center rounded-full bg-linear-to-br from-primary via-[#0a7fd0] to-azure text-white shadow-lg"
                  animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="size-7" />
                </motion.span>
              </div>
              <p className="text-xl font-semibold text-foreground">Building your career profile</p>
              <p className="text-sm text-muted-foreground">
                This only takes a moment. Please don&apos;t close this window.
              </p>
            </div>

            <div className="relative flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-linear-to-r from-primary via-[#0a7fd0] to-azure"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>

            <div className="relative flex flex-col gap-5">
              {STEPS.map((step, i) => {
                const isDone = i < activeIndex
                const isActive = i === activeIndex
                const colors = COLOR_CLASSES[step.color]
                const Icon = step.icon
                return (
                  <motion.div
                    key={step.title}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={cn(
                      "flex items-start gap-3 rounded-xl p-2.5 transition-colors",
                      isActive && "bg-muted/60"
                    )}
                  >
                    <div className="relative flex size-10 shrink-0 items-center justify-center">
                      {isActive && (
                        <motion.span
                          className={cn("absolute inset-0 rounded-full", colors.ring)}
                          animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      <span
                        className={cn(
                          "relative flex size-9 items-center justify-center rounded-full text-white transition-colors",
                          (isDone || isActive) && colors.solid,
                          !isDone && !isActive && "bg-muted text-muted-foreground"
                        )}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {isDone ? (
                            <motion.span
                              key="done"
                              initial={{ scale: 0, rotate: -90 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            >
                              <Check className="size-4" />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="icon"
                              animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                              transition={{ duration: 0.9, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
                            >
                              <Icon className="size-4" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                    </div>
                    <div className="flex flex-col pt-1">
                      <span
                        className={cn(
                          "text-sm",
                          isDone || isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                        )}
                      >
                        {step.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{step.description}</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
      </motion.div>
    </motion.div>
  )
}

function AnalyzingModal({ open }: { open: boolean }) {
  return <AnimatePresence>{open && <AnalyzingModalContent />}</AnimatePresence>
}

export { AnalyzingModal }
