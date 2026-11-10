import { apiClient } from "@/lib/api-client"
import { isOutOfTokens, reportOutOfTokens, reportTokensChanged } from "@/lib/credits/api"
import { createThread, getThread, listThreads, type ChatUiContext, type OrchestratorEvent, type QuestionCard } from "@/lib/jobs/api"
import { getCareerThread, listCareerThreads, type CareerMessage } from "@/lib/career/api"

// The one Plato AI conversation store, as the assistant panel sees it.
// New conversations are chat threads (/chat/threads: the orchestrator, which also has the
// career tools). Older career-coach conversations (/job-seeker/career/threads) are listed
// and continued as they are; nothing is moved between the stores.
export type ConvKind = "chat" | "career"
// A message of either store. Chat messages may carry a search question card; both may
// carry the career cards (resume file, interview, lookups, choices).
export type AssistantMessage = Omit<CareerMessage, "ui"> & { ui?: CareerMessage["ui"] | QuestionCard | null }
export type Conversation = { kind: ConvKind; id: string; title: string | null; messages: AssistantMessage[]; searches?: number }
export type ConversationSummary = { kind: ConvKind; id: string; title: string | null; updated_at: string; search: boolean }

// Both stores, newest first. One failing store still lists the other.
export async function listConversations(): Promise<ConversationSummary[]> {
  const [chats, careers] = await Promise.all([listThreads().catch(() => []), listCareerThreads().catch(() => [])])
  return [
    ...chats.map((t) => ({ kind: "chat" as const, id: t.id, title: t.title, updated_at: t.updated_at, search: t.discovery_runs.length > 0 })),
    ...careers.map((t) => ({ kind: "career" as const, id: t.id, title: t.title, updated_at: t.updated_at, search: false })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function getConversation(kind: ConvKind, id: string): Promise<Conversation> {
  if (kind === "career") {
    const t = await getCareerThread(id)
    return { kind, id: t.id, title: t.title, messages: t.messages }
  }
  const t = await getThread(id)
  return { kind, id: t.id, title: t.title, messages: t.messages as AssistantMessage[], searches: t.discovery_runs.length }
}

export async function newConversation(): Promise<Conversation> {
  const t = await createThread()
  return { kind: "chat", id: t.id, title: t.title, messages: t.messages as AssistantMessage[], searches: t.discovery_runs.length }
}

// A Plato AI reply that arrives as it is written (Server-Sent Events over fetch, so the auth
// cookie rides along): `delta` text pieces, `status` while a tool runs, then the saved message
// with the page events the app should carry out.
export async function streamThreadMessage(
  id: string,
  content: string,
  opts: { context?: ChatUiContext; onDelta: (text: string) => void; onStatus?: (text: string) => void; attachmentIds?: string[]; reference?: { jobId: string; searchId?: string } },
): Promise<{ message: AssistantMessage; events: OrchestratorEvent[] }> {
  const res = await fetch(`${apiClient.defaults.baseURL}/chat/threads/${id}/messages/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, context: opts.context, attachmentIds: opts.attachmentIds, reference: opts.reference }),
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    if (isOutOfTokens(res.status, body)) reportOutOfTokens(body)
    throw new Error(Array.isArray(body?.message) ? "That message could not be sent." : (body?.message ?? "Request failed"))
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let out: { message: AssistantMessage; events: OrchestratorEvent[] } | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""
    for (const frame of frames) {
      const event = /^event: (.*)$/m.exec(frame)?.[1]
      const data = JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? "null")
      if (event === "delta") opts.onDelta(data.text)
      else if (event === "status") opts.onStatus?.(data.text)
      else if (event === "done") out = { message: data.message, events: data.events ?? [] }
      else if (event === "error") throw new Error(data.message)
    }
  }
  reportTokensChanged() // the reply was charged when it finished
  if (!out) throw new Error("The reply was cut off. Please try again.")
  return out
}
