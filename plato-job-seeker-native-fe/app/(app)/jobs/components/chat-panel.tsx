"use client"

import { useEffect, useRef } from "react"
import { motion } from "motion/react"
import type { ThreadMessage } from "@/lib/jobs/api"
import { PlatoMark } from "@/components/plato-orb"
import { TypedText } from "./journey/typed-text"
import { StepsInline } from "./journey/journey-notes"
import type { Journey } from "./journey/use-journey-log"
import { useTypedArrivals } from "./use-typed-arrivals"
import { pendingCardId, QuestionCardView } from "./question-card"

function TypingDots() {
  return (
    <div className="mr-auto flex items-center gap-1 rounded-lg rounded-tl-[4px] bg-muted px-3.5 py-2.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

function PlatoAvatar({ className }: { className?: string }) {
  return <PlatoMark size={40} className={className} />
}

// Search steps slot into the timeline at the moment the run started.
export type InlineSteps = { journey: Journey; startedAt: string }

function MessageList({
  messages,
  busy,
  error,
  steps,
  onAnswer,
  className,
}: {
  messages: ThreadMessage[]
  busy: boolean
  error: string | null
  steps?: InlineSteps
  onAnswer?: (text: string) => void
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isTyping = useTypedArrivals(messages)
  const openCard = pendingCardId(messages)
  const stepCount = steps?.journey.notes.length ?? 0
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy, stepCount])

  const cutoff = steps ? new Date(steps.startedAt).getTime() : Infinity
  const before = messages.filter((m) => new Date(m.created_at).getTime() <= cutoff)
  const after = steps ? messages.filter((m) => new Date(m.created_at).getTime() > cutoff) : []

  const bubble = (m: ThreadMessage) =>
    m.role === "USER" ? (
      <div key={m.id} className="ml-auto max-w-[85%] rounded-lg rounded-br-[6px] bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        {m.content}
      </div>
    ) : (
      <div key={m.id} className="mr-auto flex max-w-[92%] flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <PlatoMark size={24} className="mt-0.5" live={isTyping(m)} />
          <p className="rounded-lg rounded-tl-[6px] bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
            {isTyping(m) ? <TypedText key={m.id} text={m.content} msPerChar={11} /> : m.content}
          </p>
        </div>
        {m.ui && m.id === openCard && onAnswer && <QuestionCardView card={m.ui} busy={busy} onSubmit={onAnswer} />}
      </div>
    )

  return (
    <div ref={scrollRef} className={"scroll-thin flex flex-1 flex-col gap-3 overflow-y-auto p-4 " + (className ?? "")}>
      {before.map(bubble)}
      {steps && <StepsInline journey={steps.journey} />}
      {after.map(bubble)}
      {busy && <TypingDots />}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { MessageList, PlatoAvatar, TypingDots }
