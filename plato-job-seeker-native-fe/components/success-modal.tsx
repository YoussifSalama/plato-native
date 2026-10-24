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
            className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-2xl"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
              className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success"
            >
              <CheckCircle2 className="size-8" />
            </motion.span>
            <p className="text-lg font-semibold text-foreground">{title}</p>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { SuccessModal }
