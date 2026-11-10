import { redirect } from "next/navigation"

// The old general-interview setup: the interview flow asks the same questions now.
// ?focus=… and ?mode=voice carry over.
export default async function GeneralInterviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined)
  const q = new URLSearchParams({ target: "general" })
  const focus = one("focus")
  if (focus && ["mixed", "behavioral", "technical", "situational"].includes(focus)) q.set("focus", focus)
  if (one("mode") === "voice") q.set("how", "voice")
  redirect(`/career/interviews/new?${q}`)
}
