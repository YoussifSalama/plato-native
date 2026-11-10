import { redirect } from "next/navigation"

// The old job-simulation setup: the interview flow asks the same questions now.
// ?job=<id> and ?mode=voice carry over.
export default async function SimulatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined)
  const q = new URLSearchParams({ target: "job" })
  const job = one("job")
  if (job && /^[A-Za-z0-9_-]{1,64}$/.test(job)) q.set("job", job)
  if (one("mode") === "voice") q.set("how", "voice")
  redirect(`/career/interviews/new?${q}`)
}
