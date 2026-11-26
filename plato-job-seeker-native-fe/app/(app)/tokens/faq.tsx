"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, HelpCircle } from "lucide-react"
import { cn } from "cn"
import { ease } from "@/lib/motion-system"
import { CARD, SectionHeader } from "@/components/plato-ui"

// The questions people actually ask about tokens, answered plainly.
const QUESTIONS = [
  { q: "Why does a search cost more than a chat message?", a: "Tokens follow the work behind each action. A chat reply is a few seconds of thinking. A new search can read thousands of postings across job boards to find the ones that fit you, so it takes more. When Plato already knows matching jobs, a search costs much less." },
  { q: "What happens when I run out?", a: "Nothing breaks: your jobs, applications and profile stay free to browse, and applying is always free. With a low balance a new search covers fewer paid job boards and a voice call is shorter. With none left, searches, AI replies and voice calls wait until your tokens refill on your monthly date, or until you top up." },
  { q: "Do unused tokens carry over?", a: "Monthly tokens refresh each month, so use them freely. Tokens you buy as a top-up are different: they never expire and are only used once your monthly tokens are gone." },
  { q: "Can I see what I'll spend before I do something?", a: "Yes. Plato shows an estimate next to paid actions, like a tailored resume or a voice interview, and you can ask Plato AI in any chat how far your balance goes." },
]

export function TokensFaq() {
  const reduced = !!useReducedMotion()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section data-tour="tokens-faq" className="flex flex-col gap-4">
      <SectionHeader title="Questions people ask" icon={HelpCircle} accent="cobalt" />
      <div className={cn(CARD, "divide-y divide-divider overflow-hidden")}>
        {QUESTIONS.map(({ q, a }, i) => {
          const isOpen = open === i
          return (
            <div key={q}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-muted/60 hover:text-primary">
                {q}
                <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform duration-300", isOpen && "rotate-180 text-primary")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: ease.out }} className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-text-secondary">{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </section>
  )
}
