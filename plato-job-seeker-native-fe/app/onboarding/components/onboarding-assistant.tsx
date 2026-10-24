"use client"

import { useState } from "react"
import type { ThreadMessage } from "@/lib/jobs/api"
import { sendChatMessage, type ChatMessage } from "@/lib/chat/api"
import { PlatoDock } from "@/app/(app)/jobs/components/plato-dock"

// Same floating Plato as the product: launcher bottom-right, expands into a
// panel. Onboarding's chat is stateless per page, so the transcript lives
// here and is replayed to /chat on every turn.
function OnboardingAssistant({ stage, faqs }: { stage: 1 | 2 | 3 | 4; faqs: string[] }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(content: string) {
    const now = new Date().toISOString()
    const next = [...messages, { id: crypto.randomUUID(), role: "USER" as const, content, created_at: now }]
    setMessages(next)
    setError(null)
    setBusy(true)
    try {
      const history: ChatMessage[] = next.map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }))
      const reply = await sendChatMessage(history, stage)
      setMessages([...next, { id: crypto.randomUUID(), role: "ASSISTANT", content: reply, created_at: new Date().toISOString() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return <PlatoDock messages={messages} onSend={(t) => void send(t)} busy={busy} error={error} quickPrompts={messages.length ? [] : faqs} status="idle" />
}

export { OnboardingAssistant }
