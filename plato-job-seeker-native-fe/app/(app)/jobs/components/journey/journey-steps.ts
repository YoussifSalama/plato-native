import { SOURCE_LABEL, type DiscoveryRun, type JobSourceName, type RunProgress, type SourceKey } from "@/lib/jobs/api"

type SourceDef = { key: SourceKey; label: string; optional?: boolean }

// Job boards searched per seeker country: a run only reports the ones it
// searched, so they show up only when present in `progress.sources`.
const BOARDS: JobSourceName[] = ["INDEED", "GOOGLE_JOBS", "ZIPRECRUITER", "GLASSDOOR", "TALENT", "JOBBANK", "JOBILLICO", "DICE", "HANDSHAKE", "BUILTIN", "WUZZUF", "REMOTIVE", "JOBICY", "REMOTEOK", "HIMALAYAS", "JOOBLE", "ADZUNA", "BAYT", "NAUKRIGULF", "GULFTALENT", "WEWORKREMOTELY", "WORKINGNOMADS", "WELLFOUND", "ARC", "DYNAMITEJOBS", "JOBGETHER", "NODESK"]

export const SOURCES: SourceDef[] = [
  { key: "index", label: "Plato index" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "workable", label: "Workable" },
  { key: "greenhouse", label: "Greenhouse" },
  { key: "ashby", label: "Ashby" },
  { key: "lever", label: "Lever" },
  ...BOARDS.map((b): SourceDef => ({ key: b.toLowerCase() as SourceKey, label: SOURCE_LABEL[b], optional: true })),
]

export const visibleSources = (progress: RunProgress) => SOURCES.filter((s) => !s.optional || progress.sources[s.key])

// Runs from before the local index existed have no `index` entry.
export const sourceOf = (progress: RunProgress, key: SourceKey) => progress.sources[key] ?? { status: "DONE" as const, fetched: 0 }

export type StepId =
  | "ai"
  | "stage"
  | "adapters"
  | `adapter:${SourceKey}`
  | "merge"
  | "filter"
  | "rank"
  | "done"
  | "failed"

// What Plato says when this event lands: a headline (typed) and a detail
// line (fades in after) with the running numbers.
export type Step = { id: StepId; voice: string; detail: string }

const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

export function deriveSteps(progress: RunProgress, query: DiscoveryRun["query"]): Step[] {
  // `titles` is what actually gets searched (planned from the seeker's
  // background); `requestedTitles` is what they asked for.
  const titles = query?.titles ?? []
  const asked = query?.requestedTitles?.length ? query.requestedTitles : titles
  const locations = query?.locations ?? []
  const roles = list(asked) || "your saved roles"
  const where = locations.length ? ` in ${list(locations)}` : ""
  const widened = titles.filter((t) => !asked.some((a) => a.toLowerCase() === t.toLowerCase()))

  const sources = visibleSources(progress)
  const live = sources.filter((s) => s.key !== "index")
  const steps: Step[] = [
    {
      id: "ai",
      voice: `Got it — you're after ${roles}${where}.`,
      detail: widened.length
        ? `Your experience qualifies you for more than that title, so I'm also searching ${list(widened)}.`
        : "I'm matching that against your profile before I start pulling postings.",
    },
    {
      id: "stage",
      voice: "I know exactly what to look for. Opening the job sources now.",
      detail: `Searching ${plural(titles.length || 1, "title")} across ${plural(live.length, "job source")}.`,
    },
    {
      id: "adapters",
      voice: "Every job source is live and searching in parallel.",
      detail: "Each one reports back the moment it finishes; you'll see the counts land one by one.",
    },
  ]

  const settled = sources.filter((s) => sourceOf(progress, s.key).status !== "RUNNING")
  const fetchedSoFar = sources.reduce((n, s) => n + sourceOf(progress, s.key).fetched, 0)
  for (const s of sources) {
    const sp = sourceOf(progress, s.key)
    if (sp.status === "RUNNING") continue
    // Runs from before a source existed have no entry for it: no note.
    if (!progress.sources[s.key]) continue
    const remaining = sources.length - settled.length
    const tail = remaining > 0 ? `${plural(remaining, "source")} still searching.` : "That's every source accounted for."
    const running = `${plural(fetchedSoFar, "posting")} collected so far · ${tail}`
    if (s.key === "index")
      steps.push({
        id: "adapter:index",
        voice:
          sp.fetched > 0
            ? `${plural(sp.fetched, "matching job")} were already in Plato's index — those are in instantly.`
            : "Nothing fresh in Plato's index for these titles yet — going to the live sources.",
        detail:
          sp.fetched > 0
            ? `Crawled in the last 7 days by earlier searches. I'll ask the live sources only for the rest.`
            : "The index fills up as searches run; next time this will be faster.",
      })
    else if (sp.status === "DONE" && sp.fetched > 0)
      steps.push({ id: `adapter:${s.key}`, voice: `${s.label} came back with ${plural(sp.fetched, "posting")}.`, detail: running })
    else if (sp.status === "DONE")
      steps.push({
        id: `adapter:${s.key}`,
        voice: `${s.label} has nothing for ${roles} right now.`,
        detail: `That happens with niche titles — I'll lean on the other sources. ${running}`,
      })
    else
      steps.push({
        id: `adapter:${s.key}`,
        voice: `${s.label} didn't respond this time.`,
        detail: `I'm continuing with the others; you can rerun later to include it. ${running}`,
      })
  }

  const order = ["crawling", "merging", "filtering", "ranking", "done"] as const
  const at = (stage: (typeof order)[number]) =>
    order.indexOf(progress.stage as (typeof order)[number]) >= order.indexOf(stage)

  if (progress.stage === "failed") {
    steps.push({
      id: "failed",
      voice: "I had to stop the search.",
      detail: progress.error ?? "Something went wrong along the way. Say \"try again\" in the chat and I'll rerun it.",
    })
    return steps
  }
  if (at("merging"))
    steps.push({
      id: "merge",
      voice:
        progress.merged !== null
          ? `Merged everything into one pool: ${plural(progress.merged, "job")} mention your titles.`
          : "Pulling every result into one pool and removing duplicates.",
      detail: `${plural(fetchedSoFar, "posting")} came in from ${plural(settled.length, "source")}.`,
    })
  if (at("filtering"))
    steps.push({
      id: "filter",
      voice:
        progress.filtered !== null
          ? `Cross-checked them against your profile — ${plural(progress.filtered, "job")} made the shortlist.`
          : "Now cross-checking each posting against your skills, titles and experience.",
      detail:
        progress.filtered !== null
          ? `From ${progress.merged ?? fetchedSoFar} down to ${progress.filtered}, keyword relevance first.`
          : "This keeps only the roles that genuinely overlap with what you've done.",
    })
  if (at("ranking"))
    steps.push({
      id: "rank",
      voice: progress.ranked !== null ? "Ranked — your strongest matches sit at the top." : "Scoring the shortlist so the best fits come first.",
      detail: "Match strength is relative to your best posting, so 95% means \"about as good as it gets for you\".",
    })
  if (at("done"))
    steps.push({
      id: "done",
      voice: `All set — ${plural(progress.ranked ?? 0, "job")} ready for you.`,
      detail: "Pick the ones you like and I'll take care of the applications.",
    })
  return steps
}
