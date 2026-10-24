"use client"

import { useState } from "react"
// Any chat message list: the job-search thread and the Career chat share this.
type Arriving = { id: string; role: string }

// Which assistant messages should be "written" live: only ones that arrived
// after mount (history loads instantly), and only the latest of them.
export function useTypedArrivals(messages: Arriving[]) {
  const [initial] = useState(() => new Set(messages.map((m) => m.id)))
  const last = messages.at(-1)
  const typingId = last && last.role === "ASSISTANT" && !initial.has(last.id) ? last.id : null
  return (m: Arriving) => m.id === typingId
}
