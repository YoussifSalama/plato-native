"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Loader2, MailWarning, X } from "lucide-react"
import { resendVerification } from "@/lib/auth/api"
import { spring } from "@/lib/motion-system"

// Until the seeker confirms their email, a quiet strip says why it matters
// (alert emails only go to confirmed addresses) and resends the link.
export function VerifyEmailBanner({ email }: { email: string }) {
  const reduced = !!useReducedMotion()
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed" | "closed">("idle")
  const resend = () => {
    setState("busy")
    resendVerification()
      .then((r) => setState(r.sent ? "sent" : "failed"))
      .catch(() => setState("failed"))
  }
  return (
    <AnimatePresence>
      {state !== "closed" && (
        <motion.div role="status" initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.settle} className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm lg:mr-6 lg:ml-7">
          <MailWarning className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1 text-foreground">
            {state === "sent" ? (
              <>A new link is on its way to <span className="font-semibold">{email}</span>.</>
            ) : state === "failed" ? (
              "We couldn't send the link right now. Try again in a little while."
            ) : (
              <>
                Confirm <span className="font-semibold">{email}</span> to get job alerts and account messages by email.
              </>
            )}
          </span>
          {state !== "sent" && (
            <button type="button" onClick={resend} disabled={state === "busy"} data-ai="verify-email.resend" className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary-tint disabled:opacity-60">
              {state === "busy" && <Loader2 className="size-3.5 animate-spin" />}
              Send the link again
            </button>
          )}
          <button type="button" onClick={() => setState("closed")} aria-label="Hide for now" className="flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-card hover:text-foreground">
            <X className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
