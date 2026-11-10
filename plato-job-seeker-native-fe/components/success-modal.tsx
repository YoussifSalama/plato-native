"use client"

import { AnimatePresence, motion } from "motion/react"
import { CheckCircle2 } from "lucide-react"

function SuccessModal({
  open,
  title,
  description,
}: {
  open: boolean
  title: string
  description?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 280 }}
            className="relative isolate flex w-full max-w-xs flex-col items-center gap-3 overflow-hidden rounded-2xl border bg-card p-8 text-center shadow-float"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_0%_0%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_65%),radial-gradient(60%_55%_at_100%_100%,color-mix(in_oklch,var(--azure)_10%,transparent),transparent_70%)]" />
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
              className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success ring-4 ring-success-soft/50"
            >
              <CheckCircle2 className="size-8" />
            </motion.span>
            <p className="type-section-title text-foreground">{title}</p>
            {description && <p className="type-body text-text-secondary">{description}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { SuccessModal }
