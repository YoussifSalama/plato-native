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
        <motion.div role="status" initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.settle} className="relative grid grid-cols-[auto_1fr_auto] items-start gap-x-2.5 border-b border-primary-line/60 bg-primary-tint py-2 pr-3 pl-4 text-[13px] leading-5 sm:flex sm:items-center sm:justify-center sm:pl-6 lg:pl-8">
          <MailWarning className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" strokeWidth={1.8} />
          <span className="min-w-0 py-0.5 text-text-secondary [overflow-wrap:anywhere] sm:py-0 [&_.font-semibold]:text-foreground">
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
            <button type="button" onClick={resend} disabled={state === "busy"} data-ai="verify-email.resend" className="col-start-2 row-start-2 -ml-2 flex h-7 shrink-0 items-center gap-1.5 justify-self-start rounded-md px-2 text-[13px] sm:ml-0 font-semibold whitespace-nowrap text-primary transition-colors duration-200 hover:bg-primary-soft disabled:opacity-60">
              {state === "busy" && <Loader2 className="size-3.5 animate-spin" />}
              Send the link again
            </button>
          )}
          <button type="button" onClick={() => setState("closed")} aria-label="Hide for now" className="col-start-3 row-start-1 flex size-7 shrink-0 sm:absolute sm:top-1/2 sm:right-3 sm:-translate-y-1/2 items-center justify-center rounded-md text-text-tertiary transition-colors duration-200 hover:bg-primary-soft hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
