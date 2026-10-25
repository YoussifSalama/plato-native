import { apiClient } from "@/lib/api-client"

// Plato tokens: one balance for every paid action (AI replies, job-board
// searches, voice interviews), refilled each month. The server never sends
// dollars, only tokens.
export type TokenMove = { id: string; kind: "grant" | "consume" | "hold" | "release" | "adjust"; amount: number; balanceAfter: number; feature: string | null; label: string; at: string }
export type TokenAccount = { plan: string; balance: number; monthly: number; periodStart: string; resetsAt: string; history: TokenMove[] }
export type TokenPrices = {
  plans: Record<string, { monthly: number }>
  voicePerMinute: number
  features: { feature: string; label: string; average: number; calls: number }[]
  boards: { label: string; perResult: number; perRun: number }[]
}
// The body of a 402 from any paid route.
export type OutOfTokens = { code: "insufficient_tokens"; message: string; balance: number; resetsAt: string; needed?: number }

export const getTokens = async (limit = 20) => (await apiClient.get<TokenAccount>("/job-seeker/credits", { params: { limit } })).data
export const getTokenPrices = async () => (await apiClient.get<TokenPrices>("/job-seeker/credits/prices")).data

export const isOutOfTokens = (status: number | undefined, data: unknown): data is OutOfTokens => status === 402 && (data as { code?: string } | null)?.code === "insufficient_tokens"

// Window events, so any request anywhere can tell the balance and the dialog.
export const OUT_OF_TOKENS_EVENT = "plato:out-of-tokens"
export const TOKENS_CHANGED_EVENT = "plato:tokens-changed"
export const reportOutOfTokens = (body: OutOfTokens) => window.dispatchEvent(new CustomEvent<OutOfTokens>(OUT_OF_TOKENS_EVENT, { detail: body }))
export const reportTokensChanged = () => window.dispatchEvent(new Event(TOKENS_CHANGED_EVENT))

export const formatTokens = (n: number) => Math.round(n).toLocaleString("en-US")
