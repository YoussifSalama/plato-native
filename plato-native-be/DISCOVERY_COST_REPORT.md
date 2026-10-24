# Discovery-side cost per platform

All 12 discovery boards run through the same Apify actor pattern
(`apify.service.ts` → `client.actor(actorId).call(input)`), each on a
different third-party Apify actor, pay-per-result (not per search).
Per-result prices are FREE-tier (no Apify subscription) — paid Apify plans
(Bronze/Silver/Gold/...) discount the same actors automatically, no code
change needed.

**Records per call is not platform-specific — it's a system cap.**
`boards.adapter.ts`: `MAX_PER_RUN = 40`, `MIN_PER_RUN = 5`. Every board gets
`limit = clamp(budget / 2 / planLength, 5, 40)` — so **max 40 records per
call** regardless of platform, unless the platform's own actor caps lower.
LinkedIn (separate adapter) uses the same `LIMIT_PER_URL = 40`.

One-search cost below = run-start fee + 40 records × per-result price (the
system ceiling), so it's the worst-case/typical top-end cost of a single
board call.

| Source | $ / request (per result) | Max records / call | Run-start fee | Cost of one call (40 records) |
|---|---|---|---|---|
| `TALENT` | $0.00070 | 40 | — | **$0.028** |
| `JOBBANK` | $0.00079 | 40 | — | **$0.032** |
| `DICE` | $0.00099 | 40 | — | **$0.040** |
| `HANDSHAKE` | $0.00100 | 40 | — | **$0.040** |
| `LINKEDIN` | $0.00100 | 40 (per URL) | — | **$0.040** |
| `WUZZUF` | $0.00092 | 40 | $0.005 | **$0.042** |
| `GOOGLE_JOBS` | $0.00220 | 40 (4×10/page) | + per extra page fetched | **$0.088+** |
| `JOBILLICO` | $0.00299 | 40 | not itemized | **$0.120** |
| `BUILTIN` | $0.00300 | 40 | small, not itemized | **$0.120+** |
| `INDEED` | $0.00300 | 40 | $0.005 | **$0.125** |
| `ZIPRECRUITER` | $0.00410 | 40 | $0.01 | **$0.174** |
| `GLASSDOOR` | $0.00500 | 40 | $0.01 | **$0.210** |

Sorted cheapest → priciest per call: Talent → JobBank → Dice/Handshake/
LinkedIn → Wuzzuf → Google Jobs → Jobillico/BuiltIn → Indeed →
ZipRecruiter → Glassdoor (7.5× the cheapest).

**Google Jobs caveat:** a results page holds 10 listings, so pulling 40
means 4 page-fetch events on top of the 40 job-scraped events — actual
cost is somewhat above $0.088, exact page-fetch price not published on the
actor's pricing page.

**Notes not itemized by the actor's own pricing page** (Jobillico's
platform-usage add-on, BuiltIn's start-event price) are called out above
rather than guessed at.

## Title variants multiply the request count — per adapter, differently

Titles come from `title-planner.ts` (LLM plan off the seeker's CV/skills/
experience, up to 8 titles) or the deterministic fallback. What happens
next splits into two different billing shapes:

| Adapter | How title variants are billed | Cap |
|---|---|---|
| The 11 Apify board scrapers (`boards.adapter.ts`) | **One separate paid call per title.** `plan()` is a cross product: `board × country × title`. | `MAX_TITLES = 3` (top 3 of the 8 planned) |
| `LINKEDIN` (own adapter) | Same shape, one call per `title × place`. | `MAX_TITLES = 6`, but hard-capped at `MAX_RUNS = 8` total runs, `MAX_PLACES = 2` |
| ATS-aggregator (Greenhouse/Lever/Workable/Ashby direct search) | **One call, all variants bundled** into a single `titleSearch` array (`expandTitle`'s `:*` prefix matching). No multiplier — not on this Apify cost table at all. | n/a |

So for the 11 board scrapers, real cost per country is **up to 3×** a
single-title call, not the flat per-call number in the table above.

## Worked examples

Records per call isn't fixed at 40 either — it's
`clamp(budget / 2 / totalRunsPlanned, 5, 40)`, so a wide search (many
boards × titles) starves each run down toward the 5-record floor unless
the budget is raised to match. Two ends of that range, 1 country, default
`budget = 200`:

**Case A — default budget (realistic, common case).**
11 boards × 3 titles = 33 runs → `limit = clamp(200/2/33 ≈ 3, 5, 40)` →
**5 records/run** (floor kicks in).
Summed across all 11 boards at 5 records/run ≈ **$0.153 per title** →
`× 3 titles` ≈ **$0.46** for the board scrapers.
LinkedIn: 6 titles × 1 place = 6 runs, `perUrl = clamp(200/2/6 ≈ 17, 10, 40)`
→ 17 records/run × $0.001 × 6 ≈ **$0.10**.
**Total ≈ $0.56 per seeker per discovery run**, 1 country.

**Case B — 2 countries, same default budget.**
Boards: 66 runs planned → still floors at 5 records/run, but now 2×
the calls → ≈ **$0.92**.
LinkedIn: `MAX_RUNS = 8` caps it — 4 titles × 2 places = 8 runs,
`perUrl = clamp(200/2/8 ≈ 13, 10, 40)` → 13 × $0.001 × 8 ≈ **$0.10**.
**Total ≈ $1.02**, 2 countries.

**Case C — budget raised to 2,000, 1 country (near the 40-record ceiling).**
`limit = clamp(2000/2/33 ≈ 30, 5, 40)` → 30 records/run.
Boards ≈ **$0.77 per title** → `× 3` ≈ **$2.31**.
LinkedIn at ~40/run (already past its own clamp ceiling) ≈ **$0.24**.
**Total ≈ $2.55**, 1 country — and the theoretical max at the full
`MAX_PER_RUN = 40` ceiling for every run (Case D, budget effectively
unlimited) is ≈ **$3.06 (boards) + $0.24 (LinkedIn) ≈ $3.30**, the
absolute per-seeker ceiling for one country, one discovery run.

Takeaway: **default-budget cost is ~17× cheaper than the max-cap cost**
($0.56 vs $3.30) because `MIN_PER_RUN = 5` throttles hard the moment
`boards × titles` gets wide — the budget knob, not the per-platform price,
is what actually controls spend.
